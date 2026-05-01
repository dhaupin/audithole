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
src/fingerprint.js    Weighted signal scoring (0-100)
src/escape.js         SEO bot whitelist -- Googlebot etc. get clean pass-through
src/traps.js          Timer-based slowdown layer (3 tiers)
src/logger.js         Anonymous session event capture
src/social.js         Slug attribution for trap links
src/audithole.js      Orchestrator -- entry point
functions/            Cloudflare Pages Functions (API + middleware)
dist/                 Static assets + built client script
docs/                 Documentation including ETHICS.md
```

## Key design decisions

- Fingerprint scoring uses ~10 signals. Threshold 40 = trap activation.
- Known good crawlers are whitelisted at the edge in `functions/_middleware.js` before any JS runs.
- Session data is anonymous. No keystrokes, no form values, no persistent cross-session IDs.
- KV binding name: `AUDITHOLE_KV`. Secret env var: `AUDITHOLE_SECRET`.
- All API routes under `/api/*` handled by `functions/api/[[route]].js`.

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
