# ETHICS.md — What We Built, What We Didn't, and Why

AuditHole is a defensive honeypot. Like fail2ban, mod_security, or Cloudflare Bot Management,
it observes and profiles automated visitors on infrastructure you own. This document is explicit
about the design decisions made during development -- including the things we deliberately left out.

---

## What this tool is for

- Detecting headless agents and scrapers hitting your own sites
- Logging anonymous behavioral profiles of automated visitors
- Slowing down (not crashing) automated processes with timer-based quiescence prevention
- Attribution of sessions back to sources on your own properties via slug links

## What this tool is not for

- Targeting individuals or third parties you do not have a relationship with
- Deploying trap links to people outside your own user base / infrastructure
- Any use against systems you do not own or have permission to profile

---

## The things we deliberately did not implement

During development, several technically feasible mechanisms were discussed and rejected.
They are documented here so that:

1. You understand where the line is
2. If you fork this and add them, you do so with full awareness of the implications

### Keystroke and form value logging

It is technically trivial to intercept `keydown` events and `input` change events and
log what a visitor types. We did not do this.

**Why:** Even if the visitor is a bot, the mechanism is indistinguishable from a keylogger.
As a general-release MIT tool, including this would mean anyone deploying it could harvest
typed content from real users. The defensive value does not justify the risk.
Bot behavior is profiled adequately through behavioral signals without capturing content.

### Client-side DoS mechanisms

The "hanging XHR + DOM mutation loop" combination -- where a persistent open connection
prevents `networkIdle` from resolving and a MutationObserver cascade burns CPU -- was
discussed and trimmed.

**Why:** There is a meaningful difference between *observing* a visitor and *crashing their process*.
A honeypot observes. Intentionally crashing a browser context (even a headless one) is
closer to a client-side denial-of-service attack. As a general MIT release, that mechanism
could be used against real users or mispointed at browsers that aren't bots.
The timer flood (Tier 1-3) achieves the legitimate goal -- slowing down agents that wait
for quiescence -- without crossing into crash territory.

### Precise cursor coordinate logging

Heat maps by precise X/Y coordinates were considered. We log click *zones* (top/mid/bot,
left/right) instead.

**Why:** Precise coordinate streams are a known fingerprinting vector for identifying
individuals across sessions. Zone-level data gives you the same behavioral insight
(did they click the form, did they click the nav, did they click nothing) without
building a per-user movement profile.

### Persistent cross-session fingerprinting

Storing a long-lived cookie or localStorage token to track the same visitor across
multiple sessions was considered.

**Why:** That is user tracking, not bot detection. Session-scoped profiling is sufficient
for honeypot purposes. We do not set persistent identifiers.

---

## The zone between defense and offense

Honeypot tooling exists on a spectrum. At one end: logging that a bot hit your `/wp-admin`
trap route. At the other end: actively crashing visitor processes or harvesting their data.

AuditHole sits firmly at the defensive end. The design principle is:

> **Observe and slow. Do not crash. Do not harvest content. Do not track individuals.**

If you are considering adding mechanisms beyond what is in this codebase, ask:

- Does this crash or destroy something on the visitor's end? (Don't.)
- Does this capture content the visitor typed or intended to keep private? (Don't.)
- Does this track individuals across sessions or sites? (Don't.)
- Does this target people who are not voluntarily interacting with your infrastructure? (Don't.)

---

## Legal considerations

This document is not legal advice. Honeypot legality varies by jurisdiction.

General principles:
- Profiling visitors to your own site is generally legal in most jurisdictions when disclosed (see the Privacy Notice on the frontend)
- IP logging is standard web server practice
- Intentionally crashing a visitor's browser process may implicate computer fraud statutes in some jurisdictions even if the visitor is a bot -- which is one reason we did not implement it
- Slug attribution links sent to users of your own service (e.g. a support link) are standard honeypot practice; cold-sending trap links to arbitrary third parties is not

Read your jurisdiction's relevant laws. When in doubt, stay on the observe-and-log side of the line.

---

*Built with the belief that defensive tooling should be transparent about what it does and doesn't do.*
