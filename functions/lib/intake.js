/**
 * AUDITHOLE - functions/lib/intake.js
 * Intake coercion for POST /api/log.
 *
 * The beacon endpoint is public and unauthenticated, so every field is
 * attacker-controlled. The dashboard renders these values into innerHTML, so
 * a stored-XSS payload only needs one unvalidated field to survive the wash
 * (audithole#1). Coerce each field to its real type and shape here, at the
 * boundary, instead of trusting the renderer to escape everything.
 *
 * Numbers are coerced to finite numbers, strings are clipped to their column
 * width, arrays are capped, and anything of the wrong type falls back to the
 * previous value (never to the raw input).
 */

export const MAX_EVENTS = 200;
export const MAX_PAGEVIEWS = 200;

// A finite, non-negative integer, else null.
function intOrNull(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// A finite number clamped to [lo, hi], else null.
function numInRange(v, lo, hi) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

function str(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Normalize one event row. Returns null for a row with no usable type, so a
 * malformed entry is dropped rather than stored half-valid.
 */
export function sanitizeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const type = str(ev.type, 64);
  if (!type) return null;
  const ms = intOrNull(ev.ms);
  return { type, ms: ms === null ? 0 : ms };
}

/**
 * Fold a raw request body into session mutations. Every value is coerced to
 * its real type; nothing from the body is passed through raw.
 *
 * @returns {{ sessionId: string|null, slug: string|null, duration: number|null,
 *   ua: string|null, language: string|null, screen: string|null,
 *   viewport: string|null, clicks: object|null, maxScrollDepth: number|null,
 *   events: object[]|null, fingerprint: {score:number,signals:string[]}|null,
 *   trapTier: number|null, pageviews: {path:string,ms:number}[] }}
 */
export function sanitizeLogBody(body) {
  const b = body && typeof body === 'object' ? body : {};

  const sessionId = str(b.sessionId, 64).replace(/[^a-zA-Z0-9_-]/g, '');
  const slug = str(b.slug, 60).replace(/[^a-zA-Z0-9_-]/g, '') || null;

  const out = {
    sessionId: sessionId || null,
    slug,
    duration: numInRange(b.duration, 0, Number.MAX_SAFE_INTEGER),
    ua: typeof b.ua === 'string' ? b.ua.slice(0, 512) : null,
    language: typeof b.language === 'string' ? b.language.slice(0, 20) : null,
    screen: typeof b.screen === 'string' ? b.screen.slice(0, 20) : null,
    viewport: typeof b.viewport === 'string' ? b.viewport.slice(0, 20) : null,
    clicks: sanitizeClicks(b.clicks),
    maxScrollDepth: numInRange(b.maxScrollDepth, 0, 100),
    events: [],
    fingerprint: null,
    trapTier: null,
    pageviews: [],
  };

  if (Array.isArray(b.events)) {
    for (const raw of b.events) {
      const ev = sanitizeEvent(raw);
      if (!ev) continue;
      if (raw.type === 'fingerprint') {
        out.fingerprint = sanitizeFingerprint(raw);
      } else if (raw.type === 'trap_activated') {
        const tier = intOrNull(raw.tier);
        if (tier !== null) out.trapTier = Math.min(3, tier);
      } else if (raw.type === 'pageview') {
        out.pageviews.push({ path: str(raw.path, 200), ms: ev.ms });
      }
      out.events.push(ev);
    }
    if (out.events.length > MAX_EVENTS) out.events = out.events.slice(-MAX_EVENTS);
    if (out.pageviews.length > MAX_PAGEVIEWS) out.pageviews = out.pageviews.slice(-MAX_PAGEVIEWS);
  }

  return out;
}

function sanitizeClicks(clicks) {
  if (!clicks || typeof clicks !== 'object' || Array.isArray(clicks)) return null;
  const total = intOrNull(clicks.total);
  if (total === null) return null;
  const zonesIn = clicks.zones && typeof clicks.zones === 'object' ? clicks.zones : {};
  const zones = {};
  for (const k of ['top', 'mid', 'bot', 'left', 'right']) {
    zones[k] = intOrNull(zonesIn[k]) || 0;
  }
  return { total, zones };
}

function sanitizeFingerprint(ev) {
  const score = numInRange(ev.score, 0, 100);
  const signals = Array.isArray(ev.signals)
    ? ev.signals.filter((s) => typeof s === 'string').map((s) => s.slice(0, 64)).slice(0, 40)
    : [];
  if (score === null && !signals.length) return null;
  return { score: score === null ? 0 : score, signals };
}
