/**
 * AUDITHOLE - tests/security.test.js
 * Regression tests for the audithole#1-#4 security fixes: intake coercion,
 * the per-IP throttle, session row caps, and the dashboard secret injection.
 */

import { describe, it, expect, vi } from 'vitest';
import { sanitizeLogBody, sanitizeEvent, MAX_EVENTS, MAX_PAGEVIEWS } from '../functions/lib/intake.js';
import { checkRateLimit, DEFAULT_LIMIT } from '../functions/lib/ratelimit.js';
import { createSession, saveSession, capSession } from '../functions/lib/session.js';
import { onRequest as middleware } from '../functions/_middleware.js';

// ---- intake.js (audithole#1) ----

describe('intake.js - sanitizeLogBody()', () => {
  it('coerces a non-numeric maxScrollDepth to null (never the raw payload)', () => {
    const out = sanitizeLogBody({ sessionId: 'xss1', maxScrollDepth: '<img src=x onerror=alert(1)>' });
    expect(out.maxScrollDepth).toBeNull();
  });

  it('clamps maxScrollDepth into 0-100', () => {
    expect(sanitizeLogBody({ sessionId: 'a', maxScrollDepth: 999 }).maxScrollDepth).toBe(100);
    expect(sanitizeLogBody({ sessionId: 'a', maxScrollDepth: -5 }).maxScrollDepth).toBe(0);
  });

  it('drops a non-object clicks payload', () => {
    expect(sanitizeLogBody({ sessionId: 'a', clicks: '"><img src=x>' }).clicks).toBeNull();
  });

  it('coerces clicks.total to a number and zones to numeric counts', () => {
    const out = sanitizeLogBody({ sessionId: 'a', clicks: { total: '7', zones: { top: '3' } } });
    expect(out.clicks).toEqual({ total: 7, zones: { top: 3, mid: 0, bot: 0, left: 0, right: 0 } });
  });

  it('coerces a non-numeric event ms to 0', () => {
    const ev = sanitizeEvent({ type: 'pageview', ms: '"><img src=x onerror=alert(1)>' });
    expect(ev.ms).toBe(0);
  });

  it('drops events with no usable type', () => {
    expect(sanitizeEvent({ ms: 5 })).toBeNull();
    expect(sanitizeEvent(null)).toBeNull();
    expect(sanitizeEvent('pageview')).toBeNull();
  });

  it('caps events and pageviews at their limits', () => {
    const events = Array.from({ length: 500 }, (_, i) => ({ type: 'click', ms: i }));
    const out = sanitizeLogBody({ sessionId: 'a', events });
    expect(out.events.length).toBe(MAX_EVENTS);
    expect(out.pageviews.length).toBe(0);
  });

  it('caps pageviews separately from events', () => {
    const events = Array.from({ length: 500 }, (_, i) => ({ type: 'pageview', ms: i, path: '/p' }));
    const out = sanitizeLogBody({ sessionId: 'a', events });
    expect(out.pageviews.length).toBe(MAX_PAGEVIEWS);
  });

  it('strips a hostile sessionId to a safe KV key', () => {
    const out = sanitizeLogBody({ sessionId: '../../etc/passwd\u0000' });
    expect(out.sessionId).toMatch(/^[a-zA-Z0-9_-]*$/);
  });

  it('sanitizes a fingerprint score into 0-100 and stringifies signals', () => {
    const out = sanitizeLogBody({
      sessionId: 'a',
      events: [{ type: 'fingerprint', score: 999, signals: ['webdriver', 42, '<x>'] }],
    });
    expect(out.fingerprint.score).toBe(100);
    expect(out.fingerprint.signals).toEqual(['webdriver', '<x>']);
  });
});

// ---- ratelimit.js (audithole#3) ----

function fakeKv() {
  const store = new Map();
  return {
    _store: store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}

describe('ratelimit.js - checkRateLimit()', () => {
  it('allows up to the limit then refuses', async () => {
    const kv = fakeKv();
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit(kv, '1.2.3.4', 5);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit(kv, '1.2.3.4', 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('counts each IP independently', async () => {
    const kv = fakeKv();
    await checkRateLimit(kv, '1.1.1.1', 1);
    expect((await checkRateLimit(kv, '1.1.1.1', 1)).allowed).toBe(false);
    expect((await checkRateLimit(kv, '2.2.2.2', 1)).allowed).toBe(true);
  });

  it('uses a 30-request default limit', () => {
    expect(DEFAULT_LIMIT).toBe(30);
  });
});

// ---- session.js (audithole#2) ----

describe('session.js - capSession()', () => {
  it('caps the pageviews array', () => {
    const s = createSession({ id: 'a', slug: null, ip: 'x', ua: '', country: 'x' });
    for (let i = 0; i < MAX_PAGEVIEWS + 50; i++) s.pageviews.push({ path: '/p', ms: i });
    capSession(s);
    expect(s.pageviews.length).toBe(MAX_PAGEVIEWS);
  });

  it('trims a row that exceeds the byte ceiling', () => {
    const s = createSession({ id: 'a', slug: null, ip: 'x', ua: '', country: 'x' });
    const big = 'x'.repeat(5000);
    for (let i = 0; i < 100; i++) s.events.push({ type: big, ms: i });
    capSession(s);
    expect(JSON.stringify(s).length).toBeLessThanOrEqual(256 * 1024);
  });
});

// ---- _middleware.js (audithole#4) ----

function middlewareContext({ token, envToken = token, secret, html }) {
  const url = new URL(`https://example.com/d/${token}`);
  return {
    request: new Request(url, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120' } }),
    env: {
      DASHBOARD_TOKEN: envToken,
      AUDITHOLE_SECRET: secret,
      ASSETS: { fetch: async () => new Response(html, { status: 200 }) },
    },
    data: {},
  };
}

describe('_middleware.js - secret injection (audithole#4)', () => {
  const page = '<script>const SECRET = window.__AH_SECRET || \'\';</script>';

  it('injects an apostrophe-bearing secret without breaking the literal', async () => {
    const res = await middleware(middlewareContext({ token: 'tok', secret: "let's go", html: page }));
    const body = await res.text();
    expect(body).toContain(`window.__AH_SECRET = "let's go" || ''`);
  });

  it('does not expand $ patterns in the secret', async () => {
    const res = await middleware(middlewareContext({ token: 'tok', secret: "never$'x", html: page }));
    const body = await res.text();
    expect(body).toContain(`window.__AH_SECRET = "never$'x" || ''`);
    expect(body).not.toContain('</script>const SECRET');
  });

  it('neutralizes a </script> inside the secret', async () => {
    const res = await middleware(middlewareContext({ token: 'tok', secret: '</script><script>alert(1)</script>', html: page }));
    const body = await res.text();
    expect(body).not.toContain('</script><script>alert(1)');
  });

  it('still serves a convincing 404 on a bad token', async () => {
    const res = await middleware(middlewareContext({ token: 'wrong', envToken: 'right', secret: 's', html: page }));
    expect(res.status).toBe(404);
  });
});
