const ICONS={user:'👤',aria:'🤖',action:'⚡',system:'⚙',error:'✕'};

function addLog(type,who,msg,params){
  const el = DOM.logStream;
  const now=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const div=document.createElement('div'); div.className='entry '+type;
  div.innerHTML=`<div class="eicon ${type}">${ICONS[type]||'•'}</div><div class="ebody"><div class="emeta"><span class="ewho ${type}">${who}</span><span class="etime">${now}</span></div><div class="emsg">${Helpers.esc(msg)}</div>${params?`<div class="eparams">${Helpers.esc(params)}</div>`:''}</div>`;
  el.appendChild(div); el.scrollTop=el.scrollHeight;
  S.logEntries.push({time:now,type,who,msg,params});
  if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
}

function showThinking(on){ DOM.thinkingRow.className='thinking-row'+(on?' show':''); }

function clearLog(){ DOM.logStream.innerHTML=''; S.logEntries=[]; addLog('system','SYSTEM','Log cleared.'); if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot(); }

function exportLog(){
  const txt=S.logEntries.map(e=>`[${e.time}] [${e.who}] ${e.msg}${e.params?'\n'+e.params:''}`).join('\n\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'})); a.download=`nexabank-log-${S.sessionId}.txt`; a.click();
}

function renderLog(){
  const el = DOM.logStream;
  if(!el) return;
  el.innerHTML = '';
  const icons = {user:'👤',aria:'🤖',action:'⚡',system:'⚙',error:'✕'};
  S.logEntries.forEach(function(e){
    const div = document.createElement('div');
    div.className = 'entry ' + e.type;
    div.innerHTML = '<div class="eicon ' + e.type + '">' + (icons[e.type]||'•') + '</div><div class="ebody"><div class="emeta"><span class="ewho ' + e.type + '">' + e.who + '</span><span class="etime">' + e.time + '</span></div><div class="emsg">' + Helpers.esc(e.msg) + '</div>' + (e.params ? '<div class="eparams">' + Helpers.esc(e.params) + '</div>' : '') + '</div>';
    el.appendChild(div);
  });
  el.scrollTop = el.scrollHeight;
}

window.addLog = addLog;
window.clearLog = clearLog;
window.exportLog = exportLog;
window.showThinking = showThinking;
window.renderLog = renderLog;