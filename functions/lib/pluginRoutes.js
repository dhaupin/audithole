/**
 * AUDITHOLE - functions/lib/pluginRoutes.js
 * Server-side plugin route registry.
 *
 * Plugins declare routes here instead of editing [[route]].js.
 * The catch-all function imports this registry and dispatches automatically.
 *
 * To add routes from a plugin:
 *   1. Create plugins/official/myplugin/routes.js (see format below)
 *   2. Import it here and add to PLUGIN_ROUTES
 *   3. That's it. Do not edit [[route]].js.
 *
 * Route handler signature:
 *   async function handler(request, env, kv, meta, url) => Response
 *
 * Route format:
 *   { method: 'POST', path: '/ban', handler: fn, requiresAuth: true|false }
 *
 * requiresAuth: if true, the catch-all checks AUDITHOLE_SECRET before calling handler.
 * Custom auth (e.g. FAIL2BAN_BRIDGE_SECRET) is handled inside the handler itself.
 */

import { handleBan, handleUnban, handleListBans } from '../../plugins/official/fail2ban/functions.js';

export const PLUGIN_ROUTES = [
  // --- fail2ban plugin routes ---
  {
    method:      'POST',
    path:        '/ban',
    handler:     handleBan,
    requiresAuth: false,  // auth is internal (CF-Connecting-IP + bridge secret on unban)
    description: 'fail2ban: receive ban event from client emitter',
  },
  {
    method:      'POST',
    path:        '/unban',
    handler:     handleUnban,
    requiresAuth: false,  // uses FAIL2BAN_BRIDGE_SECRET, handled in handler
    description: 'fail2ban: receive unban signal from bridge',
  },
  {
    method:      'GET',
    path:        '/bans',
    handler:     handleListBans,
    requiresAuth: true,   // uses AUDITHOLE_SECRET
    description: 'fail2ban: list active bans',
  },

  // --- Add your plugin routes here ---
  // {
  //   method:      'POST',
  //   path:        '/my-plugin/event',
  //   handler:     myHandler,
  //   requiresAuth: true,
  //   description: 'my-plugin: handle incoming event',
  // },
];

/**
 * Match a request path/method against the plugin route registry.
 * Returns the matching route entry or null.
 *
 * @param {string} method
 * @param {string} path - already stripped of /api prefix
 * @returns {{ route, params } | null}
 */
export function matchPluginRoute(method, path) {
  for (const route of PLUGIN_ROUTES) {
    if (route.method !== method) continue;

    // Exact match
    if (route.path === path) {
      return { route, params: {} };
    }

    // Param match: /foo/:id style
    const routeParts = route.path.split('/');
    const pathParts  = path.split('/');
    if (routeParts.length !== pathParts.length) continue;

    let matched = true;
    const params = {};
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) return { route, params };
  }
  return null;
}
