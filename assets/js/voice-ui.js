function hideMicPermissionPrompt() {
  const modal = document.getElementById('micPermissionModal');
  const screen = document.getElementById('micPermissionScreen');

  if (modal) {
    modal.hidden = true;
    modal.style.display = 'none';
    modal.classList.remove('is-open', 'active', 'visible');
    modal.setAttribute('aria-hidden', 'true');
  }

  if (screen) {
    screen.hidden = true;
    screen.style.display = 'none';
    screen.classList.remove('is-open', 'active', 'visible');
    screen.setAttribute('aria-hidden', 'true');
  }
}

function showMicPermissionPrompt() {
  const modal = document.getElementById('micPermissionModal');
  const screen = document.getElementById('micPermissionScreen');

  if (modal) {
    modal.hidden = false;
    modal.style.display = '';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  if (screen) {
    screen.hidden = false;
    screen.style.display = '';
    screen.classList.add('is-open');
    screen.setAttribute('aria-hidden', 'false');
  }
}

function setListeningUi(active, message) {
  const safeMessage = message || (active ? 'Listening…' : 'Microphone idle.');
  if (active) {
    setStatus('listening', safeMessage);
    setOrbSpin(true);
  } else {
    setStatus('live', safeMessage);
    setOrbSpin(false);
  }
  if (typeof updateMicBtn === 'function') {
    updateMicBtn();
  }
}

function setMicPermissionPending(isPending) {
  const btn = document.getElementById('allowMicrophoneBtn');
  if (!btn) return;
  btn.disabled = !!isPending;
  btn.setAttribute('aria-busy', isPending ? 'true' : 'false');
}

function markMicPermissionAsked(){
  S.permissionAsked = true;
  if(window.safeStorageSet) safeStorageSet('ariaMicPermissionAsked', '1');
}

function markMicPermissionGranted(){
  S.permissionAsked = true;
  S.permissionGranted = true;
  if(window.safeStorageSet) safeStorageSet('ariaMicPermissionAsked', '1');
  if(window.safeStorageSet) safeStorageSet('ariaMicPermissionGranted', '1');
}

function markMicPermissionDenied(){
  S.permissionAsked = true;
  S.permissionGranted = false;
  if(window.safeStorageSet) safeStorageSet('ariaMicPermissionAsked', '1');
  if(window.safeStorageRemove) safeStorageRemove('ariaMicPermissionGranted');
}

function syncPermissionOverlayOnBoot(){
  if(S.permissionGranted){
    hideMicPermissionPrompt();
  } else {
    showMicPermissionPrompt();
  }
}

function setStatus(type,label){
  const statusDot = DOM?.statusDot || document.getElementById('statusDot');
  const statusLabel = DOM?.statusLabel || document.getElementById('statusLabel');
  const ariaState = DOM?.ariaState || document.getElementById('ariaState');
  if(statusDot) statusDot.className='dot '+type;
  if(statusLabel) statusLabel.textContent=label;
  const stateMap={live:'● READY',listening:'◉ LISTENING',thinking:'◈ THINKING',speaking:'◎ SPEAKING',muted:'✕ MUTED'};
  if(ariaState) ariaState.textContent=stateMap[type]||'● READY';
  if (S.role === 'customer' && typeof scheduledPublish === 'function') {
    try {
      // Use scheduledPublish so buildFullSnapshot() wraps the payload —
      // supervisor receives logEntries, accounts, transactions etc. on every update.
      scheduledPublish({
        status: typeof type === 'string' ? type : null,
        listening: !!(type === 'listening'),
        updatedFrom: 'voice-ui'
      }, 0);
    } catch (err) {
      console.warn('[voice-ui] status sync skipped', err);
    }
  }
}

function setOrbSpin(on){
  if(!S.isSpeaking){
    DOM.ring1.className='orb-ring'+(on?' spin':'');
    DOM.ring2.className='orb-ring2'+(on?' spin':'');
  }
}

function showToast(icon,msg){
  const t = (typeof DOM !== 'undefined' && DOM.toast) ? DOM.toast : document.getElementById('toast');
  if(!t){
    console.warn('[voice-ui] toast element not found:', icon, msg);
    return;
  }
  t.innerHTML = icon + ' ' + msg;
  t.classList.add('show');
  clearTimeout(window.toastT);
  window.toastT = setTimeout(() => t.classList.remove('show'), 4000);
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

window.hidePermissionOverlay = hideMicPermissionPrompt;
window.showPermissionOverlay = showMicPermissionPrompt;
window.hideMicPermissionPrompt = hideMicPermissionPrompt;
window.showMicPermissionPrompt = showMicPermissionPrompt;
window.markMicPermissionAsked = markMicPermissionAsked;
window.markMicPermissionGranted = markMicPermissionGranted;
window.markMicPermissionDenied = markMicPermissionDenied;
window.syncPermissionOverlayOnBoot = syncPermissionOverlayOnBoot;
window.setStatus = setStatus;
window.setOrbSpin = setOrbSpin;
window.showToast = showToast;
window.updateMicBtn = updateMicBtn;
window.setListeningUi = setListeningUi;
window.setMicPermissionPending = setMicPermissionPending;
window.cancelSpeech = cancelSpeech;