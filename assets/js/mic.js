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
    scheduleAutoListen(500);
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
      addLog('system','SYSTEM','Auto-listening activated…');
      startListening();
    }
  },delay);
}

function startListening(){
  if(S.role === 'supervisor') return;
  if(!S.micReady||S.isMuted||S.isThinking||S.isSpeaking||S.isListening) return;

  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ showToast('ERR','Speech API not supported. Use Chrome.'); return; }

  S.isListening=true;
  S.pendingFinal='';
  S.vadSpeechDetected=false;
  S.vadSilenceStart=null;
  clearVadBar();
  DOM.transcriptText.textContent='Listening…';
  setStatus('listening','LISTENING');
  setOrbSpin(true);
  updateMicBtn();

  const rec=new SR();
  S.recognition=rec;
  rec.continuous=true;
  rec.interimResults=true;
  rec.lang='en-IN';
  rec.maxAlternatives=1;

  let restartAllowed=true;

  rec.onresult=(e)=>{
    // If ARIA is still speaking → barge-in: cancel TTS immediately
    if(S.isSpeaking){
      cancelSpeech();
    }

    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const t=e.results[i][0].transcript;
      if(e.results[i].isFinal){
        S.pendingFinal=(S.pendingFinal+' '+t).trim();
      } else {
        interim=t;
      }
    }

    const display=(S.pendingFinal+' '+interim).trim();
    if(display) DOM.transcriptText.textContent=display;

    // Every result = speech detected → reset 2-second silence timer
    if(display){
      S.vadSpeechDetected=true;
      S.vadSilenceStart=null;
      startSilenceTimer(()=>{
        const final=(S.pendingFinal+' '+interim).trim();
        if(final.length>1){
          restartAllowed=false;
          processInput(final);
        } else {
          // Noise, not real speech — reset
          S.pendingFinal='';
          DOM.transcriptText.textContent='Listening…';
        }
      });
    }
  };

  rec.onerror=(e)=>{
    if(e.error==='not-allowed'){
      showToast('ERR','Microphone access denied.');
      S.isMuted=true; S.isListening=false;
      updateMicBtn(); return;
    }
    // 'no-speech' and 'aborted' are expected — ignore
    if(e.error!=='no-speech'&&e.error!=='aborted'){
      addLog('error','ERROR','Mic error: '+e.error);
    }
  };

  rec.onend=()=>{
    // Chrome's continuous recognition times out — restart automatically
    if(S.isListening&&restartAllowed&&!S.isThinking&&!S.isSpeaking&&!S.isMuted){
      setTimeout(()=>{
        if(S.isListening&&!S.isThinking&&!S.isSpeaking&&!S.isMuted){
          try{ rec.start(); }catch(err){
            S.isListening=false;
            updateMicBtn();
          }
        }
      },80);
    } else {
      if(!S.isThinking&&!S.isSpeaking) S.isListening=false;
      updateMicBtn();
    }
  };

  try{ rec.start(); }
  catch(err){
    S.isListening=false;
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

window.initMic = initMic;
window.scheduleAutoListen = scheduleAutoListen;
window.startListening = startListening;
window.stopListening = stopListening;
window.toggleMute = toggleMute;
window.sendManual = sendManual;
window.runHint = runHint;
window.speak = speak;