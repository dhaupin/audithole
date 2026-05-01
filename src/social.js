/**
 * AUDITHOLE - social.js
 * Slug-based attribution for trap links on YOUR OWN PROPERTIES.
 *
 * Use case: you run a contact form, a comment section, a community.
 * You suspect a specific account or IP is a bot/spammer.
 * You send them a link to a page on your own site (e.g. /t/support-req-42).
 * That slug lets you correlate sessions back to the originating context.
 *
 * This is a standard honeypot technique. It is for defensive use
 * on infrastructure you own and control. Do not generate trap links
 * to send cold to arbitrary third parties -- that is not what this is for.
 */

export class Social {
  /**
   * Parse slug from current URL if present.
   * Supports:
   *   /t/my-slug
   *   ?ah=my-slug
   *   #ah:my-slug
   */
  static parseSlug() {
    // Path-based: /t/slug
    const pathMatch = window.location.pathname.match(/^\/t\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

    // Query param: ?ah=slug
    const params = new URLSearchParams(window.location.search);
    if (params.has('ah')) return params.get('ah');

    // Hash: #ah:slug
    const hashMatch = window.location.hash.match(/^#ah:([a-zA-Z0-9_-]+)/);
    if (hashMatch) return hashMatch[1];

    return null;
  }

  /**
   * Generate a new slug for a trap link.
   * Call server-side via /api/slug/create for persistent storage.
   * Client-side generation is for preview only.
   */
  static generateSlug(label = '') {
    const rand = Math.random().toString(36).slice(2, 8);
    const ts = Date.now().toString(36).slice(-4);
    const prefix = label
      ? label.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20) + '-'
      : '';
    return `${prefix}${rand}${ts}`;
  }

  /**
   * Build a trap URL for a given slug and base path.
   */
  static buildURL(slug, basePath = '/t/') {
    const base = window.location.origin;
    return `${base}${basePath}${slug}`;
  }
}
