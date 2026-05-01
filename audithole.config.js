/**
 * audithole.config.js
 * ============================================================
 * Drop this file in your project root and load it BEFORE
 * audithole.min.js. It sets window.__AUDITHOLE_CONFIG and
 * registers any plugins you want.
 *
 * Usage in HTML:
 *   <script src="/audithole.config.js"></script>
 *   <script src="/audithole.min.js" defer></script>
 *
 * All keys are optional. Defaults are shown below.
 * See docs/README.md for full key reference.
 * ============================================================
 */

// ---- Core config ----
window.__AUDITHOLE_CONFIG = {

  // API endpoint for session logging.
  // If you deploy to a subdirectory, adjust accordingly.
  ENDPOINT: '/api/log',

  // Fingerprint score threshold to activate traps (0-100).
  // 40 = moderate confidence bot. Raise to reduce false positives.
  THRESHOLD: 40,

  // How long (ms) to observe the visitor before scoring.
  // Shorter = faster activation, potentially less accurate.
  WINDOW_MS: 4500,

  // Set true during development to log scores and hook events to console.
  // Always false in production.
  DEBUG: false,

  // Set false to disable the plugin system entirely.
  PLUGINS_ENABLED: true,

  // ---- Script hooks (legacy mode) ----
  // DANGER: Only enable if you fully understand the implications.
  // See docs/ETHICS.md and plugins/README.md for security details.
  // If enabled, also set SCRIPT_HOOK_WHITELIST to lock it to your origin.
  ALLOW_SCRIPT_HOOKS: false,

  // Origins allowed to register script hooks.
  // Empty array = any origin (only meaningful if ALLOW_SCRIPT_HOOKS is true).
  // Recommended: always set this when enabling script hooks.
  SCRIPT_HOOK_WHITELIST: [
    // 'https://yourdomain.com',
  ],

  // ---- Outbound webhook settings ----
  WEBHOOK_TIMEOUT_MS:  4000,
  WEBHOOK_MAX_RETRIES: 2,

  // ---- Trap behavior ----
  // Whether to allow tier escalation if score rises after initial scoring.
  TRAP_ESCALATE: true,

  // Base delay (ms) for the first trap interval. Others are derived from this.
  TRAP_TIMER_SEED_MS: 800,

  // ---- Attribution ----
  // URL path prefix for slug-based trap links.
  SLUG_PATH_PREFIX: '/t/',
};


// ---- Plugin registration ----
// Add plugin setup functions here. Each plugin receives the sandboxed `ah` API.
// See plugins/README.md for the full API reference.

window.__AUDITHOLE_PLUGINS = [

  // Example: fire a webhook when a tier-2+ trap activates
  // {
  //   id: 'my-webhook',
  //   setup: function(ah) {
  //     ah.hooks.on(ah.hooks.HOOKS.TRAP_ACTIVATE, async function(payload) {
  //       if (payload.tier >= 2) {
  //         await ah.emit('outbound:webhook', {
  //           url: 'https://your-server.com/alerts',
  //           body: { tier: payload.tier, score: payload.score },
  //         });
  //       }
  //     });
  //   }
  // },

  // Example: enable the hook-injector for development
  // Import first: <script type="module" src="/plugins/core/hook-injector/index.js"></script>
  // Then register:
  // { id: 'core/hook-injector', setup: window.__AH_HOOK_INJECTOR },

  // Example: enable fail2ban plugin
  // Import first: <script type="module" src="/plugins/official/fail2ban/index.js"></script>
  // Then register:
  // { id: 'official/fail2ban', setup: window.__AH_FAIL2BAN },

];


// ---- Script hooks (legacy mode) ----
// Raw JS strings, executed in a sandboxed scope with only `ah` available.
// Requires ALLOW_SCRIPT_HOOKS: true above.
// See plugins/README.md for full docs and security implications.

window.__AUDITHOLE_SCRIPT_HOOKS = [

  // Example: log high scores via webhook using legacy style
  // `
  //   ah.hooks.on('fingerprint:complete', function(result) {
  //     if (result.score > 70) {
  //       ah.emit('outbound:webhook', {
  //         url: 'https://your-server.com/bot-alert',
  //         body: { score: result.score, signals: result.signals }
  //       });
  //     }
  //   });
  // `,

];
