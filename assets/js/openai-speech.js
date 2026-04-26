(function () {
  'use strict';

  function getBackendBaseUrl() {
    return String(window.OPENAI_RUNTIME?.backendBaseUrl || '').replace(/\/+$/, '');
  }

  async function transcribeWithOpenAI(blob) {
    if (!window.OPENAI_RUNTIME?.enabled) {
      throw new Error('OpenAI runtime disabled');
    }

    const fd = new FormData();
    fd.append('file', blob, 'utterance.webm');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), window.OPENAI_RUNTIME.transcribeTimeoutMs);

    try {
      const res = await fetch(getBackendBaseUrl() + '/api/transcribe', {
        method: 'POST',
        body: fd,
        signal: ctrl.signal
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('Transcription failed: ' + res.status + ' ' + txt);
      }

      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  window.transcribeWithOpenAI = transcribeWithOpenAI;
})();
