/**
 * src/state/stats-manager.js — Tokenmiser Stats Persistence
 * Tracks lifetime savings and session metrics per Task 1.1-H10.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'stats.json');
const CO2_GRAMS_PER_1K_TOKENS = 0.1;

class StatsManager {
  constructor() {
    this.stats = this.load();
  }

  _defaultStats() {
    return {
      session: {
        models: {},
        cache: { hits: 0, misses: 0 }
      },
      lifetime: {
        models: {},
        cache: { hits: 0, misses: 0 }
      },
      sessions: 0,
      largestSessionDelta: 0,
      lastUpdate: new Date().toISOString()
    };
  }

  _normalizeStatsShape(loaded) {
    if (!loaded || typeof loaded !== 'object') return this._defaultStats();

    if (!loaded.session || typeof loaded.session !== 'object') {
      loaded.session = { models: {}, cache: { hits: 0, misses: 0 } };
    }
    if (!loaded.session.models || typeof loaded.session.models !== 'object') {
      loaded.session.models = {};
    }
    if (!loaded.session.cache || typeof loaded.session.cache !== 'object') {
      loaded.session.cache = { hits: 0, misses: 0 };
    }

    if (!loaded.lifetime || typeof loaded.lifetime !== 'object') {
      loaded.lifetime = { models: {}, cache: { hits: 0, misses: 0 } };
    }
    if (!loaded.lifetime.models || typeof loaded.lifetime.models !== 'object') {
      loaded.lifetime.models = {};
    }
    if (!loaded.lifetime.cache || typeof loaded.lifetime.cache !== 'object') {
      loaded.lifetime.cache = { hits: 0, misses: 0 };
    }

    if (typeof loaded.sessions !== 'number') loaded.sessions = 0;
    if (typeof loaded.largestSessionDelta !== 'number') loaded.largestSessionDelta = 0;
    if (typeof loaded.lastUpdate !== 'string') loaded.lastUpdate = new Date().toISOString();

    const normalizeModel = (model) => {
      if (!model || typeof model !== 'object') {
        return { optimized: 0, notOptimized: 0, costEst: 0, rawCostEst: 0 };
      }
      if (typeof model.optimized !== 'number') model.optimized = 0;
      if (typeof model.notOptimized !== 'number') model.notOptimized = 0;
      if (typeof model.costEst !== 'number') model.costEst = 0;
      if (typeof model.rawCostEst !== 'number') model.rawCostEst = 0;
      return model;
    };

    Object.keys(loaded.session.models).forEach((k) => {
      loaded.session.models[k] = normalizeModel(loaded.session.models[k]);
    });
    Object.keys(loaded.lifetime.models).forEach((k) => {
      loaded.lifetime.models[k] = normalizeModel(loaded.lifetime.models[k]);
    });

    return loaded;
  }

  load() {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const loaded = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        return this._normalizeStatsShape(loaded);
      }
    } catch (_) {}

    return this._defaultStats();
  }

  resetSession() {
    this.stats.session = { models: {}, cache: { hits: 0, misses: 0 } };
    this.save();
  }

  save() {
    try {
      const dir = path.dirname(STATS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2), 'utf8');
    } catch (e) {
      console.error('[StatsManager] Failed to save stats:', e.message);
    }
  }

  recordCall({ model, actualTokens, actualCost, rawTokens, rawCost, cacheMetrics }) {
    const m = model || 'unknown';

    if (!this.stats.session.models[m]) {
      this.stats.session.models[m] = { optimized: 0, notOptimized: 0, costEst: 0, rawCostEst: 0 };
    }
    const s = this.stats.session.models[m];
    s.optimized += (actualTokens || 0);
    s.notOptimized += (rawTokens || 0);
    s.costEst += (actualCost || 0);
    s.rawCostEst += (rawCost || 0);

    if (cacheMetrics) {
      if (!this.stats.session.cache) this.stats.session.cache = { hits: 0, misses: 0 };
      if (!this.stats.lifetime.cache) this.stats.lifetime.cache = { hits: 0, misses: 0 };

      this.stats.session.cache.hits += (cacheMetrics.hits || 0);
      this.stats.session.cache.misses += (cacheMetrics.misses || 0);
      this.stats.lifetime.cache.hits += (cacheMetrics.hits || 0);
      this.stats.lifetime.cache.misses += (cacheMetrics.misses || 0);
    }

    if (!this.stats.lifetime.models[m]) {
      this.stats.lifetime.models[m] = { optimized: 0, notOptimized: 0, costEst: 0, rawCostEst: 0 };
    }
    const l = this.stats.lifetime.models[m];
    l.optimized += (actualTokens || 0);
    l.notOptimized += (rawTokens || 0);
    l.costEst += (actualCost || 0);
    l.rawCostEst += (rawCost || 0);

    const delta = (rawCost || 0) - (actualCost || 0);
    if (Number.isFinite(delta) && delta > this.stats.largestSessionDelta) {
      this.stats.largestSessionDelta = delta;
    }

    this.stats.lastUpdate = new Date().toISOString();
    this.save();
  }

  getTotals(scope) {
    const data = this.stats[scope] || { models: {} };
    let optimized = 0;
    let notOptimized = 0;
    let costEst = 0;
    let rawCostEst = 0;

    Object.values(data.models).forEach((m) => {
      optimized += (m.optimized || 0);
      notOptimized += (m.notOptimized || 0);
      costEst += (m.costEst || 0);
      rawCostEst += (m.rawCostEst || 0);
    });

    return { optimized, notOptimized, costEst, rawCostEst };
  }

  getCarbonImpact(scope = 'lifetime') {
    const totals = this.getTotals(scope);
    const tokensAvoided = Math.max(0, totals.notOptimized - totals.optimized);
    return (tokensAvoided / 1000) * CO2_GRAMS_PER_1K_TOKENS;
  }
}

module.exports = new StatsManager();
