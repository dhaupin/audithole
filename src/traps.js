/**
 * AUDITHOLE - traps.js
 * Defensive trap layer. Activated only after fingerprint score >= 40.
 * Designed to stall headless agents and automated scrapers on YOUR OWN PROPERTY.
 * Do not use against third-party sites or individuals you do not own/control.
 *
 * Tier 1 (score 40-69): Timer flood only
 * Tier 2 (score 70-89): + RAF storm + hanging XHR
 * Tier 3 (score 90+):   + DOM mutation loop
 */

export class TrapEngine {
  constructor() {
    this._timers = [];
    this._rafs = [];
    this._xhrs = [];
    this._observer = null;
    this._active = false;
    this._tier = 0;
  }

  // --- Tier 1: Timer flood ---
  // Stacks intervals that never clear. Agents waiting for
  // JS quiescence (no pending timers) will wait forever.

  _startTimerFlood() {
    // Start slow, escalate -- looks like a real loading page
    const intervals = [
      { ms: 800,   label: 'audit_init' },
      { ms: 1200,  label: 'audit_scan' },
      { ms: 2100,  label: 'audit_deep' },
      { ms: 3400,  label: 'audit_report' },
      { ms: 5500,  label: 'audit_finalize' },
      { ms: 8900,  label: 'audit_complete' },
      { ms: 14400, label: 'audit_retry' },
      { ms: 23300, label: 'audit_fallback' },
    ];

    for (const iv of intervals) {
      const id = setInterval(() => {
        // No-op. The point is the timer existing, not what it does.
        void 0;
      }, iv.ms);
      this._timers.push(id);
    }

    // Also stack nested timeouts that reschedule themselves
    const selfReschedule = () => {
      const id = setTimeout(selfReschedule, 1100 + Math.random() * 900);
      this._timers.push(id);
    };
    selfReschedule();
  }

  // --- Tier 2: RAF storm ---
  // requestAnimationFrame loop on an off-screen canvas.
  // Keeps the rendering thread busy. Invisible to real users.

  _startRAFStorm() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let frame = 0;
    const loop = () => {
      frame++;
      if (ctx) {
        ctx.fillStyle = `hsl(${frame % 360},50%,50%)`;
        ctx.fillRect(0, 0, 1, 1);
      }
      const id = requestAnimationFrame(loop);
      this._rafs.push(id);
    };
    loop();
  }

  // --- Tier 2: Hanging XHR ---
  // XHR that never resolves. Keeps networkIdle from firing.
  // Puppeteer/Playwright wait for networkIdle before considering
  // page "done" -- this prevents that indefinitely.

  _startHangingXHR() {
    // We abort these on cleanup, so no actual server load
    for (let i = 0; i < 3; i++) {
      const xhr = new XMLHttpRequest();
      this._xhrs.push(xhr);
      // Request to a path that returns 200 but streams forever
      // CF Worker handles /api/hang to keep connection open
      xhr.open('GET', `/api/hang?t=${Date.now()}&i=${i}`, true);
      xhr.timeout = 0; // no timeout
      try { xhr.send(); } catch (e) {}
    }
  }

  // --- Tier 3: DOM mutation loop ---
  // MutationObserver that responds to any DOM change by
  // making another DOM change. Agents that interact with
  // the DOM trigger a cascade. Real users don't see it
  // (mutations happen off-screen in a detached subtree).

  _startDOMMutationLoop() {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    let depth = 0;
    const MAX_DEPTH = 500; // safety limit

    this._observer = new MutationObserver(() => {
      if (depth < MAX_DEPTH) {
        depth++;
        const el = document.createElement('span');
        el.textContent = depth.toString();
        container.appendChild(el);
        // Trim old nodes to avoid actual memory leak
        if (container.childNodes.length > 20) {
          container.removeChild(container.firstChild);
        }
      }
    });

    this._observer.observe(container, { childList: true, subtree: true });

    // Seed the first mutation
    container.appendChild(document.createElement('span'));
  }

  // --- Activate by tier ---

  activate(tier) {
    if (this._active) return;
    this._active = true;
    this._tier = tier;

    if (tier >= 1) this._startTimerFlood();
    if (tier >= 2) {
      this._startRAFStorm();
      this._startHangingXHR();
    }
    if (tier >= 3) this._startDOMMutationLoop();
  }

  // --- Cleanup (for testing/dev) ---

  deactivate() {
    for (const id of this._timers) {
      clearInterval(id);
      clearTimeout(id);
    }
    for (const id of this._rafs) {
      cancelAnimationFrame(id);
    }
    for (const xhr of this._xhrs) {
      try { xhr.abort(); } catch (e) {}
    }
    if (this._observer) {
      this._observer.disconnect();
    }
    this._active = false;
    this._timers = [];
    this._rafs = [];
    this._xhrs = [];
    this._observer = null;
  }

  get isActive() { return this._active; }
  get tier() { return this._tier; }
}
