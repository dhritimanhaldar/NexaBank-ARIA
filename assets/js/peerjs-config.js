(function () {
  'use strict';

  window.NEXA_PEERJS = {
    host: 'nexabank-peerjs-server.onrender.com',
    port: 443,
    path: '/peerjs',
    key: 'NexaBank-ARIA-peerkey-secret',
    secure: true,
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  window.createNexaPeerId = function createNexaPeerId(prefix) {
    const base = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : ('peer-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

    return prefix ? `${prefix}-${base}` : base;
  };
})();