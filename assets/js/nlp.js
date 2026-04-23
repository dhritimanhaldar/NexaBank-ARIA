const NLP = {
  numberWords: {
    zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
    ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16,
    seventeen:17, eighteen:18, nineteen:19,
    twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90
  },

  parseWordNumber(text){
    if(!text) return null;

    const cleaned = String(text)
      .toLowerCase()
      .replace(/-/g,' ')
      .replace(/\band\b/g,' ')
      .replace(/\brupees?\b|\brs\.?\b|\binr\b/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    if(!cleaned) return null;

    const tokens = cleaned.split(' ').filter(Boolean);
    if(!tokens.length) return null;

    const digitWords = ['zero','one','two','three','four','five','six','seven','eight','nine'];

    if(tokens.every(t => digitWords.includes(t))){
      return Number(tokens.map(t => this.numberWords[t]).join(''));
    }

    let total = 0;
    let current = 0;
    let seen = false;

    for(const token of tokens){
      if(this.numberWords[token] != null){
        current += this.numberWords[token];
        seen = true;
        continue;
      }

      if(token === 'hundred'){
        current = (current || 1) * 100;
        seen = true;
        continue;
      }

      if(token === 'thousand'){
        total += (current || 1) * 1000;
        current = 0;
        seen = true;
        continue;
      }

      if(token === 'lakh'){
        total += (current || 1) * 100000;
        current = 0;
        seen = true;
        continue;
      }

      return null;
    }

    const finalValue = total + current;
    return seen && finalValue > 0 ? finalValue : null;
  },

  amount(t){
    let m;
    m = t.match(/(\d+\.?\d*)\s*lakh/i); if(m) return +m[1] * 100000;
    m = t.match(/(\d+\.?\d*)\s*thousand/i); if(m) return +m[1] * 1000;
    m = t.match(/(\d+\.?\d*)\s*k\b/i); if(m) return +m[1] * 1000;
    m = t.match(/(?:rs\.?|₹|inr)?\s*(\d[\d,]*\.?\d*)/i); if(m) return parseFloat(m[1].replace(/,/g,''));
    m = t.match(/(\d[\d,]+)/); if(m) return parseFloat(m[1].replace(/,/g,''));

    const wordsValue = this.parseWordNumber(t);
    if(wordsValue != null) return wordsValue;

    return null;
  },

  name(t){
    const sw=['my','the','a','an','from','to','savings','current','account','balance','rupees','rs','inr'];
    const m=t.match(/(?:to|pay|send|transfer|give|forward|dispatch|pass|credit)\s+(?:to\s+)?([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
    if(!m) return null;
    const n=m[1].trim().split(/\s+/).filter(w=>!sw.includes(w.toLowerCase())).join(' ');
    return n.length>1?n.charAt(0).toUpperCase()+n.slice(1):null;
  },

  account(t){
    if(/current|biz|business/.test(t)) return 'current';
    return 'savings';
  },

  biller(t){
    const s = String(t || '').toLowerCase();

    if(/\belectricity\b|\belectric\b/.test(s)) return 'Electricity';
    if(/\bwater\b/.test(s)) return 'Water';
    if(/\bgas\b/.test(s)) return 'Gas';
    if(/\binternet\b|\bbroadband\b/.test(s)) return 'Internet';
    if(/\bmobile\b|\bphone\b/.test(s)) return 'Mobile';
    if(/\binsurance\b/.test(s)) return 'Insurance';
    if(/\brent\b/.test(s)) return 'Rent';
    if(/\bemi\b/.test(s)) return 'EMI';
    if(/\bcredit card\b/.test(s)) return 'Credit Card';
    if(/\bschool\b|\bcollege\b|\bfees\b/.test(s)) return 'Fees';

    const m = s.match(/pay\s+(?:the\s+)?([a-z\s]+?)\s+bill/i);
    if(m) return m[1].trim().charAt(0).toUpperCase() + m[1].trim().slice(1);

    return 'Bill';
  },

  classify(text){
    const t = text.toLowerCase().trim();

    if(/\b(thank you|thanks|thankyou|many thanks|thanks a lot)\b/.test(t)) return { intent:'gratitude' };
    if(/\b(sorry|i am sorry|i'm sorry|apologies|my apologies)\b/.test(t)) return { intent:'apology' };
    if(/\b(please|excuse me|pardon me|kindly)\b/.test(t) && t.split(/\s+/).length <= 4) return { intent:'courtesy' };
    if(/\b(good morning|good afternoon|good evening)\b/.test(t)) return { intent:'greeting_time' };
    if(/\b(bye|goodbye|see you|talk to you later|catch you later)\b/.test(t)) return { intent:'farewell' };

    if(/\b(can you|could you|are you able to|do you support|do you handle)\b/.test(t))
      return { intent:'capability_check', task:text };

    if(/\b(what can you do|what all can you do|what do you do|how can you help|help me with)\b/.test(t))
      return { intent:'help' };

    if(/\b(last transaction|recent transaction|recent transactions|transaction history|show transaction|tell me my transactions|what transactions|what was my last transaction)\b/.test(t))
      return { intent:'transaction_info', scope:'recent' };

    if(/\b(transaction)\b.*\b(amount|status|details|time|date|recipient|beneficiary)\b/.test(t))
      return { intent:'transaction_info', scope:'recent' };

    if(/\b(update|change|modify|edit|correct)\b.*\b(email|mobile|phone|address|city|name|profile|details|kyc)\b/.test(t))
      return { intent:'update_info', field:detectProfileFieldToUpdate(text) };

    if(/\bwhat is my\b.*\b(email|mobile|phone|address|city|name|kyc)\b/.test(t) || /\bshow my\b.*\b(email|mobile|phone|address|city|profile|details|kyc)\b/.test(t))
      return { intent:'profile_info', field:detectProfileFieldToUpdate(text) };

    if(/\b(international|overseas|abroad|foreign|cross.?border|iban|bic|swift)\b/.test(t) && /\b(transfer|send|wire|remit)\b/.test(t))
      return { intent:'international_transfer', amount:this.amount(text), to:this.name(text), account:this.account(t) };

    if(/\b(transfer|send|wire|remit|neft|imps|upi|move|give|pass|forward|dispatch|shift|deposit|credit)\b/.test(t) && !/bill/.test(t))
      return { intent:'transfer', amount:this.amount(text), to:this.name(text), account:this.account(t) };

    if(
      /\b(pay|payment|settle|clear|discharge|recharge)\b.*\bbill\b/.test(t) ||
      /\b(pay|settle|clear|discharge|recharge)\s+(electricity|water|gas|internet|mobile|phone|insurance|rent|emi|fees)\b/.test(t) ||
      /\b(electricity|water|gas|internet|mobile|phone|insurance|rent|emi)\s+bill\b/.test(t) ||
      /\bbill payment\b/.test(t)
    )
      return { intent:'pay_bill', amount:this.amount(text), biller:this.biller(text), account:this.account(t) };

    if(/\b(balance|how much|available amount|available funds|what.?s left|how much do i have|account total|my funds|remaining amount)\b/.test(t) && !/send|transfer|pay/.test(t))
      return { intent:'check_balance', account:/current/.test(t)?'current':/savings/.test(t)?'savings':'both' };

    if(/\b(block|freeze|lock|disable|lost|stolen|cancel|suspend|deactivate|destroy)\b.*\b(card|debit|credit)\b/.test(t) || /\b(card|debit)\b.*\b(block|lost|stolen|freeze|suspend|stolen)\b/.test(t))
      return { intent:'block_card', account:this.account(t) };

    if(/\b(statement|passbook|history|mini statement|account log|records|account report|transaction report|show transactions|my transactions)\b/.test(t)){
      const m=t.match(/(\d+|last|three|six|one|two)\s*months?/);
      return { intent:'request_statement', period:m?m[0]:'last month', account:this.account(t) };
    }

    if(/\b(moving abroad|moving overseas|relocating abroad|emigrating|expat|move to another country)\b/.test(t)) return { intent:'life_event', eventType:'moving_abroad' };
    if(/\b(buying a home|bought a house|new home|new house|mortgage|first home)\b/.test(t)) return { intent:'life_event', eventType:'buying_home' };
    if(/\b(getting married|just married|newly married|wedding)\b/.test(t)) return { intent:'life_event', eventType:'getting_married' };

    if(/\b(hi|hello|hey|namaste)\b/.test(t)) return { intent:'greeting' };

    return { intent:'unknown', raw:text };
  }
};

// ── Partial-keyword intent scoring ───────────────────────────────────────────
// Maps each intent to the words/phrases that are strong signals for it.
// Used when NLP.classify() returns 'unknown' (garbled / broken English input).
NLP.INTENT_SIGNALS = {
  transfer: [
    'transfer','send','wire','remit','neft','imps','upi','move','give','pass',
    'forward','dispatch','shift','credit to','debit from','deposit to'
  ],
  pay_bill: [
    'pay','payment','bill','settle','clear','discharge','recharge',
    'electricity','electric','water','gas','internet','broadband',
    'mobile','phone','insurance','rent','emi','fees','credit card'
  ],
  check_balance: [
    'balance','how much','available','funds','amount left','what\'s left',
    'account total','how much do i have','what do i have'
  ],
  block_card: [
    'block','freeze','lock','disable','lost','stolen','cancel card',
    'suspend','deactivate','destroy card'
  ],
  request_statement: [
    'statement','passbook','history','mini statement','account log',
    'records','report','transactions','last transactions','show transactions'
  ],
  international_transfer: [
    'international','overseas','abroad','foreign','cross border',
    'iban','bic','swift','wire abroad','send overseas'
  ]
};

// Returns an array of { intent, score, label } sorted by score descending.
// score = number of signal words found in the lowercased input text.
NLP.scorePartialIntent = function(text) {
  const t = String(text || '').toLowerCase();
  const LABELS = {
    transfer: 'transfer money to someone',
    pay_bill: 'pay a bill',
    check_balance: 'check your account balance',
    block_card: 'block your card',
    request_statement: 'get an account statement',
    international_transfer: 'make an international transfer'
  };

  return Object.entries(NLP.INTENT_SIGNALS)
    .map(([intent, signals]) => ({
      intent,
      label: LABELS[intent],
      score: signals.filter(sig => t.includes(sig)).length
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
};

window.NLP = NLP;