(function () {
  'use strict';

  function getBackendBaseUrl() {
    return String(window.OPENAI_RUNTIME?.backendBaseUrl || '').replace(/\/+$/, '');
  }

  async function parseIntentWithOpenAI(text) {
    if (!window.OPENAI_RUNTIME?.enabled) {
      throw new Error('OpenAI runtime disabled');
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), window.OPENAI_RUNTIME.intentTimeoutMs);

    try {
      const res = await fetch(getBackendBaseUrl() + '/api/parse-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ctrl.signal
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('Intent parse failed: ' + res.status + ' ' + txt);
      }

      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  window.parseIntentWithOpenAI = parseIntentWithOpenAI;
})();
