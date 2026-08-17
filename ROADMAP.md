# AuditHole Roadmap

> A living document for where AuditHole is headed. Not a commitment — just intent.

---

## What AuditHole Is

A defensive honeypot and bot fingerprinting layer for Cloudflare Pages. It detects automated visitors, profiles them anonymously, and slows them down mildly. MIT licensed. Designed for deployment on infrastructure the deployer owns.

---

## v1.0 — Production Hardening

### Real-Time Features
- [ ] **SSE dashboard**: Server-Sent Events for live session feed (no manual refresh)
- [ ] **Live trap status**: Show which traps are currently active on the page
- [ ] **Real-time visitor map**: Animated world map showing incoming flagged visitors

### Challenge System
- [ ] **JavaScript puzzle challenge**: When visitor hits tier 3, redirect to a challenge page
- [ ] **Simple bot-detection puzzle**: Real browsers solve it; headless agents can't
- [ ] **Challenge pass tracking**: If they pass, let them through; if not, stay flagged
- [ ] **Challenge bypass logging**: Track when bots attempt to solve or skip challenges

### Evasion Detection
- [ ] **Cookie clearing detection**: Track if bot tries to clear cookies/localStorage after being flagged
- [ ] **UA spoofing detection**: Compare client-reported UA vs. server-reported UA
- [ ] **Webdriver reset detection**: Track if `navigator.webdriver` changes mid-session
- [ ] **Evasion attempt logging**: Log these as separate events, bump tier if caught evading

### Return Visitor Tracking
- [ ] **IP fingerprint history**: Track if same IP returns after being flagged
- [ ] **Score delta tracking**: If they re-visit and score lower, they may be evading
- [ ] **Auto-escalation**: Returning flagged visitors get bumped to higher tier or auto-ban

### Error Handling & Resilience
- [ ] Add error boundaries around all module initialization in `audithole.js`
- [ ] Graceful degradation if KV store is unavailable (currently logs to console)
- [ ] Timeout handling for all `fetch()` calls to API endpoints
- [ ] Retry logic with exponential backoff for failed session logs

### Testing
- [ ] **CI pipeline**: Run `npm test` on every push/PR
- [ ] **E2E tests**: Playwright tests for full client-side flow (fingerprint → trap → log)
- [ ] **Edge function tests**: Unit tests for `_middleware.js` and API routes
- [ ] **Signal coverage tests**: Add tests for all fingerprint signals (currently ~60% coverage)

### Dashboard Improvements
- [ ] **Real-time updates**: SSE or polling for live session feed
- [ ] **Export**: CSV/JSON export of session data
- [ ] **Filtering**: Date range, country, tier, UA substring search
- [ ] **Pagination**: Handle >100 sessions gracefully
- [ ] **Dark/light mode toggle**
- [ ] **Mobile responsiveness pass**

---

## v1.1 — Enhanced Fingerprinting

### Additional Signals
- [ ] WebGL renderer/vendor fingerprinting (check for common VM renderers)
- [ ] Canvas fingerprinting resistance check (does `toDataURL()` return consistent/expected values?)
- [ ] AudioContext fingerprint (headless envs often lack or mock audio)
- [ ] Battery API absence (most real laptops have battery, VMs don't)
- [ ] Device memory (`navigator.deviceMemory`) vs. actual capacity
- [ ] Hardware concurrency vs. expected ( VMs often report 1-2 cores on beefy machines)

### Anti-Evasion
- [ ] Detect automation frameworks by `navigator.automationInfo` if present
- [ ] Check for `window.callPhantom` / `window._phantom` (PhantomJS remnants)
- [ ] Detect Puppeteer's `__PT_REGION__` or `__playwright_evaluate__` if exposed
- [ ] Check `navigator.permissions.query` behavior (some automations block this)

---

## v1.2 — Trap System Improvements

### Trap Enhancements
- [ ] **CSS trap zones**: Invisible interactive elements that break scraper parsing
- [ ] **Cloudflare Turnstile integration**: Challenge visitors on the fence (score 30-50) with Turnstile instead of just trapping
- [ ] **Adaptive trap density**: Adjust timer flood intensity based on session duration
- [ ] **Sticky traps**: Once a session is tier-1'd, don't let it re-initialize clean
- [ ] **Network tarpit option**: Optional slow-drain XHR to a `/api/hang` endpoint
- [ ] **Beacon suppression**: Block `navigator.sendBeacon` to external domains

### Trap Intelligence
- [ ] Track if a bot tries to clear cookies/localStorage (suspicious behavior)
- [ ] Detect headless mode by checking `navigator.plugins` more thoroughly (PDF.js, Flash, etc. absent in headless)
- [ ] Compare reported screen resolution vs. `window.innerWidth/innerHeight` (bots often mismatch)

---

## v1.5 — Cross-Site Funneling / Multi-Tenant Network

### The Concept
Allow other sites to embed a shared audithole.js that funnels bot fingerprints to a central hub, creating a **bot threat intelligence network**. Sites add one script tag and get protection + contribute to shared intelligence.

### How It Would Work
```
[site-a.com]  --> embeds audithole.js with ENDPOINT + SITE_ID --> [your audithole.com]
[site-b.com]  --> embeds same script                      --> [your audithole.com]
[site-c.com]  --> embeds same script                      --> [your audithole.com]

Result: One dashboard showing bot fingerprints from all sites
```

### Required Features
- [ ] **Multi-tenant API**: Accept sessions from any registered site
- [ ] **Site registration**: Simple "sign up" to get a site ID and custom script URL
- [ ] **Site identifier in sessions**: Every session tagged with which site it came from
- [ ] **Per-site dashboard views**: Filter by site, see site-specific stats
- [ ] **Aggregate stats page**: "X sites enrolled, Y total bots detected this month"
- [ ] **Revenue model** (optional): Free tier = 1 site, paid = unlimited
- [ ] **Script hosting**: Serve `/audithole.js` with configurable ENDPOINT baked in
- [ ] **Site revocation**: Ability to disable a site's API key if abused

### Privacy Considerations
- [ ] Sites only see their own data by default
- [ ] Aggregated threat intel is anonymous (no IPs, no UAs in shared data)
- [ ] Clear opt-in consent for sites joining the network
- [ ] GDPR/compliance documentation for multi-tenant setup

---

## v2.0 — Analytics & Insights

### Dashboard Analytics
- [ ] **Trend charts**: Bot detection rate over time (line chart)
- [ ] **Top UAs**: Most common user-agent strings flagged
- [ ] **Geographic heatmap**: Country distribution of flagged sessions
- [ ] **Tier breakdown**: Pie chart of T0/T1/T2/T3 distribution
- [ ] **Trap effectiveness**: Track returning sessions and whether they scored lower (indicating evasion attempts)

### Attribution System
- [ ] **Slug analytics**: Which attribution links are generating the most bot traffic
- [ ] **Campaign tracking**: Group slugs into campaigns/tags
- [ ] **Click-through rate**: Sessions that hit slug → actual page vs. bail-out rate

---

## v2.1 — Enterprise Features

### Rate Limiting & Throttling
- [ ] IP-based rate limiting on `/api/log` endpoint (prevent log flooding)
- [ ] Per-session event throttling (cap events per session to prevent abuse)
- [ ] Optional IP blocklist import (for known bad actors)

### Multi-Site Support
- [ ] Aggregate dashboard for multiple deployed AuditHole instances
- [ ] Unique site identifiers in session data
- [ ] Cross-site bot fingerprinting (optional, per-deployer consent)

### Alerting
- [ ] Email/webhook alerts when bot rate exceeds threshold
- [ ] Daily/weekly digest of flagged sessions
- [ ] Anomaly detection (sudden spike in T3 sessions)

---

## v3.0 — Advanced Detection

### ML-Based Scoring (Stretch)
- [ ] Collect aggregate signal data for model training
- [ ] Optional server-side model inference for uncertain scores
- [ ] Feedback loop: track which signals are most predictive

### Fingerprint Resistance
- [ ] Detect browser extensions that spoof signals (User-Agent Switcher, etc.)
- [ ] Correlate client-side score with server-side signals (TLSJA0, IP reputation)

---

## Plugin Ecosystem

### Official Plugins (planned)
- [ ] `official/slack-alerts` — Send session alerts to Slack channels
- [ ] `official/datadog` — Export metrics to Datadog
- [ ] `official/linear` — Create Linear issues for high-tier detections
- [ ] `official/ban-list-export` — Export blocklist in nginx/fail2ban compatible format

### Community Plugins (ideas)
- [ ] Cloudflare Turnstile integration
- [ ] reCAPTCHA v3 scoring correlation
- [ ] Shopify app integration
- [ ] WordPress plugin wrapper

---

## Documentation

- [ ] **Video walkthrough**: Deployment, configuration, dashboard walkthrough
- [ ] **Case studies**: Real-world examples of bot traffic detected
- [ ] **Troubleshooting guide**: Common deployment issues and fixes
- [ ] **Signal reference**: Detailed explanation of each fingerprinting signal
- [ ] **Signal explainability**: In-dashboard "why was this flagged" — explain each signal that fired and its weight (for non-technical stakeholder buy-in)

---

## Developer Experience

### One-Click Deploy
- [ ] **`npx audithole init`**: Scaffold a complete audithole deployment
- [ ] **Automated KV namespace creation**: via Wrangler API
- [ ] **Environment variable setup**: Guided prompts for secrets
- [ ] **One-command deploy**: `npx audithole deploy` that builds + deploys
- [ ] **GitHub Actions template**: Pre-configured CI for automatic deploys

### Self-Hosted Option
- [ ] **Docker image**: Single container with CF Functions emulator + KV (using Cloudflare's workers-sdk local mode or SQLite fallback)
- [ ] **Non-Cloudflare deployment**: Run audithole on any hosting provider
- [ ] **SQLite adapter**: Replace KV with a simple SQLite store for self-hosted
- [ ] **Docker Compose template**: One file to spin up the full stack

---

## Landing Page & Marketing

- [ ] **Dynamic real stats**: Query KV for actual session counts instead of fake numbers
- [ ] **Live honeypot demo**: Let visitors see their own fingerprint in real-time
- [ ] **"Deploy in 5 minutes" CTA**: Link directly to one-click init flow
- [ ] **Show your work**: Make the fake stats real or remove them entirely

---

## Non-Goals (What We Won't Build)

See [docs/ETHICS.md](docs/ETHICS.md) for the full list. The short version:

- ❌ Keystroke or form value logging
- ❌ Client-side DoS (crashing visitor processes)
- ❌ Cross-site persistent tracking
- ❌ Precise cursor coordinate logging
- ❌ Captcha-like puzzles (adversarial UX)
- ❌ Integration with surveillance or advertising platforms

---

*Last updated: 2025-08-17*
