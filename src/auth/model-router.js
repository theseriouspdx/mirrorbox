const { detectCliSessions } = require('./session-detector');
const { detectLocalModels } = require('./local-detector');
const { detectOpenRouter } = require('./openrouter-detector');

/**
 * Routes model roles to specific providers based on detection and priority.
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
    patchGenerator: null,
    onboarding: null
  };

  // 1. Classifier - Local is best for speed and cost
  if (local.ollama.detected) {
    routingMap.classifier = { provider: 'local', model: 'ollama', url: local.ollama.url };
  } else if (cli.gemini.authenticated) {
    routingMap.classifier = { provider: 'cli', model: 'gemini', binary: cli.gemini.binary };
  }

  // 2. Planners - Claude CLI is top priority
  if (cli.claude.authenticated) {
    routingMap.architecturePlanner = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
    routingMap.componentPlanner = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
  } else if (or.detected) {
    routingMap.architecturePlanner = { provider: 'openrouter', model: 'anthropic/claude-3-opus' };
    routingMap.componentPlanner = { provider: 'openrouter', model: 'anthropic/claude-3-sonnet' };
  }

  // 3. Reviewer - Gemini CLI (Diverse Vendor from Planner)
  if (cli.gemini.authenticated) {
    routingMap.reviewer = { provider: 'cli', model: 'gemini', binary: cli.gemini.binary };
  } else if (or.detected) {
    routingMap.reviewer = { provider: 'openrouter', model: 'google/gemini-pro-1.5' };
  }

  // 4. Patch Generator - Local or OpenRouter
  if (local.ollama.detected) {
    routingMap.patchGenerator = { provider: 'local', model: 'ollama', url: local.ollama.url };
  } else if (cli.claude.authenticated) {
    routingMap.patchGenerator = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
  }

  // 5. Onboarding - Highest Capability
  if (or.detected) {
    routingMap.onboarding = { provider: 'openrouter', model: 'anthropic/claude-3-opus' };
  } else if (cli.claude.authenticated) {
    routingMap.onboarding = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
  }

  return { routingMap, providers: { cli, local, or } };
}

module.exports = { routeModels };
