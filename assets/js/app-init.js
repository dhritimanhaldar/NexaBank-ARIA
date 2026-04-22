function handleRoleSelection(role) {
  console.log(`[role] selected: ${role}`);
  setCurrentRole(role);
  const roleGate = document.getElementById('roleGate');
  if (roleGate) roleGate.style.display = 'none';
  if (role === 'supervisor') {
    if (typeof enterAsSupervisor === 'function') enterAsSupervisor();
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

  if (role === 'customer') {
    return startCustomerFlow();
  }

  if (role === 'supervisor') {
    return startSupervisorFlow();
  }

  console.warn('[flow] unknown role during post-permission continuation', role);
}

function startCustomerFlow() {
  if (typeof enterAsCustomer === 'function') {
    return enterAsCustomer();
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
    addLog('system','SYSTEM',`HSBC Global Banking Assistant · ARIA v3.0 · Session ${S.sessionId} · Hands-free voice mode`);
    addLog('system','SYSTEM','Choose a role to enter the live HSBC session. Customer mode uses your microphone; supervisor mode is view-only.');
  }

  if(typeof drawFlat === 'function'){
    drawFlat();
  }

  if(typeof updateMicBtn === 'function'){
    updateMicBtn();
  }

  await Promise.resolve(
    window.NexaBankGlobals?.bootRoleGate
      ? window.NexaBankGlobals.bootRoleGate()
      : false
  ).catch((err) => {
    console.warn('[app-init] bootRoleGate failed', err);
  });

  const customerRoleButton = DOM.customerRoleButton || document.getElementById('customerRole');
  const supervisorRoleButton = DOM.supervisorRoleButton || document.getElementById('supervisorRole');
  const allowMicButton = DOM.allowMicButton || document.getElementById('allowMicrophoneBtn');

  if (customerRoleButton && !customerRoleButton.dataset.bound) {
    customerRoleButton.addEventListener('click', () => handleRoleSelection('customer'));
    customerRoleButton.dataset.bound = 'true';
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
    if(window.S && S.role === 'customer' && typeof releaseCustomerLock === 'function'){
      releaseCustomerLock();
    }
  });
})();