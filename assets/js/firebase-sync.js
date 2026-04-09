let firebaseApp = null;
let firestoreDb = null;

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
  if(!S.firebaseAvailable || !firestoreDb || S.role !== 'supervisor') return;
  try{
    const docRef = firestoreDb.collection('channels').doc(S.sessionChannelId).collection('meta').doc('state');
    S.remoteUnsubscribe = docRef.onSnapshot((doc) => {
      if(doc.exists && !S.suppressLocalSideEffects){
        const data = doc.data();
        // hydrate remote state into local for supervisor view
        if(data.logEntries) S.logEntries = data.logEntries;
        if(data.txSeq !== undefined) S.txSeq = data.txSeq;
        if(data.totalDebit !== undefined) S.totalDebit = data.totalDebit;
        if(data.accounts) S.accounts = data.accounts;
        if(data.statusLabel) DOM.statusLabel.textContent = data.statusLabel;
        if(typeof drawFlat === 'function') drawFlat();
        if(typeof renderLog === 'function') renderLog();
      }
    }, (err) => {
      console.warn('Remote session subscribe failed:', err);
    });
  }catch(err){
    console.warn('Subscribe to remote session failed:', err);
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
  if(!S.firebaseAvailable || !firestoreDb || S.role !== 'customer') return;
  try{
    const docRef = firestoreDb.collection('channels').doc(S.sessionChannelId).collection('meta').doc('state');
    const snapshot = {
      logEntries: S.logEntries,
      txSeq: S.txSeq,
      totalDebit: S.totalDebit,
      accounts: S.accounts,
      role: S.role,
      sessionId: S.sessionId,
      statusLabel: DOM.statusLabel ? DOM.statusLabel.textContent : '',
      updatedAt: Date.now()
    };
    docRef.set(snapshot, {merge: true});
  }catch(err){
    console.warn('Publish live snapshot failed:', err);
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