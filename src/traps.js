/**
 * AUDITHOLE - src/traps.js
 * Defensive trap layer. Activated only after fingerprint score >= threshold.
 * Designed to stall headless agents on YOUR OWN PROPERTY.
 * See docs/ETHICS.md for what was deliberately excluded.
 *
 * Tier 1 (score 40-69): Timer flood -- page never quiesces
 * Tier 2 (score 70-89): + off-screen RAF storm
 * Tier 3 (score 90+):   + escalated timer density
 */

export class TrapEngine {
  constructor() {
    this._timers = [];
    this._rafs   = [];
    this._active = false;
    this._tier   = 0;
  }

  _startTimerFlood(escalated = false) {
    const base = escalated ? 600 : 800;
    const intervals = [
      base * 1.0, base * 1.5, base * 2.6, base * 4.25,
      base * 6.875, base * 11.125, base * 18.0, base * 29.125,
    ];
    for (const ms of intervals) {
      this._timers.push(setInterval(() => { void 0; }, Math.round(ms)));
    }
    // Self-rescheduling chain keeps the event loop perpetually non-idle
    const chain = () => {
      const id = setTimeout(chain, base + Math.random() * (base * 0.5));
      this._timers.push(id);
    };
    chain();
  }

  _startRAFStorm() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const loop = () => {
      frame++;
      if (ctx) { ctx.fillStyle = `hsl(${frame % 360},50%,50%)`; ctx.fillRect(0, 0, 1, 1); }
      this._rafs.push(requestAnimationFrame(loop));
    };
    loop();
  }

  activate(tier) {
    if (this._active) return;
    this._active = true;
    this._tier = tier;
    if (tier >= 1) this._startTimerFlood(false);
    if (tier >= 2) this._startRAFStorm();
    if (tier >= 3) this._startTimerFlood(true); // second escalated layer
  }

  deactivate() {
    this._timers.forEach(id => { clearInterval(id); clearTimeout(id); });
    this._rafs.forEach(id => cancelAnimationFrame(id));
    this._active = false;
    this._tier = 0;
    this._timers = [];
    this._rafs = [];
  }

  get isActive() { return this._active; }
  get tier()     { return this._tier; }
}
