syncPermissionOverlayOnBoot();

addLog('system','SYSTEM',`NexaBank ARIA v3.0 · Session ${S.sessionId} · Hands-free voice mode`);
addLog('system','SYSTEM','Choose a role to enter the live session. Customer mode uses your microphone; supervisor mode is view-only.');
drawFlat();
updateMicBtn();

bootRoleGate();

window.addEventListener('beforeunload', () => {
  if(S.role === 'customer'){
    releaseCustomerLock();
  }
});