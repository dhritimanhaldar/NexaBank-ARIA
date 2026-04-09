const S = {
  isListening:  false,
  isThinking:   false,
  isSpeaking:   false,
  isMuted:      false,
  micReady:     false,
  permissionAsked: (window.safeStorageGet ? safeStorageGet('ariaMicPermissionAsked', '0') : '0') === '1',
  permissionGranted: (window.safeStorageGet ? safeStorageGet('ariaMicPermissionGranted', '0') : '0') === '1',

  sessionId: 'SES-'+Math.random().toString(36).slice(2,7).toUpperCase(),
  accounts:  { savings:124500, current:58200 },
  customerProfile: {
    fullName: 'Dhritiman Haldar',
    mobile: '+91 98765 43210',
    email: 'dhritiman@example.com',
    city: 'Pune',
    address: 'Baner, Pune, Maharashtra',
    panMasked: 'ABCDE1234X',
    kycStatus: 'Verified'
  },
  totalDebit:0, txSeq:0, logEntries:[],

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
  presenceUnsubscribe: null,
  suppressLocalSideEffects: false,
  firebaseAvailable: false
};

document.getElementById('sessionId').textContent = S.sessionId;

window.S = S;