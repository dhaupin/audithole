/**
 * AUDITHOLE - functions/lib/session.js
 * Session model and KV persistence adapter.
 *
 * KV schema:
 *   session:{id}      → full session object (TTL: 30 days)
 *   slug:{slug}       → slug metadata + session id list (TTL: 90 days)
 *   index:recent      → last 100 session ids (no TTL, rolling)
 *
 * The session row is the one unbounded axis in this schema (audithole#2): the
 * beacon can append pageviews on every POST, and saveSession re-stamps the
 * 30-day TTL each time, so a periodically-poked row never expires and keeps
 * growing. Both are bounded here - pageviews are capped like events, and the
 * serialized row is trimmed to a hard byte ceiling before it is written.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SLUG_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const RECENT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 day rolling TTL

export const MAX_PAGEVIEWS = 200;
const MAX_ROW_BYTES = 256 * 1024; // 256 KB ceiling on a serialized session row

export function createSession({ id, slug, ip, ua, country }) {
  return {
    id,
    slug: slug || null,
    ip,          // stored server-side only, never sent to client
    ua,
    country,
    created: Date.now(),
    updated: Date.now(),
    fingerprint: null,
    trapTier: 0,
    clicks: null,
    maxScrollDepth: 0,
    events: [],
    pageviews: [],
    duration: 0,
  };
}

/**
 * Trim a session row to the storage ceilings: pageviews capped like events,
 * and the serialized row trimmed (oldest events/pageviews dropped) until it
 * fits MAX_ROW_BYTES. Mutates and returns the session.
 */
export function capSession(session) {
  if (Array.isArray(session.pageviews) && session.pageviews.length > MAX_PAGEVIEWS) {
    session.pageviews = session.pageviews.slice(-MAX_PAGEVIEWS);
  }

  let json = JSON.stringify(session);
  while (json.length > MAX_ROW_BYTES) {
    // Drop oldest rows first; events and pageviews are the only growing axes.
    const events = session.events || [];
    const pageviews = session.pageviews || [];
    if (events.length === 0 && pageviews.length === 0) break;
    if (events.length >= pageviews.length && events.length > 0) {
      session.events = events.slice(Math.ceil(events.length / 2));
    } else if (pageviews.length > 0) {
      session.pageviews = pageviews.slice(Math.ceil(pageviews.length / 2));
    }
    json = JSON.stringify(session);
  }
  return session;
}

export async function saveSession(kv, session) {
  session.updated = Date.now();
  capSession(session);
  await kv.put(
    `session:${session.id}`,
    JSON.stringify(session),
    { expirationTtl: SESSION_TTL_SECONDS } // 30 days
  );

  // Update slug index
  if (session.slug) {
    const slugKey = `slug:${session.slug}`;
    let slugMeta = {};
    try {
      const existing = await kv.get(slugKey);
      slugMeta = existing ? JSON.parse(existing) : { slug: session.slug, sessions: [], created: Date.now() };
    } catch (e) {
      slugMeta = { slug: session.slug, sessions: [], created: Date.now() };
    }
    if (!slugMeta.sessions.includes(session.id)) {
      slugMeta.sessions.push(session.id);
      // Keep last 1000 sessions per slug
      if (slugMeta.sessions.length > 1000) {
        slugMeta.sessions = slugMeta.sessions.slice(-1000);
      }
    }
    await kv.put(slugKey, JSON.stringify(slugMeta), {
      expirationTtl: SLUG_TTL_SECONDS
    });
  }

  // Update rolling recent index
  let recent = [];
  try {
    const raw = await kv.get('index:recent');
    recent = raw ? JSON.parse(raw) : [];
  } catch (e) {}
  recent.unshift(session.id);
  if (recent.length > 100) recent = recent.slice(0, 100);
  await kv.put('index:recent', JSON.stringify(recent), { expirationTtl: RECENT_TTL_SECONDS }); // 90 day rolling TTL
}

export async function getSession(kv, id) {
  try {
    const raw = await kv.get(`session:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function getRecentSessions(kv, limit = 20) {
  try {
    const raw = await kv.get('index:recent');
    const ids = raw ? JSON.parse(raw).slice(0, limit) : [];
    const sessions = await Promise.all(
      ids.map(id => getSession(kv, id))
    );
    return sessions.filter(Boolean);
  } catch (e) {
    return [];
  }
}

export async function getSlugSessions(kv, slug, limit = 50) {
  try {
    const raw = await kv.get(`slug:${slug}`);
    if (!raw) return { slug, sessions: [] };
    const meta = JSON.parse(raw);
    const ids = (meta.sessions || []).slice(-limit).reverse();
    const sessions = await Promise.all(ids.map(id => getSession(kv, id)));
    return { slug, created: meta.created, sessions: sessions.filter(Boolean) };
  } catch (e) {
    return { slug, sessions: [] };
  }
}
