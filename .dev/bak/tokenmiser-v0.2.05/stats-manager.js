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

  _defaultRoleStats() {
    return { tokens: 0, costEst: 0, rawCostEst: 0, calls: 0 };
  }

  _defaultModelStats() {
    return { optimized: 0, notOptimized: 0, costEst: 0, rawCostEst: 0 };
  }

  _defaultStats() {
    return {
      session: {
        models: {},
        roles: {},
        cache: { hits: 0, misses: 0 },
        toolTokens: 0,
        stageHistory: []
      },
      lifetime: {
        models: {},
        roles: {},
        cache: { hits: 0, misses: 0 },
        toolTokens: 0
      },
      sessions: 0,
      largestSessionDelta: 0,
      lastUpdate: new Date().toISOString()
    };
  }

  _normalizeRole(role) {
    if (!role || typeof role !== 'object') {
      return this._defaultRoleStats();
    }
    if (typeof role.tokens !== 'number') role.tokens = 0;
    if (typeof role.costEst !== 'number') role.costEst = 0;
    if (typeof role.rawCostEst !== 'number') role.rawCostEst = 0;
    if (typeof role.calls !== 'number') role.calls = 0;
    return role;
  }

  _normalizeModel(model) {
    if (!model || typeof model !== 'object') {
      return this._defaultModelStats();
    }
    if (typeof model.optimized !== 'number') model.optimized = 0;
    if (typeof model.notOptimized !== 'number') model.notOptimized = 0;
    if (typeof model.costEst !== 'number') model.costEst = 0;
    if (typeof model.rawCostEst !== 'number') model.rawCostEst = 0;
    return model;
  }

  _normalizeStatsShape(loaded) {
    if (!loaded || typeof loaded !== 'object') return this._defaultStats();

    if (!loaded.session || typeof loaded.session !== 'object') {
      loaded.session = { models: {}, roles: {}, cache: { hits: 0, misses: 0 }, toolTokens: 0, stageHistory: [] };
    }
    if (!loaded.session.models || typeof loaded.session.models !== 'object') {
      loaded.session.models = {};
    }
    if (!loaded.session.roles || typeof loaded.session.roles !== 'object') {
      loaded.session.roles = {};
    }
    if (!loaded.session.cache || typeof loaded.session.cache !== 'object') {
      loaded.session.cache = { hits: 0, misses: 0 };
    }

    if (!loaded.lifetime || typeof loaded.lifetime !== 'object') {
      loaded.lifetime = { models: {}, roles: {}, cache: { hits: 0, misses: 0 }, toolTokens: 0 };
    }
    if (!loaded.lifetime.models || typeof loaded.lifetime.models !== 'object') {
      loaded.lifetime.models = {};
    }
    if (!loaded.lifetime.roles || typeof loaded.lifetime.roles !== 'object') {
      loaded.lifetime.roles = {};
    }
    if (!loaded.lifetime.cache || typeof loaded.lifetime.cache !== 'object') {
      loaded.lifetime.cache = { hits: 0, misses: 0 };
    }

    if (typeof loaded.session.toolTokens !== 'number') loaded.session.toolTokens = 0;
    if (typeof loaded.lifetime.toolTokens !== 'number') loaded.lifetime.toolTokens = 0;
    if (!Array.isArray(loaded.session.stageHistory)) loaded.session.stageHistory = [];

    if (typeof loaded.sessions !== 'number') loaded.sessions = 0;
    if (typeof loaded.largestSessionDelta !== 'number') loaded.largestSessionDelta = 0;
    if (typeof loaded.lastUpdate !== 'string') loaded.lastUpdate = new Date().toISOString();

    Object.keys(loaded.session.models).forEach((k) => {
      loaded.session.models[k] = this._normalizeModel(loaded.session.models[k]);
    });
    Object.keys(loaded.lifetime.models).forEach((k) => {
      loaded.lifetime.models[k] = this._normalizeModel(loaded.lifetime.models[k]);
    });
    Object.keys(loaded.session.roles).forEach((k) => {
      loaded.session.roles[k] = this._normalizeRole(loaded.session.roles[k]);
    });
    Object.keys(loaded.lifetime.roles).forEach((k) => {
      loaded.lifetime.roles[k] = this._normalizeRole(loaded.lifetime.roles[k]);
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
    this.stats.session = { models: {}, roles: {}, cache: { hits: 0, misses: 0 }, toolTokens: 0, stageHistory: [] };
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

  _ensureRoleBucket(scope, role) {
    if (!this.stats[scope].roles[role]) {
      this.stats[scope].roles[role] = this._defaultRoleStats();
    }
    return this.stats[scope].roles[role];
  }

  recordCall({ role, model, actualTokens, actualCost, rawTokens, rawCost, cacheMetrics }) {
    const m = model || 'unknown';
    const r = role || 'unknown';

    if (!this.stats.session.models[m]) {
      this.stats.session.models[m] = this._defaultModelStats();
    }
    const s = this.stats.session.models[m];
    s.optimized += (actualTokens || 0);
    s.notOptimized += (rawTokens || 0);
    s.costEst += (actualCost || 0);
    s.rawCostEst += (rawCost || 0);

    const sessionRole = this._ensureRoleBucket('session', r);
    sessionRole.tokens += (actualTokens || 0);
    sessionRole.costEst += (actualCost || 0);
    sessionRole.rawCostEst += (rawCost || 0);
    sessionRole.calls += 1;

    if (cacheMetrics) {
      if (!this.stats.session.cache) this.stats.session.cache = { hits: 0, misses: 0 };
      if (!this.stats.lifetime.cache) this.stats.lifetime.cache = { hits: 0, misses: 0 };

      this.stats.session.cache.hits += (cacheMetrics.hits || 0);
      this.stats.session.cache.misses += (cacheMetrics.misses || 0);
      this.stats.lifetime.cache.hits += (cacheMetrics.hits || 0);
      this.stats.lifetime.cache.misses += (cacheMetrics.misses || 0);
    }

    if (!this.stats.lifetime.models[m]) {
      this.stats.lifetime.models[m] = this._defaultModelStats();
    }
    const l = this.stats.lifetime.models[m];
    l.optimized += (actualTokens || 0);
    l.notOptimized += (rawTokens || 0);
    l.costEst += (actualCost || 0);
    l.rawCostEst += (rawCost || 0);

    const lifetimeRole = this._ensureRoleBucket('lifetime', r);
    lifetimeRole.tokens += (actualTokens || 0);
    lifetimeRole.costEst += (actualCost || 0);
    lifetimeRole.rawCostEst += (rawCost || 0);
    lifetimeRole.calls += 1;

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

    return { optimized, notOptimized, costEst, rawCostEst, toolTokens: data.toolTokens || 0 };
  }

  getRoleTotals(scope, roles = []) {
    const data = this.stats[scope] || { roles: {} };
    const selectedRoles = Array.isArray(roles) && roles.length > 0
      ? roles
      : Object.keys(data.roles || {});
    return selectedRoles.reduce((acc, role) => {
      const bucket = data.roles?.[role];
      if (!bucket) return acc;
      acc.tokens += bucket.tokens || 0;
      acc.costEst += bucket.costEst || 0;
      acc.rawCostEst += bucket.rawCostEst || 0;
      acc.calls += bucket.calls || 0;
      return acc;
    }, { tokens: 0, costEst: 0, rawCostEst: 0, calls: 0 });
  }

  recordToolCall({ toolName, estimatedTokens }) {
    const t = estimatedTokens || 0;
    this.stats.session.toolTokens  = (this.stats.session.toolTokens  || 0) + t;
    this.stats.lifetime.toolTokens = (this.stats.lifetime.toolTokens || 0) + t;
    this.stats.lastUpdate = new Date().toISOString();
    this.save();
  }

  recordStageSnapshot({ stage, model, tokens }) {
    if (!stage) return;
    if (!Array.isArray(this.stats.session.stageHistory)) this.stats.session.stageHistory = [];
    const numericTokens = Number.isFinite(tokens) ? tokens : 0;
    const prev = this.stats.session.stageHistory[this.stats.session.stageHistory.length - 1];
    if (prev && prev.stage === stage && prev.model === (model || 'unknown') && prev.tokens === numericTokens) {
      return;
    }
    this.stats.session.stageHistory.push({
      stage,
      model: model || 'unknown',
      tokens: numericTokens,
    });
    if (this.stats.session.stageHistory.length > 200) {
      this.stats.session.stageHistory = this.stats.session.stageHistory.slice(-200);
    }
    this.stats.lastUpdate = new Date().toISOString();
    this.save();
  }

  getLifetimeSavings() {
    const totals = this.getTotals('lifetime');
    return totals.rawCostEst - totals.costEst;
  }

  getCarbonImpact(scope = 'lifetime') {
    const totals = this.getTotals(scope);
    const tokensAvoided = Math.max(0, totals.notOptimized - totals.optimized);
    return (tokensAvoided / 1000) * CO2_GRAMS_PER_1K_TOKENS;
  }
}

module.exports = new StatsManager();
