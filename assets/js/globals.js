// Ensure inline HTML handlers work safely
if(typeof initMic === 'undefined') console.error('initMic not found on window');
if(typeof toggleMute === 'undefined') console.error('toggleMute not found on window');
if(typeof sendManual === 'undefined') console.error('sendManual not found on window');
if(typeof runHint === 'undefined') console.error('runHint not found on window');
if(typeof clearLog === 'undefined') console.error('clearLog not found on window');
if(typeof bootRoleGate === 'undefined') console.error('bootRoleGate not found on window');
if(typeof enterAsCustomer === 'undefined') console.error('enterAsCustomer not found on window');
if(typeof enterAsSupervisor === 'undefined') console.error('enterAsSupervisor not found on window');
if(typeof initFirebaseSync === 'undefined') console.error('initFirebaseSync not found on window');

window.NexaBankGlobals = window.NexaBankGlobals || {};

window.NexaBankGlobals.initFirebaseSync = function (...args) {
  if (typeof window.initFirebaseSync === 'function') {
    return window.initFirebaseSync(...args);
  }
  console.warn('initFirebaseSync not found on window');
  return Promise.resolve(false);
};

window.NexaBankGlobals.publishLiveSnapshot = function (...args) {
  if (typeof window.publishLiveSnapshot === 'function') {
    return window.publishLiveSnapshot(...args);
  }
  return Promise.resolve(false);
};

window.NexaBankGlobals.acquireCustomerLock = function (...args) {
  if (typeof window.acquireCustomerLock === 'function') {
    return window.acquireCustomerLock(...args);
  }
  return Promise.resolve(false);
};

window.NexaBankGlobals.canUseFirebaseSync = function (...args) {
  if (typeof window.canUseFirebaseSync === 'function') {
    return window.canUseFirebaseSync(...args);
  }
  return false;
};