/**
 * AUDITHOLE - src/audithole.js
 * Main orchestrator. Drop dist/audithole.min.js into any HTML page.
 *
 * Plugin registration (before script loads, in audithole.config.js):
 *   window.__AUDITHOLE_CONFIG = { ... }
 *   window.__AUDITHOLE_PLUGINS = [
 *     { id: 'my-plugin', setup: (ah) => { ah.hooks.on('fingerprint:complete', fn) } }
 *   ]
 *   window.__AUDITHOLE_SCRIPT_HOOKS = [ 'ah.hooks.on("fingerprint:complete", ...)' ]
 */

import { Config }       from './config.js';
import { Fingerprint }  from './fingerprint.js';
import { shouldEscape } from './escape.js';
import { TrapEngine }   from './traps.js';
import { Logger }       from './logger.js';
import { Social }       from './social.js';
import { pluginHost, HOOKS } from './plugins.js';
import { Emitter }      from './emitter.js';

(async function AUDITHOLE() {

  // 1. SEO escape
  if (shouldEscape()) return;

  // 2. Config
  const config = new Config().load();
  const debug = config.get('DEBUG');

  // 3. Emitter
  const emitter = new Emitter(config);

  // 4. Logger
  const slug = Social.parseSlug();
  const logger = new Logger({ slug, endpoint: config.get('ENDPOINT') });
  logger.attachListeners();
  logger.attachBeforeUnload();
  logger.recordPageView();

  // 5. Plugin host
  if (config.get('PLUGINS_ENABLED')) {
    pluginHost.init({
      config: config.asReadOnly(),
      logFn:  (type, data) => logger.record(type, data),
      emitFn: (event, payload) => emitter.emit(event, payload),
    });

    for (const p of (window.__AUDITHOLE_PLUGINS || [])) {
      if (p && p.id && typeof p.setup === 'function') {
        await pluginHost.register(p.id, p.setup);
      }
    }

    for (const script of (window.__AUDITHOLE_SCRIPT_HOOKS || [])) {
      if (typeof script === 'string') await pluginHost.registerScript(script);
    }
  }

  // 6. Init hook
  await pluginHost.fire(HOOKS.INIT, { slug, config: config.getAll() });

  // 7. Fingerprint
  await pluginHost.fire(HOOKS.FP_START, {});

  const fp = new Fingerprint();
  fp.onSignal = async (signal) => pluginHost.fire(HOOKS.FP_SIGNAL, signal);

  const result = await fp.run(config.get('WINDOW_MS'), config.get('THRESHOLD'));

  // Plugins may filter the score
  const filteredScore = await pluginHost.filter(HOOKS.FP_COMPLETE, result.score, result);
  if (filteredScore !== result.score) {
    result.score = filteredScore;
    result.tier  = result.score >= 90 ? 3 : result.score >= 70 ? 2 : result.score >= 40 ? 1 : 0;
  }

  pluginHost.updateFingerprint(result.score, result.tier);
  if (debug) console.log('[AUDITHOLE] fingerprint:', result);

  logger.recordFingerprint(result);
  await pluginHost.fire(HOOKS.FP_COMPLETE, result);

  // 8. Traps
  await pluginHost.fire(HOOKS.TRAP_EVALUATE, result);

  if (result.tier > 0) {
    logger.recordTrapActivation(result.tier);
    const traps = new TrapEngine();
    traps.activate(result.tier);
    await pluginHost.fire(HOOKS.TRAP_ACTIVATE, { tier: result.tier, score: result.score });
    if (debug) {
      window.__audithole_deactivate = () => traps.deactivate();
    }
  }

  // 9. Slug hook
  if (slug) await pluginHost.fire(HOOKS.SLUG_HIT, { slug });

  // 10. Flush + ready
  await logger.flush();
  await pluginHost.fire(HOOKS.READY, { result, slug });

  if (debug) {
    console.log('[AUDITHOLE] ready. plugins:', pluginHost.listPlugins().map(p => p.id));
    window.__audithole = { pluginHost, logger, emitter, config };
  }

})();
