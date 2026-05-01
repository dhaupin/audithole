# AUDITHOLE

**Defensive honeypot and bot fingerprinting for Cloudflare Pages.**

A drop-in script + CF Pages Functions layer that anonymously profiles automated visitors to your own infrastructure -- headless agents, scrapers, and bots -- using behavioral fingerprinting. Paired with a bait frontend styled as a professional "free SEO audit" service.

MIT License. Deploy on infrastructure you own and control.

---

## What it does

1. **Fingerprints visitors** using ~10 anonymous behavioral signals (no PII beyond IP, stored server-side only)
2. **Scores them** on a 0-100 scale. Known good crawlers (Googlebot etc.) get an immediate pass-through -- zero SEO impact
3. **Activates a timer-based slowdown** for high-scoring automated visitors (score ≥ 40)
4. **Logs anonymous sessions** to Cloudflare KV: IP, UA, score, signals hit, pages visited, scroll depth, click zones, duration
5. **Provides slug attribution** -- `/t/my-slug` lets you correlate sessions back to a source on your own properties

---

## Quick start

### 1. Create a KV namespace

```bash
npx wrangler kv:namespace create AUDITHOLE_KV
npx wrangler kv:namespace create AUDITHOLE_KV --preview
```

Copy the IDs into `wrangler.toml`.

### 2. Set your dashboard secret

In Cloudflare Pages dashboard → Settings → Environment Variables:

```
AUDITHOLE_SECRET = your-secret-key-here
```

### 3. Deploy

```bash
npm install
npm run deploy
```

### 4. Embed on any page you own

```html
<script src="/audithole.min.js" data-endpoint="/api/log" defer></script>
```

Optional attributes:
- `data-threshold` — fingerprint score to activate traps (default: `40`)
- `data-window` — observation window in ms (default: `4500`)
- `data-debug` — set to `"true"` for console logging (dev only)

---

## Fingerprint signals

| Signal | Weight |
|---|---|
| `navigator.webdriver` present | 25 |
| Playwright/Puppeteer global leaks | 25 each |
| Headless in UA string | 30 |
| `window.chrome` missing on Chrome UA | 15 |
| `performance.now()` jitter too low | 15 |
| No mouse entropy after 4s | 20 |
| `navigator.languages` empty | 10 |
| Zero plugins | 10 |
| Zero connection RTT | 10 |

**Threshold 40** → Tier 1 (timer flood, page appears slow)
**Threshold 70** → Tier 2 (timer flood + RAF hold)
**Threshold 90** → Tier 3 (all of the above, escalated)

---

## Trap tiers

| Tier | Score | Mechanisms |
|---|---|---|
| 1 | 40-69 | Stacked `setInterval`/`setTimeout` -- page never quiesces |
| 2 | 70-89 | + off-screen `requestAnimationFrame` loop |
| 3 | 90+ | + escalated timer density |

See `docs/ETHICS.md` for what we deliberately did not implement and why.

---

## API endpoints

All admin routes require `x-audithole-secret` header matching `AUDITHOLE_SECRET`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/log` | Receive session events (called by client script) |
| `GET` | `/api/sessions` | List recent sessions |
| `GET` | `/api/session/:id` | Get single session |
| `GET` | `/api/slug/:slug` | Get sessions for attribution slug |
| `POST` | `/api/slug/create` | Create new attribution slug |
| `GET` | `/api/hang` | Slow-drain response endpoint (Tier 2) |

---

## Attribution slugs

Generate a slug for a source on your own property:

```bash
curl -X POST https://yourdomain.com/api/slug/create \
  -H "x-audithole-secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"label": "support-form-42"}'
```

Response:
```json
{ "slug": "support-form-42-a3b9z2f1", "url": "https://yourdomain.com/t/support-form-42-a3b9z2f1" }
```

Anyone hitting that URL gets fingerprinted and their session is tagged with that slug. Use this for correlating sessions back to specific sources on your own properties -- not for targeting third parties.

---

## What is and is not collected

**Collected (anonymous):**
- IP address (server-side only, never in client responses)
- User-agent string
- Fingerprint score + signals
- Pages visited + timestamps
- Scroll depth percentage
- Click zone distribution (top/mid/bot, left/right)
- Session duration
- Trap tier activated

**Never collected:**
- Keystrokes or typed content
- Form field values
- Precise cursor coordinates
- Clipboard contents
- Any cross-site data

---

## File structure

```
audithole/
├── src/
│   ├── fingerprint.js    # Weighted signal scoring engine
│   ├── escape.js         # SEO bot whitelist
│   ├── traps.js          # Timer-based slowdown layer
│   ├── logger.js         # Anonymous session event capture
│   ├── social.js         # Slug attribution
│   └── audithole.js      # Orchestrator
├── functions/
│   ├── _middleware.js    # CF Pages edge middleware
│   ├── api/
│   │   └── [[route]].js  # Catch-all API handler
│   └── lib/
│       └── session.js    # Session model + KV adapter
├── dist/
│   ├── index.html        # Bait frontend (AUDITHOLE SaaS)
│   ├── audithole.min.js  # Built client script
│   └── _headers          # CF security headers
├── docs/
│   ├── README.md         # This file
│   ├── DEPLOYMENT.md     # Step-by-step deploy
│   ├── ETHICS.md         # Boundaries, what we didn't build and why
│   └── AGENTS.md         # AI agent onboarding
├── build.js
├── wrangler.toml
└── package.json
```

---

## License

MIT. See `LICENSE`.

Deploy responsibly. This tool is for your own infrastructure only.
