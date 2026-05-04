// Supervisor-specific functionality for managing customer interactions and peer calls

let supervisorState = {
  customerSessions: {
    customer1: { id: 'customer1', status: 'offline', peerId: null, isSpeaking: false, isThinking: false },
    customer2: { id: 'customer2', status: 'offline', peerId: null, isSpeaking: false, isThinking: false }
  },
  activeCallCustomerId: null
};
let supervisorSpeechRecognition = null;
let supervisorSpeechRestart = false;
let supervisorTranscriptCustomerId = null;

function hasMeaningfulSupervisorTranscript(text) {
  return typeof text === 'string' && text.trim().replace(/\s+/g, ' ').length >= 2;
}

function getCustomerPeerIdForCall(item) {
  if (!item || typeof item !== 'object') return '';
  return String(
    item.peerId ||
    item.customerPeerId ||
    item.sessionPeerId ||
    ''
  ).trim();
}

function isCustomerOnlineForPeerCall(item) {
  if (!item || typeof item !== 'object') return false;
  if (hasCustomerOfflineSignal(item)) return false;
  if (item.heartbeatAt) return hasFreshCustomerHeartbeat(item);
  return !!(
    item.online === true ||
    item.isOnline === true ||
    item.connected === true ||
    item.status === 'online' ||
    item.presence === 'online' ||
    item.locked === true
  );
}

function hasCustomerOfflineSignal(item) {
  return !!(
    item &&
    typeof item === 'object' &&
    (
      item.online === false ||
      item.connected === false ||
      item.status === 'offline' ||
      item.presence === 'offline' ||
      item.heartbeatAt === 1 ||
      item.heartbeatAt === 0
    )
  );
}

function hasFreshCustomerHeartbeat(item) {
  const heartbeatAt = Number(item?.heartbeatAt || 0);
  return heartbeatAt > 1 && (Date.now() - heartbeatAt) < 15000;
}

function initSupervisorUI() {
  if (S.role !== 'supervisor') return;

  // Add "Talk to Customer" buttons to each column
  const columns = document.querySelectorAll('.supervisor-column');
  columns.forEach(function(col, idx) {
    const customerId = idx === 0 ? 'customer1' : 'customer2';
    const h3 = col.querySelector('h3');
    if (h3) {
      const item = supervisorState.customerSessions[customerId] || {};
      const peerId = getCustomerPeerIdForCall(item);
      const isActiveCall = supervisorState.activeCallCustomerId === customerId;
      const canTalk = isCustomerOnlineForPeerCall(item) && !!peerId && !supervisorState.activeCallCustomerId;
      const talkButtonMarkup =
        '<button\n' +
        '  class="talk-to-customer-btn' + (isActiveCall ? ' active-call' : '') + '"\n' +
        '  type="button"\n' +
        '  data-customer-id="' + customerId + '"\n' +
        '  data-peer-id="' + peerId + '"\n' +
        '  ' + (canTalk ? '' : 'disabled') + '\n' +
        '>\n' +
        '  ' + (isActiveCall ? 'On call' : 'Talk to Customer') + '\n' +
        '</button>';
      const existingBtn = col.querySelector('.talk-to-customer-btn');

      if (!existingBtn) {
        const tpl = document.createElement('template');
        tpl.innerHTML = talkButtonMarkup.trim();
        h3.parentNode.insertBefore(tpl.content.firstChild, h3.nextSibling);
      } else {
        existingBtn.outerHTML = talkButtonMarkup;
      }
    }
  });
}

function determineTalkButtonState(customerId) {
  const session = supervisorState.customerSessions[customerId];
  if (!session) return true;

  const peerId = getCustomerPeerIdForCall(session);
  const canTalk = isCustomerOnlineForPeerCall(session) && !!peerId && !supervisorState.activeCallCustomerId;
  return !canTalk;
}

async function handleTalkToCustomer(customerId) {
  const session = supervisorState.customerSessions[customerId];
  const peerId = getCustomerPeerIdForCall(session);

  if (!peerId) {
    console.warn('[peerjs] cannot call customer: missing peerId');
    return;
  }

  try {
    setCallingState(true, customerId);
    const call = await window.NexaPeerCalling.callCustomerPeer(peerId);
    if (call && typeof call.on === 'function') {
      call.on('close', function() {
        setCallingState(false);
      });
      call.on('error', function() {
        setCallingState(false);
      });
    }
  } catch (err) {
    setCallingState(false);
    console.error('[peerjs] failed to call customer:', err);
  }
}

function setCallingState(isCalling, customerId) {
  if (isCalling && customerId) supervisorState.activeCallCustomerId = customerId;
  if (!isCalling) supervisorState.activeCallCustomerId = null;

  const btns = document.querySelectorAll('.talk-to-customer-btn');
  btns.forEach(function(btn) {
    const buttonCustomerId = getCustomerIdForButton(btn);
    const isActiveButton = !!isCalling && supervisorState.activeCallCustomerId === buttonCustomerId;
    btn.textContent = isActiveButton ? 'On call' : 'Talk to Customer';
    btn.classList.toggle('active-call', isActiveButton);
  });
  updateTalkButtonStates();

  if (supervisorState.activeCallCustomerId) {
    startSupervisorCallTranscription(supervisorState.activeCallCustomerId);
  } else {
    stopSupervisorCallTranscription();
  }
}

function updateCustomerSession(customerId, data) {
  if (!supervisorState.customerSessions[customerId]) {
    supervisorState.customerSessions[customerId] = { id: customerId };
  }

  const session = supervisorState.customerSessions[customerId];
  const isOffline = hasCustomerOfflineSignal(data);
  const previousPeerId = session.peerId || null;
  const incomingPeerId = data.peerId || null;
  const peerIdChanged = !!(previousPeerId && incomingPeerId && previousPeerId !== incomingPeerId);

  // Update status based on heartbeat
  if (data.heartbeatAt) {
    const isOnline = hasFreshCustomerHeartbeat(data) && !isOffline;
    session.status = isOnline ? 'online' : 'offline';
    session.online = isOnline;
  }

  session.peerId = data.peerId || session.peerId || null;
  session.online = isOffline
    ? false
    : (data.online === true || data.status === 'online' || data.connected === true || session.online === true);
  session.status = session.online ? 'online' : 'offline';

  if ((!session.online || peerIdChanged) && supervisorState.activeCallCustomerId === customerId) {
    setCallingState(false);
  }

  // Store peerId for calls
  if (data.peerId) {
    session.peerId = data.peerId;
  }

  // Update speaking/thinking state
  if (typeof data.isSpeaking !== 'undefined') {
    session.isSpeaking = data.isSpeaking;
  }
  if (typeof data.isThinking !== 'undefined') {
    session.isThinking = data.isThinking;
  }
  
  updateTalkButtonStates();
}

function updateTalkButtonStates() {
  const btns = document.querySelectorAll('.talk-to-customer-btn');
  btns.forEach(function(btn) {
    const customerId = getCustomerIdForButton(btn);
    const item = supervisorState.customerSessions[customerId] || {};
    const peerId = getCustomerPeerIdForCall(item);
    const isActiveButton = supervisorState.activeCallCustomerId === customerId;
    const canTalk = isCustomerOnlineForPeerCall(item) && !!peerId && !supervisorState.activeCallCustomerId;
    btn.classList.toggle('active-call', isActiveButton);
    btn.textContent = isActiveButton ? 'On call' : 'Talk to Customer';
    btn.dataset.customerId = customerId;
    btn.dataset.peerId = peerId;
    btn.disabled = !canTalk;
  });
}

function getCustomerIdForButton(button) {
  const fromDataset = String(button?.dataset?.customerId || '').trim();
  if (fromDataset) return fromDataset;

  const column = button?.closest?.('.supervisor-column');
  const columns = Array.from(document.querySelectorAll('.supervisor-column'));
  return columns.indexOf(column) === 1 ? 'customer2' : 'customer1';
}

function startSupervisorCallTranscription(customerId) {
  if (!window.S || S.role !== 'supervisor') return;
  if (supervisorSpeechRecognition && supervisorTranscriptCustomerId === customerId) return;

  stopSupervisorCallTranscription();

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn('[supervisor] SpeechRecognition unavailable for live call transcript');
    return;
  }

  supervisorTranscriptCustomerId = customerId;
  supervisorSpeechRestart = true;

  const rec = new SR();
  supervisorSpeechRecognition = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-IN';
  rec.maxAlternatives = 1;

  rec.onresult = function(event) {
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result || !result[0] || !result.isFinal) continue;
      finalText = (finalText + ' ' + (result[0].transcript || '')).trim();
    }

    if (!hasMeaningfulSupervisorTranscript(finalText)) return;
    if (typeof window.publishSupervisorCallTranscript === 'function') {
      window.publishSupervisorCallTranscript(customerId, finalText);
    }
  };

  rec.onerror = function(event) {
    const error = event?.error || event;
    if (error !== 'no-speech') {
      console.warn('[supervisor] call transcript recognition error:', error);
    }
  };

  rec.onend = function() {
    supervisorSpeechRecognition = null;
    if (supervisorSpeechRestart && supervisorState.activeCallCustomerId === customerId) {
      setTimeout(function() {
        if (supervisorSpeechRestart && supervisorState.activeCallCustomerId === customerId) {
          startSupervisorCallTranscription(customerId);
        }
      }, 400);
    }
  };

  try {
    rec.start();
  } catch (err) {
    supervisorSpeechRecognition = null;
    console.warn('[supervisor] call transcript recognition start failed:', err);
  }
}

function stopSupervisorCallTranscription() {
  supervisorSpeechRestart = false;
  supervisorTranscriptCustomerId = null;

  if (!supervisorSpeechRecognition) return;
  const rec = supervisorSpeechRecognition;
  supervisorSpeechRecognition = null;
  rec.onend = null;

  try {
    rec.abort();
  } catch (err) {
    console.warn('[supervisor] call transcript recognition stop failed:', err);
  }
}

// Hook into applyCustomerSnapshot to update supervisor state
const originalApplyCustomerSnapshot = window.applyCustomerSnapshot;
if (typeof originalApplyCustomerSnapshot === 'function') {
  window.applyCustomerSnapshot = function(customerId, data) {
    if (S.role === 'supervisor') {
      updateCustomerSession(customerId, data);
    }
    return originalApplyCustomerSnapshot(customerId, data);
  };
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupervisorUI);
} else {
  initSupervisorUI();
}

document.addEventListener('nexa:supervisor-call-state-changed', function(event) {
  const detail = event.detail || {};
  supervisorState.activeCallCustomerId = detail.active ? detail.customerId : null;
  updateTalkButtonStates();
  if (supervisorState.activeCallCustomerId) {
    startSupervisorCallTranscription(supervisorState.activeCallCustomerId);
  } else {
    stopSupervisorCallTranscription();
  }
});

// Export functions to window
window.setCallingState = setCallingState;
window.initSupervisorUI = initSupervisorUI;
window.updateCustomerSession = updateCustomerSession;
