# AUDITHOLE

**Defensive honeypot and bot fingerprinting for Cloudflare Pages.**

Drop one script tag onto any page you own. Automated visitors get anonymously fingerprinted, scored, and slowed down. Real users and SEO crawlers are never affected. Sessions are logged to Cloudflare KV and viewable in a private dashboard.

MIT License. Runs entirely on Cloudflare's free tier.

---

## What it does

| Visitor type | What happens |
|---|---|
| Googlebot, Bingbot, etc. | Identified at edge, clean pass-through, zero logging |
| Real human | Normal site experience, no traps, not logged |
| Headless agent / scraper (score < 40) | Normal experience, session logged |
| Suspected bot (score 40-69) | Timer flood -- page never fully "settles", session logged |
| High confidence bot (score 70-89) | Timer flood + RAF hold, session logged |
| Near-certain bot (score 90+) | All of the above escalated, session logged |

Fingerprinting uses ~10 behavioral signals: `navigator.webdriver`, Playwright/Puppeteer global leaks, headless UA strings, missing `window.chrome`, timing jitter, mouse entropy, plugin count, language array, connection RTT. No PII beyond IP (stored server-side only). No keystrokes, no form values, no cross-site tracking.

---

## Quick start (5 minutes)

### 1. Fork or clone

```bash
git clone https://github.com/dhaupin/audithole
cd audithole
npm install
```

### 2. Create a KV namespace

```bash
npx wrangler kv:namespace create AUDITHOLE_KV
npx wrangler kv:namespace create AUDITHOLE_KV --preview
```

Copy both IDs. Open `wrangler.toml` and uncomment the `[[kv_namespaces]]` block, pasting in your IDs:

```toml
[[kv_namespaces]]
binding = "AUDITHOLE_KV"
id = "abc123..."
preview_id = "def456..."
```

### 3. Generate secrets

```bash
# Admin API secret (for dashboard API calls)
openssl rand -hex 24

# Dashboard URL token (your private /d/ URL)
openssl rand -hex 24
```

### 4. Set environment variables

Go to your Cloudflare Pages project:
**Settings → Environment Variables → Production**

| Variable | Value |
|---|---|
| `AUDITHOLE_SECRET` | First token from step 3 |
| `DASHBOARD_TOKEN` | Second token from step 3 |

### 5. Build and deploy

```bash
npm run build
npm run deploy
```

Or connect the repo to Cloudflare Pages (recommended):
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: (leave blank)

### 6. Embed on any page you own

```html
<!-- Add before </body> -->
<script src="/audithole.min.js" data-endpoint="/api/log" defer></script>
```

Done. Sessions will appear in your dashboard within seconds of a visit.

---

## Dashboard

Your dashboard lives at:

```
https://yourdomain.pages.dev/d/YOUR_DASHBOARD_TOKEN
```

The URL path is the authentication. There is no login page to probe -- a wrong or missing token returns a generic 404. Bookmark it and keep it private. Rotate it by updating `DASHBOARD_TOKEN` in CF Pages and redeploying.

### Dashboard features

**Sessions tab**
- Last 100 sessions, sortable and filterable by tier, UA, or slug
- Score bar with color coding (green = clean, red = high confidence bot)
- Tier badge (T0-T3)
- Click any row to open the detail drawer

**Session detail drawer**
- Fingerprint score + every signal that fired
- Trap tier activated
- Country (from Cloudflare headers)
- Session duration, scroll depth, click zone distribution
- Full event timeline
- UA string

**Slugs tab**
- Paste any attribution slug to see all sessions from that source

**Bans tab**
- Active fail2ban bans (requires fail2ban plugin + bridge)

**Generate Slug tab**
- Create a new attribution trap link with an optional label
- Copy the `/t/slug` URL to use on your own properties

---

## Attribution slugs

Use slugs to correlate sessions back to a specific source on your own infrastructure. If you run a contact form, support page, or community and you want to profile a specific source of abuse:

```bash
# Create a slug via API
curl -X POST https://yourdomain.pages.dev/api/slug/create \
  -H "x-audithole-secret: YOUR_AUDITHOLE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"label": "support-ticket-42"}'

# Response:
# { "slug": "support-ticket-42-a3b9z2", "url": "https://yourdomain.pages.dev/t/support-ticket-42-a3b9z2" }
```

Share that URL on your own property. Every session that hits it is tagged with the slug and appears in the Slugs view. Standard honeypot technique -- use only on infrastructure you own and control. See `docs/ETHICS.md`.

---

## Configuration

Copy `audithole.config.js` to your project root and load it before the main script:

```html
<script src="/audithole.config.js"></script>
<script src="/audithole.min.js" defer></script>
```

Key options:

```js
window.__AUDITHOLE_CONFIG = {
  ENDPOINT:           '/api/log',  // log endpoint
  THRESHOLD:          40,          // score to activate traps (0-100)
  WINDOW_MS:          4500,        // observation window in ms
  DEBUG:              false,       // console logging (dev only)
  PLUGINS_ENABLED:    true,
  ALLOW_SCRIPT_HOOKS: false,       // see Plugin system below
};
```

Full reference in `docs/README.md`.

---

## Plugin system

Plugins hook into the fingerprint lifecycle, session events, trap activation, and outbound events. They run in a sandboxed API -- no direct `window` or `fetch` access.

```js
window.__AUDITHOLE_PLUGINS = [
  {
    id: 'my-webhook',
    setup: function(ah) {
      // Fire a webhook when tier 2+ trap activates
      ah.hooks.on(ah.hooks.HOOKS.TRAP_ACTIVATE, async function(payload) {
        if (payload.tier >= 2) {
          await ah.emit('outbound:webhook', {
            url: 'https://your-server.com/alerts',
            body: { tier: payload.tier, score: payload.score },
          });
        }
      });
    }
  }
];
```

**Adding plugin routes (no core editing required)**

Plugins register server-side routes in `functions/lib/pluginRoutes.js` -- they never touch `[[route]].js`. Import your handler and add an entry to `PLUGIN_ROUTES`. See `plugins/README.md` for the full route format.

**Official plugins**

| Plugin | Location | What it does |
|---|---|---|
| `core/hook-injector` | `plugins/core/hook-injector/` | Dev onboarding -- logs every hook event to console. Disable in production. |
| `official/fail2ban` | `plugins/official/fail2ban/` | Fires ban events to a fail2ban bridge when score exceeds threshold (default 70). Includes bridge server stub. |

See `plugins/README.md` for full plugin API reference.

---

## fail2ban plugin setup

The fail2ban plugin requires a bridge server running on your own infrastructure alongside fail2ban.

### 1. Set env vars in CF Pages

| Variable | Value |
|---|---|
| `FAIL2BAN_BRIDGE_URL` | URL of your bridge (e.g. `https://bridge.yourdomain.com`) |
| `FAIL2BAN_BRIDGE_SECRET` | Shared secret between CF and bridge |

### 2. Run the bridge

```bash
cd plugins/official/fail2ban/bridge
npm install  # no dependencies, just Node built-ins
BRIDGE_SECRET=your-secret \
AUDITHOLE_URL=https://yourdomain.pages.dev \
node server.js
```

Expose it via nginx reverse proxy, Cloudflare Tunnel, or any method that gives it a stable HTTPS URL.

### 3. Add the fail2ban jail

`/etc/fail2ban/jail.local`:
```ini
[audithole]
enabled  = true
backend  = manual
action   = iptables-allports[name=audithole]
bantime  = 3600
maxretry = 1
```

`/etc/fail2ban/filter.d/audithole.conf`:
```ini
[Definition]
failregex =
ignoreregex =
```

### 4. Register the plugin

```js
// In audithole.config.js
window.__AUDITHOLE_PLUGINS = [
  { id: 'official/fail2ban', setup: window.__AH_FAIL2BAN }
];
```

```html
<!-- Load before audithole.min.js -->
<script type="module">
  import { fail2banSetup } from '/plugins/official/fail2ban/index.js';
  window.__AH_FAIL2BAN = fail2banSetup;
</script>
```

---

## API reference

All admin endpoints require `x-audithole-secret: YOUR_AUDITHOLE_SECRET` header.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/log` | none | Receive session events (client script) |
| `GET` | `/api/sessions?limit=50` | secret | List recent sessions (max 100) |
| `GET` | `/api/session/:id` | secret | Get single session |
| `GET` | `/api/slug/:slug` | secret | Get sessions for attribution slug |
| `POST` | `/api/slug/create` | secret | Create attribution slug |
| `GET` | `/api/hang` | none | Slow-drain stall endpoint (trap tier 2) |
| `POST` | `/api/ban` | none* | fail2ban plugin: ban event receiver |
| `POST` | `/api/unban` | bridge secret | fail2ban plugin: unban callback |
| `GET` | `/api/bans` | secret | fail2ban plugin: list active bans |

*`/api/ban` auth is handled by CF-Connecting-IP + internal routing, not the admin secret.

---

## File structure

```
audithole/
├── src/                        Client-side source
│   ├── audithole.js            Orchestrator (entry point)
│   ├── config.js               Config loader
│   ├── fingerprint.js          Weighted signal scoring
│   ├── escape.js               SEO bot whitelist
│   ├── traps.js                Timer-based slowdown (3 tiers)
│   ├── logger.js               Anonymous session capture
│   ├── social.js               Slug attribution
│   ├── emitter.js              Outbound webhook layer
│   └── plugins.js              Plugin host, hook registry, sandbox
├── functions/                  Cloudflare Pages Functions (server-side)
│   ├── _middleware.js          Edge: dashboard route, slug rewrite, headers
│   ├── api/
│   │   └── [[route]].js        API catch-all (do not add routes here)
│   └── lib/
│       ├── session.js          Session model + KV adapter
│       └── pluginRoutes.js     Plugin route registry (add routes here)
├── dist/                       Static assets (served by CF Pages)
│   ├── index.html              Bait frontend (AUDITHOLE SaaS)
│   ├── dashboard.html          Admin dashboard (served at /d/:token)
│   ├── audithole.min.js        Built client script (npm run build)
│   ├── _headers                CF security headers
│   └── _routes.json            CF route rules
├── plugins/
│   ├── README.md               Plugin API reference
│   ├── core/
│   │   └── hook-injector/      Dev onboarding plugin
│   └── official/
│       └── fail2ban/           fail2ban integration
│           ├── index.js        Client plugin
│           ├── functions.js    CF Functions handlers
│           └── bridge/
│               └── server.js   Node.js bridge (runs on your infra)
├── docs/
│   ├── README.md               Extended docs
│   ├── DEPLOYMENT.md           Step-by-step deploy guide
│   ├── ETHICS.md               Design boundaries and what we didn't build
│   └── AGENTS.md               AI agent onboarding (yes, really)
├── audithole.config.js         Example config (copy to your project)
├── package.json
├── wrangler.toml
└── LICENSE                     MIT
```

---

## What is and is not collected

| Collected | Not collected |
|---|---|
| IP address (server-side only, never in API responses) | Keystrokes or typed content |
| User-agent string | Form field values |
| Fingerprint score + signals hit | Precise cursor coordinates |
| Pages visited + timestamps | Clipboard contents |
| Scroll depth (percentage) | Cross-site data |
| Click zone distribution (top/mid/bot, left/right) | Persistent cross-session identifiers |
| Session duration | |
| Trap tier activated | |
| Country (from Cloudflare headers) | |

---

## Ethical boundaries

Read `docs/ETHICS.md` for the full design rationale. The short version:

- **Deploy on your own infrastructure only.** This is not a tool for targeting third parties.
- **Observe and slow, do not crash.** Client-side DoS mechanisms were discussed and deliberately left out.
- **No content harvesting.** Keystroke logging and form capture were explicitly rejected.
- **SEO is untouched.** Known good crawlers get a clean pass-through at the edge before any JS runs.

---

## License

MIT. See `LICENSE`.

Built to reduce noise, not create it.
