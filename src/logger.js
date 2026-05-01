/**
 * AUDITHOLE - logger.js
 * Anonymous session event capture.
 *
 * What we log:
 *   - IP (server-side only, from CF-Connecting-IP header)
 *   - User-Agent string
 *   - Fingerprint score + signals hit
 *   - Pages visited + timestamps
 *   - Scroll depth (percentage, not position)
 *   - Click count + general zone (top/mid/bot, left/right)
 *   - Session duration
 *   - Trap tier activated
 *   - Slug (attribution, which trap link was hit)
 *
 * What we NEVER log:
 *   - Keystrokes or typed content
 *   - Form field values
 *   - Precise cursor coordinates
 *   - Clipboard contents
 *   - Any PII beyond IP (which is server-side only)
 */

export class Logger {
  constructor({ slug = null, sessionId = null, endpoint = '/api/log' } = {}) {
    this.slug = slug;
    this.sessionId = sessionId || this._genId();
    this.endpoint = endpoint;
    this.startTime = Date.now();
    this.events = [];
    this.clicks = { total: 0, zones: { top: 0, mid: 0, bot: 0, left: 0, right: 0 } };
    this.maxScrollDepth = 0;
    this._bound = {};
    this._flushTimer = null;
    this._dirty = false;
  }

  _genId() {
    return 'ah_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
  }

  _ts() {
    return Date.now() - this.startTime;
  }

  // --- Event recording ---

  record(type, data = {}) {
    this.events.push({ type, ms: this._ts(), ...data });
    this._dirty = true;
    this._scheduledFlush();
  }

  _scheduledFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      if (this._dirty) this.flush();
    }, 3000);
  }

  // --- Interaction tracking ---

  attachListeners() {
    this._bound.click = (e) => {
      this.clicks.total++;
      const yRatio = e.clientY / window.innerHeight;
      const xRatio = e.clientX / window.innerWidth;
      if (yRatio < 0.33) this.clicks.zones.top++;
      else if (yRatio < 0.66) this.clicks.zones.mid++;
      else this.clicks.zones.bot++;
      if (xRatio < 0.5) this.clicks.zones.left++;
      else this.clicks.zones.right++;
    };

    this._bound.scroll = () => {
      const depth = Math.round(
        ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100
      );
      if (depth > this.maxScrollDepth) this.maxScrollDepth = depth;
    };

    this._bound.visibility = () => {
      this.record('visibility', { hidden: document.hidden });
    };

    document.addEventListener('click', this._bound.click, { passive: true });
    window.addEventListener('scroll', this._bound.scroll, { passive: true });
    document.addEventListener('visibilitychange', this._bound.visibility);
  }

  detachListeners() {
    document.removeEventListener('click', this._bound.click);
    window.removeEventListener('scroll', this._bound.scroll);
    document.removeEventListener('visibilitychange', this._bound.visibility);
  }

  // --- Flush to server ---

  async flush() {
    if (!this._dirty) return;
    this._dirty = false;

    const payload = {
      sessionId: this.sessionId,
      slug: this.slug,
      duration: this._ts(),
      ua: navigator.userAgent,
      language: navigator.language,
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      clicks: this.clicks,
      maxScrollDepth: this.maxScrollDepth,
      events: this.events.slice(-50), // last 50 events, cap payload
    };

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (e) {
      // Silent fail -- never expose errors to potential attacker
    }
  }

  // --- Final flush on page leave ---

  attachBeforeUnload() {
    window.addEventListener('pagehide', () => this.flush(), { passive: true });
    window.addEventListener('beforeunload', () => this.flush());
  }

  // --- Record fingerprint result ---

  recordFingerprint(result) {
    this.record('fingerprint', {
      score: result.score,
      signals: result.signals,
      tier: result.tier,
    });
  }

  // --- Record trap activation ---

  recordTrapActivation(tier) {
    this.record('trap_activated', { tier });
  }

  // --- Record page view ---

  recordPageView(path = window.location.pathname) {
    this.record('pageview', { path });
  }
}
