'use strict';

const { execSync } = require('child_process');
const http = require('http');

function cliExists(name) {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function queryOllamaModelNames() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:11434/api/tags', { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve((json.models || []).map((m) => m.name));
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

async function detectProviders() {
  const ollamaModels = await queryOllamaModelNames();
  return {
    geminiCLI:    cliExists('gemini'),
    claudeCLI:    cliExists('claude'),
    codexCLI:     cliExists('codex'),
    ollamaModels,
    openrouterKey: process.env.OPENROUTER_API_KEY || null,
    anthropicKey:  process.env.ANTHROPIC_API_KEY  || null,
  };
}

module.exports = { detectProviders };
