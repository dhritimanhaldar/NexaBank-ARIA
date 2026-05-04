let firebaseApp = null;
let firestoreDb = null;
let _localBc = null;
let _publishTimer = null;
const NEXABANK_SYNC_PREFIX = '[NexaBank]';
let firebaseSyncAvailable = false;
let firebaseSyncInitialized = false;
let firebaseSyncDisabledReason = '';
let heartbeatIntervalId = null;
const STALE_LOCK_MS = 30000;
const PRESENCE_STALE_MS = 15000;
const SUPERVISOR_PRESENCE_MONITOR_MS = 3000;
let supervisorPresenceMonitorId = null;
// Tracks previous online/offline state per customer for supervisor status log entries
const _customerOnlineState = {};
// Tracks peer IDs for each customer session (used by supervisor for P2P calls)
const _customerPeerIds = {};
// Tracks last received customer snapshots so supervisor can age out stale tabs.
const _customerSnapshots = {};

function getCustomerPeerIdForCall(item) {
  if (!item || typeof item !== 'object') return '';
  return String(
    item.peerId ||
    item.customerPeerId ||
    item.sessionPeerId ||
    ''
  ).trim();
}

function isCustomerOnlineForPeerCall(item) {
  if (!item || typeof item !== 'object') return false;
  if (hasExplicitOfflineSignal(item)) return false;
  if (item.heartbeatAt) return hasFreshHeartbeat(item);
  return !!(
    item.online === true ||
    item.isOnline === true ||
    item.connected === true ||
    item.status === 'online' ||
    item.presence === 'online' ||
    item.locked === true
  );
}

function hasExplicitOfflineSignal(source = {}) {
  return (
    source.online === false ||
    source.connected === false ||
    source.status === 'offline' ||
    source.presence === 'offline' ||
    source.heartbeatAt === 1 ||
    source.heartbeatAt === 0
  );
}

function hasFreshHeartbeat(source = {}) {
  const heartbeatAt = Number(source.heartbeatAt || 0);
  return heartbeatAt > 1 && (Date.now() - heartbeatAt) < PRESENCE_STALE_MS;
}

function resolveCustomerOnlineState(source = {}) {
  if (hasExplicitOfflineSignal(source)) return false;
  if (source.heartbeatAt) return hasFreshHeartbeat(source);
  return !!(
    source.online === true ||
    source.isOnline === true ||
    source.connected === true ||
    source.status === 'online' ||
    source.presence === 'online' ||
    source.locked === true
  );
}

function normalizeSyncedCustomerState(source = {}) {
  const normalized = Object.assign({}, source || {});
  normalized.peerId = source.peerId || source.customerPeerId || source.sessionPeerId || null;
  normalized.online = resolveCustomerOnlineState(source);
  normalized.connected = normalized.online;
  normalized.status = normalized.online ? 'online' : 'offline';
  normalized.presence = normalized.online ? 'online' : 'offline';
  return normalized;
}

function getCurrentPeerIdForSync() {
  const peerState = window.S?.peer;
  if (peerState?.ready && peerState.id) return peerState.id;
  if (window.S?.customerSession?.peerId) return window.S.customerSession.peerId;
  if (window.S?.currentCustomer?.peerId) return window.S.currentCustomer.peerId;
  if (window.S?.session?.peerId) return window.S.session.peerId;
  return null;
}

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
// applyCustomerSnapshot — called on supervisor tab to update the correct customer column.
function applyCustomerSnapshot(customerId, data) {
  if (!data) return;
  data = normalizeSyncedCustomerState(data);

  // Store peerId for this customer so supervisor can initiate calls
  if (data.peerId) {
    _customerPeerIds[customerId] = data.peerId;
    console.log('[NexaBank] Stored peerId for', customerId, ':', data.peerId);
  } else if (_customerPeerIds[customerId]) {
    data.peerId = _customerPeerIds[customerId];
  }

  const isC1 = customerId === 'customer1';
  const logEl      = document.getElementById(isC1 ? 'sup1Log'        : 'sup2Log');
  const statusEl   = document.getElementById(isC1 ? 'sup1Status'     : 'sup2Status');
  const balEl      = document.getElementById(isC1 ? 'sup1Balances'   : 'sup2Balances');
  const bodyEl     = document.getElementById(isC1 ? 'sup1LedgerBody' : 'sup2LedgerBody');
  const tableEl    = document.getElementById(isC1 ? 'sup1LedgerTable': 'sup2LedgerTable');
  const emptyEl    = document.getElementById(isC1 ? 'sup1EmptyLedger': 'sup2EmptyLedger');

  // ── Online / offline badge ──────────────────────────────────────
  data.online = resolveCustomerOnlineState(data);
  data.connected = data.online;
  data.status = data.online ? 'online' : 'offline';
  data.presence = data.online ? 'online' : 'offline';
  _customerSnapshots[customerId] = Object.assign({}, data);

  if (statusEl) {
    const isOnline = isCustomerOnlineForPeerCall(data);
    statusEl.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
    statusEl.className = 'sup-status ' + (isOnline ? 'online' : 'offline');
  }
    // ── Online / offline state change detection ───────────────────────
  {
    const isNowOnline = isCustomerOnlineForPeerCall(data);
    const wasOnline = _customerOnlineState[customerId];
    if (typeof wasOnline === 'boolean' && wasOnline !== isNowOnline) {
      // State changed — inject a system log entry into the supervisor log panel
      const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
      if (logEl) {
        const div = document.createElement('div');
        div.className = 'entry system sup-status-change ' + (isNowOnline ? 'online-event' : 'offline-event');
        div.innerHTML =
          '<span class="who">' + (isNowOnline ? '●' : '○') + '</span>' +
          '<span class="who">SYSTEM</span> ' +
          '<span class="time">' + ts + '</span>' +
          '<span class="msg">' +
          (isNowOnline ? '✓ Customer came online' : '✕ Customer went offline') +
          '</span>';
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
      }
    }
    _customerOnlineState[customerId] = isNowOnline;
  }

  // ── Balances ────────────────────────────────────────────────────
  if (balEl && data.accounts) {
    const fmt = n => '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    balEl.innerHTML =
      '<span>Savings: <strong>' + fmt(data.accounts.savings) + '</strong></span>' +
      '&nbsp;&nbsp;<span>Current: <strong>' + fmt(data.accounts.current) + '</strong></span>';
  }

  // ── Talk to Customer button ─────────────────────────────────────
  if (S.role === 'supervisor') {
    const columnEl = document.querySelector(isC1 ? '.supervisor-column:first-child' : '.supervisor-column:last-child');
    if (columnEl) {
      const item = Object.assign({}, data, {
        peerId: data.peerId || _customerPeerIds[customerId] || null,
        online: data.online === true || _customerOnlineState[customerId] === true
      });
      const peerId = getCustomerPeerIdForCall(item);
      const canTalk = isCustomerOnlineForPeerCall(item) && !!peerId;
      const talkButtonMarkup =
        '<button\n' +
        '  class="talk-to-customer-btn"\n' +
        '  type="button"\n' +
        '  data-peer-id="' + peerId + '"\n' +
        '  ' + (canTalk ? '' : 'disabled') + '\n' +
        '>\n' +
        '  Talk to Customer\n' +
        '</button>';
      const talkBtn = columnEl.querySelector('.talk-to-customer-btn');
      if (!talkBtn) {
        const tpl = document.createElement('template');
        tpl.innerHTML = talkButtonMarkup.trim();
        columnEl.insertBefore(tpl.content.firstChild, balEl ? balEl.nextSibling : columnEl.firstChild);
      } else {
        talkBtn.outerHTML = talkButtonMarkup;
      }
    }
  }

  // ── Interaction log ─────────────────────────────────────────────
  if (logEl && data.logEntries) {
    logEl.innerHTML = '';
    const icons = { user: '👤', aria: '🤖', action: '⚡', system: '⚙', error: '✕' };
    data.logEntries.slice(-60).forEach(function (e) {
      const div = document.createElement('div');
      div.className = 'entry ' + e.type;
      div.innerHTML =
        '<div class="eicon ' + e.type + '">' + (icons[e.type] || '•') + '</div>' +
        '<div class="ebody"><div class="emeta"><span class="ewho ' + e.type + '">' + Helpers.esc(e.who) + '</span>' +
        '<span class="etime">' + e.time + '</span></div>' +
        '<div class="emsg">' + Helpers.esc(e.msg) + '</div></div>';
      logEl.appendChild(div);
    });
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Transaction ledger ──────────────────────────────────────────
  if (bodyEl && data.transactions) {
    if (data.transactions.length > 0) {
      if (emptyEl) emptyEl.style.display = 'none';
      if (tableEl) tableEl.style.display = '';
      bodyEl.innerHTML = '';
      [...data.transactions].reverse().forEach(function (t) {
        const row = document.createElement('tr');
        row.innerHTML =
          '<td style="color:var(--color-text-soft)">' + t.seq + '</td>' +
          '<td style="color:var(--color-text-soft);white-space:nowrap">' + t.time + '</td>' +
          '<td><span class="badge ' + t.action + '">' + Helpers.actionLabel(t.action) + '</span></td>' +
          '<td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + Helpers.esc(t.detail || '') + '">' + Helpers.esc(t.detail || '—') + '</td>' +
          '<td><span class="amt ' + t.amtClass + '">' + t.amount + '</span></td>' +
          '<td><span class="sbadge ' + t.status + '">' + t.status + '</span></td>';
        bodyEl.appendChild(row);
      });
    }
  }
}

function renderSupervisorCustomers() {
  if (!window.S || S.role !== 'supervisor') return;

  ['customer1', 'customer2'].forEach(function(customerId) {
    const isC1 = customerId === 'customer1';
    const columnEl = document.querySelector(isC1 ? '.supervisor-column:first-child' : '.supervisor-column:last-child');
    const balEl = document.getElementById(isC1 ? 'sup1Balances' : 'sup2Balances');
    if (!columnEl) return;

    const item = {
      peerId: _customerPeerIds[customerId] || null,
      online: _customerOnlineState[customerId] === true
    };
    const peerId = getCustomerPeerIdForCall(item);
    const canTalk = isCustomerOnlineForPeerCall(item) && !!peerId;
    const talkButtonMarkup =
      '<button\n' +
      '  class="talk-to-customer-btn"\n' +
      '  type="button"\n' +
      '  data-peer-id="' + peerId + '"\n' +
      '  ' + (canTalk ? '' : 'disabled') + '\n' +
      '>\n' +
      '  Talk to Customer\n' +
      '</button>';
    const talkBtn = columnEl.querySelector('.talk-to-customer-btn');

    if (!talkBtn) {
      const tpl = document.createElement('template');
      tpl.innerHTML = talkButtonMarkup.trim();
      columnEl.insertBefore(tpl.content.firstChild, balEl ? balEl.nextSibling : columnEl.firstChild);
    } else {
      talkBtn.outerHTML = talkButtonMarkup;
    }
  });
}

function refreshSupervisorPresenceFromSnapshots() {
  if (!window.S || S.role !== 'supervisor') return;

  ['customer1', 'customer2'].forEach(function(customerId) {
    const snapshot = _customerSnapshots[customerId];
    if (!snapshot) return;

    const isNowOnline = resolveCustomerOnlineState(snapshot);
    if (_customerOnlineState[customerId] === true && !isNowOnline) {
      const applyFn = typeof window.applyCustomerSnapshot === 'function'
        ? window.applyCustomerSnapshot
        : applyCustomerSnapshot;
      applyFn(customerId, Object.assign({}, snapshot, {
        online: false,
        connected: false,
        status: 'offline',
        presence: 'offline'
      }));
    }
  });
}

function startSupervisorPresenceMonitor() {
  if (supervisorPresenceMonitorId) return;
  supervisorPresenceMonitorId = setInterval(refreshSupervisorPresenceFromSnapshots, SUPERVISOR_PRESENCE_MONITOR_MS);
}

// Builds the complete state snapshot the supervisor needs to mirror the customer UI.
function buildFullSnapshot(extra = {}) {
  const myPeerId = getCurrentPeerIdForSync();
  return Object.assign({
    accounts:     S.accounts,
    transactions: S.transactions  || [],
    logEntries:   S.logEntries    || [],
    txSeq:        S.txSeq         || 0,
    totalDebit:   S.totalDebit    || 0,
    statusLabel:  (typeof DOM !== 'undefined' && DOM.statusLabel)
                    ? DOM.statusLabel.textContent : '',
    peerId:       myPeerId,
    online:       S.role === 'customer'
  }, extra || {});
}

// Debounced publisher — batches rapid addLog() calls into one write every
// 300 ms. Always ships the full state so the supervisor gets a complete picture.
function scheduledPublish(extra = {}, delay = 0) {
  if (_publishTimer) clearTimeout(_publishTimer);
  _publishTimer = setTimeout(function() {
    _publishTimer = null;
    if (S.role !== 'customer') return;   // only the customer publishes state
    publishLiveSnapshot(buildFullSnapshot(extra));
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

  // A lock older than this is considered stale (session crashed without releasing).
  // Must be well above the heartbeat interval (5s) so a live session is never evicted.
  const STALE_LOCK_MS = 30000;

  try {
    const safeCustomerId = typeof customerId === 'string' && customerId.trim()
      ? customerId.trim()
      : 'customer';

    const lockRef = doc(firestoreDb, 'channels', safeCustomerId, 'locks', safeCustomerId);

    await runTransaction(firestoreDb, async (transaction) => {
      const snap = await transaction.get(lockRef);
      const data = snap.exists ? snap.data() : null;

      if (data?.locked === true) {
        // Check if the lock is stale (previous session crashed without releasing).
        const lockedAtMs = data.updatedAt?.toMillis?.() ?? 0;
        const isStale = lockedAtMs === 0 || (Date.now() - lockedAtMs) > STALE_LOCK_MS;

        if (!isStale) {
          throw new Error('customer-lock-already-held');
        }

        logSyncWarn(`Stale customer lock detected (age: ${Date.now() - lockedAtMs}ms) — overwriting`);
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
      logSyncWarn('Customer lock already held by an active session');
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

    const lockRef = doc(firestoreDb, 'channels', safeCustomerId, 'locks', safeCustomerId);

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

async function getCustomerLockStatus(customerId) {
  if (!canUseFirebaseSync() || !firestoreDb) return { locked: false, stale: false };

  try {
    const safeId = typeof customerId === 'string' && customerId.trim() ? customerId.trim() : 'customer1';
    const lockRef = doc(firestoreDb, 'channels', safeId, 'locks', safeId);
    const snap = await getDoc(lockRef);
        if (!snap.exists) return { locked: false, stale: false };
    const data = snap.data();
    if (!data || data.locked !== true) return { locked: false, stale: false };

    const lockedAtMs = data.updatedAt?.toMillis?.() ?? 0;
    const lockStale = lockedAtMs === 0 || (Date.now() - lockedAtMs) > STALE_LOCK_MS;         let heartbeatLive = false;         try {           const stateRef = doc(firestoreDb, 'channels', safeId, 'meta', 'state');           const stateSnap = await getDoc(stateRef);           if (stateSnap.exists) {             const hb = stateSnap.data()?.heartbeatAt || 0;             heartbeatLive = hb > 0 && (Date.now() - hb) < STALE_LOCK_MS;           }         } catch (_) {}         const isStale = lockStale && !heartbeatLive;
    return { locked: !isStale, stale: isStale };
  } catch (err) {
    logSyncWarn('getCustomerLockStatus error', err);
    return { locked: false, stale: false };
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

function refreshCustomerLockTimestamp(roleId) {   if (!canUseFirebaseSync() || !firestoreDb || !roleId) return;   try {     const safeId = String(roleId).trim();     const lockRef = doc(firestoreDb, 'channels', safeId, 'locks', safeId);     lockRef.update({ updatedAt: serverTimestamp() }).catch(() => {});   } catch (e) {} } function stopSessionHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

function subscribeToRemoteSession(){
  if(S.role !== 'supervisor') return;
  startSupervisorPresenceMonitor();

  // ── BroadcastChannel (same device, zero latency) ────────────────
  try {
    const bc = getLocalChannel();
    if (bc) {
      bc.onmessage = function(event) {
        if (!event.data || event.data.type !== 'nexabank_snapshot') return;
        if (S.suppressLocalSideEffects) return;
        applyCustomerSnapshot(event.data.customerId || 'customer1', event.data.payload);
      };
    }
  } catch(bcErr) {
    console.warn('[NexaBank] BroadcastChannel listener failed:', bcErr);
  }

  if (Array.isArray(S.remoteUnsubscribes)) {
    S.remoteUnsubscribes.forEach(fn => { try { if (typeof fn === 'function') fn(); } catch (e) {} });
  }
  S.remoteUnsubscribes = [];

  // ── Firestore (cross-device) ─────────────────────────────────────
  if(!S.firebaseAvailable || !firestoreDb) return;
  try{
    ['customer1','customer2'].forEach(function(customerId){
      const statusEl = document.getElementById(customerId === 'customer1' ? 'sup1Status' : 'sup2Status');
      if(statusEl){
        statusEl.textContent = 'OFFLINE';
        statusEl.className = 'sup-status offline';
      }
    });

    ['customer1','customer2'].forEach(function(customerId){
      const docRef = firestoreDb.collection('channels').doc(customerId).collection('meta').doc('state');
      const unsubscribe = docRef.onSnapshot(function(docSnap) {
                const data = docSnap.exists ? docSnap.data() : null;
        if(!data || S.suppressLocalSideEffects) return;
        applyCustomerSnapshot(customerId, data);
      }, function(err) {
        console.error('[NexaBank] Firestore onSnapshot failed for ' + customerId + ' (' + err.code + '):', err.message);
        const statusEl = document.getElementById(customerId === 'customer1' ? 'sup1Status' : 'sup2Status');
        if(statusEl){
          statusEl.textContent = 'OFFLINE';
          statusEl.className = 'sup-status offline';
        }
      });
      S.remoteUnsubscribes.push(unsubscribe);
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
  // Only the customer tab should ever publish state — supervisor is read-only.
  if (S.role && S.role !== 'customer') return false;

  const channelId = S.customerId || 'global-live-session';
  const isOfflinePayload = hasExplicitOfflineSignal(payload);
  const heartbeatAt = Number(payload.heartbeatAt || 0) || (isOfflinePayload ? 1 : Date.now());
  const syncedPayload = normalizeSyncedCustomerState({
    ...payload,
    peerId: payload.peerId || getCurrentPeerIdForSync(),
    heartbeatAt,
    online: isOfflinePayload ? false : (payload.online === true || S.role === 'customer'),
    connected: isOfflinePayload ? false : (payload.connected === true || S.role === 'customer'),
    status: isOfflinePayload ? 'offline' : (payload.status || 'online'),
    presence: isOfflinePayload ? 'offline' : (payload.presence || 'online')
  });

  // ── Same-device tab sync (zero latency via BroadcastChannel) ────────────
  // Include customerId so the supervisor panel can route to the right column.
  try {
    const bc = getLocalChannel();
    if (bc) bc.postMessage({ type: 'nexabank_snapshot', customerId: channelId, payload: syncedPayload });
  } catch (bcErr) {
    console.warn('[NexaBank] BroadcastChannel post failed:', bcErr);
  }

  if (!canUseFirebaseSync()) return false;

  try {
    const snapshotRef = doc(firestoreDb, 'channels', channelId, 'meta', 'state');

    const safePayload = sanitizeFirestorePayload({
      customerId: channelId,
      role: S.role || 'customer',
      heartbeatAt: typeof syncedPayload?.heartbeatAt === 'number' ? syncedPayload.heartbeatAt : Date.now(),
      ...syncedPayload,
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

function publishOfflinePresence(reason) {
  if (!window.S || S.role !== 'customer') return false;
  if (typeof stopSessionHeartbeat === 'function') stopSessionHeartbeat();

  return publishLiveSnapshot(buildFullSnapshot({
    heartbeatAt: 1,
    online: false,
    connected: false,
    status: 'offline',
    presence: 'offline',
    offlineReason: reason || 'customer-offline'
  }));
}

// Clear all log entries from a supervisor customer column.
// Clears in-memory display only — does not delete Firestore data.
function clearCustomerLog(customerId) {
  const isC1 = customerId === 'customer1';
  const logEl  = document.getElementById(isC1 ? 'sup1Log'  : 'sup2Log');
  const bodyEl = document.getElementById(isC1 ? 'sup1LedgerBody' : 'sup2LedgerBody');
  const tableEl  = document.getElementById(isC1 ? 'sup1LedgerTable'  : 'sup2LedgerTable');
  const emptyEl  = document.getElementById(isC1 ? 'sup1EmptyLedger'  : 'sup2EmptyLedger');
  if (logEl) logEl.innerHTML = '';
  if (bodyEl) bodyEl.innerHTML = '';
  if (tableEl) tableEl.style.display = 'none';
  if (emptyEl) { emptyEl.style.display = ''; emptyEl.textContent = 'Log cleared.'; }
  // Reset the tracked online state so the next heartbeat re-appends a status line
  delete _customerOnlineState[customerId];
  logSyncInfo('clearCustomerLog: cleared display for ' + customerId);
}

if (typeof window !== 'undefined') {
  window.initFirebaseSync = initFirebaseSync;
  window.publishLiveSnapshot = publishLiveSnapshot;
  window.publishOfflinePresence = publishOfflinePresence;
  window.scheduledPublish = scheduledPublish;
  window.buildFullSnapshot = buildFullSnapshot;
  window.startSessionHeartbeat = startSessionHeartbeat;
  window.stopSessionHeartbeat = stopSessionHeartbeat;
  window.acquireCustomerLock = acquireCustomerLock;
  window.releaseCustomerLock = releaseCustomerLock;
  window.canUseFirebaseSync = canUseFirebaseSync;
  window.subscribeToRemoteSession = subscribeToRemoteSession;
  window.syncRoleGateStatus = syncRoleGateStatus;
  window.getCustomerLockStatus = getCustomerLockStatus;
  window.applyCustomerSnapshot = applyCustomerSnapshot;
  window.clearCustomerLog = clearCustomerLog;
  window.refreshCustomerLockTimestamp = refreshCustomerLockTimestamp;
  window.renderSupervisorCustomers = renderSupervisorCustomers;
  window.getCustomerPeerId = function(customerId) {
    return _customerPeerIds[customerId] || null;
  };

  // ── Talk to Customer button click handling ──────────────────────
  document.addEventListener('click', async function(event) {
    const button = event.target.closest('.talk-to-customer-btn');
    if (!button) return;

    const peerId = String(button.dataset.peerId || '').trim();
    if (!peerId) {
      console.warn('[peerjs] cannot call customer: missing peerId');
      return;
    }

    try {
      await window.NexaPeerCalling.callCustomerPeer(peerId);
    } catch (err) {
      console.error('[peerjs] failed to call customer:', err);
    }
  });

  document.addEventListener('nexa:peer-presence-updated', function (event) {
    const detail = event.detail || {};
    if (detail.role !== 'customer' || !detail.peerId || S.role !== 'customer') return;

    if (S.customerId) {
      _customerPeerIds[S.customerId] = detail.peerId;
    }

    if (typeof publishLiveSnapshot === 'function') {
      publishLiveSnapshot(buildFullSnapshot({
        peerId: detail.peerId,
        online: true,
        connected: true,
        status: 'online',
        heartbeatAt: Date.now()
      }));
    }
  });

  document.addEventListener('nexa:peer-presence-updated', function () {
    if (typeof renderSupervisorCustomers === 'function') {
      renderSupervisorCustomers();
    }
  });

  // ── Release lock on tab close / navigation ──────────────────────
  function _releaseActiveSessionLock(markOffline) {
    const roleId = window.S && (S.customerId || S.role);
    if (markOffline === true && window.S && S.role === 'customer' && typeof publishOfflinePresence === 'function') {
      publishOfflinePresence('tab-closing');
    }
    if (roleId && typeof releaseCustomerLock === 'function') {
      releaseCustomerLock(roleId).catch(() => {});
    }
  }

  window.addEventListener('pagehide', function() {
    _releaseActiveSessionLock(true);
  });
  window.addEventListener('beforeunload', function() {
    _releaseActiveSessionLock(true);
  });
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') _releaseActiveSessionLock(false);
  });
}
