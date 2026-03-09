const http = require('http');

/**
 * Checks if a local model server is reachable and responsive.
 * @param {string} url - The URL to check.
 * @returns {Promise<boolean>} - True if responsive.
 */
function checkServer(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          // Both Ollama and LM Studio return JSON with a 'models' key.
          const json = JSON.parse(data);
          resolve(Array.isArray(json.models) || Array.isArray(json.data));
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Detects local model servers (Tier 3).
 */
async function detectLocalModels() {
  const providers = {
    ollama: { detected: false, url: 'http://localhost:11434' },
    lmstudio: { detected: false, url: 'http://localhost:1234' }
  };

  providers.ollama.detected = await checkServer(`${providers.ollama.url}/api/tags`);
  providers.lmstudio.detected = await checkServer(`${providers.lmstudio.url}/v1/models`);

  return providers;
}

module.exports = { detectLocalModels };
