const { detectCliSessions } = require('./session-detector');
const { detectLocalModels } = require('./local-detector');
const { detectOpenRouter } = require('./openrouter-detector');
const { loadOperatorConfig } = require('./config-loader');

/**
 * Routes model roles to specific providers based on detection and priority.
 * Priority (Section 9): 1. Local, 2. CLI Session, 3. OpenRouter
 * Section 33: Incorporates global and per-role streaming settings from operator config.
 */
async function routeModels() {
  const cli = detectCliSessions();
  const local = await detectLocalModels();
  const or = await detectOpenRouter();
  const opConfig = loadOperatorConfig();

  const roles = [
    'classifier', 'operator', 'architecturePlanner', 'componentPlanner',
    'reviewer', 'tiebreaker', 'patchGenerator', 'onboarding'
  ];

  const routingMap = {};
  roles.forEach(role => { routingMap[role] = null; });

  // Load baseline overrides from ~/.mbo/config.json if present
  if (opConfig) {
    roles.forEach(role => {
      if (opConfig[role]) {
        routingMap[role] = { ...opConfig[role] };
        // Attach streaming settings if present
        if (opConfig.streaming) {
          const globalStreaming = !!opConfig.streaming.enabled;
          const roleOverride = opConfig.streaming.roles?.[role]?.enabled;
          routingMap[role].streaming = (roleOverride !== undefined) ? !!roleOverride : globalStreaming;
        }
      }
    });
  }

  // Fallback / Detection Logic (if not explicitly pinned in config or for missing roles)
  
  // 1. Classifier & Operator
  if (!routingMap.classifier || !routingMap.operator) {
    let entry = null;
    if (or.detected) {
      entry = { provider: 'openrouter', model: 'google/gemini-2.0-flash-001' };
    } else if (local.ollama.detected) {
      entry = { provider: 'local', model: 'ollama', url: local.ollama.url };
    } else if (cli.gemini.authenticated) {
      entry = { provider: 'cli', model: 'gemini', binary: cli.gemini.binary };
    }
    if (entry) {
      if (!routingMap.classifier) routingMap.classifier = { ...entry };
      if (!routingMap.operator) routingMap.operator = { ...entry };
    }
  }

  // 2. Planners
  if (!routingMap.architecturePlanner || !routingMap.componentPlanner) {
    let entry = null;
    if (cli.claude.authenticated) {
      entry = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
    } else if (or.detected) {
      entry = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
    } else if (local.ollama.detected) {
      entry = { provider: 'local', model: 'ollama', url: local.ollama.url };
    }
    if (entry) {
      if (!routingMap.architecturePlanner) routingMap.architecturePlanner = { ...entry };
      if (!routingMap.componentPlanner) routingMap.componentPlanner = { ...entry };
    }
  }

  // 3. Reviewer
  if (!routingMap.reviewer) {
    if (cli.gemini.authenticated) {
      routingMap.reviewer = { provider: 'cli', model: 'gemini', binary: cli.gemini.binary };
    } else if (or.detected) {
      routingMap.reviewer = { provider: 'openrouter', model: 'google/gemini-pro-1.5' };
    } else if (local.ollama.detected) {
      routingMap.reviewer = { provider: 'local', model: 'ollama', url: local.ollama.url };
    }
  }

  // 4. Tiebreaker
  if (!routingMap.tiebreaker) {
    if (or.detected) {
      routingMap.tiebreaker = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
    } else if (cli.claude.authenticated) {
      routingMap.tiebreaker = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
    } else if (local.ollama.detected) {
      routingMap.tiebreaker = { provider: 'local', model: 'ollama', url: local.ollama.url };
    }
  }

  // 5. Patch Generator
  if (!routingMap.patchGenerator) {
    if (local.ollama.detected) {
      routingMap.patchGenerator = { provider: 'local', model: 'ollama', url: local.ollama.url };
    } else if (cli.claude.authenticated) {
      routingMap.patchGenerator = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
    } else if (or.detected) {
      routingMap.patchGenerator = { provider: 'openrouter', model: 'anthropic/claude-3.5-haiku' };
    }
  }

  // 6. Onboarding
  if (!routingMap.onboarding) {
    if (or.detected) {
      routingMap.onboarding = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
    } else if (cli.claude.authenticated) {
      routingMap.onboarding = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
    } else if (local.ollama.detected) {
      routingMap.onboarding = { provider: 'local', model: 'ollama', url: local.ollama.url };
    }
  }

  return { routingMap, providers: { cli, local, or } };
}

module.exports = { routeModels };
