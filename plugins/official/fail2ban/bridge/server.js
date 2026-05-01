/**
 * AUDITHOLE - fail2ban bridge server
 * plugins/official/fail2ban/bridge/server.js
 *
 * Runs on YOUR OWN INFRASTRUCTURE alongside fail2ban.
 * NOT deployed to Cloudflare. This is a Node.js server.
 *
 * What it does:
 *   1. Receives ban events from Cloudflare (/api/ban -> here)
 *   2. Calls fail2ban-client to ban the IP
 *   3. Optionally notifies audithole /api/unban when fail2ban unbans
 *
 * Requirements:
 *   - Node.js 18+
 *   - fail2ban installed and running
 *   - fail2ban jail named 'audithole' (see jail config below)
 *   - This server reachable from Cloudflare (reverse proxy, Cloudflare Tunnel, etc.)
 *
 * Setup:
 *   npm install  (in this directory)
 *   BRIDGE_SECRET=your-secret AUDITHOLE_URL=https://yourdomain.com node server.js
 *
 * fail2ban jail config (add to /etc/fail2ban/jail.local):
 *
 *   [audithole]
 *   enabled  = true
 *   filter   = audithole
 *   action   = iptables-allports[name=audithole]
 *   backend  = manual
 *   bantime  = 3600
 *   maxretry = 1
 *
 * fail2ban filter (create /etc/fail2ban/filter.d/audithole.conf):
 *
 *   [Definition]
 *   failregex =
 *   ignoreregex =
 *   # Manual-only jail, no log parsing needed.
 */

import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PORT          = process.env.PORT          || 7373;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';
const AUDITHOLE_URL = process.env.AUDITHOLE_URL || ''; // for unban callbacks
const JAIL_NAME     = process.env.JAIL_NAME     || 'audithole';
const DEBUG         = process.env.DEBUG         === 'true';

if (!BRIDGE_SECRET) {
  console.error('[bridge] ERROR: BRIDGE_SECRET env var required');
  process.exit(1);
}

// ---- fail2ban helpers ----

async function banIP(ip, note = '') {
  // Validate IP format before passing to shell
  const { isIP } = await import('net');
  if (!isIP(ip)) throw new Error('Invalid IP format: ' + ip);
  const cmd = `fail2ban-client set ${JAIL_NAME} banip ${ip}`;
  if (DEBUG) console.log('[bridge] Running:', cmd);
  await execAsync(cmd);
  console.log(`[bridge] Banned: ${ip} | ${note}`);
}

async function unbanIP(ip) {
  const { isIP } = await import('net');
  if (!isIP(ip)) throw new Error('Invalid IP format: ' + ip);
  const cmd = `fail2ban-client set ${JAIL_NAME} unbanip ${ip}`;
  if (DEBUG) console.log('[bridge] Running:', cmd);
  await execAsync(cmd);
  console.log(`[bridge] Unbanned: ${ip}`);
}

// Notify audithole /api/unban when fail2ban unbans (optional callback)
async function notifyUnban(ip) {
  if (!AUDITHOLE_URL) return;
  try {
    await fetch(`${AUDITHOLE_URL}/api/unban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': BRIDGE_SECRET,
      },
      body: JSON.stringify({ ip, note: 'fail2ban expiry callback' }),
    });
  } catch (e) {
    console.warn('[bridge] Unban callback failed:', e.message);
  }
}

// ---- HTTP server ----

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 4096) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  // Auth
  const secret = req.headers['x-bridge-secret'];
  if (secret !== BRIDGE_SECRET) {
    return send(res, 401, { error: 'Unauthorized' });
  }

  // POST /ban
  if (req.method === 'POST' && req.url === '/ban') {
    try {
      const body = await parseBody(req);
      const { ip, score, note } = body;
      if (!ip) return send(res, 400, { error: 'Missing ip' });
      await banIP(ip, note || `score ${score}`);
      return send(res, 200, { ok: true, ip });
    } catch (e) {
      console.error('[bridge] Ban error:', e.message);
      return send(res, 500, { error: e.message });
    }
  }

  // POST /unban
  if (req.method === 'POST' && req.url === '/unban') {
    try {
      const body = await parseBody(req);
      const { ip } = body;
      if (!ip) return send(res, 400, { error: 'Missing ip' });
      await unbanIP(ip);
      await notifyUnban(ip);
      return send(res, 200, { ok: true, ip });
    } catch (e) {
      console.error('[bridge] Unban error:', e.message);
      return send(res, 500, { error: e.message });
    }
  }

  // GET /health
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, jail: JAIL_NAME });
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[bridge] fail2ban bridge listening on :${PORT}`);
  console.log(`[bridge] Jail: ${JAIL_NAME}`);
  console.log(`[bridge] Audithole callback: ${AUDITHOLE_URL || '(none)'}`);
});
