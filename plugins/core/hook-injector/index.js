/**
 * AUDITHOLE PLUGIN - hook-injector
 * ============================================================
 * Plugin ID: core/hook-injector
 *
 * PURPOSE:
 *   This is the canonical onboarding plugin for AUDITHOLE developers.
 *   It registers a handler on every available hook and logs what it
 *   receives. Run this in debug mode to understand the event flow
 *   and payload shapes before building your own plugin.
 *
 *   It also demonstrates both modern hook style AND legacy script
 *   hook style in comments below.
 *
 * USAGE:
 *   window.__AUDITHOLE_PLUGINS = [
 *     { id: 'core/hook-injector', setup: hookInjectorSetup }
 *   ];
 *
 * DISABLE IN PRODUCTION.
 * This plugin is for development and onboarding only.
 * ============================================================
 */

export function hookInjectorSetup(ah) {

  // ---- MODERN HOOK STYLE ----------------------------------------
  // ah.hooks.on(eventName, asyncFn, priority, pluginId)
  //
  // - eventName: string from ah.hooks.HOOKS (canonical list)
  // - asyncFn:   receives payload object. can be async. 5s timeout.
  // - priority:  lower fires first. default 10. range 1-100.
  // - pluginId:  string label for your plugin (shows in hook list)
  //
  // Filter hooks (modify a value):
  //   ah.hooks.addFilter(eventName, fn, priority, pluginId)
  //   fn receives (value, context) and MUST return value.
  // ---------------------------------------------------------------

  const HOOKS = ah.hooks.HOOKS;
  const id = 'core/hook-injector';

  // -- Lifecycle hooks --

  ah.hooks.on(HOOKS.INIT, (payload) => {
    // Fires first. Config is loaded, plugins are about to run.
    // payload: { slug, config }
    console.log('[hook-injector] INIT', payload);
  }, 1, id);

  ah.hooks.on(HOOKS.READY, (payload) => {
    // Fires last. Everything is initialized. Trap may be active.
    // payload: { result: { score, signals, tier }, slug }
    console.log('[hook-injector] READY', payload);
  }, 99, id);

  ah.hooks.on(HOOKS.TEARDOWN, (payload) => {
    // Fires on page unload. Use for cleanup.
    // payload: {} (empty)
    console.log('[hook-injector] TEARDOWN');
  }, 10, id);

  // -- Fingerprint hooks --

  ah.hooks.on(HOOKS.FP_START, () => {
    // Observation window has started. No score yet.
    console.log('[hook-injector] FP_START - watching for signals');
  }, 10, id);

  ah.hooks.on(HOOKS.FP_SIGNAL, (signal) => {
    // Fires once per signal detected during scoring.
    // signal: { signal: 'webdriver', weight: 25, hit: true }
    if (signal.hit) console.log('[hook-injector] FP_SIGNAL hit:', signal.signal, '+' + signal.weight);
  }, 10, id);

  // FILTER example: FP_COMPLETE can modify the final score.
  // Return a number. Context has full result object.
  ah.hooks.addFilter(HOOKS.FP_COMPLETE, (score, context) => {
    // context: { score, signals, tier }
    // You could boost or reduce score here based on custom logic.
    // Example: reduce score by 10 for known internal IPs (not available
    // client-side, do that server-side in _middleware.js instead).
    console.log('[hook-injector] FP_COMPLETE filter - score:', score, 'signals:', context.signals);
    return score; // pass through unchanged
  }, 10, id);

  // -- Session hooks --

  ah.hooks.on(HOOKS.SESSION_CREATE, (session) => {
    // New session object created.
    // session: { id, slug, created, ... }
    console.log('[hook-injector] SESSION_CREATE', session.id);
  }, 10, id);

  ah.hooks.on(HOOKS.SESSION_FLUSH, (payload) => {
    // Session data is being sent to /api/log.
    // payload: { sessionId, slug, duration, clicks, ... }
    console.log('[hook-injector] SESSION_FLUSH', payload.sessionId);
  }, 10, id);

  // -- Trap hooks --

  ah.hooks.on(HOOKS.TRAP_EVALUATE, (result) => {
    // Fires before trap tier is decided.
    // result: { score, signals, tier }
    console.log('[hook-injector] TRAP_EVALUATE - tier would be:', result.tier);
  }, 10, id);

  ah.hooks.on(HOOKS.TRAP_ACTIVATE, (payload) => {
    // Trap is now active.
    // payload: { tier, score }
    console.log('[hook-injector] TRAP_ACTIVATE - tier:', payload.tier, 'score:', payload.score);
  }, 10, id);

  ah.hooks.on(HOOKS.TRAP_TIER_CHANGE, (payload) => {
    // Trap tier changed (escalation).
    // payload: { from, to }
    console.log('[hook-injector] TRAP_TIER_CHANGE', payload.from, '->', payload.to);
  }, 10, id);

  // -- Interaction hooks --

  ah.hooks.on(HOOKS.CLICK, (payload) => {
    // User/bot clicked. Zone only, no coordinates.
    // payload: { zone: { vertical: 'top'|'mid'|'bot', horizontal: 'left'|'right' } }
    console.log('[hook-injector] CLICK zone:', payload.zone);
  }, 10, id);

  ah.hooks.on(HOOKS.SCROLL, (payload) => {
    // Scroll depth changed.
    // payload: { depth: 0-100 (percentage) }
    console.log('[hook-injector] SCROLL depth:', payload.depth + '%');
  }, 10, id);

  ah.hooks.on(HOOKS.PAGEVIEW, (payload) => {
    // Page view recorded.
    // payload: { path: '/some/path' }
    console.log('[hook-injector] PAGEVIEW', payload.path);
  }, 10, id);

  ah.hooks.on(HOOKS.VISIBILITY_CHANGE, (payload) => {
    // Tab hidden/visible.
    // payload: { hidden: true|false }
    console.log('[hook-injector] VISIBILITY_CHANGE hidden:', payload.hidden);
  }, 10, id);

  // -- Attribution --

  ah.hooks.on(HOOKS.SLUG_HIT, (payload) => {
    // A /t/slug URL was hit. Attribution link fired.
    // payload: { slug: 'my-slug-abc123' }
    console.log('[hook-injector] SLUG_HIT', payload.slug);
  }, 10, id);

  // -- Outbound events (fired by OTHER plugins) --

  ah.hooks.on(HOOKS.OUTBOUND_WEBHOOK, (payload) => {
    // A plugin called ah.emit('outbound:webhook', ...).
    console.log('[hook-injector] OUTBOUND_WEBHOOK', payload.url);
  }, 10, id);

  ah.hooks.on(HOOKS.OUTBOUND_BAN, (payload) => {
    // A plugin called ah.emit('outbound:ban', ...).
    // payload: { ip, score, signals, note }
    console.log('[hook-injector] OUTBOUND_BAN - score was:', payload.score);
  }, 10, id);

  ah.hooks.on(HOOKS.OUTBOUND_UNBAN, (payload) => {
    // A plugin called ah.emit('outbound:unban', ...).
    // payload: { ip, note }
    console.log('[hook-injector] OUTBOUND_UNBAN');
  }, 10, id);

  ah.hooks.on(HOOKS.OUTBOUND_ALERT, (payload) => {
    // A plugin called ah.emit('outbound:alert', ...).
    // payload: { message, severity: 'info'|'warn'|'critical' }
    console.log('[hook-injector] OUTBOUND_ALERT', payload.severity, payload.message);
  }, 10, id);

  // ---- READING SESSION + FINGERPRINT STATE ---------------------
  // ah.session.get() returns a frozen snapshot of the current session.
  // ah.fingerprint.getScore() and .getTier() return current values.
  // Call these inside hook handlers AFTER the relevant lifecycle point.
  // ---------------------------------------------------------------

  ah.hooks.on(HOOKS.READY, () => {
    const session = ah.session.get();
    const score   = ah.fingerprint.getScore();
    const tier    = ah.fingerprint.getTier();
    console.log('[hook-injector] Final state:', { session, score, tier });
  }, 50, id);

  // ---- EMITTING EVENTS -----------------------------------------
  // ah.emit(eventType, payload) fires outbound events.
  // The emitter handles retries and routing.
  // ah.log(type, data) writes a typed entry to the session log.
  // ---------------------------------------------------------------

  // Example: emit a custom alert when score is very high
  ah.hooks.on(HOOKS.FP_COMPLETE, async (result) => {
    if (result.score >= 90) {
      ah.log('custom:high_score_alert', { score: result.score });
      // Uncomment to fire a webhook:
      // await ah.emit('outbound:alert', {
      //   message: `High score visitor: ${result.score}`,
      //   severity: 'warn',
      // });
    }
  }, 20, id);

  // ---- LEGACY SCRIPT HOOK STYLE --------------------------------
  // If ALLOW_SCRIPT_HOOKS=true, you can inject hooks as raw strings
  // via window.__AUDITHOLE_SCRIPT_HOOKS. These run in the same
  // sandbox as modern hooks -- ah is the only variable in scope.
  //
  // Example (set before audithole.min.js loads):
  //
  //   window.__AUDITHOLE_SCRIPT_HOOKS = [`
  //     ah.hooks.on('fingerprint:complete', function(result) {
  //       if (result.score > 60) {
  //         ah.emit('outbound:alert', {
  //           message: 'Score: ' + result.score,
  //           severity: 'warn'
  //         });
  //       }
  //     });
  //   `];
  //
  // IMPORTANT:
  //   - ALLOW_SCRIPT_HOOKS must be true in config
  //   - If SCRIPT_HOOK_WHITELIST is set, only listed origins can use this
  //   - Scripts have a 5 second execution timeout
  //   - Scripts can ONLY call ah.* methods -- window/document access denied
  //   - See docs/ETHICS.md for the security implications of enabling this
  // ---------------------------------------------------------------

  console.log('[hook-injector] All hooks registered. Registered hooks:', ah.hooks.list());
}
