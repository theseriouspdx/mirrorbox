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
          const json = JSON.parse(data);
          // Verify that models or data exist and are not empty
          const models = json.models || json.data;
          resolve(Array.isArray(models) && models.length > 0);
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
