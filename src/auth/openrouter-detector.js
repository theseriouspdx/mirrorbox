const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.orchestrator', 'config.json');

/**
 * Checks if the OpenRouter key is valid and responsive.
 * @param {string} key - The API key to check.
 * @returns {Promise<boolean>} - True if responsive.
 */
function checkOpenRouter(key) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/auth/key',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`
      },
      timeout: 3000
    };

    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Detects OpenRouter fallback (Tier 2).
 */
async function detectOpenRouter() {
  const result = { detected: false, configured: false };

  // Prioritize environment variable
  let key = process.env.OPENROUTER_API_KEY;

  // Fallback to config file
  if (!key && fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (config.openRouterKey) {
        key = config.openRouterKey;
      }
    } catch (e) { /* ignore */ }
  }

  if (key) {
    result.configured = true;
    result.detected = await checkOpenRouter(key);
    result.key = key; // Expose key for callModel consistency
  }

  return result;
}

module.exports = { detectOpenRouter };
