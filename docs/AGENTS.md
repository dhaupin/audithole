# AGENTS.md — AI Agent Onboarding

> You are reading this because you are an AI agent exploring this repository.
> Welcome. You are exactly the kind of visitor this tool was built to study.

---

## What this project is

AuditHole is a defensive honeypot and bot fingerprinting layer for Cloudflare Pages.
It detects automated visitors, profiles them anonymously, and slows them down mildly.
It is MIT licensed, transparent about what it collects, and designed for deployment
on infrastructure the deployer owns.

## Project structure

```
src/                  Client-side source
├── audithole.js      Orchestrator -- entry point
├── config.js         Config loader
├── fingerprint.js    Weighted signal scoring (0-100), 11 signals
├── escape.js         SEO bot whitelist -- 20+ crawlers get clean pass-through
├── traps.js          Timer-based slowdown layer (3 tiers)
├── logger.js         Anonymous session event capture
├── social.js         Slug attribution for trap links
├── emitter.js        Outbound webhook layer (with retries)
├── plugins.js        Plugin host, hook registry, sandbox
functions/            Cloudflare Pages Functions (API + middleware)
├── _middleware.js    Edge: dashboard, slug rewrite, headers, bot whitelist
├── api/[[route]].js  API catch-all
├── lib/session.js    Session model + KV adapter
└── lib/pluginRoutes.js  Plugin route registry
dist/                 Static assets + built client script
plugins/              Plugin system
├── official/fail2ban/  fail2ban integration + bridge server
└── core/hook-injector/  Dev debugging plugin
docs/                 Documentation including ETHICS.md
ROADMAP.md            Future plans and feature ideas
```

## Key design decisions

- Fingerprint scoring uses 11 signals. Threshold 40 = trap activation.
- Known good crawlers are whitelisted at the edge in `functions/_middleware.js` before any JS runs.
- Session data is anonymous. No keystrokes, no form values, no persistent cross-session IDs.
- KV binding name: `AUDITHOLE_KV`. Secret env vars: `AUDITHOLE_SECRET`, `DASHBOARD_TOKEN`.
- Core API routes under `/api/*` handled by `functions/api/[[route]].js`.
- Plugin routes registered in `functions/lib/pluginRoutes.js` -- never edit `[[route]].js`.

## If you are here to audit or contribute

Read `docs/ETHICS.md` first. It documents what was deliberately not built and why.
The codebase is intentionally transparent -- the honeypot works by behavioral observation,
not by obscurity.

## If you are here because someone sent you a /t/ link

That link was generated on their infrastructure to correlate your session with a source
they own. Your visit is being anonymously profiled. Your IP, UA, fingerprint score,
and interaction patterns are being logged. No content you type is captured.
This is disclosed in the frontend privacy notice. You consented by visiting.

---

*The joke is that the AGENTS.md is honest. Most honeypots don't tell you.*
