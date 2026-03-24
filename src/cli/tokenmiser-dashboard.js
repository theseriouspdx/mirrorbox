'use strict';

const statsManager = require('../state/stats-manager');

const R = '\x1b[0m';
const G = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

class TokenmiserDashboard {
  constructor() {
    this.overlayActive = false;
  }

  _formatMoney(v, precision = 6) {
    return Number.isFinite(v) ? v.toFixed(precision) : '0.000000';
  }

  _fmtInt(v) {
    return String(Number.isFinite(v) ? Math.round(v) : 0);
  }

  _getRollup(scope) {
    try {
      return statsManager.getRoutingSavings(scope);
    } catch {
      return null;
    }
  }

  _hasRollupData(rollup) {
    return !!(rollup && Array.isArray(rollup.byModel) && rollup.byModel.length > 0);
  }

  _getTotals(scope) {
    try {
      const rollup = this._getRollup(scope);
      if (this._hasRollupData(rollup)) {
        return {
          optimized: rollup.byModel.reduce((sum, row) => sum + (row.totalInput || 0) + (row.totalOutput || 0), 0),
          notOptimized: rollup.byModel.reduce((sum, row) => sum + (row.rawTokens || 0), 0),
          costEst: rollup.actualCost || 0,
          rawCostEst: rollup.rawCost || rollup.counterfactualCost || 0,
          toolTokens: statsManager?.stats?.[scope]?.toolTokens || 0,
        };
      }
      return statsManager.getTotals(scope);
    } catch {
      return { optimized: 0, notOptimized: 0, costEst: 0, rawCostEst: 0, toolTokens: 0 };
    }
  }

  _getByModel(scope) {
    const rollup = this._getRollup(scope);
    if (this._hasRollupData(rollup)) {
      return rollup.byModel
        .map((row) => ({
          model: row.model,
          optimized: (row.totalInput || 0) + (row.totalOutput || 0),
          notOptimized: row.rawTokens || 0,
          costEst: row.actualCost || 0,
          rawCostEst: row.rawCost || 0,
        }))
        .sort((a, b) => (b.costEst - a.costEst) || (b.optimized - a.optimized) || a.model.localeCompare(b.model));
    }

    const models = statsManager?.stats?.[scope]?.models || {};
    return Object.entries(models)
      .map(([model, data]) => ({
        model,
        optimized: data.optimized || 0,
        notOptimized: data.notOptimized || 0,
        costEst: data.costEst || 0,
        rawCostEst: data.rawCostEst || 0,
      }))
      .sort((a, b) => (b.costEst - a.costEst) || (b.optimized - a.optimized) || a.model.localeCompare(b.model));
  }

  _scopeLines(label, totals) {
    const savings = Math.max(0, (totals.rawCostEst || 0) - (totals.costEst || 0));
    return [
      `${BOLD}${label}${R}`,
      `  smart-routed tokens   ${G}${this._fmtInt(totals.optimized)}${R}`,
      `  raw baseline tokens   ${RED}${this._fmtInt(totals.notOptimized)}${R}`,
      `  tool context tokens   ${this._fmtInt(totals.toolTokens || 0)}`,
      `  actual cost           ${G}$${this._formatMoney(totals.costEst, 4)}${R}`,
      `  raw baseline cost     ${RED}$${this._formatMoney(totals.rawCostEst, 4)}${R}`,
      `  savings               ${G}$${this._formatMoney(savings, 4)}${R}`,
    ];
  }

  _modelLines(label, rows) {
    const lines = [`${BOLD}${label}${R}`];
    if (!rows.length) {
      lines.push(`${DIM}  No model calls recorded yet.${R}`);
      return lines;
    }

    const header = `${'Model'.padEnd(36)} ${'Smart'.padStart(9)} ${'Raw'.padStart(9)} ${'Cost'.padStart(10)}`;
    lines.push(`${DIM}${header}${R}`);
    lines.push(DIM + '  ' + '─'.repeat(68) + R);
    for (const row of rows) {
      lines.push(
        `${row.model.slice(0, 36).padEnd(36)} ${this._fmtInt(row.optimized).padStart(9)} ${this._fmtInt(row.notOptimized).padStart(9)} ${(`$${this._formatMoney(row.costEst, 4)}`).padStart(10)}`
      );
    }
    return lines;
  }

  renderHeader() {
    const sTotal = this._getTotals('session');
    const actualStr = `${G}TM [${this._fmtInt(sTotal.optimized)}] / $${this._formatMoney(sTotal.costEst)}${R}`;
    const rawStr = `${RED}[${this._fmtInt(sTotal.notOptimized)}] / $${this._formatMoney(sTotal.rawCostEst)}${R}`;
    return `${actualStr} ${DIM}|${R} ${rawStr}\n`;
  }

  renderTmCommand() {
    const lines = [];
    const sep = '─'.repeat(72);
    const sessionTotals = this._getTotals('session');
    const projectTotals = this._getTotals('lifetime');
    const sessionModels = this._getByModel('session');
    const projectModels = this._getByModel('lifetime');
    const routing = this._getRollup('session');

    lines.push(`${BOLD}TOKENMISER — Session + Project Stats${R}`);
    lines.push(sep);
    lines.push(...this._scopeLines('SESSION', sessionTotals));
    if (routing && routing.totalCalls > 0) {
      const pct = routing.counterfactualCost > 0
        ? ` (${((routing.routingSavings / routing.counterfactualCost) * 100).toFixed(1)}% off)`
        : '';
      lines.push(`  without routing       ${RED}$${this._formatMoney(routing.counterfactualCost, 4)}${R}  [all -> ${routing.maxRateModel}]`);
      lines.push(`  routing savings       ${G}$${this._formatMoney(routing.routingSavings, 4)}${pct}${R}`);
    }
    lines.push('');
    lines.push(...this._modelLines('BY MODEL — SESSION', sessionModels));
    lines.push('');
    lines.push(...this._scopeLines(`PROJECT (${this._fmtInt(statsManager.stats.sessions || 0)} sessions)`, projectTotals));
    lines.push('');
    lines.push(...this._modelLines('BY MODEL — PROJECT', projectModels));
    lines.push('');
    lines.push(`${DIM}Use /tm or SHIFT+T to open this view. In the TUI, press Esc to return.${R}`);
    return lines.join('\n');
  }

  drawOverlay() {
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(this.renderTmCommand() + '\n');
    process.stdout.write(`${DIM}Press SHIFT+T to close this overlay.${R}\n`);
  }

  toggleOverlay(rl) {
    this.overlayActive = !this.overlayActive;
    if (this.overlayActive) {
      this.drawOverlay();
      return;
    }
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write('[SYSTEM] Overlay closed.\n');
    rl.prompt();
  }
}

module.exports = new TokenmiserDashboard();
