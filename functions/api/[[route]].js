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
import { sanitizeLogBody, MAX_EVENTS, MAX_PAGEVIEWS } from '../lib/intake.js';
import { checkRateLimit }  from '../lib/ratelimit.js';
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

  // Per-IP throttle first: it is the cheapest guard against the forged-id
  // flood (audithole#3) and it runs before any KV session write.
  const ip = meta.ip || 'unknown';
  const rl = await checkRateLimit(kv, ip);
  if (!rl.allowed) {
    return json({ error: 'Rate limit exceeded' }, 429, { 'Retry-After': String(rl.retryAfter) });
  }

  const clean = sanitizeLogBody(body);
  if (!clean.sessionId) {
    return json({ error: 'Missing sessionId' }, 400);
  }

  let session = await getSession(kv, clean.sessionId);
  if (!session) {
    session = createSession({
      id:      clean.sessionId,
      slug:    clean.slug,
      ip,
      ua:      clean.ua || meta.ua || '',
      country: meta.country || 'unknown',
    });
  }

  if (clean.duration       !== null) session.duration       = clean.duration;
  if (clean.language       !== null) session.language       = clean.language;
  if (clean.screen         !== null) session.screen         = clean.screen;
  if (clean.viewport       !== null) session.viewport       = clean.viewport;
  if (clean.clicks         !== null) session.clicks         = clean.clicks;
  if (clean.maxScrollDepth !== null) session.maxScrollDepth = clean.maxScrollDepth;

  // events/pageviews arrive already coerced and capped by the sanitizer.
  if (clean.fingerprint) session.fingerprint = clean.fingerprint;
  if (clean.trapTier !== null) session.trapTier = clean.trapTier;

  for (const ev of clean.events) session.events.push(ev);
  if (session.events.length > MAX_EVENTS) session.events = session.events.slice(-MAX_EVENTS);

  for (const pv of clean.pageviews) session.pageviews.push(pv);
  if (session.pageviews.length > MAX_PAGEVIEWS) session.pageviews = session.pageviews.slice(-MAX_PAGEVIEWS);

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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-audithole-secret',
  };
}
