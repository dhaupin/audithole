/**
 * AUDITHOLE - src/config.js
 * Central config. Merges script tag data-attributes with
 * audithole.config.js (if present) and hard defaults.
 *
 * Priority (highest to lowest):
 *   1. audithole.config.js (user file, window.__AUDITHOLE_CONFIG)
 *   2. <script data-*> attributes on the audithole script tag
 *   3. Defaults below
 */

const DEFAULTS = {
  // Core
  ENDPOINT:              '/api/log',
  THRESHOLD:             40,           // fingerprint score to activate traps
  WINDOW_MS:             4500,         // observation window before scoring
  DEBUG:                 false,

  // Plugin system
  PLUGINS_ENABLED:       true,
  ALLOW_SCRIPT_HOOKS:    false,        // DANGER: must be explicitly opted in
  SCRIPT_HOOK_WHITELIST: [],           // origins allowed to use script hooks
                                       // empty = all allowed when enabled
                                       // ['https://yourdomain.com'] = locked

  // Outbound webhooks (used by plugins)
  WEBHOOK_TIMEOUT_MS:    4000,
  WEBHOOK_MAX_RETRIES:   2,

  // Session
  SESSION_TTL_DAYS:      30,
  SESSION_MAX_EVENTS:    200,

  // Trap behavior
  TRAP_ESCALATE:         true,         // allow tier promotion if score rises
  TRAP_TIMER_SEED_MS:    800,          // first interval base delay

  // Fingerprint tuning
  // These need adjustment based on real traffic data.
  // Raise MOUSE_EVENTS_MIN if legit users are getting flagged.
  // Raise MOUSE_DELTA_MIN if bots are moving the mouse slightly to evade.
  MOUSE_EVENTS_MIN:      3,    // min mouse move events to consider "human"
  MOUSE_DELTA_MIN:       50,   // min total mouse delta (px) to consider "human"

  // Attribution
  SLUG_PATH_PREFIX:      '/t/',        // path prefix for slug URLs
};

export class Config {
  constructor() {
    this._data = { ...DEFAULTS };
  }

  /**
   * Load config from all sources and merge.
   * Call once on init before plugins or fingerprint run.
   */
  load() {
    // 1. Script tag data attributes
    const scriptEl = document.currentScript ||
      document.querySelector('script[src*="audithole"]');
    if (scriptEl) {
      const d = scriptEl.dataset;
      if (d.endpoint)   this._data.ENDPOINT   = d.endpoint;
      if (d.threshold)  this._data.THRESHOLD  = parseInt(d.threshold, 10);
      if (d.window)     this._data.WINDOW_MS  = parseInt(d.window, 10);
      if (d.debug)      this._data.DEBUG       = d.debug === 'true';
      if (d.plugins)    this._data.PLUGINS_ENABLED = d.plugins !== 'false';
      if (d.scriptHooks) this._data.ALLOW_SCRIPT_HOOKS = d.scriptHooks === 'true';
    }

    // 2. window.__AUDITHOLE_CONFIG (user's audithole.config.js)
    if (window.__AUDITHOLE_CONFIG && typeof window.__AUDITHOLE_CONFIG === 'object') {
      Object.assign(this._data, window.__AUDITHOLE_CONFIG);
    }

    // Safety: if script hooks enabled, warn loudly
    if (this._data.ALLOW_SCRIPT_HOOKS) {
      console.warn(
        '[AUDITHOLE] Script hooks are ENABLED. ' +
        'Only use this if you trust all code running on this page. ' +
        'See docs/ETHICS.md and plugins/README.md for security implications.'
      );
    }

    return this;
  }

  get(key) {
    return this._data[key];
  }

  getAll() {
    return { ...this._data };
  }

  // Read-only proxy for plugin sandbox
  asReadOnly() {
    return { get: (key) => this.get(key) };
  }
}
