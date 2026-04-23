let firebaseApp = null;
let firestoreDb = null;
let _localBc = null;
let _publishTimer = null;
const NEXABANK_SYNC_PREFIX = '[NexaBank]';
let firebaseSyncAvailable = false;
let firebaseSyncInitialized = false;
let firebaseSyncDisabledReason = '';
let heartbeatIntervalId = null;

function logSyncInfo(message, extra) {
  if (typeof extra !== 'undefined') {
    console.log(`${NEXABANK_SYNC_PREFIX} ${message}`, extra);
  } else {
    console.log(`${NEXABANK_SYNC_PREFIX} ${message}`);
  }
}

function logSyncWarn(message, extra) {
  if (typeof extra !== 'undefined') {
    console.warn(`${NEXABANK_SYNC_PREFIX} ${message}`, extra);
  } else {
    console.warn(`${NEXABANK_SYNC_PREFIX} ${message}`);
  }
}

function disableFirebaseSync(reason, extra) {
  firebaseSyncAvailable = false;
  firebaseSyncDisabledReason = reason || 'unknown-reason';
  if (window.S) S.firebaseAvailable = false;

  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }

  if (typeof extra !== 'undefined') {
    console.warn(`${NEXABANK_SYNC_PREFIX} Firebase sync disabled: ${firebaseSyncDisabledReason}`, extra);
  } else {
    console.warn(`${NEXABANK_SYNC_PREFIX} Firebase sync disabled: ${firebaseSyncDisabledReason}`);
  }
}

function isPermissionError(err) {
  const code = err?.code || err?.name || '';
  const message = err?.message || '';
  return (
    String(code).includes('permission-denied') ||
    String(code).includes('PermissionDenied') ||
    String(message).toLowerCase().includes('insufficient permissions') ||
    String(message).toLowerCase().includes('permission denied')
  );
}

function canUseFirebaseSync() {
  return firebaseSyncAvailable === true;
}

function doc(dbRef, ...path) {
  if (!dbRef || typeof dbRef.collection !== 'function') return null;
  if (path.length < 2) return null;
  let ref = dbRef.collection(path[0]).doc(path[1]);
  for (let i = 2; i < path.length; i += 2) {
    const collectionName = path[i];
    const docId = path[i + 1];
    if (!collectionName) break;
    ref = ref.collection(collectionName);
    if (typeof docId !== 'undefined') {
      ref = ref.doc(docId);
    }
  }
  return ref;
}

function setDoc(ref, data, options) {
  if (!ref || typeof ref.set !== 'function') return Promise.reject(new Error('invalid-doc-ref'));
  return ref.set(data, options);
}

function updateDoc(ref, data) {
  if (!ref || typeof ref.update !== 'function') return Promise.reject(new Error('invalid-doc-ref'));
  return ref.update(data);
}

function getDoc(ref) {
  if (!ref || typeof ref.get !== 'function') return Promise.reject(new Error('invalid-doc-ref'));
  return ref.get();
}

function runTransaction(dbRef, updateFunction) {
  if (!dbRef || typeof dbRef.runTransaction !== 'function') return Promise.reject(new Error('invalid-db-ref'));
  return dbRef.runTransaction(updateFunction);
}

function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value
      .map(stripUndefinedDeep)
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value)
      .map(([key, val]) => [key, stripUndefinedDeep(val)])
      .filter(([, val]) => val !== undefined);

    return Object.fromEntries(entries);
  }

  return value === undefined ? undefined : value;
}

function sanitizeFirestorePayload(payload = {}) {
  return stripUndefinedDeep(payload) || {};
}

// Returns a BroadcastChannel instance for same-device tab sync.
function getLocalChannel() {
  if (!_localBc && typeof BroadcastChannel !== 'undefined') {
    _localBc = new BroadcastChannel('nexabank_aria_sync');
  }
  return _localBc;
}

// Shared function that both Firebase and BroadcastChannel paths call
// when the supervisor tab receives a snapshot.
function applyRemoteSnapshot(data) {
  if (!data) return;
  if (data.logEntries) S.logEntries = data.logEntries;
  if (data.txSeq !== undefined) {
    S.txSeq = data.txSeq;
    if (DOM.ledgerCount) DOM.ledgerCount.textContent = S.txSeq + ' action' + (S.txSeq !== 1 ? 's' : '');
    if (DOM.totalActions) DOM.totalActions.textContent = S.txSeq;
    if (DOM.txnCount) DOM.txnCount.textContent = S.txSeq;
  }
  if (data.totalDebit !== undefined) {
    S.totalDebit = data.totalDebit;
    if (DOM.totalDebit) DOM.totalDebit.textContent = '₹ ' + S.totalDebit.toLocaleString('en-IN');
  }
  if (data.accounts) {
    S.accounts = data.accounts;
    if (DOM.savingsBal) DOM.savingsBal.textContent = '₹ ' + S.accounts.savings.toLocaleString('en-IN', {minimumFractionDigits:2});
    if (DOM.currentBal) DOM.currentBal.textContent = '₹ ' + S.accounts.current.toLocaleString('en-IN', {minimumFractionDigits:2});
  }
  if (data.statusLabel && DOM.statusLabel) DOM.statusLabel.textContent = data.statusLabel;
  if (data.transactions) {
    S.transactions = data.transactions;
    if (typeof renderLedger === 'function') renderLedger();
  }
  if (typeof renderLog === 'function') renderLog();
}

// Debounced publisher — batches rapid addLog() calls into one Firestore
// write every 300 ms so the supervisor sees updates in near real-time
// without flooding Firestore with one write per character.
function scheduledPublish(payload = {}, delay = 0) {
  if (_publishTimer) clearTimeout(_publishTimer);
  _publishTimer = setTimeout(function() {
    _publishTimer = null;
    if (!canUseFirebaseSync() && S.role !== 'customer') return;
    publishLiveSnapshot(payload);
  }, delay || 300);
}

async function _testFirebaseWrite() {
  if (!canUseFirebaseSync()) return false;

  try {
    const testRef = doc(firestoreDb, '_health', 'write-test');
    await setDoc(testRef, sanitizeFirestorePayload({
      updatedAt: serverTimestamp(),
      source: 'nexabank-aria'
    }), { merge: true });

    logSyncInfo('Firestore write test passed');
    return true;
  } catch (err) {
    console.warn(`${NEXABANK_SYNC_PREFIX} Firestore unavailable for write test`, err);

    if (isPermissionError(err)) {
      disableFirebaseSync('firestore-permission-denied', err);
      return false;
    }

    disableFirebaseSync('firestore-write-test-failed', err);
    return false;
  }
}

async function initFirebaseSync(){

  if (firebaseSyncInitialized) return firebaseSyncAvailable;
  firebaseSyncInitialized = true;

  try{
    if (typeof firebase === 'undefined' || !window.NEXA_FIREBASE_CONFIG) {
      disableFirebaseSync('firebase-config-unavailable');
      S.firebaseAvailable = false;
      return false;
    }

    if (firebaseApp) return firebaseSyncAvailable;

    firebaseApp = firebase.initializeApp(window.NEXA_FIREBASE_CONFIG);

    if (typeof firebase.firestore !== 'function') {
      disableFirebaseSync('firestore-lib-unavailable');
      S.firebaseAvailable = false;
      return false;
    }

    firestoreDb = firebase.firestore();
    if (!firestoreDb) {
      disableFirebaseSync('firestore-db-unavailable');
      S.firebaseAvailable = false;
      return false;
    }

    S.firebaseAvailable = true;
    firebaseSyncAvailable = true;
    logSyncInfo('Firebase sync initialized');

    await _testFirebaseWrite();
    return firebaseSyncAvailable;
  }catch(err){
    disableFirebaseSync('firebase-init-failed', err);
    S.firebaseAvailable = false;
    return false;
  }
}

async function acquireCustomerLock(customerId = 'customer') {
  if (!canUseFirebaseSync()) return false;

  try {
    const safeCustomerId = typeof customerId === 'string' && customerId.trim()
      ? customerId.trim()
      : 'customer';

    const lockRef = doc(firestoreDb, 'channels', 'global-live-session', 'locks', safeCustomerId);

    await runTransaction(firestoreDb, async (transaction) => {
      const snap = await transaction.get(lockRef);
      const data = snap.exists ? snap.data() : null;

      if (data?.locked === true) {
        throw new Error('customer-lock-already-held');
      }

      transaction.set(lockRef, sanitizeFirestorePayload({
        locked: true,
        role: 'customer',
        customerId: safeCustomerId,
        updatedAt: serverTimestamp()
      }), { merge: true });
    });

    logSyncInfo(`Customer lock acquired for ${safeCustomerId}`);
    return true;
  } catch (err) {
    if (err?.message === 'customer-lock-already-held') {
      logSyncWarn('Customer lock already held');
      return false;
    }

    if (isPermissionError(err)) {
      disableFirebaseSync('acquireCustomerLock-permission-denied', err);
      return false;
    }

    logSyncWarn('acquireCustomerLock error', err);
    return false;
  }
}

async function releaseCustomerLock(customerId = 'customer') {
  if (!canUseFirebaseSync()) return false;

  try {
    const safeCustomerId = typeof customerId === 'string' && customerId.trim()
      ? customerId.trim()
      : 'customer';

    const lockRef = doc(firestoreDb, 'channels', 'global-live-session', 'locks', safeCustomerId);

    await setDoc(lockRef, sanitizeFirestorePayload({
      locked: false,
      role: 'customer',
      customerId: safeCustomerId,
      updatedAt: serverTimestamp()
    }), { merge: true });

    logSyncInfo(`Customer lock released for ${safeCustomerId}`);
    return true;
  } catch (err) {
    if (isPermissionError(err)) {
      disableFirebaseSync('releaseCustomerLock-permission-denied', err);
      return false;
    }

    logSyncWarn('releaseCustomerLock error', err);
    return false;
  }
}

function startSessionHeartbeat(buildPayload) {
  if (!canUseFirebaseSync()) return;

  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }

  heartbeatIntervalId = setInterval(() => {
    if (!canUseFirebaseSync()) return;

    try {
      const payload = typeof buildPayload === 'function' ? buildPayload() : {};
      publishLiveSnapshot({
        ...payload,
        heartbeatAt: Date.now()
      });
    } catch (err) {
      logSyncWarn('heartbeat payload error', err);
    }
  }, 5000);
}

function stopSessionHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

function subscribeToRemoteSession(){
  if(S.role !== 'supervisor') return;

  // ── BroadcastChannel (same device, zero latency) ────────────────
  try {
    const bc = getLocalChannel();
    if (bc) {
      bc.onmessage = function(event) {
        if (!event.data || event.data.type !== 'nexabank_snapshot') return;
        if (!S.suppressLocalSideEffects) applyRemoteSnapshot(event.data.payload);
      };
    }
  } catch(bcErr) {
    console.warn('[NexaBank] BroadcastChannel listener failed:', bcErr);
  }

  // ── Firestore (cross-device) ─────────────────────────────────────
  if(!S.firebaseAvailable || !firestoreDb) return;
  try{
    const docRef = firestoreDb.collection('channels').doc(S.sessionChannelId).collection('meta').doc('state');
    S.remoteUnsubscribe = docRef.onSnapshot(function(doc) {
      const data = doc.exists ? doc.data() : null;
      if(data && !S.suppressLocalSideEffects){
        applyRemoteSnapshot(data);
      }
    }, function(err) {
      console.error('[NexaBank] Firestore onSnapshot failed (' + err.code + '):', err.message,
        '\nCheck Firestore security rules — see the ❌ message above for instructions.');
    });
  }catch(err){
    console.warn('[NexaBank] subscribeToRemoteSession setup failed:', err);
  }
}

function publishRemoteEvent(eventType, eventData){
  if(!canUseFirebaseSync() || !firestoreDb || S.role !== 'customer') return;
  try{
    const eventsRef = firestoreDb.collection('channels').doc(S.sessionChannelId).collection('events');
    eventsRef.add({
      type: eventType,
      data: eventData,
      sessionId: S.sessionId,
      timestamp: Date.now()
    });
  }catch(err){
    console.warn('Publish remote event failed:', err);
  }
}

function syncRoleGateStatus(){
  if(typeof setLiveModeBadge === 'function'){
    setLiveModeBadge(S.firebaseAvailable ? 'LIVE' : 'LOCAL');
  }
}

async function publishLiveSnapshot(payload = {}) {
  if (!canUseFirebaseSync()) return false;

  try {
    const snapshotRef = doc(firestoreDb, 'channels', 'global-live-session', 'meta', 'state');

    const safePayload = sanitizeFirestorePayload({
      ...payload,
      updatedAt: serverTimestamp()
    });

    logSyncInfo('publishLiveSnapshot payload', safePayload);

    await setDoc(snapshotRef, safePayload, { merge: true });
    return true;
  } catch (err) {
    console.warn(`${NEXABANK_SYNC_PREFIX} publishLiveSnapshot sync error:`, err);

    if (isPermissionError(err)) {
      disableFirebaseSync('publishLiveSnapshot-permission-denied', err);
      return false;
    }
  
    disableFirebaseSync('publishLiveSnapshot-failed', err);
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.initFirebaseSync = initFirebaseSync;
  window.publishLiveSnapshot = publishLiveSnapshot;
  window.scheduledPublish = scheduledPublish;
  window.startSessionHeartbeat = startSessionHeartbeat;
  window.stopSessionHeartbeat = stopSessionHeartbeat;
  window.acquireCustomerLock = acquireCustomerLock;
  window.releaseCustomerLock = releaseCustomerLock;
  window.canUseFirebaseSync = canUseFirebaseSync;
  window.subscribeToRemoteSession = subscribeToRemoteSession;
  window.syncRoleGateStatus = syncRoleGateStatus;
}
