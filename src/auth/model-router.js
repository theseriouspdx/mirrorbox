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

  // 1. Classifier - Local > CLI > OpenRouter (Speed/Cost)
  if (local.ollama.detected) {
    routingMap.classifier = { provider: 'local', model: 'ollama', url: local.ollama.url };
  } else if (cli.gemini.authenticated) {
    routingMap.classifier = { provider: 'cli', model: 'gemini', binary: cli.gemini.binary };
  } else if (or.detected) {
    routingMap.classifier = { provider: 'openrouter', model: 'google/gemini-pro-1.5' };
  }

  // 2. Planners - Claude-first per Section 11 (Vendor diversity is structural)
  if (cli.claude.authenticated) {
    routingMap.architecturePlanner = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
    routingMap.componentPlanner = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
  } else if (or.detected) {
    routingMap.architecturePlanner = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
    routingMap.componentPlanner = { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' };
  } else if (local.ollama.detected) {
    routingMap.architecturePlanner = { provider: 'local', model: 'ollama', url: local.ollama.url };
    routingMap.componentPlanner = { provider: 'local', model: 'ollama', url: local.ollama.url };
  }

  // 3. Reviewer - Gemini-first per Section 11 (Adversarial vendor required)
  if (cli.gemini.authenticated) {
    routingMap.reviewer = { provider: 'cli', model: 'gemini', binary: cli.gemini.binary };
  } else if (or.detected) {
    routingMap.reviewer = { provider: 'openrouter', model: 'google/gemini-pro-1.5' };
  } else if (local.ollama.detected) {
    routingMap.reviewer = { provider: 'local', model: 'ollama', url: local.ollama.url };
  }

  // 4. Tiebreaker - Best available frontier (OpenRouter > CLI > Local)
  if (or.detected) {
    routingMap.tiebreaker = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
  } else if (cli.claude.authenticated) {
    routingMap.tiebreaker = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
  } else if (local.ollama.detected) {
    routingMap.tiebreaker = { provider: 'local', model: 'ollama', url: local.ollama.url };
  }

  // 5. Patch Generator - Local/Specialized (Speed/Code-specialized)
  if (local.ollama.detected) {
    routingMap.patchGenerator = { provider: 'local', model: 'ollama', url: local.ollama.url };
  } else if (cli.claude.authenticated) {
    routingMap.patchGenerator = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
  } else if (or.detected) {
    routingMap.patchGenerator = { provider: 'openrouter', model: 'anthropic/claude-3.5-haiku' };
  }

  // 6. Onboarding - Best available frontier (Judgment/Finesse)
  if (or.detected) {
    routingMap.onboarding = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
  } else if (cli.claude.authenticated) {
    routingMap.onboarding = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
  } else if (local.ollama.detected) {
    routingMap.onboarding = { provider: 'local', model: 'ollama', url: local.ollama.url };
  }

  return { routingMap, providers: { cli, local, or } };
}

module.exports = { routeModels };
