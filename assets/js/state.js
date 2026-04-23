const CUSTOMER_PROFILES = {
  customer1: {
    fullName: 'Dhritiman Haldar',
    mobile: '+91 98765 43210',
    email: 'dhritiman@example.com',
    city: 'Pune',
    address: 'Baner, Pune, Maharashtra',
    panMasked: 'ABCDE1234X',
    kycStatus: 'Verified',
    savings: 124500,
    current: 58200,
    savingsAccNum: '4821',
    currentAccNum: '9034'
  },
  customer2: {
    fullName: 'Priya Sharma',
    mobile: '+91 91234 56789',
    email: 'priya.sharma@example.com',
    city: 'Mumbai',
    address: 'Bandra West, Mumbai, Maharashtra',
    panMasked: 'FGHIJ5678Y',
    kycStatus: 'Verified',
    savings: 287300,
    current: 112850,
    savingsAccNum: '7362',
    currentAccNum: '5518'
  }
};
window.CUSTOMER_PROFILES = CUSTOMER_PROFILES;

const S = {
  isListening:  false,
  isThinking:   false,
  isSpeaking:   false,
  isMuted:      false,
  micReady:     false,
  permissionAsked: (window.safeStorageGet ? safeStorageGet('ariaMicPermissionAsked', '0') : '0') === '1',
  permissionGranted: (window.safeStorageGet ? safeStorageGet('ariaMicPermissionGranted', '0') : '0') === '1',
  currentRole: null,
  micPermissionGranted: false,
  recognitionActive: false,
  silenceTimeoutId: null,
  maxListenTimeoutId: null,
  hasDetectedSpeech: false,
  micPermissionInFlight: false,
  activeModal: null,

  sessionId: 'SES-'+Math.random().toString(36).slice(2,7).toUpperCase(),
  accounts:  { savings: 0, current: 0 },
  customerProfile: null,
  customerId: null,
  totalDebit:0, txSeq:0, logEntries:[], transactions:[],

  recognition:   null,
  audioCtx:      null,
  analyser:      null,
  waveAnim:      null,
  vadAnim:       null,
  _stream:       null,

  silenceTimer:    null,   // fires after 2s of silence → process
  autoListenTimer: null,   // fires 1s after ARIA stops → start listening
  pendingFinal:    '',     // accumulated final transcript during a listen session
  vadSpeechDetected: false,
  vadSilenceStart:   null,
  pendingTransaction: null,  // stores incomplete transaction details
  pendingTask: null,
  role: null,
  sessionChannelId: 'global-live-session',
  customerLock: null,
  isSupervisorView: false,
  heartbeatTimer: null,
  heartbeatIntervalMs: 5000,
  heartbeatExpiryMs: 15000,
  remoteUnsubscribe: null,
  remoteUnsubscribes: [],
  presenceUnsubscribe: null,
  suppressLocalSideEffects: false,
  firebaseAvailable: false
};

document.getElementById('sessionId').textContent = S.sessionId;

function setCurrentRole(role) {
  S.currentRole = role;
  S.role = role;
}

function setMicPermissionGranted(value) {
  const granted = Boolean(value);
  S.micPermissionGranted = granted;
  S.permissionGranted = granted;
}

function setListening(value) {
  const active = Boolean(value);
  S.isListening = active;
  S.recognitionActive = active;
}

function clearRecognitionTimers() {
  if (S.silenceTimeoutId) {
    clearTimeout(S.silenceTimeoutId);
    S.silenceTimeoutId = null;
  }
  if (S.maxListenTimeoutId) {
    clearTimeout(S.maxListenTimeoutId);
    S.maxListenTimeoutId = null;
  }
}

function resetSpeechFlags() {
  S.hasDetectedSpeech = false;
}

function setMicPermissionInFlight(value) {
  S.micPermissionInFlight = Boolean(value);
}

function setActiveModal(value) {
  S.activeModal = value;
}

window.appState = S;
window.setCurrentRole = setCurrentRole;
window.setMicPermissionGranted = setMicPermissionGranted;
window.setListening = setListening;
window.clearRecognitionTimers = clearRecognitionTimers;
window.resetSpeechFlags = resetSpeechFlags;
window.setMicPermissionInFlight = setMicPermissionInFlight;
window.setActiveModal = setActiveModal;
window.S = S;