function handleRoleSelection(role) {
  console.log(`[role] selected: ${role}`);
  setCurrentRole(role);
  if (role === 'customer1' || role === 'customer2') {
    S.customerId = role;
  }
  const roleGate = document.getElementById('roleGate');
  if (roleGate) roleGate.style.display = 'none';
  if (role === 'supervisor') {
    if (typeof enterAsSupervisor === 'function') enterAsSupervisor();
    return;
  }
  if (role === 'customer1' || role === 'customer2') {
    appState.customerId = role;
    showMicPermissionPrompt();
    return;
  }
  showMicPermissionPrompt();
}

async function handleMicPermissionClick() {
  if (appState.micPermissionInFlight) return;

  console.log('[mic] permission button clicked');

  const role = appState.currentRole;
  if (!role) {
    console.warn('[flow] no role selected before mic permission');
    return;
  }

  closeMicPermissionUi();
  await Promise.resolve(continueAfterMicPermission(role)).catch((err) => {
    console.warn('[app-init] post-permission flow failed', err);
  });
}

function closeMicPermissionUi() {
  hideMicPermissionPrompt();
}

function continueAfterMicPermission(role) {
  console.log(`[flow] continue after permission for role: ${role}`);

  closeMicPermissionUi();

  if (role === 'customer' || role === 'customer1' || role === 'customer2') {
    return startCustomerFlow(appState.customerId || role);
  }

  if (role === 'supervisor') {
    return startSupervisorFlow();
  }

  console.warn('[flow] unknown role during post-permission continuation', role);
}

function startCustomerFlow(customerId) {
  if (typeof enterAsCustomer === 'function') {
    return enterAsCustomer(customerId);
  }
}

function startSupervisorFlow() {
  if (typeof enterAsSupervisor === 'function') {
    return enterAsSupervisor();
  }
}

(async function(){
  if(typeof hideMicPermissionPrompt === 'function'){
    hideMicPermissionPrompt();
  }
  if(typeof addLog === 'function' && window.S){
    addLog('system','SYSTEM',`HSBC Global Banking Assistant \u00b7 ARIA v3.0 \u00b7 Session ${S.sessionId} \u00b7 Hands-free voice mode`);
    addLog('system','SYSTEM','Choose a role to enter the live HSBC session. Customer mode uses your microphone; supervisor mode is view-only.');
  }
  if(typeof drawFlat === 'function'){
    drawFlat();
  }
  if(typeof updateMicBtn === 'function'){
    updateMicBtn();
  }
  await Promise.resolve(
    window.NexaBankGlobals?.refreshRoleGateButtons
      ? window.NexaBankGlobals.refreshRoleGateButtons()
      : false
  ).catch((err) => {
    console.warn('[app-init] refreshRoleGateButtons failed', err);
  });

  const customer1RoleButton = DOM.customer1RoleButton || document.getElementById('customer1Role');
  const customer2RoleButton = DOM.customer2RoleButton || document.getElementById('customer2Role');
  const supervisorRoleButton = DOM.supervisorRoleButton || document.getElementById('supervisorRole');
  const allowMicButton = DOM.allowMicButton || document.getElementById('allowMicrophoneBtn');

  if (customer1RoleButton && !customer1RoleButton.dataset.bound) {
    customer1RoleButton.addEventListener('click', () => handleRoleSelection('customer1'));
    customer1RoleButton.dataset.bound = 'true';
  }
  if (customer2RoleButton && !customer2RoleButton.dataset.bound) {
    customer2RoleButton.addEventListener('click', () => handleRoleSelection('customer2'));
    customer2RoleButton.dataset.bound = 'true';
  }
  if (supervisorRoleButton && !supervisorRoleButton.dataset.bound) {
    supervisorRoleButton.addEventListener('click', () => handleRoleSelection('supervisor'));
    supervisorRoleButton.dataset.bound = 'true';
  }
  if (allowMicButton && !allowMicButton.dataset.bound) {
    allowMicButton.addEventListener('click', handleMicPermissionClick);
    allowMicButton.dataset.bound = 'true';
  }

  window.addEventListener('beforeunload', () => {
    if(window.S && S.role === 'customer') {
      // Publish offline snapshot so supervisor sees OFFLINE immediately
      if (typeof publishLiveSnapshot === 'function') {
        publishLiveSnapshot({ heartbeatAt: 1 });
      }
      if (typeof releaseCustomerLock === 'function'){
        releaseCustomerLock(S.customerId);
      }
    }
    if(window.S && S.role === 'supervisor') {
      if (typeof releaseCustomerLock === 'function'){
        releaseCustomerLock('supervisor');
      }
    }
  });
})();

function endSession(){
  if(S.sessionEnded) return;
  S.sessionEnded = true;
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  if(typeof cancelSpeech === 'function') cancelSpeech();
  if(typeof stopListening === 'function') stopListening(true);
  if(typeof setListeningUi === 'function') setListeningUi(false, 'Session ended');
  if(typeof stopSessionHeartbeat === 'function') stopSessionHeartbeat();
  // Publish offline snapshot BEFORE releasing the lock so supervisor sees OFFLINE
  if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') {
    publishLiveSnapshot({ heartbeatAt: 1 });
  }
  if(S.role === 'customer' && typeof releaseCustomerLock === 'function') releaseCustomerLock(S.customerId);
  if(typeof setStatus === 'function') setStatus('ended','SESSION ENDED');
  const btn = document.getElementById('endSessionBtn');
  if(btn){ btn.disabled = true; btn.textContent = '\u2713 Session Ended'; }
  const mi = document.getElementById('manualInput');
  if(mi) mi.disabled = true;
  const sb = document.querySelector('.send-btn');
  if(sb) sb.disabled = true;
  if(typeof addLog === 'function') addLog('system','SYSTEM','Session ended. Refresh the page to start a new session.');
  console.log('[NexaBank] Session ended by user.');
}
window.endSession = endSession;
