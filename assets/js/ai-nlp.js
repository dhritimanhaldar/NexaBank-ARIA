// ── AI-powered NLP intent classification ─────────────────────────────────────
// Replaces keyword-only intent detection with an LLM inference call.
// The model receives the user's raw speech and returns a structured JSON
// object that mirrors what NLP.classify() currently returns.
//
// ► Configuration ──────────────────────────────────────────────────────────
//   Set window.NEXA_AI_CONFIG before this script loads (e.g. in a <script>
//   tag in index.html) to activate AI mode:
//
//     window.NEXA_AI_CONFIG = {
//       provider : 'openai',          // 'openai' | 'gemini' | 'openrouter' | 'custom'
//       apiKey   : 'sk-...',          // your API key
//       model    : 'gpt-4o-mini',     // model name (provider-specific)
//       endpoint : '',                // optional: override base URL for 'custom' provider
//     };
//
// ► Behaviour ─────────────────────────────────────────────────────────────
//   • When AI is available:  user speech → AI model → structured intent JSON
//   • On any failure:        falls back instantly to NLP.classify() (keywords)
//   • processInput() gains an async path that awaits AI classification before
//     calling respond() – the rest of the flow is completely unchanged.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── System prompt sent to the model ────────────────────────────────────────
  // Keep it tightly scoped so the model stays on-task and never leaks PII.
  const SYSTEM_PROMPT = `You are an intent classifier for NexaBank ARIA, a voice banking assistant.
Analyse the user's spoken input and return ONLY a valid JSON object – no markdown, no explanation.

Possible intents and the extra fields each requires:
  transfer              { intent, amount(number|null), to(string|null), account('savings'|'current') }
  pay_bill              { intent, amount(number|null), biller(string|null), account }
  check_balance         { intent, account('savings'|'current'|'both') }
  block_card            { intent, account }
  request_statement     { intent, period(string), account }
  international_transfer{ intent, amount(number|null), to(string|null), account }
  transaction_info      { intent, scope('recent') }
  profile_info          { intent, field(string|null) }
  update_info           { intent, field(string|null) }
  capability_check      { intent, task(string) }
  end_session           { intent }
  greeting              { intent }
  greeting_time         { intent }
  gratitude             { intent }
  apology               { intent }
  courtesy              { intent }
  farewell              { intent }
  help                  { intent }
  life_event            { intent, eventType('moving_abroad'|'buying_home'|'getting_married') }
  unknown               { intent, raw(string) }

Rules:
- Amounts must be plain numbers (e.g. 5000, not "five thousand" or "₹5,000").
- "to" is the recipient's name only – strip verbs and noise words.
- Default account is "savings" unless "current" or "business" is mentioned.
- If the intent is unclear return { "intent": "unknown", "raw": "<original text>" }.
- Return ONLY the JSON object, no other text.`;

  // ── Provider endpoint builders ──────────────────────────────────────────────
  function buildRequest(cfg, userText) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userText }
    ];
    switch (cfg.provider) {
      case 'openai':
      case 'openrouter': {
        return {
          url: cfg.endpoint || (
            cfg.provider === 'openrouter'
              ? 'https://openrouter.ai/api/v1/chat/completions'
              : 'https://api.openai.com/v1/chat/completions'
          ),
          headers: {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`,
            ...(cfg.provider === 'openrouter' ? { 'HTTP-Referer': location.origin } : {})
          },
          body: JSON.stringify({
            model      : cfg.model || 'gpt-4o-mini',
            messages,
            temperature: 0,
            max_tokens : 200,
            response_format: { type: 'json_object' }
          })
        };
      }
      case 'gemini': {
        const model = cfg.model || 'gemini-1.5-flash';
        return {
          url: cfg.endpoint ||
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents          : [{ role: 'user', parts: [{ text: userText }] }],
            generationConfig  : {
              temperature     : 0,
              maxOutputTokens : 200,
              responseMimeType: 'application/json'
            }
          })
        };
      }
      case 'custom':
      default: {
        // Generic OpenAI-compatible endpoint
        return {
          url: cfg.endpoint || '',
          headers: {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`
          },
          body: JSON.stringify({
            model   : cfg.model || 'default',
            messages,
            temperature: 0,
            max_tokens : 200
          })
        };
      }
    }
  }

  // ── Parse raw API response into the text content ────────────────────────────
  function extractContent(cfg, responseJson) {
    if (cfg.provider === 'gemini') {
      return responseJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    // OpenAI / OpenRouter / custom
    return responseJson?.choices?.[0]?.message?.content || '';
  }

  // ── Validate that the parsed intent is something respond() can handle ───────
  const KNOWN_INTENTS = new Set([
    'transfer','pay_bill','check_balance','block_card','request_statement',
    'international_transfer','transaction_info','profile_info','update_info',
    'capability_check','end_session','greeting','greeting_time','gratitude',
    'apology','courtesy','farewell','help','life_event','unknown'
  ]);

  function sanitiseResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!KNOWN_INTENTS.has(raw.intent))  return null;
    // Coerce numeric fields
    if (raw.amount != null) raw.amount = Number(raw.amount) || null;
    return raw;
  }

  // ── Main classify call ──────────────────────────────────────────────────────
  // Returns a Promise that resolves to an intent object.
  // Rejects (or resolves with null) if AI is unavailable or fails,
  // so callers must handle the fallback.
  async function aiClassify(userText) {
    const cfg = window.NEXA_AI_CONFIG;
    if (!cfg || !cfg.apiKey || !cfg.provider) {
      return null; // AI not configured
    }
    const req = buildRequest(cfg, userText);
    if (!req.url) return null;

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 8000); // 8-second hard timeout
    try {
      const res = await fetch(req.url, {
        method : 'POST',
        headers: req.headers,
        body   : req.body,
        signal : controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        console.warn(`[AI-NLP] HTTP ${res.status} from ${cfg.provider}`);
        return null;
      }
      const json    = await res.json();
      const content = extractContent(cfg, json).trim();
      if (!content) return null;

      const parsed = JSON.parse(content);
      return sanitiseResult(parsed);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name !== 'AbortError') {
        console.warn('[AI-NLP] classify failed:', err.message);
      }
      return null;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  window.aiClassify = aiClassify;

  // ── Patch processInput() to use AI classification ──────────────────────────
  // We wrap the existing synchronous processInput with an async version that:
  //   1. Calls aiClassify() for the initial intent lookup
  //   2. Injects the result into a one-shot NLP.classify override
  //   3. Calls the original processInput() which will immediately consume it
  //   4. Restores NLP.classify() afterwards
  //
  // All existing guard rails (pendingTask, pendingClarification, security
  // filter, etc.) continue to work exactly as before because they run INSIDE
  // the original processInput().

  let _originalProcessInput = null;

  function _patchProcessInput() {
    if (typeof window.processInput !== 'function') {
      // processInput not yet loaded — retry in 200 ms
      setTimeout(_patchProcessInput, 200);
      return;
    }
    if (window.processInput._aiPatched) return; // already patched

    _originalProcessInput = window.processInput;

    async function processInputWithAI(text) {
      if (!text || typeof text !== 'string') return;
      const t = text.trim();
      if (!t) return;

      // ── Skip AI for pending-task follow-ups & clarification replies ─────
      // Those paths only need the NLP amount/name helpers, not full classify().
      if ((window.S && (S.pendingTask || S.pendingClarification || S.isThinking))) {
        return _originalProcessInput(t);
      }

      // ── Try AI classification ───────────────────────────────────────────
      let aiResult = null;
      try {
        aiResult = await aiClassify(t);
      } catch (_) { /* fallback below */ }

      if (aiResult) {
        // Log that AI handled this turn
        if (typeof addLog === 'function') {
          addLog('system', 'SYSTEM', `[AI-NLP] intent: ${aiResult.intent}${aiResult.amount != null ? ` · amount: ${aiResult.amount}` : ''}${aiResult.to ? ` · to: ${aiResult.to}` : ''}`);
        }
        // Override NLP.classify for one call so that processInput picks up the
        // AI-derived intent without any other change to the pipeline.
        const _origClassify = NLP.classify;
        NLP.classify = function (_ignored) {
          NLP.classify = _origClassify; // restore immediately after first call
          return aiResult;
        };
      }
      // ── Delegate to original processInput (sync from here) ──────────────
      _originalProcessInput(t);
    }

    processInputWithAI._aiPatched = true;
    window.processInput = processInputWithAI;
    console.log('[AI-NLP] processInput patched — AI intent classification active.');
  }

  // Patch as soon as the DOM is ready (processInput loads with the page scripts)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _patchProcessInput);
  } else {
    _patchProcessInput();
  }

})();
