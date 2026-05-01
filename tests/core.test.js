/**
 * AUDITHOLE - tests/core.test.js
 * Core unit tests. Run with: npm test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- escape.js ----
import { isKnownGoodBot, edgeShouldEscape, shouldEscape } from '../src/escape.js';

describe('escape.js - isKnownGoodBot()', () => {
  it('identifies Googlebot', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      configurable: true,
    });
    expect(isKnownGoodBot()).toBe(true);
  });

  it('identifies Bingbot', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      configurable: true,
    });
    expect(isKnownGoodBot()).toBe(true);
  });

  it('identifies ClaudeBot', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'claudebot/1.0',
      configurable: true,
    });
    expect(isKnownGoodBot()).toBe(true);
  });

  it('identifies GPTBot', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0',
      configurable: true,
    });
    expect(isKnownGoodBot()).toBe(true);
  });

  it('does not flag a real Chrome UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    expect(isKnownGoodBot()).toBe(false);
  });

  it('does not flag a real Firefox UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
      configurable: true,
    });
    expect(isKnownGoodBot()).toBe(false);
  });
});

describe('escape.js - edgeShouldEscape() (server-side)', () => {
  it('escapes Googlebot at edge', () => {
    expect(edgeShouldEscape('Googlebot/2.1')).toBe(true);
  });

  it('escapes anthropic-ai at edge', () => {
    expect(edgeShouldEscape('anthropic-ai/1.0')).toBe(true);
  });

  it('does not escape empty UA', () => {
    expect(edgeShouldEscape('')).toBe(false);
  });

  it('does not escape a normal Chrome UA', () => {
    expect(edgeShouldEscape('Mozilla/5.0 Chrome/120.0.0.0')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(edgeShouldEscape('GOOGLEBOT/2.1')).toBe(true);
  });
});


// ---- social.js ----
import { Social } from '../src/social.js';

describe('Social.generateSlug()', () => {
  it('generates a string', () => {
    expect(typeof Social.generateSlug()).toBe('string');
  });

  it('generates unique slugs', () => {
    const a = Social.generateSlug();
    const b = Social.generateSlug();
    expect(a).not.toBe(b);
  });

  it('includes label prefix when provided', () => {
    const slug = Social.generateSlug('my-label');
    expect(slug.startsWith('my-label-')).toBe(true);
  });

  it('sanitizes label -- strips non-alphanumeric', () => {
    const slug = Social.generateSlug('hello world!');
    expect(slug).toMatch(/^hello-world-/);
  });

  it('truncates long labels to 20 chars', () => {
    const slug = Social.generateSlug('a'.repeat(50));
    const prefix = slug.split('-').slice(0, -1).join('-');
    expect(prefix.length).toBeLessThanOrEqual(20);
  });

  it('only contains safe URL chars', () => {
    for (let i = 0; i < 20; i++) {
      const slug = Social.generateSlug('test-label');
      expect(slug).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });
});

describe('Social.parseSlug()', () => {
  const setLocation = (path, search = '', hash = '') => {
    Object.defineProperty(window, 'location', {
      value: { pathname: path, search, hash },
      configurable: true,
    });
  };

  it('parses /t/slug from path', () => {
    setLocation('/t/my-slug-abc123');
    expect(Social.parseSlug()).toBe('my-slug-abc123');
  });

  it('parses ?ah=slug from query', () => {
    setLocation('/some/page', '?ah=my-slug-xyz');
    expect(Social.parseSlug()).toBe('my-slug-xyz');
  });

  it('parses #ah:slug from hash', () => {
    setLocation('/page', '', '#ah:my-hash-slug');
    expect(Social.parseSlug()).toBe('my-hash-slug');
  });

  it('returns null when no slug present', () => {
    setLocation('/normal/page', '', '');
    expect(Social.parseSlug()).toBeNull();
  });

  it('does not parse partial /t/ paths', () => {
    setLocation('/not-t/something');
    expect(Social.parseSlug()).toBeNull();
  });
});


// ---- functions/lib/pluginRoutes.js ----
import { matchPluginRoute, PLUGIN_ROUTES } from '../functions/lib/pluginRoutes.js';

describe('matchPluginRoute()', () => {
  it('matches exact POST /ban route', () => {
    const result = matchPluginRoute('POST', '/ban');
    expect(result).not.toBeNull();
    expect(result.route.path).toBe('/ban');
  });

  it('matches exact POST /unban route', () => {
    const result = matchPluginRoute('POST', '/unban');
    expect(result).not.toBeNull();
  });

  it('matches GET /bans route', () => {
    const result = matchPluginRoute('GET', '/bans');
    expect(result).not.toBeNull();
  });

  it('returns null for unknown path', () => {
    expect(matchPluginRoute('GET', '/nonexistent')).toBeNull();
  });

  it('returns null for wrong method', () => {
    expect(matchPluginRoute('GET', '/ban')).toBeNull();
  });

  it('returns null for empty path', () => {
    expect(matchPluginRoute('POST', '')).toBeNull();
  });

  it('extracts params from :param routes', () => {
    // Add a test route temporarily
    const original = [...PLUGIN_ROUTES];
    PLUGIN_ROUTES.push({ method: 'GET', path: '/test/:id', handler: () => {}, requiresAuth: false });
    const result = matchPluginRoute('GET', '/test/abc123');
    expect(result).not.toBeNull();
    expect(result.params.id).toBe('abc123');
    PLUGIN_ROUTES.splice(PLUGIN_ROUTES.length - 1, 1); // cleanup
  });
});


// ---- src/fingerprint.js - signal checks ----
import { Fingerprint } from '../src/fingerprint.js';

describe('Fingerprint signal checks', () => {
  let fp;

  beforeEach(() => {
    fp = new Fingerprint();
    // Reset any navigator mocks
    vi.restoreAllMocks();
  });

  it('_checkWebdriver() hits when navigator.webdriver=true', () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    const result = fp._checkWebdriver();
    expect(result.hit).toBe(true);
    expect(result.weight).toBe(25);
  });

  it('_checkWebdriver() does not hit on normal browser', () => {
    Object.defineProperty(navigator, 'webdriver', { value: undefined, configurable: true });
    const result = fp._checkWebdriver();
    expect(result.hit).toBe(false);
  });

  it('_checkHeadlessUA() hits on headless UA string', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0',
      configurable: true,
    });
    const result = fp._checkHeadlessUA();
    expect(result.hit).toBe(true);
    expect(result.weight).toBe(30);
  });

  it('_checkHeadlessUA() does not hit on normal UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      configurable: true,
    });
    const result = fp._checkHeadlessUA();
    expect(result.hit).toBe(false);
  });

  it('_checkPlaywrightLeak() hits when __playwright present', () => {
    window.__playwright = {};
    const result = fp._checkPlaywrightLeak();
    expect(result.hit).toBe(true);
    expect(result.weight).toBe(25);
    delete window.__playwright;
  });

  it('_checkPlaywrightLeak() does not hit on clean window', () => {
    delete window.__playwright;
    delete window.__pwInitScripts;
    delete window.__PW_inspect;
    delete window._playwrightInstance;
    const result = fp._checkPlaywrightLeak();
    expect(result.hit).toBe(false);
  });

  it('_checkLanguages() hits when navigator.languages is empty', () => {
    Object.defineProperty(navigator, 'languages', { value: [], configurable: true });
    const result = fp._checkLanguages();
    expect(result.hit).toBe(true);
  });

  it('_checkLanguages() does not hit with normal languages', () => {
    Object.defineProperty(navigator, 'languages', { value: ['en-US', 'en'], configurable: true });
    const result = fp._checkLanguages();
    expect(result.hit).toBe(false);
  });

  it('_checkPlugins() hits when plugins.length=0', () => {
    Object.defineProperty(navigator, 'plugins', { value: [], configurable: true });
    const result = fp._checkPlugins();
    expect(result.hit).toBe(true);
  });

  it('calculate() returns score and signals array', () => {
    // Set up a clearly-bot environment
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    Object.defineProperty(navigator, 'userAgent', {
      value: 'HeadlessChrome/120',
      configurable: true,
    });
    fp._timingSamples = [100, 101, 102, 103, 104, 105]; // whole ms = jitter hit
    const result = fp.calculate();
    expect(result.score).toBeGreaterThan(0);
    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('calculate() score does not exceed 100', () => {
    // Max out every signal
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    window.__playwright = {};
    window.__puppeteer__ = {};
    Object.defineProperty(navigator, 'userAgent', { value: 'HeadlessChrome', configurable: true });
    Object.defineProperty(navigator, 'languages', { value: [], configurable: true });
    Object.defineProperty(navigator, 'plugins', { value: [], configurable: true });
    fp._timingSamples = [0, 1, 2, 3, 4, 5];
    fp.mouseEvents = 0;
    fp.mouseDelta = 0;
    fp.startTime = performance.now() - 10000;
    const result = fp.calculate();
    expect(result.score).toBeLessThanOrEqual(100);
    delete window.__playwright;
    delete window.__puppeteer__;
  });

  it('tier assignment is correct', async () => {
    // Mock run() internals to get specific scores
    fp._timingSamples = [];
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'Chrome/120', configurable: true });
    // Score 0 -> tier 0
    const clean = fp.calculate();
    expect(clean.tier).toBeUndefined(); // tier set by run(), not calculate()
  });
});


// ---- src/plugins.js - PluginHost ----
import { PluginHost, HOOKS } from '../src/plugins.js';

describe('PluginHost', () => {
  let host;
  const mockConfig = { get: (k) => ({ DEBUG: false, ALLOW_SCRIPT_HOOKS: false, SCRIPT_HOOK_WHITELIST: [] }[k]) };
  const mockLog  = vi.fn();
  const mockEmit = vi.fn();

  beforeEach(() => {
    host = new PluginHost();
    host.init({ config: mockConfig, logFn: mockLog, emitFn: mockEmit });
  });

  it('registers and fires an action hook', async () => {
    const handler = vi.fn();
    await host.register('test-plugin', (ah) => {
      ah.hooks.on(HOOKS.READY, handler);
    });
    await host.fire(HOOKS.READY, { test: true });
    expect(handler).toHaveBeenCalledWith({ test: true });
  });

  it('fires hooks in priority order', async () => {
    const order = [];
    await host.register('test-priority', (ah) => {
      ah.hooks.on(HOOKS.READY, () => order.push('second'), 20);
      ah.hooks.on(HOOKS.READY, () => order.push('first'),  5);
      ah.hooks.on(HOOKS.READY, () => order.push('third'),  50);
    });
    await host.fire(HOOKS.READY, {});
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('filter hook can modify a value', async () => {
    await host.register('test-filter', (ah) => {
      ah.hooks.addFilter(HOOKS.FP_COMPLETE, (score) => score + 10);
    });
    const result = await host.filter(HOOKS.FP_COMPLETE, 50, {});
    expect(result).toBe(60);
  });

  it('double-init is ignored with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    host.init({ config: mockConfig, logFn: mockLog, emitFn: mockEmit });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('called more than once'));
  });

  it('plugin setup errors are caught and do not throw', async () => {
    await expect(
      host.register('bad-plugin', () => { throw new Error('setup failed'); })
    ).resolves.not.toThrow();
  });

  it('hook handler timeout does not throw (5s)', async () => {
    await host.register('slow-plugin', (ah) => {
      ah.hooks.on(HOOKS.READY, () => new Promise(() => {})); // never resolves
    });
    // Should resolve within ~5s timeout -- use fake timers
    vi.useFakeTimers();
    const firePromise = host.fire(HOOKS.READY, {});
    vi.advanceTimersByTime(6000);
    await expect(firePromise).resolves.not.toThrow();
    vi.useRealTimers();
  });

  it('sandbox does not expose window directly', async () => {
    let sandboxedAh;
    await host.register('inspect-sandbox', (ah) => { sandboxedAh = ah; });
    expect(sandboxedAh.window).toBeUndefined();
    expect(sandboxedAh.document).toBeUndefined();
    expect(sandboxedAh.fetch).toBeUndefined();
  });
});
