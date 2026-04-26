(function () {
  'use strict';

  function getBackendBaseUrl() {
    return String(window.OPENAI_RUNTIME?.backendBaseUrl || '').replace(/\/+$/, '');
  }

  async function transcribeWithOpenAI(blob) {
    if (!window.OPENAI_RUNTIME?.enabled) {
      throw new Error('OpenAI backend unavailable');
    }

    const base = getBackendBaseUrl();
    if (!base) {
      throw new Error('OpenAI backend URL is not configured');
    }

    const fd = new FormData();
    fd.append('file', blob, 'utterance.webm');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), window.OPENAI_RUNTIME.transcribeTimeoutMs);

    try {
      const res = await fetch(base + '/api/transcribe', {
        method: 'POST',
        body: fd,
        signal: ctrl.signal
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('Transcription failed: ' + res.status + ' ' + txt);
      }

      return await res.json();
    } catch (err) {
      window.OPENAI_RUNTIME.enabled = false;
      window.OPENAI_RUNTIME.backendReachable = false;
      if (typeof window.probeOpenAIBackend === 'function') {
        setTimeout(() => window.probeOpenAIBackend().catch(() => {}), 1000);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  window.transcribeWithOpenAI = transcribeWithOpenAI;
})();
