(function(){
  if(typeof syncPermissionOverlayOnBoot === 'function'){
    syncPermissionOverlayOnBoot();
  }

  if(typeof addLog === 'function' && window.S){
    addLog('system','SYSTEM',`NexaBank ARIA v3.0 · Session ${S.sessionId} · Hands-free voice mode`);
    addLog('system','SYSTEM','Choose a role to enter the live session. Customer mode uses your microphone; supervisor mode is view-only.');
  }

  if(typeof drawFlat === 'function'){
    drawFlat();
  }

  if(typeof updateMicBtn === 'function'){
    updateMicBtn();
  }

  if(typeof bootRoleGate === 'function'){
    bootRoleGate();
  }

  window.addEventListener('beforeunload', () => {
    if(window.S && S.role === 'customer' && typeof releaseCustomerLock === 'function'){
      releaseCustomerLock();
    }
  });
})();