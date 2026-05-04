// Supervisor-specific functionality for managing customer interactions and peer calls

let supervisorState = {
  customerSessions: {
    customer1: { id: 'customer1', status: 'offline', peerId: null, isSpeaking: false, isThinking: false },
    customer2: { id: 'customer2', status: 'offline', peerId: null, isSpeaking: false, isThinking: false }
  },
  activeCallCustomerId: null
};

function initSupervisorUI() {
  if (S.role !== 'supervisor') return;
  
  // Add "Talk to Customer" buttons to each column
  const columns = document.querySelectorAll('.supervisor-column');
  columns.forEach(function(col, idx) {
    const customerId = idx === 0 ? 'customer1' : 'customer2';
    const h3 = col.querySelector('h3');
    if (h3 && !col.querySelector('.talk-to-customer-btn')) {
      const talkBtn = document.createElement('button');
      talkBtn.className = 'talk-to-customer-btn';
      talkBtn.textContent = 'Talk to Customer';
      talkBtn.dataset.customerId = customerId;
      talkBtn.disabled = true;
      talkBtn.addEventListener('click', function() {
        handleTalkToCustomer(customerId);
      });
      h3.parentNode.insertBefore(talkBtn, h3.nextSibling);
    }
  });
}

function determineTalkButtonState(customerId) {
  const session = supervisorState.customerSessions[customerId];
  if (!session) return true;
  
  const isOffline = session.status === 'offline' ||
                    session.status === 'disconnected' ||
                    !session.peerId;
  if (isOffline) return true;
  
  const isSpeaking = session.isSpeaking === true ||
                     session.isThinking === true;
  if (isSpeaking) return true;
  
  // Can't call if another call is active
  if (supervisorState.activeCallCustomerId && supervisorState.activeCallCustomerId !== customerId) {
    return true;
  }
  
  return false;
}

function handleTalkToCustomer(customerId) {
  const session = supervisorState.customerSessions[customerId];
  const targetPeerId = session && session.peerId;
  
  if (!targetPeerId) {
    showToast('ERR', 'Customer not available for voice call.');
    return;
  }
  
  if (!isPeerConnected()) {
    initPeerJS();
  }
  
  supervisorState.activeCallCustomerId = customerId;
  startPeerCall(targetPeerId);
}

function setCallingState(isCalling) {
  const btns = document.querySelectorAll('.talk-to-customer-btn');
  btns.forEach(function(btn) {
    const customerId = btn.dataset.customerId;
    if (isCalling) {
      if (supervisorState.activeCallCustomerId === customerId) {
        btn.textContent = 'End Call';
        btn.classList.add('active-call');
        btn.disabled = false;
      } else {
        btn.disabled = true;
      }
    } else {
      btn.textContent = 'Talk to Customer';
      btn.classList.remove('calling', 'active-call');
      supervisorState.activeCallCustomerId = null;
      btn.disabled = determineTalkButtonState(customerId);
    }
  });
}

function updateCustomerSession(customerId, data) {
  if (!supervisorState.customerSessions[customerId]) {
    supervisorState.customerSessions[customerId] = { id: customerId };
  }
  
  const session = supervisorState.customerSessions[customerId];
  
  // Update status based on heartbeat
  if (data.heartbeatAt) {
    const isOnline = data.heartbeatAt && (Date.now() - data.heartbeatAt) < 15000;
    session.status = isOnline ? 'online' : 'offline';
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
    const customerId = btn.dataset.customerId;
    if (supervisorState.activeCallCustomerId && supervisorState.activeCallCustomerId !== customerId) {
      // Another call is active
      btn.disabled = true;
    } else {
      btn.disabled = determineTalkButtonState(customerId);
    }
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
