// Supervisor-specific functionality for managing customer interactions and peer calls

let supervisorState = {
  customerSessions: {
    customer1: { id: 'customer1', status: 'offline', peerId: null, isSpeaking: false, isThinking: false },
    customer2: { id: 'customer2', status: 'offline', peerId: null, isSpeaking: false, isThinking: false }
  },
  activeCallCustomerId: null
};

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
      const canTalk = isCustomerOnlineForPeerCall(item) && !!peerId;
      const talkButtonMarkup =
        '<button\n' +
        '  class="talk-to-customer-btn"\n' +
        '  type="button"\n' +
        '  data-peer-id="' + peerId + '"\n' +
        '  ' + (canTalk ? '' : 'disabled') + '\n' +
        '>\n' +
        '  Talk to Customer\n' +
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
  const canTalk = isCustomerOnlineForPeerCall(session) && !!peerId;
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
    await window.NexaPeerCalling.callCustomerPeer(peerId);
  } catch (err) {
    console.error('[peerjs] failed to call customer:', err);
  }
}

function setCallingState(isCalling) {
  const btns = document.querySelectorAll('.talk-to-customer-btn');
  btns.forEach(function(btn) {
    btn.textContent = 'Talk to Customer';
    btn.classList.toggle('active-call', !!isCalling && !btn.disabled);
  });
  if (!isCalling) supervisorState.activeCallCustomerId = null;
  updateTalkButtonStates();
}

function updateCustomerSession(customerId, data) {
  if (!supervisorState.customerSessions[customerId]) {
    supervisorState.customerSessions[customerId] = { id: customerId };
  }

  const session = supervisorState.customerSessions[customerId];
  const isOffline = hasCustomerOfflineSignal(data);

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
    const column = btn.closest('.supervisor-column');
    const columns = Array.from(document.querySelectorAll('.supervisor-column'));
    const customerId = columns.indexOf(column) === 1 ? 'customer2' : 'customer1';
    const item = supervisorState.customerSessions[customerId] || {};
    const peerId = getCustomerPeerIdForCall(item);
    const canTalk = isCustomerOnlineForPeerCall(item) && !!peerId;
    btn.dataset.peerId = peerId;
    btn.disabled = !canTalk;
  });
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

// Export functions to window
window.setCallingState = setCallingState;
window.initSupervisorUI = initSupervisorUI;
window.updateCustomerSession = updateCustomerSession;
