/**
 * AUDITHOLE - escape.js
 * Whitelist known legitimate crawlers so they NEVER hit traps.
 * SEO impact: zero. Googlebot gets clean pass-through always.
 */

const GOOD_BOTS = [
  'googlebot',
  'bingbot',
  'slurp',           // Yahoo
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'facebot',
  'ia_archiver',     // Internet Archive
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'dotbot',
  'rogerbot',
  'linkedinbot',
  'twitterbot',
  'applebot',
  'petalbot',
  'bytespider',
  'gptbot',          // OpenAI
  'claudebot',       // Anthropic
  'anthropic-ai',
  'ccbot',           // Common Crawl
  'chrome-lighthouse',
];

/**
 * Check UA string against known good bot list.
 * Called client-side as a final safety net.
 * Primary check is in _middleware.js at edge.
 */
export function isKnownGoodBot() {
  const ua = navigator.userAgent.toLowerCase();
  return GOOD_BOTS.some(bot => ua.includes(bot));
}

/**
 * Check if this looks like a prerender / SSR context.
 * Prerender services should get clean output.
 */
export function isPrerenderContext() {
  return !!(
    window.__PRERENDER_INJECTED ||
    navigator.userAgent.includes('Prerender') ||
    document.documentElement.hasAttribute('data-prerender')
  );
}

/**
 * Master escape check. If true, audithole does nothing.
 */
export function shouldEscape() {
  return isKnownGoodBot() || isPrerenderContext();
}

/**
 * Edge-side UA check (used in _middleware.js, no DOM available).
 * @param {string} ua - User-Agent header value
 */
export function edgeShouldEscape(ua = '') {
  const lower = ua.toLowerCase();
  return GOOD_BOTS.some(bot => lower.includes(bot));
}
