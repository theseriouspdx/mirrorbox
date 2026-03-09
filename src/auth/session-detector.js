const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Detects available AI CLI sessions (Tier 1).
 */
function detectCliSessions() {
  const providers = {
    claude: { detected: false, binary: null, authenticated: false, version: null },
    gemini: { detected: false, binary: null, authenticated: false, version: null },
    openai: { detected: false, binary: null, authenticated: false, version: null }
  };

  // 1. Detect Claude (Claude Code)
  try {
    const claudePath = execSync('which claude', { encoding: 'utf8' }).trim();
    if (claudePath) {
      providers.claude.detected = true;
      providers.claude.binary = claudePath;
      providers.claude.version = execSync('claude --version', { encoding: 'utf8' }).trim();
      
      // Soft auth check: Existence of ~/.claude/session-env (seen in research)
      const claudeSessionDir = path.join(os.homedir(), '.claude', 'session-env');
      if (fs.existsSync(claudeSessionDir)) {
        providers.claude.authenticated = true;
      }
    }
  } catch (e) { /* ignore */ }

  // 2. Detect Gemini (Gemini CLI)
  try {
    const geminiPath = execSync('which gemini', { encoding: 'utf8' }).trim();
    if (geminiPath) {
      providers.gemini.detected = true;
      providers.gemini.binary = geminiPath;
      providers.gemini.version = execSync('gemini --version', { encoding: 'utf8' }).trim();
      // Authenticated if we are running in a Gemini CLI session
      providers.gemini.authenticated = !!process.env.GEMINI_CLI;
    }
  } catch (e) { /* ignore */ }

  // 3. Detect OpenAI (Python CLI)
  try {
    const openaiPath = execSync('which openai', { encoding: 'utf8' }).trim();
    if (openaiPath) {
      providers.openai.detected = true;
      providers.openai.binary = openaiPath;
      providers.openai.version = execSync('openai --version', { encoding: 'utf8' }).trim();
      
      // Soft auth check: Environment variable or config
      const openaiConfig = path.join(os.homedir(), '.config', 'openai');
      if (process.env.OPENAI_API_KEY || fs.existsSync(openaiConfig)) {
        providers.openai.authenticated = true;
      }
    }
  } catch (e) { /* ignore */ }

  return providers;
}

module.exports = { detectCliSessions };
