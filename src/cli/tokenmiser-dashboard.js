/**
 * src/cli/tokenmiser-dashboard.js — TUI Dashboard & Stats Overlay
 * Implements Agent Header and SHIFT+T overlay per Task 1.1-H10 & 1.1-H11.
 */

'use strict';

const statsManager = require('../state/stats-manager');
const db = require('../state/db-manager');

const R = '\x1b[0m';
const G = '\x1b[32m'; // Green
const RED = '\x1b[31m'; // Red
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

  /**
   * Renders the top status bar for an agent/operator panel.
   */
  renderHeader() {
    const sTotal = statsManager.getTotals('session');

    const actualStr = `${G}TM [${this._fmtInt(sTotal.optimized)}] / $${this._formatMoney(sTotal.costEst)}${R}`;
    const rawStr = `${RED}[${this._fmtInt(sTotal.notOptimized)}] / $${this._formatMoney(sTotal.rawCostEst)}${R}`;

    return `${actualStr} ${DIM}|${R} ${rawStr}\n`;
  }

  /**
   * Toggles the global stats overlay.
   */
  toggleOverlay(rl) {
    this.overlayActive = !this.overlayActive;
    if (this.overlayActive) {
      this.drawOverlay();
    } else {
      process.stdout.write('\x1b[2J\x1b[H'); // Clear and move to top
      process.stdout.write('[SYSTEM] Overlay closed.\n');
      rl.prompt();
    }
  }

  drawOverlay() {
    const s = statsManager.stats.session;
    const l = statsManager.stats.lifetime;
    const sTotal = statsManager.getTotals('session');
    const lTotal = statsManager.getTotals('lifetime');
    const carbon = statsManager.getCarbonImpact('lifetime');

    process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and move to top
    process.stdout.write(`
${BOLD}TOKENMISER${R}
${BOLD}────────────────────────────────────────────────────────────────────────${R}
${BOLD}SESSION${R}
Model          | optimized      | not optimized  | cost (est)
───────────────┼────────────────┼────────────────┼─────────────
${Object.entries(s.models).map(([m, data]) =>
`${m.padEnd(14)} | ${this._fmtInt(data.optimized).padStart(14)} | ${this._fmtInt(data.notOptimized).padStart(14)} | $${this._formatMoney(data.costEst, 4)}`
).join('\n')}
───────────────┼────────────────┼────────────────┼─────────────
${BOLD}Total Session${R}  | ${this._fmtInt(sTotal.optimized).padStart(14)} | ${this._fmtInt(sTotal.notOptimized).padStart(14)} | $${this._formatMoney(sTotal.costEst, 4)}

${BOLD}LIFETIME${R}
Model          | optimized      | not optimized  | cost (est)
───────────────┼────────────────┼────────────────┼─────────────
${Object.entries(l.models).map(([m, data]) =>
`${m.padEnd(14)} | ${this._fmtInt(data.optimized).padStart(14)} | ${this._fmtInt(data.notOptimized).padStart(14)} | $${this._formatMoney(data.costEst, 4)}`
).join('\n')}
───────────────┼────────────────┼────────────────┼─────────────
${BOLD}Total Lifetime${R} | ${this._fmtInt(lTotal.optimized).padStart(14)} | ${this._fmtInt(lTotal.notOptimized).padStart(14)} | $${this._formatMoney(lTotal.costEst, 4)}

${BOLD}Project Carbon impact:${R} ${DIM}${this._formatMoney(carbon, 4)}g CO2 avoided${R}
${BOLD}────────────────────────────────────────────────────────────────────────${R}

${BOLD}ROUTING SAVINGS${R}
${(() => {
  try {
    const rollup = db.getCostRollup();
    if (rollup.totalCalls === 0) return `${DIM}No callModel data yet.${R}`;
    const fmt = (v) => `$${this._formatMoney(v, 6)}`;
    const rows = rollup.byModel.map(r =>
      `${r.model.padEnd(36)} | ${String(r.calls).padStart(5)} calls | ${fmt(r.actualCost)}`
    ).join('\n');
    return [
      `Model                                | Calls | Actual cost`,
      `─────────────────────────────────────┼───────┼─────────────`,
      rows,
      `─────────────────────────────────────┼───────┼─────────────`,
      `${'Actual total'.padEnd(36)}   ${String(rollup.totalCalls).padStart(5)}         ${fmt(rollup.actualCost)}`,
      `${'Counterfactual (all → ' + rollup.maxRateModel + ')'}`,
      `${''.padEnd(36)}                       ${fmt(rollup.counterfactualCost)}`,
      `${G}${BOLD}Routing savings${R}${''.padEnd(22)}                       ${G}${fmt(rollup.routingSavings)}${R}`,
    ].join('\n');
  } catch (_) {
    return `${DIM}Routing data unavailable.${R}`;
  }
})()}
${BOLD}────────────────────────────────────────────────────────────────────────${R}
${DIM}Press SHIFT+T to close this overlay.${R}
`);
  }
}

module.exports = new TokenmiserDashboard();
