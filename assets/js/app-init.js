syncPermissionOverlayOnBoot();

addLog('system','SYSTEM',`NexaBank ARIA v3.0 · Session ${S.sessionId} · Hands-free voice mode`);
addLog('system','SYSTEM','Click "Allow Microphone" to start. Mic stays open — echo cancellation prevents self-listening.');
drawFlat();
updateMicBtn();

if(S.permissionGranted){
  hidePermissionOverlay();
  setTimeout(() => {
    initMic();
  }, 50);
}