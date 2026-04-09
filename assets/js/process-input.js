function isCancelIntent(text){
  return /\b(cancel|stop|nevermind|never mind|forget it|do not proceed|don't proceed|dont proceed|cancel transaction|stop transaction)\b/i.test(String(text || ''));
}

function buildAmountText(amount){
  return '₹ ' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function extractLooseRecipient(input){
  if(!input) return null;

  const direct = NLP.name(input);
  if(direct) return direct;

  const cleaned = String(input)
    .replace(/\b(send|transfer|pay|money|bill|rupees?|rs\.?|inr|to|for|from|account|please|upi|neft|imps|amount|electricity|water|gas|internet|mobile|phone)\b/gi,' ')
    .replace(/[^a-zA-Z\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  if(!cleaned) return null;

  const words = cleaned.split(' ').filter(Boolean);
  if(words.length >= 1 && words.length <= 3){
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  return null;
}

function extractLooseBiller(input){
  if(!input) return null;
  const t = String(input).toLowerCase();

  if(/\belectricity\b|\belectric\b/.test(t)) return 'Electricity';
  if(/\bwater\b/.test(t)) return 'Water';
  if(/\bgas\b/.test(t)) return 'Gas';
  if(/\binternet\b|\bbroadband\b/.test(t)) return 'Internet';
  if(/\bmobile\b|\bphone\b/.test(t)) return 'Mobile';
  if(/\binsurance\b/.test(t)) return 'Insurance';
  if(/\brent\b/.test(t)) return 'Rent';
  if(/\bemi\b/.test(t)) return 'EMI';
  if(/\bcredit card\b/.test(t)) return 'Credit Card';

  const fromNlp = NLP.biller(input);
  if(fromNlp && fromNlp !== 'Bill') return fromNlp;

  return null;
}

function inferIntentFromText(text){
  const parsed = NLP.classify(text);
  if(parsed.intent === 'transfer' || parsed.intent === 'pay_bill') return parsed.intent;

  const t = String(text || '').toLowerCase();
  if(/\b(transfer|send|remit|wire|upi|neft|imps)\b/.test(t)) return 'transfer';
  if(/\b(pay|payment|bill|electricity|water|gas|internet|mobile|phone|insurance|rent|emi)\b/.test(t)) return 'pay_bill';

  return null;
}

function createOrMergePendingTask(existingTask, text){
  const parsed = NLP.classify(text);
  const task = existingTask ? { ...existingTask } : {
    intent: null,
    amount: null,
    recipient: null,
    biller: null,
    account: null,
    originalText: ''
  };

  task.originalText = [task.originalText, String(text || '').trim()].filter(Boolean).join(' ').trim();

  if(!task.intent){
    task.intent = inferIntentFromText(text);
  }

  if(!task.amount){
    const amt = NLP.amount(text);
    if(amt != null) task.amount = amt;
  }

  if(!task.account){
    if(/\bcurrent\b|\bbusiness\b|\bbiz\b/i.test(text)) task.account = 'current';
    else if(/\bsavings\b/i.test(text)) task.account = 'savings';
  }

  if(task.intent === 'transfer' && !task.recipient){
    const name = extractLooseRecipient(text);
    if(name) task.recipient = name;
  }

  if(task.intent === 'pay_bill' && !task.biller){
    const biller = extractLooseBiller(text);
    if(biller) task.biller = biller;
  }

  if(!task.intent){
    if(task.recipient) task.intent = 'transfer';
    if(task.biller) task.intent = 'pay_bill';
  }

  if(!task.account) task.account = 'savings';

  return task;
}

function isPendingTaskComplete(task){
  if(!task || !task.intent) return false;
  if(task.intent === 'transfer') return !!(task.amount && task.recipient);
  if(task.intent === 'pay_bill') return !!(task.amount && task.biller);
  return false;
}

function buildPendingTaskPrompt(task, retry=false){
  if(!task || !task.intent){
    return retry
      ? 'I still need a little more information. Would you like to transfer money or pay a bill?'
      : 'Sure, I can help with that. Would you like to transfer money or pay a bill?';
  }

  if(task.intent === 'transfer'){
    if(task.amount && !task.recipient){
      return retry
        ? `I still need the recipient name. You want to send ${buildAmountText(task.amount)}. Whom would you like to send it to?`
        : `Okay, I understand you want to send ${buildAmountText(task.amount)}. Whom would you like to send it to?`;
    }
    if(!task.amount && task.recipient){
      return retry
        ? `I still need the amount. I will send money to ${task.recipient}. How much should you send?`
        : `Okay, I will send money to ${task.recipient}. How much should you send?`;
    }
    return retry
      ? `I still need the recipient name and amount. Whom would you like to send it to, and how much should you send?`
      : `Sure, I can help with that. Whom would you like to send it to, and how much should you send?`;
  }

  if(task.intent === 'pay_bill'){
    if(task.biller && !task.amount){
      return retry
        ? `I still need the amount for the ${task.biller} bill. How much would you like to pay?`
        : `Okay, I can help with your ${task.biller} bill. How much would you like to pay?`;
    }
    if(!task.biller && task.amount){
      return retry
        ? `I still need the bill type. You want to pay ${buildAmountText(task.amount)}. Which bill would you like to pay?`
        : `Okay, I understand you want to pay ${buildAmountText(task.amount)}. Which bill would you like to pay?`;
    }
    return retry
      ? 'I still need the bill type and amount. For example, you can say pay electricity bill 1200. Which bill would you like to pay, and how much should you pay?'
      : 'Sure, I can help with a bill payment. Which bill would you like to pay, and how much would you like to pay?';
  }

  return 'Please tell me a little more so I can help correctly.';
}

function buildPendingTaskDetail(task){
  if(!task) return 'Pending task updated.';
  const missing = [];
  if(task.intent === 'transfer'){
    if(!task.recipient) missing.push('recipient name');
    if(!task.amount) missing.push('amount');
    return `Pending transfer updated. Still missing: ${missing.join(', ') || 'nothing'}`;
  }
  if(task.intent === 'pay_bill'){
    if(!task.biller) missing.push('bill type');
    if(!task.amount) missing.push('amount');
    return `Pending bill payment updated. Still missing: ${missing.join(', ') || 'nothing'}`;
  }
  return 'Pending task updated.';
}

function buildCompletionCommand(task){
  if(task.intent === 'transfer'){
    return `transfer ${task.amount} to ${task.recipient} from ${task.account || 'savings'}`;
  }
  if(task.intent === 'pay_bill'){
    return `pay ${task.biller} bill ${task.amount} from ${task.account || 'savings'}`;
  }
  return null;
}

function speakPendingResponse(rawText, spoken, detailText){
  stopListening(true);
  S.isThinking = true;
  DOM.transcriptText.textContent = rawText;
  addLog('user','You',rawText);
  if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
  showThinking(true);
  setStatus('thinking','THINKING');
  setOrbSpin(false);
  setTimeout(() => {
    showThinking(false);
    S.isThinking = false;
    addLog('aria','ARIA',spoken);
    if(detailText) addLog('system','SYSTEM',detailText);
    if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
    speak(spoken);
  }, 350);
}

function processInput(text){
  if(S.isThinking) return;

  const rawText = String(text || '').trim();
  if(!rawText) return;

  const fmt = n => '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const cancelWords = /\b(cancel|stop|do not proceed|don't proceed|dont proceed|cancel transaction|nevermind|never mind)\b/i;

  if(isCancelIntent(rawText) && (S.pendingTask || S.pendingTransaction)){
    S.pendingTask = null;
    S.pendingTransaction = null;
    const spoken = "Okay, I've cancelled that transaction. How else can I help you?";
    speakPendingResponse(rawText, spoken, 'Pending task cancelled.');
    return;
  }

  if(S.pendingTask){
    S.pendingTask = createOrMergePendingTask(S.pendingTask, rawText);

    if(isPendingTaskComplete(S.pendingTask)){
      const completeText = buildCompletionCommand(S.pendingTask);
      const completedIntent = S.pendingTask.intent;
      S.pendingTransaction = null;
      S.pendingTask = null;
      addLog('system','SYSTEM',`Completing pending ${completedIntent === 'pay_bill' ? 'bill payment' : 'transfer'}: ${completeText}`);
      if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
      processInput(completeText);
      return;
    }

    const spoken = buildPendingTaskPrompt(S.pendingTask, true);
    const detail = buildPendingTaskDetail(S.pendingTask);
    speakPendingResponse(rawText, spoken, detail);
    return;
  }

  const parsed = NLP.classify(rawText);

  if(parsed.intent === 'transfer' || parsed.intent === 'pay_bill'){
    const initialTask = createOrMergePendingTask(null, rawText);

    if(!isPendingTaskComplete(initialTask)){
      S.pendingTask = initialTask;
      S.pendingTransaction = initialTask.intent === 'transfer' ? initialTask : null;
      const spoken = buildPendingTaskPrompt(initialTask, false);
      const detail = buildPendingTaskDetail(initialTask);
      speakPendingResponse(rawText, spoken, detail);
      return;
    }
  }

  stopListening(true);
  S.isThinking = true;
  DOM.transcriptText.textContent = rawText;
  addLog('user','You',rawText);
  if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
  showThinking(true);
  setStatus('thinking','THINKING');
  setOrbSpin(false);

  setTimeout(()=>{
    const r = respond(rawText);
    showThinking(false);
    S.isThinking = false;
    addLog('aria','ARIA',r.spoken);
    if(S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
    speak(r.spoken);

    if(r.action){
      const detail = r.detail ? `Detail: ${r.detail}\nAmount: ${r.amount}` : null;
      addLog('action','ACTION',Helpers.actionLabel(r.action)+' · '+r.status,detail);
      addTx(r.action,r.detail,r.amount,r.amtClass,r.status);

      if(r.debit && r.status === 'success'){
        S.accounts[r.debit.acct] -= r.debit.amt;
        S.totalDebit += r.debit.amt;
        updateBal(r.debit.acct,-r.debit.amt);
        DOM.totalDebit.textContent = '₹ ' + S.totalDebit.toLocaleString('en-IN');
      }
    }
  },550);
}

window.processInput = processInput;