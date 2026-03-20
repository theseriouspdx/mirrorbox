const { detectCliSessions } = require('./session-detector');
const { detectLocalModels } = require('./local-detector');
const { detectOpenRouter } = require('./openrouter-detector');
const { loadOperatorConfig } = require('./config-loader');
const fs = require('fs');
const path = require('path');

function normalizeProvider(rawProvider) {
  const p = String(rawProvider || '').trim().toLowerCase();
  if (!p) return null;
  if (p === 'cli' || p === 'claude-cli' || p === 'gemini-cli' || p === 'codex-cli') return 'cli';
  if (p === 'google' || p === 'openrouter' || p === 'anthropic') return 'openrouter';
  if (p === 'ollama' || p === 'local') return 'local';
  return p;
}

function normalizeConfiguredEntry(entry = {}) {
  const normalized = { ...entry };
  const provider = normalizeProvider(entry.provider);
  if (provider) normalized.provider = provider;

  // If a CLI-flavored provider was configured, infer the proper binary/model mapping.
  const sourceProvider = String(entry.provider || '').trim().toLowerCase();
  if (provider === 'cli' && !normalized.binary) {
    if (sourceProvider === 'claude-cli') {
      normalized.binary = 'claude';
      normalized.model = normalized.model || 'claude';
    } else if (sourceProvider === 'gemini-cli') {
      normalized.binary = 'gemini';
      normalized.model = normalized.model || 'gemini';
    } else if (sourceProvider === 'codex-cli') {
      normalized.binary = 'codex';
      normalized.model = normalized.model || 'codex';
    }
  }

  // Legacy setup configs may write provider=google/anthropic with non-OpenRouter model names.
  // Keep provider as openrouter but coerce model to a valid default route.
  if (provider === 'openrouter' && typeof normalized.model === 'string') {
    const m = normalized.model.trim();
    if (m === 'gemini-2.5-flash') normalized.model = 'google/gemini-2.0-flash-001';
    if (m === 'gemini-2.5-pro') normalized.model = 'google/gemini-pro-1.5';
    if (m.startsWith('claude-')) normalized.model = 'anthropic/claude-3.7-sonnet';
  }

  return normalized;
}

function harmonizeConfiguredEntry(entry, cli, local, or) {
  const normalized = { ...entry };

  if (normalized.provider === 'cli' && !normalized.binary) {
    const model = String(normalized.model || '').toLowerCase();
    if (model.includes('claude') && cli.claude.authenticated) normalized.binary = cli.claude.binary;
    else if (model.includes('gemini') && cli.gemini.authenticated) normalized.binary = cli.gemini.binary;
    else if (model.includes('codex') && cli.openai.authenticated) normalized.binary = cli.openai.binary;
  }

  if (normalized.provider === 'local' && !normalized.url && local.ollama.detected) {
    normalized.url = local.ollama.url;
  }

  if (normalized.provider === 'openrouter' && !or.detected) {
    const model = String(normalized.model || '').toLowerCase();
    if (model.includes('claude') && cli.claude.authenticated) {
      return { provider: 'cli', model: 'claude', binary: cli.claude.binary };
    }
    if (model.includes('gemini') && cli.gemini.authenticated) {
      return { provider: 'cli', model: 'gemini', binary: cli.gemini.binary };
    }
    if (local.ollama.detected) {
      return { provider: 'local', model: 'ollama', url: local.ollama.url };
    }
  }

  return normalized;
}

// Section 33.6: Validate streaming config at startup to catch misconfiguration early.
function validateStreamingConfig(streaming) {
  if (typeof streaming !== 'object' || streaming === null)
    throw new Error('[Config] streaming must be an object');
  if ('enabled' in streaming && typeof streaming.enabled !== 'boolean')
    throw new Error('[Config] streaming.enabled must be a boolean');
  if ('flushMs' in streaming && (typeof streaming.flushMs !== 'number' || streaming.flushMs <= 0))
    throw new Error('[Config] streaming.flushMs must be a positive number');
  if (streaming.roles) {
    for (const [r, rc] of Object.entries(streaming.roles)) {
      if ('enabled' in rc && typeof rc.enabled !== 'boolean')
        throw new Error(`[Config] streaming.roles.${r}.enabled must be a boolean`);
    }
  }
}

/**
 * Section 35.4: Tiered Routing Policy
 * Map task complexity and blast radius to an execution tier (0-3).
 */
function calculateTaskTier(classification, blastRadius = []) {
  // Manual override from classification
  if (classification.tier !== undefined) return Number(classification.tier);

  const nodeCount = blastRadius.length;
  const files = classification.files || [];
  const isMultiFile = files.length > 1;
  const isHighRisk = classification.risk === 'high';

  // Section 8 Matrix: Tier 0 — Inline execution, no pipeline
  // Only valid when blast radius is zero AND files are safelisted AND files exist.
  if (nodeCount === 0 && !isMultiFile && !isHighRisk && files.length > 0) {
    const safelist = ['SPEC.md', 'README.md', 'AGENTS.md', 'ROADMAP.md', 'CHANGELOG.md'];
    const allSafelisted = files.every(f => safelist.includes(path.basename(f)) || f.endsWith('.css'));
    
    // Safety Invariant: New files never qualify for Tier 0.
    const projectRoot = process.env.MBO_PROJECT_ROOT || process.cwd();
    const allExist = files.every(f => fs.existsSync(path.resolve(projectRoot, f)));
    
    if (allSafelisted && allExist) return 0;
  }

  if (nodeCount <= 5 && !isHighRisk) return 1;                  // Tier 1: Small change
  if (isHighRisk || nodeCount > 15) return 3;                  // Tier 3: High Risk / Architectural
  return 2;                                                     // Tier 2: Standard DID
}

/**
 * Routes model roles to specific providers based on detection and priority.
 * Priority (Section 9): 1. Local, 2. CLI Session, 3. OpenRouter
 * Section 33: Incorporates global and per-role streaming settings from operator config.
 */
async function routeModels(classification = {}, blastRadius = []) {
  const cli = detectCliSessions();
  const local = await detectLocalModels();
  const or = await detectOpenRouter();
  const opConfig = loadOperatorConfig();

  const tier = calculateTaskTier(classification, blastRadius);
  const roles = [
    'classifier', 'operator', 'architecturePlanner', 'componentPlanner',
    'reviewer', 'tiebreaker', 'patchGenerator', 'onboarding'
  ];

  const routingMap = {};
  roles.forEach(role => { routingMap[role] = null; });

  // Load baseline overrides from ~/.mbo/config.json if present
  if (opConfig) {
    if (opConfig.streaming) {
      validateStreamingConfig(opConfig.streaming);
    }
    // BUG-143: alias 'planner' key → architecturePlanner + componentPlanner.
    // Setup writes 'planner' but router expects role-specific keys.
    if (opConfig.planner && !opConfig.architecturePlanner) opConfig.architecturePlanner = opConfig.planner;
    if (opConfig.planner && !opConfig.componentPlanner) opConfig.componentPlanner = opConfig.planner;

    roles.forEach(role => {
      if (opConfig[role]) {
        routingMap[role] = harmonizeConfiguredEntry(normalizeConfiguredEntry(opConfig[role]), cli, local, or);
        // Budget override from config (Section 35.5)
        if (opConfig[role].budget) {
          routingMap[role].budget = opConfig[role].budget;
        }
        // Attach streaming settings if present
        if (opConfig.streaming) {
          const globalStreaming = !!opConfig.streaming.enabled;
          const roleOverride = opConfig.streaming.roles?.[role]?.enabled;
          routingMap[role].streaming = (roleOverride !== undefined) ? !!roleOverride : globalStreaming;
          if (opConfig.streaming.flushMs) routingMap[role].flushMs = opConfig.streaming.flushMs;
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
    } else if (cli.gemini.authenticated) {
      // BUG-143 fallback: gemini is available and already handles classifier/operator
      entry = { provider: 'cli', model: 'gemini', binary: cli.gemini.binary };
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
  // Prefer authenticated local CLI first to avoid network-key drift during
  // first-run interactive setup and onboarding.
  if (!routingMap.onboarding) {
    if (cli.claude.authenticated) {
      routingMap.onboarding = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
    } else if (or.detected) {
      routingMap.onboarding = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
    } else if (local.ollama.detected) {
      routingMap.onboarding = { provider: 'local', model: 'ollama', url: local.ollama.url };
    }
  }

  return { routingMap, tier, blastRadius, providers: { cli, local, or } };
}

module.exports = { routeModels, calculateTaskTier };
