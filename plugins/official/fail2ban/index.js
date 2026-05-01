/**
 * AUDITHOLE PLUGIN - fail2ban
 * ============================================================
 * Plugin ID: official/fail2ban
 *
 * PURPOSE:
 *   When a visitor scores above the ban threshold, fire a ban
 *   event to a fail2ban bridge. The bridge receives the event
 *   and issues a fail2ban ban via `fail2ban-client`.
 *
 *   Also fires unban events when an IP is cleared.
 *   Listens on a webhook endpoint for unban signals from your
 *   fail2ban bridge so it can sync state back.
 *
 * ARCHITECTURE:
 *
 *   [audithole client]
 *       |
 *       | ah.emit('outbound:ban', { ip, score, signals })
 *       v
 *   [/api/ban CF Function]  <-- included in this plugin
 *       |
 *       | POST to FAIL2BAN_BRIDGE_URL
 *       v
 *   [fail2ban-bridge server]  <-- you run this, see bridge/README.md
 *       |
 *       | fail2ban-client set audithole banip <ip>
 *       v
 *   [fail2ban]
 *
 *   Unban flow (reverse):
 *   [fail2ban] --> [bridge] --> POST /api/unban --> [audithole KV]
 *
 * REQUIREMENTS:
 *   - A fail2ban bridge running on your own infra (see bridge/)
 *   - FAIL2BAN_BRIDGE_URL env var in Cloudflare Pages
 *   - FAIL2BAN_BRIDGE_SECRET shared secret for auth
 *   - Optional: FAIL2BAN_BAN_THRESHOLD (default: 70)
 *
 * USAGE:
 *   window.__AUDITHOLE_PLUGINS = [
 *     { id: 'official/fail2ban', setup: fail2banSetup }
 *   ];
 * ============================================================
 */

export function fail2banSetup(ah) {

  const HOOKS = ah.hooks.HOOKS;
  const id = 'official/fail2ban';

  // Ban threshold -- higher than trap threshold.
  // You don't want to ban every slow page visitor,
  // only high-confidence automated attackers.
  const BAN_THRESHOLD = 70;

  // Track what we've already banned this session to avoid duplicate fires.
  let bannedThisSession = false;

  // -- Ban on high fingerprint score --

  ah.hooks.on(HOOKS.FP_COMPLETE, async (result) => {
    if (bannedThisSession) return;
    if (result.score < BAN_THRESHOLD) return;

    bannedThisSession = true;

    // Log locally first
    ah.log('fail2ban:ban_triggered', {
      score: result.score,
      signals: result.signals,
      tier: result.tier,
    });

    // Fire ban event -- emitter routes this to /api/ban
    await ah.emit('outbound:ban', {
      // Note: IP is server-side only. The CF Function at /api/ban
      // reads CF-Connecting-IP and passes it to the bridge.
      // We send score + signals as context for the ban note.
      score:   result.score,
      signals: result.signals,
      note:    `audithole score ${result.score} (tier ${result.tier}): ${result.signals.join(', ')}`,
    });

    // Also fire an alert for visibility
    await ah.emit('outbound:alert', {
      message:  `Ban triggered. Score: ${result.score}, tier: ${result.tier}`,
      severity: result.score >= 90 ? 'critical' : 'warn',
    });

  }, 10, id);

  // -- Log trap activation for correlation --

  ah.hooks.on(HOOKS.TRAP_ACTIVATE, (payload) => {
    ah.log('fail2ban:trap_active', { tier: payload.tier, score: payload.score });
  }, 10, id);

  // -- Log slug hits (attribution) --

  ah.hooks.on(HOOKS.SLUG_HIT, (payload) => {
    ah.log('fail2ban:slug_hit', { slug: payload.slug });
  }, 10, id);
}

/**
 * ============================================================
 * FAIL2BAN BRIDGE STUB
 * ============================================================
 * This is a minimal Node.js bridge that receives ban events
 * from audithole and passes them to fail2ban-client.
 *
 * Save as bridge/server.js on your own infra and run it.
 * It must be reachable from Cloudflare at FAIL2BAN_BRIDGE_URL.
 *
 * The bridge is NOT part of the Cloudflare Pages deployment --
 * it runs on your own server alongside fail2ban.
 *
 * See plugins/official/fail2ban/bridge/ for the full bridge code.
 * ============================================================
 */

/**
 * ============================================================
 * CF PAGES FUNCTION EXTENSIONS
 * ============================================================
 * This plugin requires two additional CF Pages Functions.
 * Add these to your functions/api/[[route]].js or as separate files.
 *
 * POST /api/ban
 *   Receives ban event from client emitter.
 *   Reads CF-Connecting-IP (real IP).
 *   POSTs to FAIL2BAN_BRIDGE_URL with secret.
 *   Writes ban record to KV.
 *
 * POST /api/unban
 *   Receives unban signal from fail2ban bridge.
 *   Verifies FAIL2BAN_BRIDGE_SECRET.
 *   Removes ban record from KV.
 *   Returns 200.
 *
 * These handlers are in plugins/official/fail2ban/functions.js.
 * Merge them into your functions/api/[[route]].js.
 * ============================================================
 */
