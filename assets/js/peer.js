// PeerJS voice call module for Supervisor ↔ Customer direct calls
// Uses PeerJS library for WebRTC peer-to-peer audio (no server proxy for media)

(function() {
  let peer = null;
  let currentCall = null;
  let localStream = null;
  let peerId = null;
  let isConnected = false;

  function initPeerJS() {
    if (peer) return;
    try {
      peerId = window.createNexaPeerId('nexabank');
      peer = new Peer(peerId, {
        host: window.NEXA_PEERJS.host,
        port: window.NEXA_PEERJS.port,
        path: window.NEXA_PEERJS.path,
        key: window.NEXA_PEERJS.key,
        secure: window.NEXA_PEERJS.secure,
        config: { iceServers: window.NEXA_PEERJS.iceServers }
      });

      peer.on('open', function(id) {
        console.log('[peer] connected to signaling server, my id:', id);
        isConnected = true;
        if (typeof window.setPeerId === 'function') {
          window.setPeerId(id);
        }
      });

      peer.on('call', function(call) {
        console.log('[peer] incoming call from:', call.peer);
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then(function(stream) {
            localStream = stream;
            call.answer(stream);
            currentCall = call;
            setupCallListeners(call);
            if (typeof setCallingState === 'function') setCallingState(true);
            if (typeof setStatus === 'function') setStatus('live', 'ON CALL');
            if (typeof setPeerCallActive === 'function') setPeerCallActive(true);
          })
          .catch(function(err) {
            console.error('[peer] getUserMedia failed:', err);
            call.close();
            showCallToast('Microphone access denied.');
          });
      });

      peer.on('error', function(err) {
        console.error('[peer] error:', err);
        showCallToast('Peer connection failed: ' + err.type);
      });

      peer.on('disconnected', function() {
        console.log('[peer] disconnected from signaling server');
        isConnected = false;
      });

    } catch (e) {
      console.error('[peer] init failed:', e);
    }
  }

  function setupCallListeners(call) {
    call.on('stream', function(remoteStream) {
      console.log('[peer] remote stream received');
      const audio = document.getElementById('peer-call-audio');
      if (audio) {
        audio.srcObject = remoteStream;
        audio.play().catch(function(e) {
          console.warn('[peer] autoplay blocked:', e);
        });
      }
    });

    call.on('close', function() {
      console.log('[peer] call closed');
      endCall();
    });

    call.on('error', function(err) {
      console.error('[peer] call error:', err);
      endCall();
    });
  }

  function startCall(targetPeerId) {
    if (!peer || !isConnected) {
      initPeerJS();
      setTimeout(function() { startCall(targetPeerId); }, 1500);
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(function(stream) {
        localStream = stream;
        const call = peer.call(targetPeerId, stream);
        currentCall = call;
        setupCallListeners(call);
        if (typeof setCallingState === 'function') setCallingState(true);
        if (typeof setStatus === 'function') setStatus('live', 'ON CALL');
        if (typeof setPeerCallActive === 'function') setPeerCallActive(true);
      })
      .catch(function(err) {
        console.error('[peer] getUserMedia failed:', err);
        showCallToast('Microphone access denied.');
      });
  }

  function endCall() {
    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(function(track) { track.stop(); });
      localStream = null;
    }
    const audio = document.getElementById('peer-call-audio');
    if (audio) {
      audio.srcObject = null;
    }
    if (typeof setCallingState === 'function') setCallingState(false);
    if (typeof setStatus === 'function') setStatus('live', 'READY');
    if (typeof setPeerCallActive === 'function') setPeerCallActive(false);
  }

  function hangup() {
    if (currentCall) {
      currentCall.close();
    }
    endCall();
  }

  function isPeerConnected() {
    return isConnected && peer !== null;
  }

  function getMyPeerId() {
    return peerId;
  }

  function cleanup() {
    hangup();
    if (peer) {
      peer.destroy();
      peer = null;
    }
    isConnected = false;
    peerId = null;
  }

  function showCallToast(msg) {
    if (typeof showToast === 'function') {
      showToast('INFO', msg);
    } else {
      console.log('[peer] toast:', msg);
    }
  }

  window.startPeerCall = startCall;
  window.hangupPeerCall = hangup;
  window.endPeerCall = endCall;
  window.isPeerConnected = isPeerConnected;
  window.getMyPeerId = getMyPeerId;
  window.initPeerJS = initPeerJS;
  window.cleanupPeerJS = cleanup;
  if (typeof window.setPeerCallActive !== 'function') {
    window.setPeerCallActive = function() {};
  }
})();
