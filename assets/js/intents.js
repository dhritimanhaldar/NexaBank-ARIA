function canDoTask(text){
  const t = text.toLowerCase();

  const supported = [
    /\btransfer\b|\bsend money\b|\bsend\b/,
    /\bpay\b.*\bbill\b|\bbill payment\b/,
    /\bbalance\b/,
    /\bblock\b.*\bcard\b|\bfreeze\b.*\bcard\b/,
    /\bstatement\b|\bpassbook\b|\btransaction history\b/,
    /\btransaction\b|\brecent transaction\b|\blast transaction\b/,
    /\bupdate\b.*\b(email|mobile|phone|address|city|profile|details)\b/
  ];

  return supported.some(re => re.test(t));
}

function getSupportedTaskExamples(){
  return [
    'transfer money',
    'make an international transfer',
    'pay a bill',
    'check your balance',
    'block a debit card',
    'request a statement',
    'review recent transactions',
    'update your contact details'
  ];
}

function respond(text){
  const p = NLP.classify(text);
  const { intent, amount, to, account, biller, period, task, field, scope } = p;

  const sav = S.accounts.savings, cur = S.accounts.current;
  const srcBal = account === 'current' ? cur : sav;
  const fmt = n => '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

  if(intent === 'transfer'){
    if(!amount && !to) return {
      action:null,
      spoken:"Sure, I can help with that. Whom would you like to send it to, and how much should I send?"
    };

    if(!amount) return {
      action:null,
      spoken:`Okay, I will send money to ${to}. How much should I send?`
    };

    if(!to) return {
      action:null,
      spoken:`Okay, I understand you want to send ${fmt(amount)}. Whom would you like to send it to?`
    };

    if(amount > srcBal) return {
      action:'transfer',
      status:'failed',
      amtClass:'debit',
      amount:fmt(amount),
      detail:`To: ${to} | Insufficient funds`,
      spoken:`I'm afraid your ${account} account currently holds ${fmt(srcBal)}, which isn't sufficient to transfer ${fmt(amount)}. Let's see how we can make that work — would you like to use a different account?`
    };

    return {
      action:'transfer',
      status:'success',
      amtClass:'debit',
      amount:fmt(amount),
      detail:`To: ${to} | From: ${cap(account)}`,
      debit:{ acct:account, amt:amount },
      spoken:`We're all set! ${fmt(amount)} has been transferred to ${to} from your ${account} account. Your new balance is ${fmt(srcBal - amount)}. Is there anything else I can help you with?`
    };
  }

  if(intent === 'pay_bill'){
    if(!amount && !biller) return {
      action:null,
      spoken:"Sure, I can help with a bill payment. Which bill would you like to pay, and how much would you like to pay?"
    };

    if(!amount) return {
      action:null,
      spoken:`Okay, I can help with your ${biller || 'bill'}. How much would you like to pay?`
    };

    if(!biller) return {
      action:null,
      spoken:`Okay, I understand you want to pay ${fmt(amount)}. Which bill would you like to pay?`
    };

    if(amount > srcBal) return {
      action:'payment',
      status:'failed',
      amtClass:'debit',
      amount:fmt(amount),
      detail:`Biller: ${biller} | Insufficient funds`,
      spoken:`Your ${account} account balance of ${fmt(srcBal)} is insufficient for this ${fmt(amount)} payment.`
    };

    return {
      action:'payment',
      status:'success',
      amtClass:'debit',
      amount:fmt(amount),
      detail:`Biller: ${biller} | From: ${cap(account)}`,
      debit:{ acct:account, amt:amount },
      spoken:`Your ${biller} bill payment of ${fmt(amount)} has been processed successfully from your ${account} account.`
    };
  }

  if(intent === 'check_balance'){
    const a = account;
    const msg = a === 'both'
      ? `Your savings balance is ${fmt(sav)} and current account is ${fmt(cur)}.`
      : a === 'current'
      ? `Your current account balance is ${fmt(cur)}.`
      : `Your savings account balance is ${fmt(sav)}.`;

    const detail = a === 'both'
      ? `Savings: ${fmt(sav)} | Current: ${fmt(cur)}`
      : a === 'current'
      ? 'Current ••9034'
      : 'Savings ••4821';

    return { action:'balance', status:'info', amtClass:'neutral', amount:'—', detail, spoken:msg };
  }

  if(intent === 'block_card'){
    return {
      action:'block',
      status:'success',
      amtClass:'neutral',
      amount:'—',
      detail:`${cap(account)} Debit Card — blocked`,
      spoken:`Your ${account} debit card has been blocked immediately. A new card will be dispatched within 5 working days.`
    };
  }

  if(intent === 'request_statement'){
    return {
      action:'statement',
      status:'success',
      amtClass:'neutral',
      amount:'—',
      detail:`${cap(account)} | ${cap(period || 'last month')}`,
      spoken:`Your ${account} statement for ${period || 'last month'} has been sent to your registered email address.`
    };
  }

  if(intent === 'transaction_info'){
    const rows = getRecentTransactionSummary(scope === 'recent' ? 5 : 5);
    return {
      action:null,
      spoken:buildRecentTransactionSpeech(rows)
    };
  }

  if(intent === 'profile_info'){
    if(field && S.customerProfile[field] != null){
      return {
        action:null,
        spoken:`Your ${getCustomerProfileLabel(field)} on file is ${S.customerProfile[field]}.`
      };
    }

    return {
      action:null,
      spoken:`I can help with your profile details like email address, mobile number, city, address, or KYC status. Which one would you like to check?`
    };
  }

  if(intent === 'update_info'){
    if(field && S.customerProfile[field] != null){
      return {
        action:null,
        spoken:`I can help update your ${getCustomerProfileLabel(field)}. For this demo, I can capture the request, but I am not yet applying profile changes automatically. Please tell me the new ${getCustomerProfileLabel(field)} you want to set.`
      };
    }

    return {
      action:null,
      spoken:`I can help with updates to your mobile number, email address, city, address, name, or KYC-related details. What would you like to update?`
    };
  }

  if(intent === 'capability_check'){
    const yes = canDoTask(task || text);
    if(yes){
      return {
        action:null,
        spoken:`Yes, I can help with that. If you'd like, you can go ahead and ask me now.`
      };
    }

    const examples = getSupportedTaskExamples().slice(0,4).join(', ');
    return {
      action:null,
      spoken:`No, I can't perform that task right now. I can help with things like ${examples}.`
    };
  }

  if(intent === 'international_transfer'){
    if(!amount && !to) return {
      action:null,
      spoken:"I can certainly help you move money across borders today. Which country and recipient are you sending to, and how much would you like to transfer? You will need the recipient's IBAN — that's their International Bank Account Number — and their BIC, which is the Bank Identifier Code."
    };
    if(!amount) return {
      action:null,
      spoken:`I can certainly help you send money to ${to} internationally. How much would you like to transfer?`
    };
    if(!to) return {
      action:null,
      spoken:`I can help with an international transfer of ${fmt(amount)}. Which country or recipient are you sending this to? Please have their IBAN and BIC ready.`
    };
    if(amount > srcBal) return {
      action:'international_transfer',
      status:'failed',
      amtClass:'debit',
      amount:fmt(amount),
      detail:`International · To: ${to} | Insufficient funds`,
      spoken:`I'm afraid your ${account} account has only ${fmt(srcBal)}, which isn't sufficient for this international transfer of ${fmt(amount)}. Would you like to explore another option?`
    };
    return {
      action:'international_transfer',
      status:'success',
      amtClass:'debit',
      amount:fmt(amount),
      detail:`International Transfer · To: ${to} | From: ${cap(account)}`,
      debit:{ acct:account, amt:amount },
      spoken:`Your international transfer of ${fmt(amount)} to ${to} has been initiated. For your security, I'll need you to generate a confirmation code using the Digital Secure Key in your HSBC app. Your new balance will be ${fmt(srcBal - amount)} once the transfer clears.`
    };
  }

  if(intent === 'life_event'){
    const { eventType } = p;
    if(eventType === 'moving_abroad') return {
      action:null,
      spoken:"That's an exciting step! HSBC is uniquely positioned to help you manage your finances across multiple countries. You may want to explore our Global Money Account, which lets you hold and exchange multiple currencies. Would you like to know more?"
    };
    if(eventType === 'buying_home') return {
      action:null,
      spoken:"Congratulations on the new home! Let's make sure the financial side of this transition is as smooth as possible. I can help you with mortgage-related queries or setting up standing orders. What would you like to explore?"
    };
    if(eventType === 'getting_married') return {
      action:null,
      spoken:"Congratulations — what a wonderful milestone! HSBC can help you and your partner manage joint finances, explore our Premier services, or set up a Global Money Account. How can I help you get started?"
    };
    return {
      action:null,
      spoken:"That sounds like an important life event. HSBC is here to support you through every financial transition. How can I help you today?"
    };
  }

  if(intent === 'greeting'){
    return {
      action:null,
      spoken:"Hello! I'm ARIA, your HSBC Global Navigator. How may I assist you with your banking today?"
    };
  }

  if(intent === 'greeting_time'){
    return {
      action:null,
      spoken:"Good to hear from you. I'm ARIA, HSBC's Global Navigator. Let's see how we can make that happen for you."
    };
  }

  if(intent === 'gratitude'){
    return {
      action:null,
      spoken:"You're most welcome. I'm happy to help. Is there anything else you'd like me to do?"
    };
  }

  if(intent === 'apology'){
    return {
      action:null,
      spoken:"No worries at all. Please go ahead — I'm here to help."
    };
  }

  if(intent === 'courtesy'){
    return {
      action:null,
      spoken:"Of course. Please tell me what you'd like me to do."
    };
  }

  if(intent === 'farewell'){
    return {
      action:null,
      spoken:"Thank you for banking with HSBC. Take care, and feel free to come back whenever you need us."
    };
  }

  if(intent === 'help'){
    return {
      action:null,
      spoken:"I can help with transferring money, international transfers using your IBAN and BIC details, paying bills, checking balances, blocking a debit card, requesting statements, reviewing recent transactions, and guiding you on profile updates. I can also help you explore your Global Money Account or Premier status."
    };
  }

  const examples = getSupportedTaskExamples().slice(0,5).join(', ');
  return {
    action:'unknown',
    status:'info',
    amtClass:'neutral',
    amount:'—',
    detail:`Input: "${text.slice(0,40)}"`,
    spoken:`That's an interesting thought! I'm afraid my expertise is mostly limited to the world of finance. While I can't help with that, I can certainly help you explore your Global Money Account, check your Premier status, or assist with ${examples}. Which would you prefer?`
  };
}

window.canDoTask = canDoTask;
window.getSupportedTaskExamples = getSupportedTaskExamples;
window.respond = respond;