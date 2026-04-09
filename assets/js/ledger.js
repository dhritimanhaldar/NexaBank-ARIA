function addTx(action,detail,amount,amtClass,status){
  S.txSeq++;
  DOM.emptyLedger.style.display='none';
  DOM.ledgerTable.style.display='';
  DOM.ledgerCount.textContent=S.txSeq+' action'+(S.txSeq!==1?'s':'');
  DOM.totalActions.textContent=S.txSeq;
  DOM.txnCount.textContent=S.txSeq;
  const now=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const row=document.createElement('tr'); row.className='new-tx';
  row.innerHTML=`<td style="color:var(--text3)">${S.txSeq}</td><td style="color:var(--text3);white-space:nowrap">${now}</td><td><span class="badge ${action}">${Helpers.actionLabel(action)}</span></td><td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Helpers.esc(detail||'')}">${Helpers.esc(detail||'—')}</td><td><span class="amt ${amtClass||'neutral'}">${amount||'—'}</span></td><td><span class="sbadge ${status}">${status}</span></td>`;
  DOM.ledgerBody.prepend(row);
}

function updateBal(key,delta){
  const balEl = key==='savings' ? DOM.savingsBal : DOM.currentBal;
  const chgEl = key==='savings' ? DOM.savingsChg : DOM.currentChg;
  const cardEl = key==='savings' ? DOM.savingsCard : DOM.currentCard;
  balEl.textContent='₹ '+S.accounts[key].toLocaleString('en-IN',{minimumFractionDigits:2});
  chgEl.textContent=(delta<0?'−':'+')+' ₹ '+Math.abs(delta).toLocaleString('en-IN')+(delta<0?' debited':' credited');
  chgEl.className='acct-chg '+(delta<0?'debit':'credit');
  cardEl.classList.add('updated');
  setTimeout(()=>{ cardEl.classList.remove('updated'); chgEl.textContent=''; },2500);
}

function getRecentLedgerRows(limit=5){
  const rows = [...document.querySelectorAll('#ledgerBody tr')];
  return rows.slice(0, limit);
}

function getRecentTransactionSummary(limit=5){
  const rows = getRecentLedgerRows(limit);
  if(!rows.length) return null;

  return rows.map(row => {
    const cells = row.querySelectorAll('td');
    return {
      seq: cells[0]?.textContent?.trim() || '',
      time: cells[1]?.textContent?.trim() || '',
      action: cells[2]?.textContent?.trim() || '',
      details: cells[3]?.textContent?.trim() || '',
      amount: cells[4]?.textContent?.trim() || '',
      status: cells[5]?.textContent?.trim() || ''
    };
  });
}

function buildRecentTransactionSpeech(rows){
  if(!rows || !rows.length){
    return "I don't see any completed transactions yet. You can ask me to transfer money, pay a bill, check your balance, block a card, or request a statement.";
  }

  if(rows.length === 1){
    const r = rows[0];
    return `Your most recent transaction was ${r.action} at ${r.time}. ${r.details}. Amount ${r.amount}. Status ${r.status}.`;
  }

  const first = rows[0];
  return `I found your recent transactions. The latest was ${first.action} at ${first.time}, ${first.details}, amount ${first.amount}, status ${first.status}. I can also walk you through more of them if you want.`;
}

window.addTx = addTx;
window.updateBal = updateBal;
window.getRecentLedgerRows = getRecentLedgerRows;
window.getRecentTransactionSummary = getRecentTransactionSummary;
window.buildRecentTransactionSpeech = buildRecentTransactionSpeech;