# AUDITHOLE Plugin System

## Overview

AuditHole exposes a plugin API that lets you hook into the fingerprint lifecycle,
session events, trap activation, and outbound events. Plugins are sandboxed --
they can read session data and fire outbound events through the `ah` API, but they
cannot directly access `window`, `document`, or `fetch`.

---

## Plugin registration

Before `audithole.min.js` loads, declare plugins on `window`:

```html
<script>
window.__AUDITHOLE_PLUGINS = [
  {
    id: 'my-plugin',
    setup: function(ah) {
      ah.hooks.on(ah.hooks.HOOKS.FP_COMPLETE, function(result) {
        if (result.score > 60) {
          ah.emit('outbound:alert', { message: 'High score: ' + result.score, severity: 'warn' });
        }
      });
    }
  }
];
</script>
<script src="/audithole.min.js" data-endpoint="/api/log" defer></script>
```

Or as an ES module import:

```html
<script type="module">
import { myPluginSetup } from '/plugins/my-plugin/index.js';
window.__AUDITHOLE_PLUGINS = [{ id: 'my-plugin', setup: myPluginSetup }];
</script>
<script src="/audithole.min.js" defer></script>
```

---

## Plugin API (`ah` object)

### `ah.hooks`

| Method | Description |
|---|---|
| `ah.hooks.on(event, fn, priority?, pluginId?)` | Register action hook |
| `ah.hooks.off(event, fn)` | Remove action hook |
| `ah.hooks.addFilter(event, fn, priority?, pluginId?)` | Register filter hook (must return value) |
| `ah.hooks.list()` | List all registered hooks |
| `ah.hooks.HOOKS` | Frozen object of all canonical hook names |

### `ah.session`

| Method | Description |
|---|---|
| `ah.session.get()` | Frozen snapshot of current session (read only) |

### `ah.fingerprint`

| Method | Description |
|---|---|
| `ah.fingerprint.getScore()` | Current fingerprint score (0-100) |
| `ah.fingerprint.getTier()` | Current trap tier (0-3) |

### `ah.config`

| Method | Description |
|---|---|
| `ah.config.get(key)` | Read a config value |

### `ah.emit(event, payload)`

Fire an outbound event. Built-in routing for:
- `outbound:webhook` -- POST to `payload.url`
- `outbound:ban` -- POST to `/api/ban`
- `outbound:unban` -- POST to `/api/unban`
- `outbound:alert` -- logged, or forwarded if webhook configured

### `ah.log(type, data)`

Write a typed entry to the session event log.

---

## Hook reference

See `src/plugins.js` for the full `HOOKS` constant, or use `ah.hooks.HOOKS` at runtime.

| Hook | When | Payload |
|---|---|---|
| `audithole:init` | Before fingerprint | `{ slug, config }` |
| `audithole:ready` | After everything | `{ result, slug }` |
| `fingerprint:start` | Observation window opens | `{}` |
| `fingerprint:signal` | Per signal detected | `{ signal, weight, hit }` |
| `fingerprint:complete` | Score calculated | `{ score, signals, tier }` |
| `session:create` | New session | session object |
| `session:flush` | Data sent to server | payload object |
| `trap:evaluate` | Before tier decision | `{ score, signals, tier }` |
| `trap:activate` | Trap is live | `{ tier, score }` |
| `trap:tier_change` | Tier escalated | `{ from, to }` |
| `interaction:click` | Click event | `{ zone }` |
| `interaction:scroll` | Scroll depth | `{ depth }` |
| `interaction:pageview` | Page view | `{ path }` |
| `attribution:slug_hit` | /t/slug URL hit | `{ slug }` |
| `outbound:ban` | Ban emitted | `{ score, signals, note }` |
| `outbound:unban` | Unban emitted | `{ ip, note }` |
| `outbound:alert` | Alert emitted | `{ message, severity }` |

Filter hooks (use `addFilter`, must return value):
- `fingerprint:complete` -- can modify the final score

---

## Script hooks (legacy mode)

For devops who want to paste a quick script without writing a full plugin.

**Enable in config (opt-in, disabled by default):**

```js
window.__AUDITHOLE_CONFIG = {
  ALLOW_SCRIPT_HOOKS: true,
  SCRIPT_HOOK_WHITELIST: ['https://yourdomain.com'], // lock to your origin
};
```

**Then inject scripts:**

```js
window.__AUDITHOLE_SCRIPT_HOOKS = [`
  ah.hooks.on('fingerprint:complete', function(result) {
    if (result.score > 70) {
      ah.emit('outbound:webhook', {
        url: 'https://your-server.com/webhook',
        body: { score: result.score, signals: result.signals }
      });
    }
  });
`];
```

**Security model:**
- Scripts run with `new Function('ah', script)` -- `ah` is the only variable in scope
- `window`, `document`, `fetch` are not available inside the script string
- 5 second execution timeout
- If `SCRIPT_HOOK_WHITELIST` is set, only matching origins can register scripts
- **Do not enable `ALLOW_SCRIPT_HOOKS` if you have untrusted third-party scripts on the same page**

See `docs/ETHICS.md` for full security implications.

---

## Official plugins

### `core/hook-injector`
Development onboarding plugin. Registers a console.log handler on every hook.
Shows payload shapes. Disable in production.

### `official/fail2ban`
Fires ban events to a fail2ban bridge server when fingerprint score exceeds threshold (default 70).
Includes a Node.js bridge server to run alongside fail2ban.
Handles unban callbacks when fail2ban expires bans.

---

## Building your own plugin

Minimal example:

```js
// plugins/my-plugin/index.js
export function myPluginSetup(ah) {
  const HOOKS = ah.hooks.HOOKS;

  ah.hooks.on(HOOKS.TRAP_ACTIVATE, async (payload) => {
    // Fire a webhook when a trap activates
    await ah.emit('outbound:webhook', {
      url: 'https://my-server.com/trap-alert',
      body: {
        tier: payload.tier,
        score: payload.score,
        session: ah.session.get(),
      },
    });
  }, 10, 'my-plugin');
}
```

Register it:
```html
<script type="module">
import { myPluginSetup } from '/plugins/my-plugin/index.js';
window.__AUDITHOLE_PLUGINS = [{ id: 'my-plugin', setup: myPluginSetup }];
</script>
```

That's it. See `plugins/core/hook-injector/index.js` for the full annotated example.
