async function bootRoleGate(){
  try{
    const roleGate = document.getElementById('roleGate');
    const enterCustomerBtn = document.getElementById('enterCustomerBtn');
    const enterSupervisorBtn = document.getElementById('enterSupervisorBtn');
    if(enterCustomerBtn) enterCustomerBtn.onclick = enterAsCustomer;
    if(enterSupervisorBtn) enterSupervisorBtn.onclick = enterAsSupervisor;
    if(typeof initFirebaseSync === 'function'){
      const syncReady = await initFirebaseSync().catch(() => false);
      if (!syncReady) {
        console.warn('[role-gate] Firebase sync unavailable, continuing in local-only mode');
      }
    }
    if(typeof syncRoleGateStatus === 'function') syncRoleGateStatus();
    if(roleGate) roleGate.style.display = 'flex';
    updateRoleBadge();
  }catch(err){
    console.warn('bootRoleGate failed:', err);
  }
}

async function enterAsCustomer(){
  try{
    const roleGateStatus = document.getElementById('roleGateStatus');
    if(roleGateStatus) roleGateStatus.textContent = 'Joining as customer...';
    let lockAcquired = false;
    if(typeof acquireCustomerLock === 'function'){
      lockAcquired = await acquireCustomerLock('customer').catch(() => false);
    }
    if(!lockAcquired){
      if(roleGateStatus) roleGateStatus.textContent = 'A customer session is already active. Open supervisor mode or try again.';
      console.warn('[role-gate] Customer lock not acquired or sync unavailable; continuing locally');
    }
    S.role = 'customer';
    S.isSupervisorView = false;
    const roleGate = document.getElementById('roleGate');
    if(roleGate) roleGate.style.display = 'none';
    updateRoleBadge();
    setLiveModeBadge(S.firebaseAvailable ? 'LIVE' : 'LOCAL');
    const manualInput = document.getElementById('manualInput');
    const micBtn = document.getElementById('micBtn');
    if(manualInput) manualInput.disabled = false;
    if(micBtn) micBtn.disabled = false;
    if(typeof addLog === 'function') addLog('system','SYSTEM','Entered customer mode. Voice and manual input enabled.');
    if(typeof initMic === 'function') initMic();
    if(typeof startSessionHeartbeat === 'function') startSessionHeartbeat(() => ({
      role: 'customer',
      mode: 'live'
    }));
  }catch(err){
    console.warn('enterAsCustomer failed:', err);
  }
}

async function enterAsSupervisor(){
  try{
    const syncReady = typeof initFirebaseSync === 'function'
      ? await initFirebaseSync().catch(() => false)
      : false;
    if (!syncReady) {
      console.warn('[role-gate] Firebase sync unavailable, continuing in local-only mode');
    }
    S.role = 'supervisor';
    S.isSupervisorView = true;
    document.body.classList.add('supervisor-mode');
    const roleGate = document.getElementById('roleGate');
    if(roleGate) roleGate.style.display = 'none';
    updateRoleBadge();
    setLiveModeBadge(S.firebaseAvailable ? 'LIVE' : 'LOCAL');
    const manualInput = document.getElementById('manualInput');
    const micBtn = document.getElementById('micBtn');
    if(manualInput) manualInput.disabled = true;
    if(micBtn) micBtn.disabled = true;
    if(typeof addLog === 'function') addLog('system','SYSTEM','Entered supervisor mode. View-only access.');
    if(typeof subscribeToRemoteSession === 'function') subscribeToRemoteSession();
  }catch(err){
    console.warn('enterAsSupervisor failed:', err);
  }
}

function updateRoleBadge(){
  try{
    const roleBadge = document.getElementById('roleBadge');
    if(roleBadge){
      const roleText = S.role ? S.role.toUpperCase() : 'UNSET';
      roleBadge.textContent = roleText;
    }
  }catch(err){
    console.warn('updateRoleBadge failed:', err);
  }
}

function setLiveModeBadge(mode){
  try{
    const liveModeBadge = document.getElementById('liveModeBadge');
    if(liveModeBadge) liveModeBadge.textContent = mode;
  }catch(err){
    console.warn('setLiveModeBadge failed:', err);
  }
}

window.bootRoleGate = bootRoleGate;
window.enterAsCustomer = enterAsCustomer;
window.enterAsSupervisor = enterAsSupervisor;
window.updateRoleBadge = updateRoleBadge;
window.setLiveModeBadge = setLiveModeBadge;