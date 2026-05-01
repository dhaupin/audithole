/**
 * AUDITHOLE - plugins/official/fail2ban/functions.js
 * CF Pages Functions extensions for the fail2ban plugin.
 *
 * Merge these handlers into your functions/api/[[route]].js
 * under the appropriate route conditions.
 *
 * Requires env vars in Cloudflare Pages dashboard:
 *   FAIL2BAN_BRIDGE_URL    - URL of your fail2ban bridge server
 *   FAIL2BAN_BRIDGE_SECRET - shared secret for auth
 */

/**
 * Handle POST /api/ban
 * Called by the audithole emitter when outbound:ban fires.
 * Reads the real IP from CF-Connecting-IP, builds a ban request,
 * and forwards it to the fail2ban bridge.
 *
 * @param {Request} request
 * @param {object} env - CF env bindings
 * @param {object} meta - { ip, ua, country } from middleware
 */
export async function handleBan(request, env, kv, meta) {
  const bridgeUrl    = env.FAIL2BAN_BRIDGE_URL;
  const bridgeSecret = env.FAIL2BAN_BRIDGE_SECRET;

  if (!bridgeUrl || !bridgeSecret) {
    return jsonResp({ error: 'fail2ban bridge not configured' }, 503);
  }

  let body = {};
  try { body = await request.json(); } catch (e) {}

  const ip      = meta.ip;
  const score   = body.score   || 0;
  const signals = body.signals || [];
  const note    = body.note    || `audithole score ${score}`;

  // Write ban record to KV
  if (kv) {
    await kv.put(`ban:${ip}`, JSON.stringify({
      ip, score, signals, note,
      banned_at: Date.now(),
      source: 'audithole',
    }), { expirationTtl: 60 * 60 * 24 * 7 }); // 7 day default, fail2ban controls actual ban duration
  }

  // Forward to bridge
  try {
    const res = await fetch(bridgeUrl + '/ban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': bridgeSecret,
      },
      body: JSON.stringify({ ip, score, signals, note }),
    });

    if (!res.ok) {
      return jsonResp({ error: 'bridge error', status: res.status }, 502);
    }

    return jsonResp({ ok: true, ip, score });

  } catch (e) {
    return jsonResp({ error: 'bridge unreachable', message: e.message }, 503);
  }
}

/**
 * Handle POST /api/unban
 * Called by the fail2ban bridge when a ban expires or is manually removed.
 * Verifies the shared secret, removes the KV ban record.
 *
 * @param {Request} request
 * @param {object} env
 * @param {object} kv
 */
export async function handleUnban(request, env, kv, meta = {}) {
  const bridgeSecret = env.FAIL2BAN_BRIDGE_SECRET;
  const provided     = request.headers.get('x-bridge-secret');

  if (!bridgeSecret || provided !== bridgeSecret) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  let body = {};
  try { body = await request.json(); } catch (e) {}

  const ip = body.ip;
  if (!ip) return jsonResp({ error: 'Missing ip' }, 400);

  if (kv) {
    await kv.delete(`ban:${ip}`);
  }

  return jsonResp({ ok: true, ip, unbanned_at: Date.now() });
}

/**
 * Handle GET /api/bans
 * List active ban records. Requires AUDITHOLE_SECRET.
 */
export async function handleListBans(request, env, kv, meta = {}) {
  const secret   = env.AUDITHOLE_SECRET;
  const provided = request.headers.get('x-audithole-secret');
  if (!secret || provided !== secret) return jsonResp({ error: 'Unauthorized' }, 401);

  const list = await kv.list({ prefix: 'ban:' });
  const bans = await Promise.all(
    list.keys.map(async (k) => {
      try {
        const raw = await kv.get(k.name);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    })
  );

  return jsonResp(bans.filter(Boolean));
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
