/**
 * AUDITHOLE - functions/lib/ratelimit.js
 * Per-IP fixed-window rate limiting for the public intake lane.
 *
 * POST /api/log is unauthenticated and costs up to 3 KV ops per accepted
 * request, so an unthrottled loop is a storage-and-ops amplifier
 * (audithole#3). The counter is a KV row keyed by IP + window bucket with a
 * short TTL: each accepted request costs one read and one write on the
 * counter, which still bounds the flood well below the 3-ops-per-request
 * cost of the session writes themselves.
 *
 * KV counters are eventually consistent, so this is abuse damping, not a hard
 * guarantee - a determined attacker on many IPs still gets through. It closes
 * the single-origin loop the issue describes and pairs with a CF Rate
 * Limiting rule on /api/log for the hard ceiling.
 */

const WINDOW_MS = 60 * 1000;
export const DEFAULT_LIMIT = 30;

/**
 * @returns {Promise<{ allowed: boolean, count: number, limit: number, retryAfter: number }>}
 */
export async function checkRateLimit(kv, ip, limit = DEFAULT_LIMIT) {
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const key = `rl:${ip}:${bucket}`;
  let count = 0;
  try {
    const raw = await kv.get(key);
    count = raw ? parseInt(raw, 10) || 0 : 0;
  } catch (e) {
    count = 0;
  }

  if (count >= limit) {
    const retryAfter = Math.ceil(((bucket + 1) * WINDOW_MS - Date.now()) / 1000);
    return { allowed: false, count, limit, retryAfter: Math.max(1, retryAfter) };
  }

  try {
    // TTL is 2 windows so the row always outlives its bucket but never lingers.
    await kv.put(key, String(count + 1), { expirationTtl: 120 });
  } catch (e) {
    // A counter write failure must not block legitimate intake.
  }

  return { allowed: true, count: count + 1, limit, retryAfter: 0 };
}
