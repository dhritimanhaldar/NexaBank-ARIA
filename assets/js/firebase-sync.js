let firebaseApp = null;
let firestoreDb = null;
let _localBc = null;
let _publishTimer = null;

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
function scheduledPublish() {
  if (_publishTimer) clearTimeout(_publishTimer);
  _publishTimer = setTimeout(function() {
    _publishTimer = null;
    publishLiveSnapshot();
  }, 300);
}

function initFirebaseSync(){
  try{
    if(typeof firebase === 'undefined' || !window.NEXA_FIREBASE_CONFIG){
      S.firebaseAvailable = false;
      return;
    }
    if(firebaseApp) return; // already initialized
    firebaseApp = firebase.initializeApp(window.NEXA_FIREBASE_CONFIG);
    firestoreDb = firebase.firestore();
    S.firebaseAvailable = true;
    // Immediately verify Firestore is accessible and print result to console.
    _testFirebaseWrite();
  }catch(err){
    console.warn('Firebase init failed, falling back to local mode:', err);
    S.firebaseAvailable = false;
  }
}

function acquireCustomerLock(){
  if(!S.firebaseAvailable || !firestoreDb) return true; // allow in local mode
  try{
    const docRef = firestoreDb.collection('channels').doc(S.sessionChannelId).collection('meta').doc('state');
    const now = Date.now();
    return firestoreDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if(doc.exists){
        const data = doc.data();
        if(data.role === 'customer' && data.sessionId !== S.sessionId && (now - data.updatedAt) < S.heartbeatExpiryMs){
          return false; // lock held by another session
        }
      }
      transaction.set(docRef, {role: 'customer', sessionId: S.sessionId, updatedAt: now}, {merge: true});
      return true;
    });
  }catch(err){
    console.warn('Customer lock acquire failed:', err);
    return true; // allow on error
  }
}

function releaseCustomerLock(){
  if(!S.firebaseAvailable || !firestoreDb) return;
  try{
    const docRef = firestoreDb.collection('channels').doc(S.sessionChannelId).collection('meta').doc('state');
    firestoreDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if(doc.exists && doc.data().sessionId === S.sessionId){
        transaction.update(docRef, {role: null, sessionId: null, updatedAt: Date.now()});
      }
    });
  }catch(err){
    console.warn('Customer lock release failed:', err);
  }
}

function startSessionHeartbeat(){
  if(!S.firebaseAvailable || !firestoreDb || S.role !== 'customer') return;
  stopSessionHeartbeat();
  S.heartbeatTimer = setInterval(() => {
    try{
      const docRef = firestoreDb.collection('channels').doc(S.sessionChannelId).collection('meta').doc('state');
      docRef.set({role: 'customer', sessionId: S.sessionId, updatedAt: Date.now()}, {merge: true});
    }catch(err){
      console.warn('Heartbeat update failed:', err);
    }
  }, S.heartbeatIntervalMs);
}

function stopSessionHeartbeat(){
  if(S.heartbeatTimer){
    clearInterval(S.heartbeatTimer);
    S.heartbeatTimer = null;
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
      if(doc.exists && !S.suppressLocalSideEffects){
        applyRemoteSnapshot(doc.data());
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
  if(!S.firebaseAvailable || !firestoreDb || S.role !== 'customer') return;
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

function publishLiveSnapshot(){
  if(S.role !== 'customer') return;

  const payload = {
    logEntries: S.logEntries,
    transactions: S.transactions,
    txSeq: S.txSeq,
    totalDebit: S.totalDebit,
    accounts: S.accounts,
    sessionId: S.sessionId,
    statusLabel: DOM.statusLabel ? DOM.statusLabel.textContent : ''
  };

  // ── BroadcastChannel (same device, instant) ──────────────────────
  try {
    const bc = getLocalChannel();
    if (bc) {
      bc.postMessage({ type: 'nexabank_snapshot', payload: payload });
    }
  } catch(bcErr) {
    console.warn('[NexaBank] BroadcastChannel post failed:', bcErr);
  }

  // ── Firestore (cross-device) ──────────────────────────────────────
  if(!S.firebaseAvailable || !firestoreDb) return;
  try{
    const docRef = firestoreDb.collection('channels').doc(S.sessionChannelId).collection('meta').doc('state');
    docRef
      .set(Object.assign({}, payload, { role: S.role, updatedAt: Date.now() }), { merge: true })
      .catch(function(err) {
        // This .catch() is critical — docRef.set() returns a Promise and
        // Firestore rule rejections are async, invisible to the try/catch above.
        console.error('[NexaBank] Firestore write failed (' + err.code + '):', err.message);
      });
  }catch(err){
    console.warn('[NexaBank] publishLiveSnapshot sync error:', err);
  }
}

window.initFirebaseSync = initFirebaseSync;
window.acquireCustomerLock = acquireCustomerLock;
window.releaseCustomerLock = releaseCustomerLock;
window.startSessionHeartbeat = startSessionHeartbeat;
window.stopSessionHeartbeat = stopSessionHeartbeat;
window.subscribeToRemoteSession = subscribeToRemoteSession;
window.publishRemoteEvent = publishRemoteEvent;
window.syncRoleGateStatus = syncRoleGateStatus;
window.publishLiveSnapshot = publishLiveSnapshot;
window.scheduledPublish = scheduledPublish;