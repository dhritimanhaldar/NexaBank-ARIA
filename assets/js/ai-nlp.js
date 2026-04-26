(function () {
  'use strict';

  const ACTUAL_PIN = '123456';
  const AUTH = { pending: null, step: 0, digits: [] };
  const originalProcess = window.processInput;

  if (typeof originalProcess !== 'function') {
    console.warn('[ai-nlp] window.processInput was not ready when AI middleware loaded.');
    return;
  }

  const getOrdinal = function (n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const isHighRisk = function (intentObj) {
    const intent = String(intentObj?.intent || '').toLowerCase();
    return ['transfer', 'pay_bill', 'block_card'].includes(intent);
  };

  function resetAuth() {
    AUTH.pending = null;
    AUTH.step = 0;
    AUTH.digits = [];
  }

  function buildCanonicalCommand(ai) {
    switch (ai.intent) {
      case 'transfer':
        if (ai.amount == null || !ai.recipient) return null;
        return 'transfer ' + ai.amount + ' to ' + ai.recipient + (ai.source_account ? ' from ' + ai.source_account : '');
      case 'pay_bill':
        if (ai.amount == null) return null;
        return 'pay ' + (ai.biller || 'utility') + ' bill ' + ai.amount + (ai.source_account ? ' from ' + ai.source_account : '');
      case 'check_balance':
        return ai.source_account ? 'check my ' + ai.source_account + ' balance' : 'check my balance';
      case 'block_card':
        return ai.source_account ? 'block my ' + ai.source_account + ' debit card' : 'block my debit card';
      case 'request_statement':
        return ai.statement_period ? 'send ' + ai.statement_period + ' statement' : 'send last 3 months statement';
      case 'end_session':
        return 'end session';
      default:
        return null;
    }
  }

  async function callAI(text) {
    if (typeof window.parseIntentWithOpenAI !== 'function') {
      throw new Error('Intent parser helper missing');
    }

    return window.parseIntentWithOpenAI(text);
  }

  function askPinFor(ai) {
    const p1 = Math.floor(Math.random() * 6) + 1;
    let p2 = Math.floor(Math.random() * 6) + 1;

    while (p2 === p1) p2 = Math.floor(Math.random() * 6) + 1;

    AUTH.pending = ai;
    AUTH.step = 1;
    AUTH.digits = [
      { pos: p1, expected: ACTUAL_PIN[p1 - 1] },
      { pos: p2, expected: ACTUAL_PIN[p2 - 1] }
    ];

    const msg = (ai.spoken || 'To secure this transaction, I need to verify your PIN.') +
      ' Please enter the ' + getOrdinal(p1) + ' digit.';

    if (window.addLog) addLog('aria', 'ARIA', msg);
    if (typeof speak === 'function') speak(msg, null);
  }

  window.processInput = async function (text) {
    if (!text) return;

    const t = String(text).trim();
    const runtime = window.OPENAI_RUNTIME || {};

    if (!t) return;

    if (AUTH.pending) {
      const digit = t.replace(/\D/g, '');

      if (digit.length === 1) {
        if (digit === AUTH.digits[AUTH.step - 1].expected) {
          if (AUTH.step === 1) {
            AUTH.step = 2;
            const p2 = AUTH.digits[1].pos;
            const msg = 'Correct. Now, please enter the ' + getOrdinal(p2) + ' digit.';

            if (window.addLog) addLog('aria', 'ARIA', msg);
            if (typeof speak === 'function') speak(msg, null);
          } else {
            const finalMsg = 'Identity verified. Processing transaction.';

            if (window.addLog) addLog('aria', 'ARIA', finalMsg);
            if (typeof speak === 'function') {
              speak(finalMsg, function () {
                const a = AUTH.pending;
                const cmd = buildCanonicalCommand(a);
                resetAuth();
                if (cmd) originalProcess(cmd);
              });
            } else {
              const a = AUTH.pending;
              const cmd = buildCanonicalCommand(a);
              resetAuth();
              if (cmd) originalProcess(cmd);
            }
          }
        } else {
          const failMsg = 'Incorrect. Transaction revoked.';

          if (window.addLog) addLog('aria', 'ARIA', failMsg);
          if (typeof speak === 'function') speak(failMsg, null);
          resetAuth();
        }
      }

      return;
    }

    if (typeof showThinking === 'function') showThinking(true);

    try {
      const ai = await callAI(t);

      if (typeof showThinking === 'function') showThinking(false);

      if (runtime.debug && window.addLog) {
        addLog('system', 'AI-NLP', 'Parsed intent: ' + JSON.stringify(ai));
      }

      if (!ai || !ai.intent || ai.intent === 'unknown' || Number(ai.confidence || 0) < runtime.minIntentConfidence) {
        return originalProcess(t);
      }

      if (ai.needs_confirmation) {
        const msg = ai.clarification_question || 'Please confirm the request before I proceed.';
        if (window.addLog) addLog('aria', 'ARIA', msg);
        if (typeof speak === 'function') speak(msg, null);
        return;
      }

      if (isHighRisk(ai) && Number(ai.confidence || 0) < runtime.highRiskConfirmThreshold) {
        askPinFor(ai);
        return;
      }

      if (ai.intent === 'end_session') {
        const bye = ai.spoken || 'Goodbye!';
        if (window.addLog) addLog('aria', 'ARIA', bye);
        if (typeof speak === 'function') {
          speak(bye, function () {
            if (typeof window.endSession === 'function') window.endSession();
          });
        } else if (typeof window.endSession === 'function') {
          window.endSession();
        }
        return;
      }

      if (ai.spoken && window.addLog) {
        addLog('system', 'AI-NLP', ai.spoken);
      }

      const cmd = buildCanonicalCommand(ai);
      if (cmd) {
        return originalProcess(cmd);
      }

      return originalProcess(t);
    } catch (e) {
      if (typeof showThinking === 'function') showThinking(false);
      if (runtime.debug) console.warn('[ai-nlp] fallback due to error:', e);
      return originalProcess(t);
    }
  };
})();
