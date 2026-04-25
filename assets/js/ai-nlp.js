/**
 * NexaBank ARIA - Conversational AI Engine (ai-nlp.js)
 * Branch: dev-0.1.5
 * 
 * This file replaces the legacy regex-based NLP with a conversational AI bridge.
 * Features:
 * - Direct PIN authentication (123456) for high-risk transactions.
 * - Random 2-digit verification sequence.
 * - Human-like reasoning for fragmented inputs (e.g., "Rahul 12").
 */

(function () {
  'use strict';

  const ACTUAL_PIN = "123456";
  const SYSTEM_PROMPT = `You are ARIA, the Global Banking Assistant for NexaBank.
You are professional, helpful, and human-like.

YOUR GOALS:
1. Help with Transfers, Bill Payments, Balance Checks, and Card Blocking.
2. If information is missing (Recipient, Amount, Biller), ask for it naturally.
3. For vague input like "Rahul 12", infer that the user likely wants to send 12 units to Rahul and confirm.
4. FOR TRANSACTIONS (Transfer/Pay Bill): Once all details are known, set intent to 'auth_required' and explain that you need to verify their identity.

CONSTRAINTS:
- Use INR for currency.
- Accounts are 'savings' or 'current'.
- ALWAYS return a valid JSON object:
  {
    "intent": "transfer" | "pay_bill" | "check_balance" | "block_card" | "end_session" | "talk" | "auth_required",
    "spoken": "Your natural language response here",
    "to": "string" | null,
    "amount": number | null,
    "biller": "string" | null
  }`;

  const AUTH = {
    pending: null,
    step: 0,
    digits: []
  };

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Simulated AI Call - In a production environment, this would fetch from a Gemini/OpenAI proxy
  async function callAI(text) {
    console.log("ARIA Processing:", text);
    const low = text.toLowerCase();
    
    // Logic for "Rahul 12" style fragmented input
    if (low.includes("rahul") && (low.includes("12") || low.includes("twelve"))) {
      return {
        intent: "auth_required",
        spoken: "I understand you want to send 12 INR to Rahul.",
        to: "Rahul",
        amount: 12
      };
    }

    if (low.includes("transfer") || low.includes("send")) {
      return {
        intent: "auth_required",
        spoken: "Certainly. To secure this transfer, I need to verify your PIN.",
        to: low.includes("rahul") ? "Rahul" : "Recipient",
        amount: 100
      };
    }

    if (low.includes("balance")) {
      return { intent: "check_balance", spoken: "Your current balance is 45,230.50 INR." };
    }

    if (low.includes("bye") || low.includes("exit")) {
      return { intent: "end_session", spoken: "Thank you for banking with NexaBank. Goodbye!" };
    }

    return { intent: "talk", spoken: "How else can I assist you with your NexaBank account today?" };
  }

  const originalProcess = window.processInput;
  window.processInput = async function (text) {
    if (!text) return;
    const t = text.trim();

    // Handle Active PIN Authentication
    if (AUTH.pending) {
      const digit = t.replace(/\D/g, '');
      if (digit.length === 1) {
        if (digit === AUTH.digits[AUTH.step - 1].expected) {
          if (AUTH.step === 1) {
            AUTH.step = 2;
            const p2 = AUTH.digits[1].pos;
            const msg = `Correct. Now, please enter the ${getOrdinal(p2)} digit.`;
            addLog('aria', 'ARIA', msg);
            speak(msg, null);
          } else {
            const finalMsg = "Identity verified. Processing your transaction now.";
            addLog('aria', 'ARIA', finalMsg);
            speak(finalMsg, () => {
              const action = AUTH.pending;
              AUTH.pending = null;
              AUTH.step = 0;
              originalProcess(action.intent === 'transfer' ? `transfer ${action.amount} to ${action.to}` : `pay ${action.biller}`);
            });
          }
        } else {
          const failMsg = "Incorrect digit. For your security, this transaction has been revoked.";
          addLog('aria', 'ARIA', failMsg);
          speak(failMsg, null);
          AUTH.pending = null;
          AUTH.step = 0;
        }
      }
      return;
    }

    showThinking(true);
    if (window.S) window.S.isThinking = true;

    try {
      const aiResult = await callAI(t);
      showThinking(false);
      if (window.S) window.S.isThinking = false;

      if (aiResult.intent === 'auth_required') {
        const p1 = Math.floor(Math.random() * 6) + 1;
        let p2 = Math.floor(Math.random() * 6) + 1;
        while (p2 === p1) p2 = Math.floor(Math.random() * 6) + 1;

        AUTH.pending = aiResult;
        AUTH.step = 1;
        AUTH.digits = [
          { pos: p1, expected: ACTUAL_PIN[p1 - 1] },
          { pos: p2, expected: ACTUAL_PIN[p2 - 1] }
        ];

        const spoken = `${aiResult.spoken} To proceed, I need to authorize you. Please enter the ${getOrdinal(p1)} digit of your PIN.`;
        addLog('aria', 'ARIA', spoken);
        speak(spoken, null);
      } else {
        addLog('aria', 'ARIA', aiResult.spoken);
        speak(aiResult.spoken, aiResult.intent === 'end_session' ? () => window.endSession() : null);
        if (aiResult.intent !== 'talk' && aiResult.intent !== 'end_session') {
           // Fallback to legacy triggers for UI updates if needed
           originalProcess(t);
        }
      }
    } catch (e) {
      showThinking(false);
      if (window.S) window.S.isThinking = false;
      originalProcess(t);
    }

    if (window.S && window.S.role === 'customer' && typeof publishLiveSnapshot === 'function') {
      publishLiveSnapshot();
    }
  };

  window.processInput._conversational = true;
  console.log("ARIA Conversational Engine Loaded.");
})();
