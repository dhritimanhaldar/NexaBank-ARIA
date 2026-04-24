// Ensure inline HTML handlers work safely
if(typeof initMic === 'undefined') console.error('initMic not found on window');
if(typeof toggleMute === 'undefined') console.error('toggleMute not found on window');
if(typeof sendManual === 'undefined') console.error('sendManual not found on window');
if(typeof runHint === 'undefined') console.error('runHint not found on window');
if(typeof clearLog === 'undefined') console.error('clearLog not found on window');
if(typeof enterAsCustomer === 'undefined') console.error('enterAsCustomer not found on window');
if(typeof bootRoleGate === 'undefined') console.warn('[globals] bootRoleGate not yet registered — will be set by role-gate.js');
if(typeof enterAsSupervisor === 'undefined') console.error('enterAsSupervisor not found on window');
window.NexaBankGlobals = window.NexaBankGlobals || {};

window.NexaBankGlobals.refreshRoleGateButtons = function (...args) {
  if (typeof window.refreshRoleGateButtons === 'function') {
    return window.refreshRoleGateButtons(...args);
  }
  console.warn('refreshRoleGateButtons not found on window');
  return Promise.resolve(false);
};

// bootRoleGate is the old name — proxy it to refreshRoleGateButtons
window.NexaBankGlobals.bootRoleGate = function (...args) {
  if (typeof window.refreshRoleGateButtons === 'function') {
    return window.refreshRoleGateButtons(...args);
  }
  console.warn('bootRoleGate / refreshRoleGateButtons not found on window');
  return Promise.resolve(false);
};

window.NexaBankGlobals.enterAsCustomer = function (...args) {
  if (typeof window.enterAsCustomer === 'function') {
    return window.enterAsCustomer(...args);
  }
  console.warn('enterAsCustomer not found on window');
  return Promise.resolve(false);
};

window.NexaBankGlobals.enterAsSupervisor = function (...args) {
  if (typeof window.enterAsSupervisor === 'function') {
    return window.enterAsSupervisor(...args);
  }
  console.warn('enterAsSupervisor not found on window');
  return Promise.resolve(false);
};

window.NexaBankGlobals.initFirebaseSync = function (...args) {
  if (typeof window.initFirebaseSync === 'function') {
    return window.initFirebaseSync(...args);
  }
  console.warn('initFirebaseSync not found on window');
  return Promise.resolve(false);
};

window.NexaBankGlobals.acquireCustomerLock = function (...args) {
  if (typeof window.acquireCustomerLock === 'function') {
    return window.acquireCustomerLock(...args);
  }
  return Promise.resolve(false);
};

window.NexaBankGlobals.releaseCustomerLock = function (...args) {
  if (typeof window.releaseCustomerLock === 'function') {
    return window.releaseCustomerLock(...args);
  }
  return Promise.resolve(false);
};

window.NexaBankGlobals.canUseFirebaseSync = function (...args) {
  if (typeof window.canUseFirebaseSync === 'function') {
    return window.canUseFirebaseSync(...args);
  }
  return false;
};