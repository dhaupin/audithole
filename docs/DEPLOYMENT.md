# DEPLOYMENT.md — Step-by-Step Deploy Guide

## Prerequisites

- Cloudflare account (free tier works)
- Node.js 18+
- `wrangler` CLI (`npm install -g wrangler`)
- A GitHub repo (for Pages CI/CD)

---

## Step 1 — KV Namespace

Create two KV namespaces (production + preview):

```bash
npx wrangler kv:namespace create AUDITHOLE_KV
npx wrangler kv:namespace create AUDITHOLE_KV --preview
```

Copy the output IDs into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "AUDITHOLE_KV"
id = "your-production-id-here"
preview_id = "your-preview-id-here"
```

---

## Step 2 — Environment Variables

In Cloudflare Pages dashboard:
**Settings → Environment Variables → Production**

| Variable | Value |
|---|---|
| `AUDITHOLE_SECRET` | A long random string -- your admin API key |

Never commit this to the repo.

---

## Step 3 — Build

```bash
npm install
node build.js
```

This produces `dist/audithole.min.js` from the `src/` modules.

For production, use esbuild for real minification:

```bash
npx esbuild src/audithole.js --bundle --minify --format=iife --outfile=dist/audithole.min.js
```

---

## Step 4 — Deploy

### Via Wrangler CLI

```bash
npx wrangler pages deploy dist
```

### Via GitHub CI (recommended)

Connect your repo to Cloudflare Pages in the dashboard:
- Build command: `node build.js`
- Build output directory: `dist`
- Root directory: (leave blank)

The `.github/workflows/deploy.yml` handles this automatically.

---

## Step 5 — Verify

```bash
# Check session log endpoint
curl -X POST https://yourdomain.pages.dev/api/log \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","slug":null,"duration":1000}'

# Should return: {"ok":true}

# List recent sessions (requires secret)
curl https://yourdomain.pages.dev/api/sessions \
  -H "x-audithole-secret: your-secret"
```

---

## Step 6 — Embed on your pages

Add to any HTML page on your own infrastructure:

```html
<script src="/audithole.min.js" data-endpoint="/api/log" defer></script>
```

Or with custom thresholds:

```html
<script
  src="/audithole.min.js"
  data-endpoint="/api/log"
  data-threshold="50"
  data-window="5000"
  data-debug="false"
  defer
></script>
```

---

## Step 7 — Create attribution slugs

```bash
curl -X POST https://yourdomain.pages.dev/api/slug/create \
  -H "x-audithole-secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"label": "contact-form"}'
```

Share the returned URL on your own properties to correlate sessions.

---

## Cloudflare Free Tier Limits

| Resource | Free Limit | Typical Usage |
|---|---|---|
| KV reads | 100k/day | ~1 per session |
| KV writes | 1k/day | ~1-3 per session |
| Pages requests | Unlimited | N/A |
| Functions requests | 100k/day | Per API call |

For most deployments, free tier is more than sufficient.

---

## Dashboard access

The dashboard lives at `/d/{DASHBOARD_TOKEN}`. The path segment is the auth.
There is no login page -- nothing to probe or brute-force unless an attacker
knows the token and the `/d/` prefix exists.

### Generate a token

```bash
openssl rand -hex 24
# e.g: a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3
```

### Set in CF Pages dashboard

Settings → Environment Variables → Production:

| Variable | Value |
|---|---|
| `DASHBOARD_TOKEN` | your generated token |
| `AUDITHOLE_SECRET` | separate secret for API calls |

### Access your dashboard

```
https://yourdomain.pages.dev/d/a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3
```

Bookmark it. Rotate the token by updating the env var in CF Pages -- old bookmarks
immediately stop working.

### What the dashboard shows

- Recent sessions (last 100, filterable by tier/UA/slug)
- Per-session detail: score, signals hit, trap tier, country, scroll depth, click zones, events
- Attribution slug lookup -- paste a slug to see all sessions from that source
- Active bans (requires fail2ban plugin)
- Slug generator -- create new attribution links
