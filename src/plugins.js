/**
 * AUDITHOLE - src/plugins.js
 * Plugin host, hook registry, and sandbox layer.
 *
 * Two hook modes:
 *   Modern  -- audithole.hooks.on('event', asyncFn)
 *   Legacy  -- script string injection, WordPress-style.
 *              Requires ALLOW_SCRIPT_HOOKS=true in audithole.config.js
 *              and the calling origin in SCRIPT_HOOK_WHITELIST.
 *
 * Plugin API (what plugins can access -- frozen proxy):
 *   ah.hooks.on(event, fn)       register hook
 *   ah.hooks.off(event, fn)      remove hook
 *   ah.session.get()             read current session snapshot (never write)
 *   ah.config.get(key)           read config value
 *   ah.emit(event, payload)      fire outbound webhook / event
 *   ah.log(type, data)           write typed entry to session event log
 *   ah.fingerprint.getScore()    current fingerprint score
 *   ah.fingerprint.getTier()     current trap tier
 *
 * Plugin API (what plugins CANNOT access):
 *   window, document, fetch, XMLHttpRequest directly.
 *   All IO is mediated through ah.emit() and ah.log().
 *   Plugins cannot modify session data, only read it.
 *   Plugins cannot modify fingerprint scores.
 */

// ---- Hook names (canonical list) ----
// See plugins/core/hook-injector/index.js for full annotated list.
export const HOOKS = {
  // Lifecycle
  INIT:                'audithole:init',
  READY:               'audithole:ready',
  TEARDOWN:            'audithole:teardown',

  // Fingerprint
  FP_START:            'fingerprint:start',
  FP_SIGNAL:           'fingerprint:signal',       // fired per signal
  FP_COMPLETE:         'fingerprint:complete',      // { score, signals, tier }

  // Session
  SESSION_CREATE:      'session:create',
  SESSION_UPDATE:      'session:update',
  SESSION_FLUSH:       'session:flush',
  SESSION_END:         'session:end',

  // Trap
  TRAP_EVALUATE:       'trap:evaluate',             // before tier decision
  TRAP_ACTIVATE:       'trap:activate',             // { tier }
  TRAP_TIER_CHANGE:    'trap:tier_change',          // { from, to }

  // Interaction
  CLICK:               'interaction:click',         // { zone }
  SCROLL:              'interaction:scroll',        // { depth }
  PAGEVIEW:            'interaction:pageview',      // { path }
  VISIBILITY_CHANGE:   'interaction:visibility',    // { hidden }

  // Attribution
  SLUG_HIT:            'attribution:slug_hit',      // { slug }

  // Outbound (for plugins to fire)
  OUTBOUND_WEBHOOK:    'outbound:webhook',          // { url, payload }
  OUTBOUND_BAN:        'outbound:ban',              // { ip, score, signals }
  OUTBOUND_UNBAN:      'outbound:unban',            // { ip }
  OUTBOUND_ALERT:      'outbound:alert',            // { message, severity }
};

// ---- Hook registry ----

class HookRegistry {
  constructor() {
    this._handlers = new Map(); // event -> [{ fn, priority, pluginId }]
    this._filters  = new Map(); // event -> [{ fn, priority, pluginId }]
  }

  /**
   * Register an action hook (fire-and-forget, no return value used).
   * @param {string} event
   * @param {Function} fn - async ok
   * @param {number} priority - lower fires first (default 10, like WP)
   * @param {string} pluginId
   */
  on(event, fn, priority = 10, pluginId = 'anonymous') {
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    this._handlers.get(event).push({ fn, priority, pluginId });
    this._handlers.get(event).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a previously registered action hook.
   */
  off(event, fn) {
    if (!this._handlers.has(event)) return;
    this._handlers.set(event, this._handlers.get(event).filter(h => h.fn !== fn));
  }

  /**
   * Register a filter hook (transforms a value, must return it).
   * @param {string} event
   * @param {Function} fn - receives (value, context) must return value
   */
  addFilter(event, fn, priority = 10, pluginId = 'anonymous') {
    if (!this._filters.has(event)) this._filters.set(event, []);
    this._filters.get(event).push({ fn, priority, pluginId });
    this._filters.get(event).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Fire all action hooks for an event.
   * @param {string} event
   * @param {*} payload
   */
  async doAction(event, payload = {}) {
    const handlers = this._handlers.get(event) || [];
    for (const { fn, pluginId } of handlers) {
      try {
        await Promise.race([
          fn(payload),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
        ]);
      } catch (e) {
        console.warn(`[AUDITHOLE] Plugin hook error (${pluginId} on ${event}):`, e.message);
      }
    }
  }

  /**
   * Apply all filter hooks for an event, threading value through.
   * @param {string} event
   * @param {*} value - initial value
   * @param {*} context - read-only context
   * @returns {*} filtered value
   */
  async applyFilters(event, value, context = {}) {
    const filters = this._filters.get(event) || [];
    let current = value;
    for (const { fn, pluginId } of filters) {
      try {
        const result = await Promise.race([
          fn(current, context),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);
        if (result !== undefined) current = result;
      } catch (e) {
        console.warn(`[AUDITHOLE] Plugin filter error (${pluginId} on ${event}):`, e.message);
      }
    }
    return current;
  }

  listHooks() {
    const out = {};
    for (const [event, handlers] of this._handlers) {
      out[event] = handlers.map(h => ({ pluginId: h.pluginId, priority: h.priority }));
    }
    return out;
  }
}

// ---- Sandbox ----
// Plugins get a frozen proxy. They cannot reach window/document directly.

function createSandbox(registry, sessionRef, configRef, fpRef, emitFn, logFn) {
  return Object.freeze({
    hooks: {
      on:        (e, fn, p, id) => registry.on(e, fn, p, id),
      off:       (e, fn)        => registry.off(e, fn),
      addFilter: (e, fn, p, id) => registry.addFilter(e, fn, p, id),
      list:      ()             => registry.listHooks(),
      HOOKS:     Object.freeze({ ...HOOKS }),
    },
    session: {
      get: () => Object.freeze({ ...sessionRef.current }),
    },
    config: {
      get: (key) => configRef.get(key),
    },
    fingerprint: {
      getScore: () => fpRef.score,
      getTier:  () => fpRef.tier,
    },
    emit: (event, payload) => emitFn(event, payload),
    log:  (type, data)    => logFn(type, data),
  });
}

// ---- Script hook sandbox ----
// Legacy mode. Enabled only when config ALLOW_SCRIPT_HOOKS=true.
// Runs injected string in a restricted scope. Can only call `ah.*`.

async function runScriptHook(scriptStr, ah, config) {
  if (!config.get('ALLOW_SCRIPT_HOOKS')) {
    console.warn('[AUDITHOLE] Script hooks disabled. Set ALLOW_SCRIPT_HOOKS=true in audithole.config.js to enable.');
    return;
  }

  // Origin whitelist check
  const whitelist = config.get('SCRIPT_HOOK_WHITELIST') || [];
  const origin = window.location.origin;
  if (whitelist.length > 0 && !whitelist.includes(origin)) {
    console.warn('[AUDITHOLE] Script hook rejected: origin not in SCRIPT_HOOK_WHITELIST:', origin);
    return;
  }

  // Run with 5s timeout, ah api only in scope
  try {
    const fn = new Function('ah', `"use strict";\n${scriptStr}`);
    await Promise.race([
      Promise.resolve(fn(ah)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('script hook timeout')), 5000)),
    ]);
  } catch (e) {
    console.warn('[AUDITHOLE] Script hook error:', e.message);
  }
}

// ---- Plugin host ----

export class PluginHost {
  constructor() {
    this.registry = new HookRegistry();
    this._plugins = new Map();
    this._sessionRef = { current: {} };
    this._configRef = null;
    this._fpRef = { score: 0, tier: 0 };
    this._logFn = null;
    this._emitFn = null;
    this._sandbox = null;
  }

  /**
   * Must be called before registering plugins.
   */
  init({ config, logFn, emitFn }) {
    if (this._sandbox) {
      console.warn('[AUDITHOLE] PluginHost.init() called more than once -- ignoring. Do not load audithole.min.js twice.');
      return;
    }
    this._configRef = config;
    this._logFn = logFn;
    this._emitFn = emitFn;
    this._sandbox = createSandbox(
      this.registry,
      this._sessionRef,
      this._configRef,
      this._fpRef,
      this._emitFn,
      this._logFn,
    );
  }

  /** Update session snapshot (called by logger) */
  updateSession(snapshot) {
    this._sessionRef.current = snapshot;
  }

  /** Update fingerprint state (called by orchestrator) */
  updateFingerprint(score, tier) {
    this._fpRef.score = score;
    this._fpRef.tier = tier;
  }

  /**
   * Register a plugin module.
   * @param {string} id - unique plugin id
   * @param {Function} setup - receives (ah) sandbox, registers hooks
   */
  async register(id, setup) {
    if (this._plugins.has(id)) {
      console.warn(`[AUDITHOLE] Plugin '${id}' already registered`);
      return;
    }
    if (!this._sandbox) throw new Error('PluginHost not initialized');
    try {
      await setup(this._sandbox);
      this._plugins.set(id, { id, registeredAt: Date.now() });
    } catch (e) {
      console.warn(`[AUDITHOLE] Plugin '${id}' setup failed:`, e.message);
    }
  }

  /**
   * Register a raw script string as a hook (legacy mode).
   */
  async registerScript(scriptStr) {
    await runScriptHook(scriptStr, this._sandbox, this._configRef);
  }

  /** Fire an action on the registry (called by audithole core) */
  async fire(event, payload) {
    await this.registry.doAction(event, payload);
  }

  /** Apply filters on the registry (called by audithole core) */
  async filter(event, value, context) {
    return this.registry.applyFilters(event, value, context);
  }

  listPlugins() {
    return [...this._plugins.values()];
  }
}

// Singleton
export const pluginHost = new PluginHost();
