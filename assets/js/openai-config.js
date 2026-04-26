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
    transcribeTimeoutMs: 20000,
    intentTimeoutMs: 12000,
    minIntentConfidence: 0.72,
    highRiskConfirmThreshold: 0.9,
    debug: true,
    backendReachable: false
  };

  function syncRuntimeUi() {
    const badge = document.getElementById('runtimeBadge');
    if (badge) {
      badge.textContent = window.OPENAI_RUNTIME.enabled
        ? 'LOCAL UI · OPENAI BACKEND'
        : 'LOCAL UI · FALLBACK MODE';
    }

    const liveModeBadge = document.getElementById('liveModeBadge');
    if (liveModeBadge) {
      liveModeBadge.textContent = window.OPENAI_RUNTIME.enabled ? 'OPENAI' : 'LOCAL';
    }
  }

  async function probeOpenAIBackend() {
    const base = normalizeBaseUrl(window.OPENAI_RUNTIME.backendBaseUrl);
    if (!base) {
      window.OPENAI_RUNTIME.enabled = false;
      window.OPENAI_RUNTIME.backendReachable = false;
      syncRuntimeUi();
      return false;
    }

    try {
      const res = await fetch(base + '/health', { method: 'GET', cache: 'no-store' });
      const ok = !!res.ok;
      window.OPENAI_RUNTIME.backendReachable = ok;
      window.OPENAI_RUNTIME.enabled = ok;
      syncRuntimeUi();
      return ok;
    } catch (err) {
      window.OPENAI_RUNTIME.backendReachable = false;
      window.OPENAI_RUNTIME.enabled = false;
      if (window.OPENAI_RUNTIME.debug) {
        console.warn('[openai-config] backend probe failed, falling back to local/browser mode:', err);
      }
      syncRuntimeUi();
      return false;
    }
  }

  window.probeOpenAIBackend = probeOpenAIBackend;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      syncRuntimeUi();
      probeOpenAIBackend();
    }, { once: true });
  } else {
    syncRuntimeUi();
    probeOpenAIBackend();
  }
})();
