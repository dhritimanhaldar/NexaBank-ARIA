(function () {
  'use strict';

  let peerInstance = null;
  let localStreamPromise = null;
  let activeCall = null;

  function getRole() {
    return (window.S && window.S.role) || document.body?.dataset?.role || 'customer';
  }

  function getPeerState() {
    if (!window.S) window.S = {};
    if (!window.S.peer) {
      window.S.peer = {
        id: null,
        connected: false,
        ready: false,
        lastError: null
      };
    }
    return window.S.peer;
  }

  async function getLocalAudioStream() {
    if (!localStreamPromise) {
      localStreamPromise = navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
    }
    return localStreamPromise;
  }

  function ensurePeerLibraryLoaded() {
    if (typeof window.Peer !== 'function') {
      throw new Error('PeerJS client library is not loaded');
    }
  }

  function getMyPeerId() {
    const role = getRole();
    const peerState = getPeerState();
    if (!peerState.id) {
      peerState.id = window.createNexaPeerId(role);
    }
    return peerState.id;
  }

  function writePeerIdIntoKnownState(peerId) {
    const role = getRole();

    if (!window.S) window.S = {};

    if (role === 'customer') {
      if (!window.S.customerSession || typeof window.S.customerSession !== 'object') {
        window.S.customerSession = {};
      }
      window.S.customerSession.peerId = peerId;
      window.S.customerSession.online = true;

      if (!window.S.currentCustomer || typeof window.S.currentCustomer !== 'object') {
        window.S.currentCustomer = {};
      }
      window.S.currentCustomer.peerId = peerId;
      window.S.currentCustomer.online = true;

      if (window.S.session && typeof window.S.session === 'object') {
        window.S.session.peerId = peerId;
        window.S.session.online = true;
      }
    }

    if (role === 'supervisor') {
      if (!window.S.supervisorSession || typeof window.S.supervisorSession !== 'object') {
        window.S.supervisorSession = {};
      }
      window.S.supervisorSession.peerId = peerId;
      window.S.supervisorSession.online = true;
    }
  }

  function broadcastPeerPresence(peerId) {
    document.dispatchEvent(new CustomEvent('nexa:peer-presence-updated', {
      detail: {
        role: getRole(),
        peerId,
        connected: true,
        online: true
      }
    }));
  }

  function attachIncomingCallHandler(peer) {
    peer.on('call', async (call) => {
      try {
        const stream = await getLocalAudioStream();
        activeCall = call;
        call.answer(stream);
        call.on('stream', (remoteStream) => {
          playRemoteAudio(remoteStream);
        });
        call.on('close', () => {
          activeCall = null;
        });
      } catch (err) {
        console.error('[peerjs] failed to answer incoming call:', err);
      }
    });
  }

  function playRemoteAudio(stream) {
    let audio = document.getElementById('peerjs-remote-audio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'peerjs-remote-audio';
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }
    audio.srcObject = stream;
  }

  async function initPeerCalling() {
    ensurePeerLibraryLoaded();

    if (peerInstance) return peerInstance;

    const myPeerId = getMyPeerId();
    const peerState = getPeerState();

    peerInstance = new window.Peer(myPeerId, {
      host: window.NEXA_PEERJS.host,
      port: window.NEXA_PEERJS.port,
      path: window.NEXA_PEERJS.path,
      key: window.NEXA_PEERJS.key,
      secure: window.NEXA_PEERJS.secure,
      config: { iceServers: window.NEXA_PEERJS.iceServers },
      debug: 2
    });

    peerInstance.on('open', () => {
      peerState.connected = true;
      peerState.ready = true;
      peerState.lastError = null;

      writePeerIdIntoKnownState(myPeerId);
      broadcastPeerPresence(myPeerId);

      console.log('[peerjs] connected as', myPeerId);
    });

    peerInstance.on('error', (err) => {
      peerState.lastError = err ? String(err.message || err) : 'unknown';
      console.error('[peerjs] error:', err);
    });

    peerInstance.on('disconnected', () => {
      peerState.connected = false;
      peerState.ready = false;
    });

    attachIncomingCallHandler(peerInstance);
    return peerInstance;
  }

  async function callCustomerPeer(customerPeerId) {
    if (!customerPeerId) {
      throw new Error('Missing customer peer id');
    }

    const peer = await initPeerCalling();
    const peerState = getPeerState();

    if (!peerState.ready) {
      throw new Error('PeerJS connection is not ready yet');
    }

    const stream = await getLocalAudioStream();
    const call = peer.call(customerPeerId, stream);

    activeCall = call;

    call.on('stream', (remoteStream) => {
      playRemoteAudio(remoteStream);
    });

    call.on('close', () => {
      activeCall = null;
    });

    call.on('error', (err) => {
      console.error('[peerjs] call failed:', err);
    });

    return call;
  }

  window.NexaPeerCalling = {
    initPeerCalling,
    callCustomerPeer,
    getMyPeerId
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (window.NEXA_PEERJS && typeof window.Peer === 'function') {
      initPeerCalling().catch((err) => {
        console.error('[peerjs] init failed:', err);
      });
    }
  });
})();
