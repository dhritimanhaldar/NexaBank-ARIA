async function refreshRoleGateButtons(){
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
    console.warn('refreshRoleGateButtons failed:', err);
  }
}

async function enterAsCustomer(customerId){
  try{
    // Load customer profile
    if (!CUSTOMER_PROFILES[customerId]) {
      console.error('[role-gate] Invalid customerId:', customerId);
      return;
    }
    S.customerProfile = CUSTOMER_PROFILES[customerId];
    S.customerId = customerId;
    S.accounts = {
            savings: Number(S.customerProfile.savings),
      current: Number(S.customerProfile.current)
    };
    S.totalDebit = 0;
    S.txSeq = 0;
    S.transactions = [];
    S.logEntries = [];
    S.pendingTask = null;
    S.pendingTransaction = null;
    S.pendingClarification = null;

    // ── Update balance and account number DOM immediately ─────────
    const fmt2 = n => '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const savBal = document.getElementById('savingsBal');
    const curBal = document.getElementById('currentBal');
    const savNum = document.getElementById('savingsAccNum');
    const curNum = document.getElementById('currentAccNum');
    if(savBal) savBal.textContent = fmt2(S.accounts.savings);
    if(curBal) curBal.textContent = fmt2(S.accounts.current);
    if(savNum) savNum.textContent = '•••• •••• ' + S.customerProfile.savingsAccNum;
    if(curNum) curNum.textContent = '•••• •••• ' + S.customerProfile.currentAccNum;
    
    
    if (typeof document !== 'undefined') {
      const sessionIdEl = document.getElementById('sessionId');
      if (sessionIdEl && S.sessionId) sessionIdEl.textContent = S.sessionId;
    }

    const roleGateStatus = document.getElementById('roleGateStatus');
    if(roleGateStatus) roleGateStatus.textContent = 'Joining as customer...';
    const syncEnabledBeforeLock = typeof canUseFirebaseSync === 'function'
      ? canUseFirebaseSync()
      : true;
    const lockAcquired = await acquireCustomerLock(customerId).catch(() => false);
    if (syncEnabledBeforeLock && !lockAcquired) {
      console.warn('[role-gate] Customer lock not acquired; continuing locally');
    }
    if(!lockAcquired){
      if(roleGateStatus) roleGateStatus.textContent = 'Live sync unavailable for this customer. Continuing in local mode.';
      if (syncEnabledBeforeLock) {
        console.warn('[role-gate] Customer lock not acquired; continuing locally');
      }
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
    if (typeof renderAccounts === 'function') renderAccounts();
    if (typeof renderLedger === 'function') renderLedger();
    if (typeof renderLog === 'function') renderLog();
    if (typeof publishLiveSnapshot === 'function') {
      publishLiveSnapshot(buildFullSnapshot({
        role: 'customer',
        customerId: S.customerId,
        heartbeatAt: Date.now()
      }));
    }
    if(typeof initMic === 'function') initMic();
    // Heartbeat carries the full snapshot so supervisor always has current state.
    startSessionHeartbeat(() => buildFullSnapshot({
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

    // Show the supervisor two-column panel and hide the normal customer layout
    const supervisorView = document.getElementById('supervisorView');
    if(supervisorView) supervisorView.style.display = 'grid';
    const mainBody = document.querySelector('.body');
    if(mainBody) mainBody.style.gridTemplateColumns = '1fr';
    updateRoleBadge();
    setLiveModeBadge(S.firebaseAvailable ? 'LIVE' : 'LOCAL');
    const manualInput = document.getElementById('manualInput');
    const micBtn = document.getElementById('micBtn');
    if(manualInput) manualInput.disabled = true;
    if(micBtn) micBtn.disabled = true;
    if(typeof addLog === 'function') addLog('system','SYSTEM','Entered supervisor mode. View-only access.');
    if(typeof subscribeToRemoteSession === 'function') subscribeToRemoteSession();
    // Supervisor is read-only — no heartbeat publish needed.
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

window.refreshRoleGateButtons = refreshRoleGateButtons;
window.bootRoleGate = refreshRoleGateButtons;   // backward-compat alias
window.enterAsCustomer = enterAsCustomer;
window.enterAsSupervisor = enterAsSupervisor;
window.updateRoleBadge = updateRoleBadge;
window.setLiveModeBadge = setLiveModeBadge;

if (typeof window !== 'undefined') {
  window.bootRoleGate = refreshRoleGateButtons;
  window.refreshRoleGateButtons = refreshRoleGateButtons;
  window.enterAsCustomer = enterAsCustomer;
  window.enterAsSupervisor = enterAsSupervisor;
}