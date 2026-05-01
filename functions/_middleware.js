/**
 * AUDITHOLE - functions/_middleware.js
 * Cloudflare Pages edge middleware. Runs before every request.
 *
 * Responsibilities:
 *   1. Dashboard route: /d/:token -- serve dashboard.html if token matches
 *   2. Slug route: /t/:slug -- rewrite to index.html, slug parsed client-side
 *   3. SEO bot whitelist -- known good crawlers get clean pass-through
 *   4. Attach CF metadata to context for downstream functions
 *   5. Security headers on all responses
 */

import { edgeShouldEscape } from '../src/escape.js';

export async function onRequest(context) {
  const { request, next, env } = context;
  const url     = new URL(request.url);
  const path    = url.pathname;
  const ua      = request.headers.get('user-agent') || '';
  const ip      = request.headers.get('CF-Connecting-IP') || 'unknown';
  const country = request.headers.get('CF-IPCountry') || 'unknown';

  // 1. Dashboard route: /d/:token
  //    Token lives in DASHBOARD_TOKEN env var (set in CF Pages dashboard).
  //    The path segment IS the auth -- no login page, nothing to probe.
  //    If token missing/wrong, return 404 (not 401, don't confirm route exists).
  const dashMatch = path.match(/^\/d\/([^/]+)\/?$/);
  if (dashMatch) {
    const provided = dashMatch[1];
    const expected = env.DASHBOARD_TOKEN;

    if (!expected || provided !== expected) {
      // Return a convincing 404 -- don't leak that a dashboard exists
      return new Response('Not found', { status: 404 });
    }

    // Serve dashboard.html with the secret injected for API calls
    const dashReq  = new Request(new URL('/dashboard.html', url.origin), request);
    const dashResp = await fetch(dashReq);
    const html     = await dashResp.text();

    // Inject the secret into the page so the dashboard JS can call /api/*
    const injected = html.replace(
      'window.__AH_SECRET || \'\'',
      `'${env.AUDITHOLE_SECRET || ''}'`
    );

    return new Response(injected, {
      status: 200,
      headers: securityHeaders({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache',
        'X-Robots-Tag': 'noindex',
      }),
    });
  }

  // 2. Slug route: /t/:slug
  //    Rewrite to index.html. The client-side Social.parseSlug() reads it from path.
  //    The slug gets logged when audithole.js initializes.
  const slugMatch = path.match(/^\/t\/([a-zA-Z0-9_-]+)\/?$/);
  if (slugMatch) {
    const indexReq  = new Request(new URL('/', url.origin), request);
    const indexResp = await next();
    context.data.meta = { ip, ua, country, path, slug: slugMatch[1] };
    return addSecurityHeaders(indexResp);
  }

  // 3. Known good crawlers -- immediate clean pass-through, zero trap injection
  if (edgeShouldEscape(ua)) {
    const response = await next();
    return addSecurityHeaders(response);
  }

  // 4. Attach metadata for downstream functions
  context.data.meta = { ip, ua, country, path };

  // 5. Normal request
  const response = await next();
  return addSecurityHeaders(response);
}

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    ...extra,
  };
}

function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(securityHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
