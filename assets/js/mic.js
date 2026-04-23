const SILENCE_TIMEOUT_MS = 2000;
const MAX_LISTEN_MS = 10000;
const MIN_TRANSCRIPT_LENGTH = 2;

function hasMeaningfulTranscript(text) {
  return typeof text === 'string' && text.trim().replace(/\s+/g, ' ').length >= MIN_TRANSCRIPT_LENGTH;
}

function startSilenceTimeout(recognition, onSilenceStop) {
  if (appState.silenceTimeoutId) {
    clearTimeout(appState.silenceTimeoutId);
  }
  appState.silenceTimeoutId = setTimeout(() => {
    console.log('[mic] silence timeout reached');
    stopRecognitionSession(recognition, 'silence-timeout');
    if (typeof onSilenceStop === 'function') onSilenceStop();
  }, SILENCE_TIMEOUT_MS);
}

function startMaxListenTimeout(recognition) {
  if (appState.maxListenTimeoutId) {
    clearTimeout(appState.maxListenTimeoutId);
  }
  appState.maxListenTimeoutId = setTimeout(() => {
    console.log('[mic] max listen timeout reached');
    stopRecognitionSession(recognition, 'max-listen-timeout');
  }, MAX_LISTEN_MS);
}

function stopRecognitionSession(recognition, reason = 'manual-stop') {
  if (!recognition || !appState.recognitionActive) return;
  console.log(`[mic] stopping recognition: ${reason}`);
  clearRecognitionTimers();
  setListening(false);
  try {
    recognition.stop();
  } catch (err) {
    console.warn('[mic] recognition.stop() failed', err);
  }
}

async function initMic(){
  if(S.role === 'supervisor') return;
  if(S._stream && S.micReady){
    hidePermissionOverlay();
    updateMicBtn();
    return;
  }

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    addLog('error','ERROR','Microphone capture is not supported by this browser.');
    showToast('ERR','Microphone capture is not supported by this browser.');
    hidePermissionOverlay();
    updateMicBtn();
    return;
  }

  if(!window.isSecureContext && !['localhost','127.0.0.1'].includes(location.hostname)){
    addLog('error','ERROR','Microphone access requires HTTPS or localhost.');
    showToast('ERR','Microphone access requires HTTPS or localhost.');
    hidePermissionOverlay();
    updateMicBtn();
    return;
  }

  markMicPermissionAsked();

  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      audio:{
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true,
        channelCount:1
      }
    });

    if(!stream || !stream.getAudioTracks().length){
      throw new Error('No audio track obtained');
    }

    S._stream = stream;
    S.micReady = true;
    markMicPermissionGranted();
    hidePermissionOverlay();

    startWaveAlways(stream);
    addLog('system','SYSTEM','Microphone ready · Echo cancellation ON · Auto-listen active');
    updateMicBtn();
    showToast('OK','Microphone enabled.');

    speak("Hello! I'm ARIA, your NexaBank AI assistant. I can transfer money, pay bills, check balances, block cards, or send statements. How can I help you today?");
  }catch(err){
    const reason = err?.name || err?.message || 'Permission denied';
    addLog('error','ERROR','Microphone init failed: ' + reason);
    showToast('ERR','Microphone access failed: ' + (err.message || reason));

    if(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'){
      markMicPermissionDenied();
      setStatus('muted','MIC UNAVAILABLE');
    }

    updateMicBtn();
  }
}

function scheduleAutoListen(delay=1000){
  if(S.role === 'supervisor') return;
  if(S.autoListenTimer) clearTimeout(S.autoListenTimer);
  S.autoListenTimer=setTimeout(()=>{
    if(!S.isListening&&!S.isThinking&&!S.isSpeaking&&!S.isMuted&&S.micReady){
      startListening();
    }
  },delay);
}

function startListening(){
  if(S.role === 'supervisor') return;
  if(!S.micReady||S.isMuted||S.isThinking||S.isSpeaking||appState.recognitionActive) return;
  S.pendingFinal = '';

  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ showToast('ERR','Speech API not supported. Use Chrome.'); return; }

  resetSpeechFlags();
  clearRecognitionTimers();
  setListening(true);

  const rec=new SR();
  S.recognition=rec;
  rec.continuous=true;
  rec.interimResults=true;
  rec.lang='en-IN';
  rec.maxAlternatives=1;

  let stopReason = null;
  let restartAllowed=true;

  DOM.transcriptText.textContent='Listening…';
  setListeningUi(true, 'Listening…');

  function stopSession(reason='manual-stop') {
    stopReason = reason;
    stopRecognitionSession(rec, reason);
  }

  rec.onresult=(e)=>{
    if(S.isSpeaking){
      cancelSpeech();
    }

    let transcript='';
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const result=e.results[i];
      if(!result||!result[0]) continue;
      transcript += result[0].transcript || '';
      if(result.isFinal){
        S.pendingFinal=(S.pendingFinal+' '+result[0].transcript).trim();
      } else {
        interim = result[0].transcript || interim;
      }
    }

    const cleanedTranscript = transcript.trim();
    const display = (S.pendingFinal+' '+interim).trim();
    if(display) DOM.transcriptText.textContent = display;

    if(hasMeaningfulTranscript(cleanedTranscript)){
      appState.hasDetectedSpeech = true;
      S.vadSpeechDetected=true;
      S.vadSilenceStart=null;
      startSilenceTimeout(rec, () => {
        if (typeof setListeningUi === 'function') {
          setListeningUi(false, 'No speech detected, stopped listening.');
        }
        const final = (S.pendingFinal+' '+interim).trim();
        if(final.length>1){
          restartAllowed=false;
          processInput(final);
        } else {
          S.pendingFinal='';
          DOM.transcriptText.textContent='Listening…';
        }
      });
    }
  };

  // onspeechend removed: it was clearing the silence timeout before processInput could fire.
  // The silence timeout (2000ms) now has exclusive responsibility for triggering processInput.

  rec.onerror=(e)=>{
    console.warn('[mic] recognition error', e?.error || e);
    clearRecognitionTimers();
    setListening(false);
    if(typeof setListeningUi === 'function'){
      setListeningUi(false,'Microphone idle.');
    }
    if(!S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady){
      scheduleAutoListen(1500);
    }
  };

  rec.onend=()=>{
    console.log('[mic] recognition ended');
    clearRecognitionTimers();
    setListening(false);
    if(typeof setListeningUi === 'function'){
      if(stopReason !== 'silence-timeout'){
        setListeningUi(false,'Microphone idle.');
      }
    }
    updateMicBtn();
    // If processInput was never called this session (restartAllowed still true),
    // schedule a new listen so the mic does not go permanently silent.
    if(restartAllowed && !S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady){
      scheduleAutoListen(500);
    }
  };

  try{
    rec.start();
    console.log('[mic] recognition started');
    startSilenceTimeout(rec, () => {
      if(typeof setListeningUi === 'function'){
        setListeningUi(false,'No speech detected, stopped listening.');
      }
    });
    startMaxListenTimeout(rec);
  } catch(err){
    setListening(false);
    addLog('error','ERROR','Cannot start recognition: '+err.message);
    updateMicBtn();
  }
}

function stopListening(silent=false){
  clearSilenceTimer();
  clearVadBar();
  S.isListening=false;
  if(S.recognition){
    try{
      S.recognition.onend=null; // prevent auto-restart
      S.recognition.abort();
    }catch(e){}
    S.recognition=null;
  }
  if(!S.isThinking&&!S.isSpeaking&&!silent){
    setStatus('live','READY');
    setOrbSpin(false);
  }
  updateMicBtn();
}

let _silenceProgress=0, _silenceRaf=null;

function startSilenceTimer(cb){
  clearSilenceTimer();
  _silenceProgress=0;
  const bar=DOM.vadBar;
  bar.classList.add('active');
  bar.style.width='0%';

  const start=Date.now();
  const duration=2000;

  function tick(){
    const elapsed=Date.now()-start;
    _silenceProgress=Math.min(elapsed/duration*100,100);
    bar.style.width=_silenceProgress+'%';
    if(_silenceProgress<100){
      _silenceRaf=requestAnimationFrame(tick);
    } else {
      bar.classList.remove('active');
      cb();
    }
  }
  _silenceRaf=requestAnimationFrame(tick);

  S.silenceTimer=setTimeout(()=>{
    // Safety fallback (RAF should call cb first)
  },duration+100);
}

function clearSilenceTimer(){
  if(S.silenceTimer){ clearTimeout(S.silenceTimer); S.silenceTimer=null; }
  if(_silenceRaf){ cancelAnimationFrame(_silenceRaf); _silenceRaf=null; }
}

function clearVadBar(){
  const bar=DOM.vadBar;
  if(bar){ bar.classList.remove('active'); bar.style.width='0%'; }
}

function toggleMute(){
  if(S.role === 'supervisor'){
    showToast('INFO','Supervisor mode is view-only.');
    return;
  }
  if(!S.micReady){
    if(S.permissionGranted){
      initMic();
      return;
    }
    showPermissionOverlay();
    return;
  }

  S.isMuted = !S.isMuted;

  if(S.isMuted){
    cancelSpeech();
    stopListening();
    if(S.autoListenTimer){
      clearTimeout(S.autoListenTimer);
      S.autoListenTimer = null;
    }
    addLog('system','SYSTEM','Microphone muted by user.');
    setStatus('muted','MUTED');
  } else {
    addLog('system','SYSTEM','Microphone unmuted. Auto-listening…');
    updateMicBtn();
    scheduleAutoListen(300);
  }

  updateMicBtn();
}

function sendManual(){
  if(S.role === 'supervisor'){
    showToast('INFO','Supervisor mode is view-only.');
    return;
  }
  const i=DOM.manualInput;
  const t=i.value.trim(); if(!t) return;
  i.value='';
  cancelSpeech(); // stop speaking if typing
  processInput(t);
}

function runHint(t){
  if(S.role === 'supervisor'){
    showToast('INFO','Supervisor mode is view-only.');
    return;
  }
  cancelSpeech();
  processInput(t);
}

function speak(text){
  if(S.role === 'supervisor') return;
  if(!window.speechSynthesis){
    scheduleAutoListen();
    return;
  }
  cancelSpeech(); // clear any prior utterance
  S.isSpeaking=true;
  setStatus('speaking','SPEAKING');
  DOM.ring1.className='orb-ring speak';
  DOM.ring2.className='orb-ring2 speak';
  DOM.orbFace.textContent='🗣';
  updateMicBtn();

  const u=new SpeechSynthesisUtterance(text);
  u.rate=1.0; u.pitch=1.05; u.volume=1;

  // Pick a female English voice if available
  const voices=speechSynthesis.getVoices();
  const pref=voices.find(v=>/female|zira|samantha|victoria|heera/i.test(v.name)&&/en/i.test(v.lang))
            ||voices.find(v=>/en/i.test(v.lang));
  if(pref) u.voice=pref;

  u.onend=()=>{
    S.isSpeaking=false;
    DOM.ring1.className='orb-ring';
    DOM.ring2.className='orb-ring2';
    DOM.orbFace.textContent='🤖';
    setStatus('live','READY');
    updateMicBtn();
    // Wait 1 second then auto-listen (gives speaker output time to fade)
    if(!S.isMuted&&!S.isThinking) scheduleAutoListen(1000);
  };

  u.onerror=(e)=>{
    if(e.error==='interrupted') return; // user barged in — OK
    S.isSpeaking=false;
    DOM.ring1.className='orb-ring';
    DOM.ring2.className='orb-ring2';
    DOM.orbFace.textContent='🤖';
    setStatus('live','READY');
    updateMicBtn();
    if(!S.isMuted&&!S.isThinking) scheduleAutoListen(1000);
  };

  // Workaround: Chrome sometimes doesn't fire onend; poll as fallback
  const estimatedMs=(text.split(' ').length/2.8)*1000+800;
  const fallback=setTimeout(()=>{
    if(S.isSpeaking){
      S.isSpeaking=false;
      DOM.ring1.className='orb-ring';
      DOM.ring2.className='orb-ring2';
      DOM.orbFace.textContent='🤖';
      setStatus('live','READY');
      updateMicBtn();
      if(!S.isMuted&&!S.isThinking) scheduleAutoListen(1000);
    }
  },estimatedMs+2000);

  u.onend=((origEnd)=>function(e){
    clearTimeout(fallback);
    origEnd(e);
  })(u.onend);

  speechSynthesis.speak(u);
}

speechSynthesis.onvoiceschanged=()=>{}; // pre-load voices

function resetSession(){
  try{ speechSynthesis.cancel(); } catch(e){}
  stopListening(true);
  S.isThinking = false;
  S.isSpeaking = false;
  S.pendingTask = null;
  S.pendingTransaction = null;
  S.pendingFinal = '';
  clearRecognitionTimers();
  if(typeof showThinking === 'function') showThinking(false);
  if(typeof setStatus === 'function') setStatus('live', 'READY');
  if(typeof updateMicBtn === 'function') updateMicBtn();
  if(typeof addLog === 'function') addLog('system','SYSTEM','Session reset by user. You can start speaking again.');
  if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
  scheduleAutoListen(800);
}

window.resetSession = resetSession;
window.initMic = initMic;
window.scheduleAutoListen = scheduleAutoListen;
window.startListening = startListening;
window.stopListening = stopListening;
window.toggleMute = toggleMute;
window.sendManual = sendManual;
window.runHint = runHint;
window.speak = speak;