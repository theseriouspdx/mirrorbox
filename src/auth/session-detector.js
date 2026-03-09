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
      
      // Auth check: attempt a no-op invocation. Exit 0 = authenticated session.
      try {
        execSync('claude --help', { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
        providers.claude.authenticated = true;
      } catch (authErr) {
        providers.claude.authenticated = false;
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
      // Auth check: attempt --help. Gemini CLI exits non-zero if not authenticated.
      try {
        execSync('gemini --help', { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
        providers.gemini.authenticated = true;
      } catch (authErr) {
        providers.gemini.authenticated = false;
      }
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
