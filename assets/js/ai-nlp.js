// ── Conversational AI Engine for NexaBank ARIA ───────────────────────────────
// Uses Gemini (free tier) to provide human-like reasoning and responses.
// Includes random 2-digit partial PIN authentication for transactions.

(function () {
  'use strict';

  const ACTUAL_PIN = "123456";

  const SYSTEM_PROMPT = `You are ARIA, the Global Banking Assistant for NexaBank (HSBC-themed).
You are professional, helpful, and human-like.

YOUR GOALS:
1. Help with Transfers, Bill Payments, Balance Checks.
2. If info is missing (To, Amount, Biller), ask for it.
3. For vague input ("Rahul 12"), infer intent and suggest an action.
4. FOR TRANSACTIONS: Once all details are known, do NOT trigger the action. Instead, set intent to 'auth_required' and explain you need to verify the user.

PIN AUTH RULES:
- If 'auth_required' is triggered, the system will handle random PIN digit requests.
- Do NOT ask for the PIN yourself in 'spoken'. Just state that authentication is starting.

CONSTRAINTS:
- Amounts: INR (\u20b9).
- Accounts: 'savings' or 'current'.
- ALWAYS return JSON:
  {
    "intent": "transfer" | "pay_bill" | "check_balance" | "block_card" | "end_session" | "talk" | "auth_required",
    "spoken": "Professional human-like response",
    "amount": number | null,
    "to": "string" | null,
    "biller": "string" | null,
    "account": "savings" | "current",
    "needs_more": boolean
  }`;

  // Auth State
  const AUTH = {
    pending: null,    // The intent/data waiting for auth
    step: 0,          // 0: inactive, 1: first digit, 2: second digit
    digits: [],       // [ {pos: 1-6, expected: "x"} ]
    failed: false
  };

  function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  async function aiProcess(userText, history = []) {
    const cfg = window.NEXA_AI_CONFIG;
    if (!cfg || !cfg.apiKey) return null;

    const messages = [{
      role: 'user',
      parts: [{ text: SYSTEM_PROMPT + "

User History:
" + history.join('
') + "

Latest Input: " + userText }]
    }];

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cfg.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages,
          generationConfig: { temperature: 0.4, maxOutputTokens: 300, responseMimeType: 'application/json' }
        })
      });
      if (!response.ok) return null;
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const result = text ? JSON.parse(text) : null;
      
      // Auto-switch to auth_required if a transaction is complete
      if (result && (result.intent === 'transfer' || result.intent === 'pay_bill') && !result.needs_more) {
        result.intent = 'auth_required';
      }
      return result;
    } catch (err) { return null; }
  }

  const convoHistory = [];

  function _patch() {
    if (typeof window.processInput !== 'function') { setTimeout(_patch, 200); return; }
    if (window.processInput._conversational) return;

    const original = window.processInput;

    window.processInput = async function (text) {
      if (!text || S.isThinking) return;
      const t = text.trim();

      // PIN Input Handling (Interception)
      if (AUTH.step > 0) {
        DOM.transcriptText.textContent = "*";
        addLog('user', 'You', "[Digit Input]");
        
        const expected = AUTH.digits[AUTH.step - 1].expected;
        if (t === expected) {
          if (AUTH.step === 1) {
            AUTH.step = 2;
            const nextPos = AUTH.digits[1].pos;
            const spoken = `Correct. Now, please enter the ${getOrdinal(nextPos)} digit of your PIN.`;
            addLog('aria', 'ARIA', spoken);
            speak(spoken);
            return;
          } else {
            // Auth Success
            const finalSpoken = "Authorization successful. Processing your transaction now.";
            addLog('aria', 'ARIA', finalSpoken);
            speak(finalSpoken);
            
            const data = AUTH.pending;
            AUTH.step = 0;
            AUTH.pending = null;

            // Trigger action
            let cmd = data.intent;
            if (data.amount) cmd += ` ${data.amount}`;
            if (data.to) cmd += ` to ${data.to}`;
            if (data.biller) cmd += ` ${data.biller} bill`;
            if (data.account) cmd += ` from ${data.account}`;

            const r = respond(cmd);
            if (r.action) {
              addLog('action', 'ACTION', Helpers.actionLabel(r.action) + ' · ' + r.status);
              addTx(r.action, r.detail, r.amount, r.amtClass, r.status);
              if (r.debit && r.status === 'success') {
                S.accounts[r.debit.acct] -= r.debit.amt; S.totalDebit += r.debit.amt;
                updateBal(r.debit.acct, -r.debit.amt);
              }
            }
            if (S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
            return;
          }
        } else {
          // Auth Failure
          AUTH.step = 0; AUTH.pending = null;
          const failSpoken = "I'm sorry, that digit is incorrect. For security, this transaction has been revoked. Please try again from the beginning.";
          addLog('aria', 'ARIA', failSpoken);
          addLog('system', 'SYSTEM', 'AUTH_FAILED: PIN mismatch.');
          speak(failSpoken);
          return;
        }
      }

      // Normal flow
      DOM.transcriptText.textContent = t;
      addLog('user', 'You', t);
      stopListening(true); S.isThinking = true; showThinking(true);
      setStatus('thinking', 'ARIA is thinking...');

      const aiResult = await aiProcess(t, convoHistory);
      convoHistory.push(`User: ${t}`);

      if (aiResult) {
        convoHistory.push(`ARIA: ${aiResult.spoken}`);
        showThinking(false); S.isThinking = false;
feat: implement 2-digit random PIN authentication for transactions (ai-nlp.js)        if (aiResult.intent === 'auth_required') {
          // Setup random PIN challenge
          const p1 = Math.floor(Math.random() * 6) + 1;
          let p2 = Math.floor(Math.random- Transactions now require partial PIN authentication (proof of concept PIN: 123456)
- AI identifies complete transactions and triggers an 'auth_required' state
- System generates requests for two random digits one-by-one (e.g., "enter the 4th digit")
- Inputs are intercepted and validated against ACTUAL_PIN positions
- Successful auth processes the transaction; failure revokes it for security
- Integrated keyboard-based PIN entry flow into the conversational bridge() * 6) + 1;
          while (p2 === p1) p2 = Math.floor(Math.random() * 6) + 1;
          
          AUTH.pending = { ...aiResult, intent: aiResult.to ? 'transfer' : 'pay_bill' };
          AUTH.step = 1;
          AUTH.digits = [
            { pos: p1, expected: ACTUAL_PIN[p1 - 1] },
            { pos: p2, expected: ACTUAL_PIN[p2 - 1] }
          ];

          const spoken = `${aiResult.spoken} To proceed, I need to authorize you as the account holder. Please enter the ${getOrdinal(p1)} digit of your security PIN using your keyboard.`;
          addLog('aria', 'ARIA', spoken);
          speak(spoken);
        } else {
          addLog('aria', 'ARIA', aiResult.spoken);
          speak(aiResult.spoken, aiResult.intent === 'end_session' ? () => window.endSession() : null);
        }
      } else {
        showThinking(false); S.isThinking = false; original(t);
      }
      if (S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
    };
    window.processInput._conversational = true;
  }

  _patch();
})();
