/**
 * src/utils/pricing.js — OpenRouter Pricing Fetcher & Cache
 * Implements real-time rates fetch with local fallback per Task 1.1-H09.
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'pricing_cache.json');

// Static fallback table per Section 30.2
const STATIC_FALLBACK = {
  'anthropic/claude-3.7-sonnet': { prompt: 0.000015, completion: 0.000075 },
  'anthropic/claude-3.5-sonnet': { prompt: 0.000003, completion: 0.000015 },
  'google/gemini-pro-1.5':      { prompt: 0.0000035, completion: 0.0000105 },
  'google/gemini-2.0-flash-001': { prompt: 0.0000001, completion: 0.0000004 },
  'default':                    { prompt: 0.000002, completion: 0.000010 }
};

/**
 * Fetches latest pricing from OpenRouter API.
 */
async function fetchPricing() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/models',
      method: 'GET',
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.data || !Array.isArray(json.data)) {
            return resolve(null);
          }
          
          const pricing = {};
          json.data.forEach(m => {
            if (m.id && m.pricing) {
              pricing[m.id] = {
                prompt: parseFloat(m.pricing.prompt) || 0,
                completion: parseFloat(m.pricing.completion) || 0
              };
            }
          });
          
          // Save to cache
          const dir = path.dirname(CACHE_FILE);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          
          fs.writeFileSync(CACHE_FILE, JSON.stringify({
            timestamp: Date.now(),
            pricing
          }, null, 2), 'utf8');
          
          resolve(pricing);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Gets pricing for a specific model, with multiple levels of fallback.
 */
async function getModelPricing(modelId) {
  let cache = null;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')).pricing;
    }
  } catch (_) {}

  // If cache is missing, return static fallback but don't block on fetch here.
  // fetchPricing is typically called at session start.
  const pricing = (cache && cache[modelId]) 
    ? cache[modelId] 
    : (STATIC_FALLBACK[modelId] || STATIC_FALLBACK['default']);

  return pricing;
}

module.exports = { getModelPricing, fetchPricing };
