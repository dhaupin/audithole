/**
 * AUDITHOLE - functions/api/[[route]].js
 * Core API catch-all. Do not add plugin routes here directly.
 * Register plugin routes in functions/lib/pluginRoutes.js instead.
 *
 * Core routes:
 *   POST /api/log           - receive session events from client
 *   GET  /api/sessions      - list recent sessions (auth required)
 *   GET  /api/session/:id   - get single session (auth required)
 *   GET  /api/slug/:slug    - get sessions for a slug (auth required)
 *   POST /api/slug/create   - create a new attribution slug
 *   GET  /api/hang          - slow-drain stall for tier-2 trap
 *   GET  /d/:token          - dashboard (token = DASHBOARD_TOKEN env var)
 *
 * Plugin routes are dispatched via matchPluginRoute() below.
 */

import {
  createSession,
  saveSession,
  getSession,
  getRecentSessions,
  getSlugSessions,
} from '../lib/session.js';
import { Social }            from '../../src/social.js';
import { matchPluginRoute }  from '../lib/pluginRoutes.js';

export async function onRequest(context) {
  const { request, env, data } = context;
  const url    = new URL(request.url);
  const method = request.method;
  const kv     = env.AUDITHOLE_KV;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(url.origin) });
  }

  if (!kv) return json({ error: 'KV not configured' }, 500);

  // Strip /api prefix for routing
  const path = url.pathname.replace(/^\/api/, '');

  // ---- Dashboard route (/d/:token) ----
  // Served from /api layer so middleware runs, but lives at /d/ not /api/d/
  // Actually handled in _middleware.js -- see functions/_middleware.js
  // This catch-all only sees /api/* paths.

  // ---- Core routes ----

  if (method === 'POST' && path === '/log') {
    return handleLog(request, kv, data.meta || {});
  }

  if (method === 'GET' && path === '/hang') {
    return handleHang();
  }

  // Auth guard for read routes
  const secret   = env.AUDITHOLE_SECRET;
  const provided = request.headers.get('x-audithole-secret');
  const authed   = secret && provided === secret;

  if (method === 'GET' && path === '/sessions') {
    if (!authed) return json({ error: 'Unauthorized' }, 401);
    const limit    = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const sessions = await getRecentSessions(kv, limit);
    return json(sessions.map(stripIP));
  }

  const sessionMatch = path.match(/^\/session\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && sessionMatch) {
    if (!authed) return json({ error: 'Unauthorized' }, 401);
    const session = await getSession(kv, sessionMatch[1]);
    if (!session) return json({ error: 'Not found' }, 404);
    return json(stripIP(session));
  }

  const slugReadMatch = path.match(/^\/slug\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && slugReadMatch) {
    if (!authed) return json({ error: 'Unauthorized' }, 401);
    const result = await getSlugSessions(kv, slugReadMatch[1]);
    result.sessions = result.sessions.map(stripIP);
    return json(result);
  }

  if (method === 'POST' && path === '/slug/create') {
    if (!authed) return json({ error: 'Unauthorized' }, 401);
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const slug    = Social.generateSlug((body.label || '').slice(0, 40));
    const slugUrl = `${url.origin}/t/${slug}`;
    return json({ slug, url: slugUrl });
  }

  // ---- Plugin routes ----
  // Registered in functions/lib/pluginRoutes.js.
  // Plugins never need to touch this file.
  const pluginMatch = matchPluginRoute(method, path);
  if (pluginMatch) {
    const { route, params } = pluginMatch;

    // Auth check if route requires it
    if (route.requiresAuth && !authed) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Call plugin handler with full context
    return route.handler(request, env, kv, data.meta || {}, url, params);
  }

  return json({ error: 'Not found' }, 404);
}

// ---- Core handlers ----

async function handleLog(request, kv, meta) {
  let body = {};
  try { body = await request.json(); } catch (e) {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { sessionId, slug, duration, ua, language, screen, viewport,
          clicks, maxScrollDepth, events } = body;

  if (!sessionId || typeof sessionId !== 'string') {
    return json({ error: 'Missing sessionId' }, 400);
  }

  // Strip then re-validate: defense-in-depth against KV key injection.
  // We strip first (rather than reject) to be tolerant of minor encoding
  // quirks from the client, then hard-reject if nothing meaningful remains.
  const cleanId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!cleanId) return json({ error: 'Invalid sessionId' }, 400);

  let session = await getSession(kv, cleanId);
  if (!session) {
    session = createSession({
      id:      cleanId,
      slug:    (slug || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || null,
      ip:      meta.ip || 'unknown',
      ua:      (ua || meta.ua || '').slice(0, 512),
      country: meta.country || 'unknown',
    });
  }

  session.duration       = duration || session.duration;
  session.language       = (language || '').slice(0, 20);
  session.screen         = (screen || '').slice(0, 20);
  session.viewport       = (viewport || '').slice(0, 20);
  session.clicks         = clicks || session.clicks;
  session.maxScrollDepth = maxScrollDepth || session.maxScrollDepth;

  if (Array.isArray(events)) {
    for (const ev of events) {
      if (!ev || !ev.type) continue;
      if (ev.type === 'fingerprint') {
        session.fingerprint = { score: ev.score, signals: ev.signals };
      }
      if (ev.type === 'trap_activated') session.trapTier = ev.tier;
      if (ev.type === 'pageview') {
        session.pageviews.push({ path: (ev.path || '').slice(0, 200), ms: ev.ms });
      }
      session.events.push({ type: ev.type, ms: ev.ms });
    }
    if (session.events.length > 200) session.events = session.events.slice(-200);
  }

  await saveSession(kv, session);
  return json({ ok: true });
}

function handleHang() {
  // Slow-drain: write a space byte every 5s for 45s then close.
  // Prevents networkIdle from resolving during the window.
  // Does not crash client -- just keeps the connection open.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let count = 0;
  const iv = setInterval(async () => {
    count++;
    try { await writer.write(new Uint8Array([0x20])); } catch (e) {}
    if (count >= 9) {
      clearInterval(iv);
      try { await writer.close(); } catch (e) {}
    }
  }, 5000);

  return new Response(readable, {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}

// ---- Helpers ----

function stripIP({ ip, ...rest }) { return rest; }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-audithole-secret',
  };
}
