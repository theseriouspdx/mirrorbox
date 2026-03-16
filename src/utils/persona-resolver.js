'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const MBO_ROOT = path.resolve(__dirname, '../..');

/**
 * Maps role names used in callModel to builtin persona file basenames.
 * architecturePlanner and componentPlanner both use the 'planner' persona
 * because they share the same reasoning constraint (minimalism / spec adherence).
 */
const BUILTIN_ALIASES = {
  architecturePlanner: 'planner',
  componentPlanner:    'planner',
  classifier:          'classifier',
  reviewer:            'reviewer',
  tiebreaker:          'tiebreaker',
  operator:            'operator',
};

/**
 * Strips YAML frontmatter (--- ... ---) from a Markdown persona file.
 * Returns only the body text, trimmed.
 */
function stripFrontmatter(raw) {
  // Match opening ---, any content, closing --- at start of line
  return raw.replace(/^---[\s\S]*?^---\s*/m, '').trim();
}

/**
 * Resolves the persona prompt for a given role and optional personaId.
 *
 * Search order (first match wins):
 *   1. ~/.orchestrator/personas/<personaId>.md   — user library
 *   2. <project_root>/personalities/<personaId>.md — project override
 *   3. <MBO_ROOT>/personalities/<builtinAlias>.md  — MBO builtin
 *
 * If personaId is null/undefined, the builtin alias is used as the ID
 * for steps 1 and 2 as well (allows project to override builtins by name).
 *
 * Returns stripped prompt string, or '' if no file is found.
 */
function resolvePersona(role, personaId) {
  const alias = BUILTIN_ALIASES[role] || role;
  const id    = personaId || alias;
  const projectRoot = process.env.MBO_PROJECT_ROOT || process.cwd();

  const candidates = [
    path.join(os.homedir(), '.orchestrator', 'personas', `${id}.md`),
    path.join(projectRoot, 'personalities', `${id}.md`),
    path.join(MBO_ROOT, 'personalities', `${alias}.md`),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8');
        return stripFrontmatter(raw);
      }
    } catch { /* skip unreadable candidates */ }
  }

  return '';
}

/**
 * Loads .mbo/persona.json from the active project root.
 * Returns the parsed object, or {} if the file is absent or malformed.
 *
 * Schema: { [role]: { id: string, source: string, installedFrom?: string } }
 */
function loadPersonaConfig() {
  const configPath = path.join(
    process.env.MBO_PROJECT_ROOT || process.cwd(),
    '.mbo',
    'persona.json'
  );
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch { /* missing or corrupt — fall through to default */ }
  return {};
}

module.exports = { resolvePersona, loadPersonaConfig, BUILTIN_ALIASES };
