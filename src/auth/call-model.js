const { spawnSync } = require('child_process');
const http = require('http');
const https = require('https');
const { routeModels } = require('./model-router');

/**
 * Unified model call interface.
 * @param {string} role - The role to invoke (e.g., 'classifier', 'reviewer').
 * @param {string} prompt - The message to send.
 * @returns {Promise<string>} - The model's response.
 */
async function callModel(role, prompt) {
  const { routingMap } = await routeModels();
  const config = routingMap[role];

  if (!config) {
    throw new Error(`No provider routed for role: ${role}`);
  }

  // 1. Dispatch by Provider Type
  switch (config.provider) {
    case 'cli':
      return callCliProvider(config, prompt);
    case 'local':
      return callLocalProvider(config, prompt);
    case 'openrouter':
      return callOpenRouter(config, prompt);
    default:
      throw new Error(`Unsupported provider type: ${config.provider}`);
  }
}

/**
 * Dispatches a prompt to a CLI provider (Claude or Gemini).
 */
function callCliProvider(config, prompt) {
  let args = [];
  if (config.model === 'claude') {
    args = [prompt]; // claude "prompt"
  } else if (config.model === 'gemini') {
    args = ['-p', prompt]; // gemini -p "prompt"
  } else if (config.model === 'openai') {
    const payload = JSON.stringify([
      { role: 'user', content: prompt }
    ]);
    args = ['chat', 'completions', 'create', '--model', 'gpt-4o', '--messages', payload];
  }

  const res = spawnSync(config.binary, args, { encoding: 'utf8', timeout: 30000 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(res.stderr || 'CLI execution failed');

  return res.stdout.trim();
}

/**
 * Dispatches a prompt to a local Ollama server.
 */
function callLocalProvider(config, prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'qwen2.5-coder-7b', // default for local
      prompt: prompt,
      stream: false
    });

    const url = new URL(`${config.url}/api/generate`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.response || json.message?.content || '');
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Dispatches a prompt to OpenRouter.
 */
function callOpenRouter(config, prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode !== 200) {
            reject(new Error(`OpenRouter error (${res.statusCode}): ${json.error?.message || body}`));
            return;
          }
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content || '');
          } else {
            reject(new Error(`OpenRouter returned unexpected format: ${body}`));
          }
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = { callModel };
