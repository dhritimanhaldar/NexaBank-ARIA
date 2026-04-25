// ── Conversational AI Engine for NexaBank ARIA ───────────────────────────────
// Uses Gemini (free tier) to provide human-like reasoning and responses.
// It handles intent extraction, missing data collection, and direct talk.

(function () {
  'use strict';

  const SYSTEM_PROMPT = `You are ARIA, the Global Banking Assistant for NexaBank (themed after HSBC).
You are professional, helpful, and human-like. You run on the customer's browser.

YOUR GOALS:
1. Help users with banking: Transfers, Bill Payments, Balance Checks, etc.
2. If input is vague (e.g., "Rahul 12"), infer intent or ask clarifying questions.
3. Keep track of what you need (Recipient, Amount, Biller, Account Type).
4. Be proactive: "I see you mentioned Rahul and 12. Would you like to send \u20b912 to Rahul from your savings?"

CONSTRAINTS:
- Amounts are in INR (\u20b9).
- Accounts: 'savings' (default) or 'current'.
- NEVER share PII.
- If the user says "stop", "end", or "hang up", set intent to 'end_session'.
- ALWAYS return a JSON object with:
  {
    "intent": "transfer" | "pay_bill" | "check_balance" | "block_card" | "end_session" | "talk",
    "spoken": "Your human-like response here",
    "amount": number | null,
    "to": "string" | null,
    "biller": "string" | null,
    "account": "savings" | "current",
    "needs_more": boolean (true if you are asking for missing details)
  }

INTENT DETAILS:
- 'talk': Use for greetings, help, or clarifying vague inputs without triggering an action yet.
- 'transfer': Requires 'amount' and 'to'.
- 'pay_bill': Requires 'amount' and 'biller'.
- 'check_balance': Requires 'account'.

Current User Context:
- Account Balances: Savings (~ \u20b950,000), Current (~ \u20b912,000).`;

  async function aiProcess(userText, history = []) {
    const cfg = window.NEXA_AI_CONFIG;
    if (!cfg || !cfg.apiKey) return null;

    const messages = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT + "

User History:
" + history.join('
') + "

Latest Input: " + userText }] }
    ];

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cfg.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 300,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) return null;
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? JSON.parse(text) : null;
    } catch (err) {
      console.error('[AI-Engine] Error:', err);
      return null;
    }
  }

  window.aiProcess = aiProcess;

  // Global history for this session
  const convoHistory = [];

  // Patch processInput to route through AI
  function _patch() {
    if (typeof window.processInput !== 'function') {
      setTimeout(_patch, 200);
      return;
    }
    if (window.processInput._conversational) return;

    const original = window.processInput;

    window.processInput = async function (text) {
      if (!text || S.isThinking) return;
      const t = text.trim();
      
      // Visual feedback immediately
      DOM.transcriptText.textContent = t;
      addLog('user', 'You', t);
      stopListening(true);
      S.isThinking = true;
      showThinking(true);
      setStatus('thinking', 'ARIA is thinking...');

      const aiResult = await aiProcess(t, convoHistory);
      convoHistory.push(`User: ${t}`);

      if (aiResult) {
        convoHistory.push(`ARIA: ${aiResult.spoken}`);
        
        showThinking(false);
        S.isThinking = false;
        addLog('aria', 'ARIA', aiResult.spoken);
        speak(aiResult.spoken, aiResult.intent === 'end_session' ? () => window.endSession() : null);

        // If intent is an action and NOT asking for more info, trigger the legacy 'respond' for UI updates
        if (aiResult.intent !== 'talk' && !aiResult.needs_more && aiResult.intent !== 'end_session') {
           // Construct a keyword command for the legacy parser
           let cmd = aiResult.intent;
           if (aiResult.amount) cmd += ` ${aiResult.amount}`;
           if (aiResult.to) cmd += ` to ${aiResult.to}`;
           if (aiResult.biller) cmd += ` ${aiResult.biller} bill`;
           if (aiResult.account) cmd += ` from ${aiResult.account}`;
           
           // Silently run the legacy respond to handle balances/ledger/UI
           const r = respond(cmd);
           if (r.action) {
             addLog('action', 'ACTION', Helpers.actionLabel(r.action) + ' · ' + r.status);
             addTx(r.action, r.detail, r.amount, r.amtClass, r.status);
             if (r.debit && r.status === 'success') {
               S.accounts[r.debit.acct] -= r.debit.amt;
               S.totalDebit += r.debit.amt;
               updateBal(r.debit.acct, -r.debit.amt);
             }
           }
        }
      } else {
        // Fallback to original
        showThinking(false);
        S.isThinking = false;
        original(t);
      }
      
      if (S.role === 'customer' && typeof publishLiveSnapshot === 'function') publishLiveSnapshot();
    };
    
    window.processInput._conversational = true;
    console.log('[AI-Engine] Conversational bridge active.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _patch);
  } else {
    _patch();
  }
})();
