const S = {
  isListening:  false,
  isThinking:   false,
  isSpeaking:   false,
  isMuted:      false,
  micReady:     false,
  permissionAsked: localStorage.getItem('ariaMicPermissionAsked') === '1',
  permissionGranted: localStorage.getItem('ariaMicPermissionGranted') === '1',

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
};

document.getElementById('sessionId').textContent = S.sessionId;

window.S = S;