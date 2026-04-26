const SILENCE_TIMEOUT_MS = 5000;
const MAX_LISTEN_MS = 120000;
const MIN_TRANSCRIPT_LENGTH = 2;
const SPEECH_FLUSH_MS = 1200;
const VAD_SPEECH_THRESHOLD = 9;
const VAD_STREAK_FRAMES = 2;

let mediaRecorder = null;
let recordedChunks = [];
let recordingActive = false;
let speechFlushTimer = null;
let vadFrameId = null;
let listenSessionToken = 0;
let activeListenMode = null;
let discardRecordingOnStop = false;
let speechFrameStreak = 0;

function hasMeaningfulTranscript(text) {
  return typeof text === 'string' && text.trim().replace(/\s+/g, ' ').length >= MIN_TRANSCRIPT_LENGTH;
}

function isOpenAIRuntimeEnabled() {
  return Boolean(window.OPENAI_RUNTIME?.enabled && typeof window.transcribeWithOpenAI === 'function');
}

function getRecorderMimeType() {
  if (typeof window.MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return 'audio/webm';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }

  return '';
}

function clearSpeechFlushTimer() {
  if (speechFlushTimer) {
    clearTimeout(speechFlushTimer);
    speechFlushTimer = null;
  }
}

function clearVadMonitor() {
  if (vadFrameId) {
    cancelAnimationFrame(vadFrameId);
    vadFrameId = null;
  }
  speechFrameStreak = 0;
}

function startRecognitionSilenceTimeout(recognition, onSilenceStop) {
  if (appState.silenceTimeoutId) {
    clearTimeout(appState.silenceTimeoutId);
  }

  appState.silenceTimeoutId = setTimeout(() => {
    console.log('[mic] silence timeout reached');
    stopRecognitionSession(recognition, 'silence-timeout');
    if (typeof onSilenceStop === 'function') onSilenceStop();
  }, SILENCE_TIMEOUT_MS);
}

function startRecognitionMaxListenTimeout(recognition) {
  if (appState.maxListenTimeoutId) {
    clearTimeout(appState.maxListenTimeoutId);
  }

  appState.maxListenTimeoutId = setTimeout(() => {
    console.log('[mic] max listen timeout reached');
    stopRecognitionSession(recognition, 'max-listen-timeout');
  }, MAX_LISTEN_MS);
}

function startOpenAINoSpeechTimeout(sessionToken) {
  if (appState.silenceTimeoutId) {
    clearTimeout(appState.silenceTimeoutId);
  }

  appState.silenceTimeoutId = setTimeout(() => {
    if (sessionToken !== listenSessionToken || activeListenMode !== 'openai') return;

    console.log('[mic] no speech detected before transcription');
    stopListening(true);
    if (typeof setListeningUi === 'function') {
      setListeningUi(false, 'No speech detected, stopped listening.');
    }
    DOM.transcriptText.textContent = 'Waiting for input…';
    if (!S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady) {
      scheduleAutoListen(1500);
    }
  }, SILENCE_TIMEOUT_MS);
}

function startOpenAIMaxListenTimeout(sessionToken) {
  if (appState.maxListenTimeoutId) {
    clearTimeout(appState.maxListenTimeoutId);
  }

  appState.maxListenTimeoutId = setTimeout(() => {
    if (sessionToken !== listenSessionToken || activeListenMode !== 'openai') return;

    console.log('[mic] max listen timeout reached');
    if (recordingActive) {
      finishOpenAIUtterance();
      return;
    }

    stopListening(true);
    if (typeof setListeningUi === 'function') {
      setListeningUi(false, 'Microphone idle.');
    }
    if (!S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady) {
      scheduleAutoListen(500);
    }
  }, MAX_LISTEN_MS);
}

function stopRecognitionSession(recognition, reason = 'manual-stop') {
  if (!recognition || !appState.recognitionActive) return;
  console.log('[mic] stopping recognition: ' + reason);
  clearRecognitionTimers();
  setListening(false);
  activeListenMode = null;
  try {
    recognition.stop();
  } catch (err) {
    console.warn('[mic] recognition.stop() failed', err);
  }
}

function startAudioCaptureForUtterance(sessionToken) {
  if (!S._stream || recordingActive || sessionToken !== listenSessionToken) return;

  const mimeType = getRecorderMimeType();

  recordedChunks = [];
  discardRecordingOnStop = false;
  mediaRecorder = mimeType ? new MediaRecorder(S._stream, { mimeType: mimeType }) : new MediaRecorder(S._stream);

  mediaRecorder.ondataavailable = function (event) {
    if (event.data && event.data.size > 0) recordedChunks.push(event.data);
  };

  mediaRecorder.onstop = async function () {
    const shouldDiscard = discardRecordingOnStop || sessionToken !== listenSessionToken;
    const blobType = mediaRecorder?.mimeType || mimeType || 'audio/webm';
    const chunks = recordedChunks.slice();

    recordingActive = false;
    mediaRecorder = null;
    recordedChunks = [];
    discardRecordingOnStop = false;

    if (shouldDiscard) return;

    const blob = new Blob(chunks, { type: blobType });
    if (!blob.size) {
      DOM.transcriptText.textContent = 'Waiting for input…';
      if (typeof setListeningUi === 'function') {
        setListeningUi(false, 'Microphone idle.');
      }
      if (!S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady) {
        scheduleAutoListen(800);
      }
      return;
    }

    try {
      DOM.transcriptText.textContent = 'Transcribing…';
      if (typeof showThinking === 'function') showThinking(true);
      if (typeof setStatus === 'function') setStatus('thinking', 'TRANSCRIBING');
      if (typeof setOrbSpin === 'function') setOrbSpin(false);

      const result = await window.transcribeWithOpenAI(blob);
      const finalText = String(result?.text || '').trim();

      if (typeof showThinking === 'function') showThinking(false);

      if (sessionToken !== listenSessionToken) return;

      if (hasMeaningfulTranscript(finalText)) {
        DOM.transcriptText.textContent = finalText;
        processInput(finalText);
      } else {
        DOM.transcriptText.textContent = 'Waiting for input…';
        if (typeof setListeningUi === 'function') {
          setListeningUi(false, 'Microphone idle.');
        }
        if (!S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady) {
          scheduleAutoListen(800);
        }
      }
    } catch (err) {
      if (typeof showThinking === 'function') showThinking(false);
      console.warn('[mic] OpenAI transcription failed:', err);
      showToast('ERR', 'Transcription failed. Listening again shortly.');
      DOM.transcriptText.textContent = 'Waiting for input…';
      if (typeof setListeningUi === 'function') {
        setListeningUi(false, 'Microphone idle.');
      }
      if (!S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady) {
        scheduleAutoListen(1500);
      }
    }
  };

  mediaRecorder.start();
  recordingActive = true;
}

function stopAudioCaptureForUtterance(discard) {
  clearSpeechFlushTimer();
  clearSilenceTimer();
  clearVadBar();
  discardRecordingOnStop = Boolean(discard);

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (err) {
      console.warn('[mic] mediaRecorder.stop() failed', err);
      recordingActive = false;
      mediaRecorder = null;
      recordedChunks = [];
      discardRecordingOnStop = false;
    }
  } else {
    recordingActive = false;
    mediaRecorder = null;
    recordedChunks = [];
    discardRecordingOnStop = false;
  }
}

function finishOpenAIUtterance() {
  clearRecognitionTimers();
  clearVadMonitor();
  setListening(false);
  activeListenMode = null;
  updateMicBtn();
  stopAudioCaptureForUtterance(false);
}

function markSpeechDetected() {
  if (appState.silenceTimeoutId) {
    clearTimeout(appState.silenceTimeoutId);
    appState.silenceTimeoutId = null;
  }

  if (S.isSpeaking) {
    cancelSpeech();
  }

  appState.hasDetectedSpeech = true;
  S.vadSpeechDetected = true;
  S.vadSilenceStart = null;

  if (!recordingActive) {
    startAudioCaptureForUtterance(listenSessionToken);
  }

  clearSpeechFlushTimer();
  startSilenceTimer(function () {}, SPEECH_FLUSH_MS);
  speechFlushTimer = setTimeout(() => {
    finishOpenAIUtterance();
  }, SPEECH_FLUSH_MS);
}

function startVoiceActivityMonitor(sessionToken) {
  if (!S.analyser) {
    console.warn('[mic] analyser is not ready for VAD');
    return;
  }

  clearVadMonitor();

  const buffer = new Uint8Array(S.analyser.fftSize);

  function loop() {
    if (sessionToken !== listenSessionToken || activeListenMode !== 'openai' || !S.isListening) {
      clearVadMonitor();
      return;
    }

    try {
      S.analyser.getByteTimeDomainData(buffer);
    } catch (err) {
      console.warn('[mic] analyser read failed', err);
      clearVadMonitor();
      return;
    }

    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const centered = buffer[i] - 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / buffer.length);
    if (rms >= VAD_SPEECH_THRESHOLD) {
      speechFrameStreak += 1;
      if (speechFrameStreak >= VAD_STREAK_FRAMES) {
        markSpeechDetected();
      }
    } else {
      speechFrameStreak = 0;
    }

    vadFrameId = requestAnimationFrame(loop);
  }

  vadFrameId = requestAnimationFrame(loop);
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

function startListeningWithBrowserRecognition() {
  S.pendingFinal = '';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ showToast('ERR','Speech API not supported. Use Chrome.'); return; }

  resetSpeechFlags();
  clearRecognitionTimers();
  clearSpeechFlushTimer();
  clearVadMonitor();
  setListening(true);
  activeListenMode = 'browser';

  const rec = new SR();
  S.recognition = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-IN';
  rec.maxAlternatives = 1;

  let stopReason = null;
  let restartAllowed = true;

  DOM.transcriptText.textContent='Listening…';
  setListeningUi(true, 'Listening…');

  rec.onresult = function (event) {
    if(S.isSpeaking){
      cancelSpeech();
    }

    let transcript = '';
    let interim = '';
    for(let i = event.resultIndex; i < event.results.length; i++){
      const result = event.results[i];
      if(!result || !result[0]) continue;
      transcript += result[0].transcript || '';
      if(result.isFinal){
        S.pendingFinal = (S.pendingFinal + ' ' + result[0].transcript).trim();
      } else {
        interim = result[0].transcript || interim;
      }
    }

    const cleanedTranscript = transcript.trim();
    const display = (S.pendingFinal + ' ' + interim).trim();
    if(display) DOM.transcriptText.textContent = display;

    if((cleanedTranscript + interim).trim().length > 0){
      appState.hasDetectedSpeech = true;
      S.vadSpeechDetected = true;
      S.vadSilenceStart = null;
      startRecognitionSilenceTimeout(rec, () => {
        if (typeof setListeningUi === 'function') {
          setListeningUi(false, 'No speech detected, stopped listening.');
        }
        const final = (S.pendingFinal + ' ' + interim).trim();
        if(final.length > 1){
          restartAllowed = false;
          processInput(final);
        } else {
          S.pendingFinal = '';
          DOM.transcriptText.textContent = 'Listening…';
        }
      });
    }
  };

  rec.onerror = function (event) {
    console.warn('[mic] recognition error', event?.error || event);
    clearRecognitionTimers();
    setListening(false);
    activeListenMode = null;
    if(typeof setListeningUi === 'function'){
      setListeningUi(false,'Microphone idle.');
    }
    if(!S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady){
      scheduleAutoListen(1500);
    }
  };

  rec.onend = function () {
    console.log('[mic] recognition ended');
    clearRecognitionTimers();
    setListening(false);
    activeListenMode = null;
    if(typeof setListeningUi === 'function' && stopReason !== 'silence-timeout'){
      setListeningUi(false,'Microphone idle.');
    }
    updateMicBtn();
    if(restartAllowed && !S.isThinking && !S.isSpeaking && !S.isMuted && S.micReady){
      scheduleAutoListen(500);
    }
  };

  try{
    rec.start();
    console.log('[mic] recognition started');
    startRecognitionSilenceTimeout(rec, () => {
      if(typeof setListeningUi === 'function'){
        setListeningUi(false,'No speech detected, stopped listening.');
      }
    });
    startRecognitionMaxListenTimeout(rec);
  } catch(err){
    setListening(false);
    activeListenMode = null;
    addLog('error','ERROR','Cannot start recognition: ' + err.message);
    updateMicBtn();
  }
}

function startListeningWithOpenAI() {
  if(typeof window.MediaRecorder === 'undefined'){
    showToast('ERR', 'Audio recording is not supported by this browser.');
    return;
  }

  resetSpeechFlags();
  clearRecognitionTimers();
  clearSpeechFlushTimer();
  clearSilenceTimer();
  clearVadBar();
  clearVadMonitor();

  recordedChunks = [];
  discardRecordingOnStop = false;
  recordingActive = false;
  listenSessionToken += 1;
  activeListenMode = 'openai';
  setListening(true);
  S.recognition = null;
  DOM.transcriptText.textContent = 'Listening…';
  setListeningUi(true, 'Listening…');

  startOpenAINoSpeechTimeout(listenSessionToken);
  startOpenAIMaxListenTimeout(listenSessionToken);
  startVoiceActivityMonitor(listenSessionToken);
}

function startListening(){
  if(S.role === 'supervisor') return;
  if(!S.micReady || S.isMuted || S.isThinking || S.isSpeaking || appState.recognitionActive) return;

  if (isOpenAIRuntimeEnabled()) {
    startListeningWithOpenAI();
    return;
  }

  startListeningWithBrowserRecognition();
}

let _silenceProgress = 0, _silenceRaf = null;
function startSilenceTimer(cb, duration = 2000){
  clearSilenceTimer();
  _silenceProgress = 0;
  const bar = DOM.vadBar;
  bar.classList.add('active');
  bar.style.width = '0%';
  const start = Date.now();
  function tick(){
    const elapsed = Date.now() - start;
    _silenceProgress = Math.min(elapsed / duration * 100, 100);
    bar.style.width = _silenceProgress + '%';
    if(_silenceProgress < 100){
      _silenceRaf = requestAnimationFrame(tick);
    } else {
      bar.classList.remove('active');
      if (typeof cb === 'function') cb();
    }
  }
  _silenceRaf = requestAnimationFrame(tick);
}

function clearSilenceTimer(){
  if(S.silenceTimer){ clearTimeout(S.silenceTimer); S.silenceTimer = null; }
  if(_silenceRaf){ cancelAnimationFrame(_silenceRaf); _silenceRaf = null; }
}

function clearVadBar(){
  const bar = DOM.vadBar;
  if(bar){ bar.classList.remove('active'); bar.style.width='0%'; }
}

function stopListening(silent=false){
  listenSessionToken += 1;
  clearRecognitionTimers();
  clearSpeechFlushTimer();
  clearSilenceTimer();
  clearVadBar();
  clearVadMonitor();

  setListening(false);
  activeListenMode = null;

  if(S.recognition){
    try{
      S.recognition.onend = null;
      S.recognition.abort();
    }catch(e){}
    S.recognition = null;
  }

  if(recordingActive || (mediaRecorder && mediaRecorder.state !== 'inactive')){
    stopAudioCaptureForUtterance(true);
  } else {
    mediaRecorder = null;
    recordedChunks = [];
    recordingActive = false;
    discardRecordingOnStop = false;
  }

  if(!S.isThinking && !S.isSpeaking && !silent){
    setStatus('live','READY');
    setOrbSpin(false);
  }

  updateMicBtn();
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
  cancelSpeech();
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

function speak(text, callback = null){
  if(S.role === 'supervisor') return;
  if(!window.speechSynthesis){
    scheduleAutoListen();
    if (callback) callback();
    return;
  }
  cancelSpeech();
  S.isSpeaking=true;
  setStatus('speaking','SPEAKING');
  DOM.ring1.className='orb-ring speak';
  DOM.ring2.className='orb-ring2 speak';
  DOM.orbFace.textContent='🗣';
  updateMicBtn();
  const u=new SpeechSynthesisUtterance(text);
  u.rate=1.0; u.pitch=1.05; u.volume=1;
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
    if (callback) callback();
    if(!S.isMuted&&!S.isThinking) scheduleAutoListen(1000);
  };
  u.onerror=(e)=>{
    if(e.error==='interrupted') return;
    S.isSpeaking=false;
    DOM.ring1.className='orb-ring';
    DOM.ring2.className='orb-ring2';
    DOM.orbFace.textContent='🤖';
    setStatus('live','READY');
    updateMicBtn();
    if (callback) callback();
    if(!S.isMuted&&!S.isThinking) scheduleAutoListen(1000);
  };
  const estimatedMs=(text.split(' ').length/2.8)*1000+800;
  setTimeout(()=>{
    if(S.isSpeaking){
      S.isSpeaking=false;
      DOM.ring1.className='orb-ring';
      DOM.ring2.className='orb-ring2';
      DOM.orbFace.textContent='🤖';
      setStatus('live','READY');
      updateMicBtn();
      if (callback) callback();
      if(!S.isMuted&&!S.isThinking) scheduleAutoListen(1000);
    }
  },estimatedMs+2000);
  speechSynthesis.speak(u);
}

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
