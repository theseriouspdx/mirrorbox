  /**
   * Section 27: Pre-Execution Assumption Ledger
   * Audit every assumption before planning begins.
   */
  async generateAssumptionLedger(classification, routing, context) {
    const hardState = this.getHardState();
    const prompt = `Audit every assumption for the following task. 
Task: ${classification.rationale}
Files: ${classification.files.join(', ')}
Routing Tier: ${routing.tier}

Return ONLY a JSON object following this schema:
{
  "assumptions": [
    {
      "id": "A1",
      "category": "Logic" | "Architecture" | "Data" | "UX" | "Security",
      "statement": "One falsifiable sentence.",
      "impact": "Critical" | "High" | "Low",
      "autonomousDefault": "Specific decision if human types go."
    }
  ],
  "blockers": ["Specific missing info preventing go"],
  "entropyScore": number
}

Calculate entropyScore as: (Critical × 3) + (High × 1.5) + (Low × 0.5).`;

    try {
      const response = await callModel('classifier', prompt, { classification, routing, context }, hardState);
      const ledger = this._safeParseJSON(response);
      
      if (!ledger || !ledger.assumptions) {
        throw new Error("[Operator] Ledger generation failed or malformed.");
      }

      // Ensure score is derived correctly if model missed it
      ledger.entropyScore = this._calculateEntropy(ledger.assumptions);
      return ledger;
    } catch (e) {
      console.error(`[Operator] Ledger generation error: ${e.message}`);
      return { assumptions: [], blockers: ["Ledger generation failed"], entropyScore: 0 };
    }
  }

  _calculateEntropy(assumptions) {
    const weights = { 'Critical': 3, 'High': 1.5, 'Low': 0.5 };
    return assumptions.reduce((sum, a) => sum + (weights[a.impact] || 0), 0);
  }

  /**
   * Section 27: Sign-Off Block Formatting
   */
  _formatSignOffBlock(ledger) {
    const critical = ledger.assumptions.filter(a => a.impact === 'Critical').map(a => a.id);
    const defaults = ledger.assumptions.map(a => a.id);
    
    return `
Entropy Score: ${ledger.entropyScore}
Blockers: ${ledger.blockers.length > 0 ? ledger.blockers.join(', ') : 'none'}
Critical assumptions requiring confirmation: ${critical.length > 0 ? critical.join(', ') : 'none'}
Autonomous defaults active if you type go: ${defaults.join(', ')}
`;
  }
