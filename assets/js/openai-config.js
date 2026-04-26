(function () {
  'use strict';

  window.OPENAI_RUNTIME = {
    enabled: true,
    backendBaseUrl: 'http://localhost:3001',
    transcribeTimeoutMs: 20000,
    intentTimeoutMs: 12000,
    minIntentConfidence: 0.72,
    highRiskConfirmThreshold: 0.9,
    debug: true
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncRuntimeUi, { once: true });
  } else {
    syncRuntimeUi();
  }
})();
