const { detectCliSessions } = require('./session-detector');
const { detectLocalModels } = require('./local-detector');
const { detectOpenRouter } = require('./openrouter-detector');

/**
 * Routes model roles to specific providers based on detection and priority.
 * Priority (Section 9): 1. Local, 2. CLI Session, 3. OpenRouter
 */
async function routeModels() {
  const cli = detectCliSessions();
  const local = await detectLocalModels();
  const or = await detectOpenRouter();

  const routingMap = {
    classifier: null,
    architecturePlanner: null,
    componentPlanner: null,
    reviewer: null,
    tiebreaker: null,
    patchGenerator: null,
    onboarding: null
  };

  /**
   * Helper to find the best available provider for a role based on SPEC priority.
   */
  function findProvider(localPref, cliPref, orPref) {
    if (local.ollama.detected) return { provider: 'local', model: 'ollama', url: local.ollama.url };
    if (cli[cliPref] && cli[cliPref].authenticated) return { provider: 'cli', model: cliPref, binary: cli[cliPref].binary };
    if (or.detected) return { provider: 'openrouter', model: orPref };
    return null;
  }

  // 1. Classifier - Local > CLI > OpenRouter
  routingMap.classifier = findProvider('ollama', 'gemini', 'google/gemini-pro-1.5');

  // 2. Planners - Local > CLI > OpenRouter
  routingMap.architecturePlanner = findProvider('ollama', 'claude', 'anthropic/claude-3.7-sonnet');
  routingMap.componentPlanner = findProvider('ollama', 'claude', 'anthropic/claude-3.5-sonnet');

  // 3. Reviewer - Local > CLI > OpenRouter (Adversarial vendor from planner is handled via Role configuration)
  routingMap.reviewer = findProvider('ollama', 'gemini', 'google/gemini-pro-1.5');

  // 4. Tiebreaker - Best available frontier (OpenRouter > CLI > Local)
  if (or.detected) {
    routingMap.tiebreaker = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
  } else if (cli.claude.authenticated) {
    routingMap.tiebreaker = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
  } else if (local.ollama.detected) {
    routingMap.tiebreaker = { provider: 'local', model: 'ollama', url: local.ollama.url };
  }

  // 5. Patch Generator - Local > CLI > OpenRouter
  routingMap.patchGenerator = findProvider('ollama', 'claude', 'anthropic/claude-3.5-haiku');

  // 6. Onboarding - Local > CLI > OpenRouter
  routingMap.onboarding = findProvider('ollama', 'claude', 'anthropic/claude-3.7-sonnet');

  return { routingMap, providers: { cli, local, or } };
}

module.exports = { routeModels };
