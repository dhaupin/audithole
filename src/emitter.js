/**
 * AUDITHOLE - src/emitter.js
 * Outbound event emitter. Used by plugins to fire webhooks,
 * ban events, alerts, etc. All external IO goes through here.
 *
 * Plugins call ah.emit(event, payload) which routes here.
 * The emitter handles retries, timeouts, and rate limiting.
 *
 * Supported built-in event types:
 *   outbound:webhook   -- generic HTTP POST to a URL
 *   outbound:ban       -- ban signal (ip, score, signals, note)
 *   outbound:unban     -- unban signal (ip, note)
 *   outbound:alert     -- alert signal (message, severity)
 *
 * Plugins can define their own event types -- they just won't
 * get built-in routing. Use outbound:webhook for custom events.
 */

export class Emitter {
  constructor(config) {
    this._config = config;
    this._queue = [];
    this._sending = false;
    this._sent = 0;
    this._failed = 0;
  }

  /**
   * Fire an outbound event.
   * @param {string} event - canonical event name (see HOOKS.OUTBOUND_*)
   * @param {object} payload
   */
  async emit(event, payload = {}) {
    const item = { event, payload, ts: Date.now(), retries: 0 };
    this._queue.push(item);
    this._drain();
  }

  async _drain() {
    if (this._sending) return;
    this._sending = true;

    while (this._queue.length > 0) {
      const item = this._queue.shift();
      await this._dispatch(item);
    }

    this._sending = false;
  }

  async _dispatch(item) {
    const maxRetries = this._config.get('WEBHOOK_MAX_RETRIES');
    const timeout = this._config.get('WEBHOOK_TIMEOUT_MS');

    // Route built-in event types
    switch (item.event) {
      case 'outbound:webhook':
        await this._post(item, timeout, maxRetries);
        break;
      case 'outbound:ban':
        // Default: log to /api/ban on the same origin
        // Plugins can override by hooking OUTBOUND_BAN
        await this._post({
          ...item,
          payload: {
            url: '/api/ban',
            body: item.payload,
          }
        }, timeout, maxRetries);
        break;
      case 'outbound:unban':
        await this._post({
          ...item,
          payload: {
            url: '/api/unban',
            body: item.payload,
          }
        }, timeout, maxRetries);
        break;
      case 'outbound:alert':
        // Default: log to console. Plugins override via webhook.
        if (this._config.get('DEBUG')) {
          console.warn('[AUDITHOLE] Alert:', item.payload);
        }
        break;
      default:
        // Unknown event type -- pass to any registered plugin handlers
        if (this._config.get('DEBUG')) {
          console.log('[AUDITHOLE] Unrouted emit:', item.event, item.payload);
        }
    }
  }

  async _post(item, timeout, maxRetries) {
    const { url, body, headers = {} } = item.payload;
    if (!url) return;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ ...body, _ah_event: item.event, _ah_ts: item.ts }),
          signal: controller.signal,
          keepalive: true,
        });

        clearTimeout(timer);

        if (res.ok) {
          this._sent++;
          return;
        }

        // Non-2xx -- retry if attempts remain
        if (attempt >= maxRetries) this._failed++;

      } catch (e) {
        if (attempt >= maxRetries) {
          this._failed++;
          if (this._config.get('DEBUG')) {
            console.warn('[AUDITHOLE] Emit failed:', url, e.message);
          }
        }
        // Exponential backoff before retry
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }
  }

  stats() {
    return { sent: this._sent, failed: this._failed, queued: this._queue.length };
  }
}
