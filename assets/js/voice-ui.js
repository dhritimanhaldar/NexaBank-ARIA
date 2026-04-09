function hidePermissionOverlay(){
  const el = DOM.permOverlay;
  if(el) el.style.display = 'none';
}

function showPermissionOverlay(){
  const el = DOM.permOverlay;
  if(el) el.style.display = 'flex';
}

function markMicPermissionAsked(){
  S.permissionAsked = true;
  localStorage.setItem('ariaMicPermissionAsked', '1');
}

function markMicPermissionGranted(){
  S.permissionAsked = true;
  S.permissionGranted = true;
  localStorage.setItem('ariaMicPermissionAsked', '1');
  localStorage.setItem('ariaMicPermissionGranted', '1');
}

function markMicPermissionDenied(){
  S.permissionAsked = true;
  localStorage.setItem('ariaMicPermissionAsked', '1');
}

function syncPermissionOverlayOnBoot(){
  if(S.permissionGranted){
    hidePermissionOverlay();
  } else {
    showPermissionOverlay();
  }
}

function setStatus(type,label){
  DOM.statusDot.className='dot '+type;
  DOM.statusLabel.textContent=label;
  const stateMap={live:'● READY',listening:'◉ LISTENING',thinking:'◈ THINKING',speaking:'◎ SPEAKING',muted:'✕ MUTED'};
  DOM.ariaState.textContent=stateMap[type]||'● READY';
}

function setOrbSpin(on){
  if(!S.isSpeaking){
    DOM.ring1.className='orb-ring'+(on?' spin':'');
    DOM.ring2.className='orb-ring2'+(on?' spin':'');
  }
}

function showToast(icon,msg){
  const t=DOM.toast;
  t.innerHTML=icon+' '+msg; t.classList.add('show');
  clearTimeout(window.toastT); window.toastT=setTimeout(()=>t.classList.remove('show'),4000);
}

function updateMicBtn(){
  const btn=DOM.micBtn;
  const icon=DOM.micIcon;
  const label=DOM.micLabel;
  btn.className='mic-btn';
  if(!S.micReady){
    icon.textContent='MIC'; label.textContent='Initializing mic…';
  } else if(S.isMuted){
    btn.classList.add('muted');
    icon.textContent='OFF'; label.textContent='Muted — Click to Unmute';
  } else if(S.isSpeaking){
    btn.classList.add('speaking');
    icon.textContent='AI'; label.textContent='ARIA Speaking — Click to Interrupt';
  } else if(S.isListening){
    btn.classList.add('listening');
    icon.textContent='LIVE'; label.textContent='Listening… Speak now';
  } else {
    icon.textContent='MIC'; label.textContent='Auto-listen Active — Click to Mute';
  }
}

function cancelSpeech(){
  speechSynthesis.cancel();
  S.isSpeaking=false;
  DOM.ring1.className='orb-ring';
  DOM.ring2.className='orb-ring2';
  DOM.orbFace.textContent='🤖';
}

window.hidePermissionOverlay = hidePermissionOverlay;
window.showPermissionOverlay = showPermissionOverlay;
window.markMicPermissionAsked = markMicPermissionAsked;
window.markMicPermissionGranted = markMicPermissionGranted;
window.markMicPermissionDenied = markMicPermissionDenied;
window.syncPermissionOverlayOnBoot = syncPermissionOverlayOnBoot;
window.setStatus = setStatus;
window.setOrbSpin = setOrbSpin;
window.showToast = showToast;
window.updateMicBtn = updateMicBtn;
window.cancelSpeech = cancelSpeech;