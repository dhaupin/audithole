/**
 * AUDITHOLE - fingerprint.js
 * Weighted signal scoring engine.
 * Scores 0-100. Threshold 40 = trap activation.
 * No PII collected. Anonymous behavioral signals only.
 */

export class Fingerprint {
  constructor() {
    this.signals = [];
    this.score = 0;
    this.mouseEvents = 0;
    this.mouseDelta = 0;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.scrollEvents = 0;
    this.focusEvents = 0;
    this.startTime = performance.now();
    this._bound = {};
  }

  // --- Individual signal checks ---

  _checkWebdriver() {
    if (navigator.webdriver === true) {
      return { signal: 'webdriver', weight: 25, hit: true };
    }
    return { signal: 'webdriver', weight: 25, hit: false };
  }

  _checkPlaywrightLeak() {
    const keys = ['__playwright', '__pwInitScripts', '__PW_inspect', '_playwrightInstance'];
    const hit = keys.some(k => k in window);
    return { signal: 'playwright_leak', weight: 25, hit };
  }

  _checkPuppeteerLeak() {
    const keys = ['__puppeteer__', '_puppeteer', '__nightmare'];
    const hit = keys.some(k => k in window);
    return { signal: 'puppeteer_leak', weight: 25, hit };
  }

  _checkHeadlessUA() {
    const ua = navigator.userAgent.toLowerCase();
    const hit = ua.includes('headless') || ua.includes('phantomjs') || ua.includes('slimerjs');
    return { signal: 'headless_ua', weight: 30, hit };
  }

  _checkChromeMissing() {
    const isChrome = /chrome/i.test(navigator.userAgent);
    const hit = isChrome && (!window.chrome || !window.chrome.runtime);
    return { signal: 'chrome_missing', weight: 15, hit };
  }

  _checkLanguages() {
    const langs = navigator.languages;
    const hit = !langs || langs.length === 0;
    return { signal: 'no_languages', weight: 10, hit };
  }

  _checkPlugins() {
    const hit = navigator.plugins.length === 0;
    return { signal: 'no_plugins', weight: 10, hit };
  }

  _checkTimingJitter() {
    // Headless VMs often have coarser or perfectly uniform timer resolution.
    // We compare two performance.now() samples with a microtask gap between them.
    // In real browsers with Spectre mitigations, sub-ms resolution is clamped
    // and jittered, so the values are rarely identical across event loop ticks.
    // A synchronous tight loop always gives 0 diffs even in real browsers
    // (loop completes within one timer quantum), so we use a stored baseline
    // from _attachListeners() instead -- sampled across real time.
    //
    // Heuristic: if performance.now() resolution appears to be exactly 1ms
    // with no sub-ms component across 5 samples taken during the observation
    // window, flag it. This catches VMs with 1ms clamped timers.
    const samples = this._timingSamples || [];
    if (samples.length < 3) {
      return { signal: 'timing_jitter', weight: 15, hit: false };
    }
    const diffs = [];
    for (let i = 1; i < samples.length; i++) {
      diffs.push(samples[i] - samples[i - 1]);
    }
    // All diffs are whole milliseconds = suspiciously uniform
    const allWhole = diffs.every(d => d > 0 && Number.isInteger(d));
    return { signal: 'timing_jitter', weight: 15, hit: allWhole };
  }

  _checkNotificationAPI() {
    // Some headless envs expose Notification but it's broken
    try {
      if (window.Notification && Notification.permission === 'denied') {
        return { signal: 'notification_denied', weight: 5, hit: true };
      }
    } catch (e) {}
    return { signal: 'notification_denied', weight: 5, hit: false };
  }

  _checkMouseEntropy(windowMs = 4000, eventsMin = 3, deltaMin = 50) {
    const elapsed = performance.now() - this.startTime;
    if (elapsed < windowMs) return null; // not ready yet
    const hit = this.mouseEvents < eventsMin && this.mouseDelta < deltaMin;
    return { signal: 'no_mouse_entropy', weight: 20, hit };
  }

  _checkConnectionRtt() {
    // Headless agents often show perfect RTT
    try {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && conn.rtt === 0 && conn.type !== 'none') {
        return { signal: 'zero_rtt', weight: 10, hit: true };
      }
    } catch (e) {}
    return { signal: 'zero_rtt', weight: 10, hit: false };
  }

  // --- Event tracking ---

  _attachListeners() {
    // Collect timing samples spread across the observation window
    this._timingSamples = [];
    const sampleTiming = () => {
      if (this._timingSamples.length < 6) {
        this._timingSamples.push(performance.now());
      }
    };
    this._timingSampleInterval = setInterval(sampleTiming, 250);

    this._bound.mouseMove = (e) => {
      this.mouseEvents++;
      this.mouseDelta += Math.abs(e.clientX - this.lastMouseX) + Math.abs(e.clientY - this.lastMouseY);
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    };
    this._bound.scroll = () => { this.scrollEvents++; };
    this._bound.focus = () => { this.focusEvents++; };

    document.addEventListener('mousemove', this._bound.mouseMove, { passive: true });
    window.addEventListener('scroll', this._bound.scroll, { passive: true });
    window.addEventListener('focus', this._bound.focus, { passive: true });
  }

  _detachListeners() {
    if (this._timingSampleInterval) {
      clearInterval(this._timingSampleInterval);
      this._timingSampleInterval = null;
    }
    document.removeEventListener('mousemove', this._bound.mouseMove);
    window.removeEventListener('scroll', this._bound.scroll);
    window.removeEventListener('focus', this._bound.focus);
  }

  // --- Main score calculation ---

  calculate() {
    const checks = [
      this._checkWebdriver(),
      this._checkPlaywrightLeak(),
      this._checkPuppeteerLeak(),
      this._checkHeadlessUA(),
      this._checkChromeMissing(),
      this._checkLanguages(),
      this._checkPlugins(),
      this._checkTimingJitter(),
      this._checkNotificationAPI(),
      this._checkConnectionRtt(),
    ];

    const mouseCheck = this._checkMouseEntropy(this._windowMs, this._eventsMin, this._deltaMin);
    if (mouseCheck) checks.push(mouseCheck);

    let score = 0;
    const hits = [];
    for (const c of checks) {
      if (c && c.hit) {
        score += c.weight;
        hits.push(c.signal);
        // Fire per-signal callback if registered (wired by plugin host)
        if (typeof this.onSignal === 'function') {
          try { this.onSignal(c); } catch (e) {}
        }
      }
      if (c) this.signals.push(c);
    }

    this.score = Math.min(score, 100);
    return { score: this.score, signals: hits };
  }

  /**
   * Run full fingerprint over a time window, then resolve.
   * @param {number} windowMs - how long to observe before scoring
   * @returns {Promise<{score, signals, tier}>}
   */
  async run(windowMs = 4500, threshold = 40, eventsMin = 3, deltaMin = 50) {
    this._windowMs   = windowMs;
    this._eventsMin  = eventsMin;
    this._deltaMin   = deltaMin;
    this._attachListeners();

    return new Promise((resolve) => {
      setTimeout(() => {
        this._detachListeners();
        const result = this.calculate();
        result.tier = result.score >= 90 ? 3
          : result.score >= 70 ? 2
          : result.score >= threshold ? 1
          : 0;
        resolve(result);
      }, windowMs);
    });
  }
}
