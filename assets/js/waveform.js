const wc=DOM.waveCanvas, wx=wc.getContext('2d');

function resizeWave(){ wc.width=wc.offsetWidth||220; wc.height=28; }
resizeWave(); window.addEventListener('resize',resizeWave);

function drawFlat(color='rgba(240,165,0,.15)'){
  wx.clearRect(0,0,wc.width,wc.height);
  wx.strokeStyle=color; wx.lineWidth=1.2; wx.beginPath();
  wx.moveTo(0,wc.height/2); wx.lineTo(wc.width,wc.height/2); wx.stroke();
}

function startWaveAlways(stream){
  S.audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  S.analyser=S.audioCtx.createAnalyser();
  S.analyser.fftSize=256;
  S.audioCtx.createMediaStreamSource(stream).connect(S.analyser);
  const buf=new Uint8Array(S.analyser.frequencyBinCount);

  const loop=()=>{
    S.analyser.getByteTimeDomainData(buf);
    const w=wc.width, h=wc.height;
    wx.clearRect(0,0,w,h);

    // Color by state
    let color='rgba(240,165,0,.25)', glow=0;
    if(S.isMuted){ color='rgba(255,77,109,.3)'; glow=0; }
    else if(S.isListening){ color='#f0a500'; glow=4; }
    else if(S.isSpeaking){ color='#a855f7'; glow=5; }
    else { color='rgba(240,165,0,.3)'; }

    wx.strokeStyle=color; wx.lineWidth=S.isListening?1.8:1.2;
    wx.shadowColor=color; wx.shadowBlur=glow;
    wx.beginPath();
    const sw=w/buf.length;
    for(let i=0;i<buf.length;i++){
      const y=(buf[i]/128)*h/2;
      i===0?wx.moveTo(0,y):wx.lineTo(i*sw,y);
    }
    wx.stroke();
    wx.shadowBlur=0;
    S.waveAnim=requestAnimationFrame(loop);
  };
  loop();
}

function stopWave(){
  if(S.waveAnim){ cancelAnimationFrame(S.waveAnim); S.waveAnim=null; }
  if(S.audioCtx){ S.audioCtx.close(); S.audioCtx=null; }
  if(S.analyser){ S.analyser=null; }
  drawFlat();
}

window.startWaveAlways = startWaveAlways;
window.stopWave = stopWave;
window.resizeWave = resizeWave;
window.drawFlat = drawFlat;