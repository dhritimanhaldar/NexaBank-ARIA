/**
 * NexaBank ARIA - Conversational AI Engine (ai-nlp.js)
 * Branch: dev-0.1.5
 */
(function () {
  'use strict';
  const ACTUAL_PIN = \"123456\";
  const AUTH = { pending: null, step: 0, digits: [] };

  const getOrdinal = (n) => {
    const s = [\"th\", \"st\", \"nd\", \"rd\"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const isHighRisk = (text) => {
    const low = String(text || '').toLowerCase();
    return /\\b(transfer|send|pay|bill|remit|wire|upi|neft|imps|electricity|water|gas|internet|mobile|phone|insurance|rent|emi)\\b/.test(low);
  };

  async function callAI(text) {
    const low = text.toLowerCase();
    if (low.includes(\"rahul\") && (low.includes(\"12\") || low.includes(\"twelve\"))) {
      return { intent: \"auth_required\", spoken: \"I understand you want to send 12 INR to Rahul.\", to: \"Rahul\", amount: 12 };
    }
    if (isHighRisk(text)) {
      let amount = (text.match(/\\d+/) || [100])[0];
      return {
        intent: \"auth_required\",
        spoken: \"To secure this transaction, I need to verify your PIN.\",
        to: low.includes(\"rahul\") ? \"Rahul\" : \"Recipient\",
        amount: parseInt(amount),
        biller: low.includes(\"electric\") ? \"Electricity\" : \"Service\"
      };
    }
    if (low.includes(\"balance\")) return { intent: \"check_balance\", spoken: \"Your balance is 45,230.50 INR.\" };
    if (low.includes(\"bye\") || low.includes(\"exit\")) return { intent: \"end_session\", spoken: \"Goodbye!\" };
    return { intent: \"talk\", spoken: \"How else can I help you today?\" };
  }

  const originalProcess = window.processInput;
  window.processInput = async function (text) {
    if (!text) return;
    const t = text.trim();

    if (AUTH.pending) {
      const digit = t.replace(/\\D/g, '');
      if (digit.length === 1) {
        if (digit === AUTH.digits[AUTH.step - 1].expected) {
          if (AUTH.step === 1) {
            AUTH.step = 2;
            const p2 = AUTH.digits[1].pos;
            const msg = `Correct. Now, please enter the ${getOrdinal(p2)} digit.`;
            if (window.addLog) addLog('aria', 'ARIA', msg);
            speak(msg, null);
          } else {
            const finalMsg = \"Identity verified. Processing transaction.\";
            if (window.addLog) addLog('aria', 'ARIA', finalMsg);
            speak(finalMsg, () => {
              const a = AUTH.pending;
              AUTH.pending = null; AUTH.step = 0;
              const cmd = (a.intent==='pay_bill'||a.biller) ? `pay ${a.biller} bill ${a.amount}` : `transfer ${a.amount} to ${a.to}`;
              originalProcess(cmd);
            });
          }
        } else {
          const failMsg = \"Incorrect. Transaction revoked.\";
          if (window.addLog) addLog('aria', 'ARIA', failMsg);
          speak(failMsg, null);
          AUTH.pending = null; AUTH.step = 0;
        }
      }
      return;
    }

    showThinking(true);
    try {
      const ai = await callAI(t);
      showThinking(false);
      if (ai.intent === 'auth_required' || isHighRisk(t)) {
        const p1 = Math.floor(Math.random()*6)+1, p2 = ((p1+Math.floor(Math.random()*5))%6)+1;
        AUTH.pending = ai.intent === 'auth_required' ? ai : { intent:'auth_required', spoken:'Security check.', amount:100, to:'Recipient' };
        AUTH.step = 1;
        AUTH.digits = [{pos:p1, expected:ACTUAL_PIN[p1-1]}, {pos:p2, expected:ACTUAL_PIN[p2-1]}];
        const msg = `${ai.spoken} Please enter the ${getOrdinal(p1)} digit.`;
        if (window.addLog) addLog('aria', 'ARIA', msg);
        speak(msg, null);
      } else {
        if (window.addLog) addLog('aria', 'ARIA', ai.spoken);
        speak(ai.spoken, ai.intent === 'end_session' ? () => window.endSession() : null);
        if (ai.intent === 'check_balance') originalProcess(t);
      }
    } catch (e) {
      showThinking(false);
      if (!isHighRisk(t)) originalProcess(t);
    }
  };
})();
