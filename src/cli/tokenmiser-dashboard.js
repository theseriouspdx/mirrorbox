/**
 * src/cli/tokenmiser-dashboard.js — TUI Dashboard & Stats Overlay
 * Implements Agent Header and SHIFT+T overlay per Task 1.1-H10 & 1.1-H11.
 */

'use strict';

const statsManager = require('../state/stats-manager');

const R = '\x1b[0m';
const G = '\x1b[32m'; // Green
const RED = '\x1b[31m'; // Red
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

class TokenmiserDashboard {
  constructor() {
    this.overlayActive = false;
  }

  /**
   * Renders the top status bar for an agent/operator panel.
   */
  renderHeader() {
    const sTotal = statsManager.getTotals('session');
    
    const actualStr = `${G}TM [${sTotal.optimized}] / $${sTotal.costEst.toFixed(6)}${R}`;
    const rawStr = `${RED}[NaN] / $[NaN]${R}`;
    
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
    const carbon = statsManager.getCarbonImpact();

    process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and move to top
    process.stdout.write(`
${BOLD}TOKENMISER${R}
${BOLD}────────────────────────────────────────────────────────────────────────${R}
${BOLD}SESSION${R}
Model          | optimized      | not optimized  | cost (est)
───────────────┼────────────────┼────────────────┼─────────────
${Object.entries(s.models).map(([m, data]) => 
`${m.padEnd(14)} | ${data.optimized.toString().padStart(14)} | ${data.notOptimized.toString().padStart(14)} | $${data.costEst.toFixed(4)}`
).join('\n')}
───────────────┼────────────────┼────────────────┼─────────────
${BOLD}Total Session${R}  | ${sTotal.optimized.toString().padStart(14)} | ${sTotal.notOptimized.toString().padStart(14)} | $${sTotal.costEst.toFixed(4)}

${BOLD}LIFETIME${R}
Model          | optimized      | not optimized  | cost (est)
───────────────┼────────────────┼────────────────┼─────────────
${Object.entries(l.models).map(([m, data]) => 
`${m.padEnd(14)} | ${data.optimized.toString().padStart(14)} | ${data.notOptimized.toString().padStart(14)} | $${data.costEst.toFixed(4)}`
).join('\n')}
───────────────┼────────────────┼────────────────┼─────────────
${BOLD}Total Lifetime${R} | ${lTotal.optimized.toString().padStart(14)} | ${lTotal.notOptimized.toString().padStart(14)} | $${lTotal.costEst.toFixed(4)}

${BOLD}Project Carbon impact:${R} ${DIM}${carbon.toString()}g CO2 avoided${R}
${BOLD}────────────────────────────────────────────────────────────────────────${R}
${DIM}Press SHIFT+T to close this overlay.${R}
`);
  }
}

module.exports = new TokenmiserDashboard();
