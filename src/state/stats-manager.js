/**
 * src/state/stats-manager.js — Tokenmiser Stats Persistence
 * Tracks lifetime savings and session metrics per Task 1.1-H10.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'stats.json');

class StatsManager {
  constructor() {
    this.stats = this.load();
  }

  load() {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const loaded = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        if (!loaded.session) loaded.session = { models: {} };
        if (!loaded.lifetime) loaded.lifetime = { models: {} };
        return loaded;
      }
    } catch (_) {}

    return {
      session: {
        models: {}
      },
      lifetime: {
        models: {}
      },
      largestSessionDelta: 0,
      lastUpdate: new Date().toISOString()
    };
  }

  resetSession() {
    this.stats.session = { models: {} };
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

  recordCall({ model, actualTokens, actualCost, rawTokens, rawCost }) {
    const m = model || 'unknown';
    
    // Update Session
    if (!this.stats.session.models[m]) {
      this.stats.session.models[m] = { optimized: 0, notOptimized: 0, costEst: 0 };
    }
    const s = this.stats.session.models[m];
    s.optimized += (actualTokens || 0);
    s.notOptimized = NaN; // Per user instruction: NaN for now
    s.costEst += (actualCost || 0);

    // Update Lifetime
    if (!this.stats.lifetime.models[m]) {
      this.stats.lifetime.models[m] = { optimized: 0, notOptimized: 0, costEst: 0 };
    }
    const l = this.stats.lifetime.models[m];
    l.optimized += (actualTokens || 0);
    l.notOptimized = NaN; // Per user instruction: NaN for now
    l.costEst += (actualCost || 0);

    const delta = (rawCost || 0) - (actualCost || 0);
    if (!isNaN(delta) && delta > this.stats.largestSessionDelta) {
      this.stats.largestSessionDelta = delta;
    }

    this.stats.lastUpdate = new Date().toISOString();
    this.save();
  }

  getTotals(scope) {
    const data = this.stats[scope];
    let optimized = 0;
    let notOptimized = 0;
    let costEst = 0;
    Object.values(data.models).forEach(m => {
      optimized += m.optimized;
      notOptimized = NaN; // Per user instruction
      costEst += m.costEst;
    });
    return { optimized, notOptimized, costEst };
  }

  getCarbonImpact() {
    // 0.1g CO2 per 1,000 tokens stripped
    // Since notOptimized is NaN, impact is NaN for now
    return NaN;
  }
}

module.exports = new StatsManager();
