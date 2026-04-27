(function () {
  'use strict';

  const DEFAULT_OPENAI_BACKEND_URL = 'https://nexabank-aria.onrender.com';

  function normalizeBaseUrl(url) {
    return String(url || '').replace(/\/+$/, '');
  }

  function getDefaultBackendBaseUrl() {
    const explicit = window.NEXA_OPENAI_BACKEND_URL || '';
    return normalizeBaseUrl(explicit || DEFAULT_OPENAI_BACKEND_URL);
  }

  window.OPENAI_RUNTIME = {
    enabled: false,
    backendBaseUrl: getDefaultBackendBaseUrl(),
    transcribeTimeoutMs: 90000, 
    intentTimeoutMs: 30000,     
    minIntentConfidence: 0.72,
    highRiskConfirmThreshold: 0.9,
    debug: true,
    backendReachable: false
  };

  function syncRuntimeUi() {
    const badge = document.getElementById('runtimeBadge');
    if (badge) {
      badge.textContent = window.OPENAI_RUNTIME.enabled
        ? 'LOCAL UI + OPENAI BACKEND'
        : 'LOCAL UI + FALLBACK MODEL';
      badge.style.backgroundColor = window.OPENAI_RUNTIME.enabled ? '#28a745' : '#ffc107';
    }
  }

  async function probeOpenAIBackend() {
    try {
      const resp = await fetch(`${window.OPENAI_RUNTIME.backendBaseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      const data = await resp.json();
      if (data.ok) {
        window.OPENAI_RUNTIME.backendReachable = true;
        window.OPENAI_RUNTIME.enabled = true;
      }
    } catch (err) {
      console.warn('[openai-config] Backend probe failed, using local fallback:', err.message);
      window.OPENAI_RUNTIME.backendReachable = false;
      window.OPENAI_RUNTIME.enabled = false;
    } finally {
      syncRuntimeUi();
    }
  }

  probeOpenAIBackend();

})();
