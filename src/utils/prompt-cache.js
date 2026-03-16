const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const CACHE_DIR = path.join(process.cwd(), '.dev/cache/prompts');

/**
 * Section 35.6: Prompt Caching
 * Static governance/invariant blocks cached by digest, invalidated on source change.
 */
class PromptCache {
  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cached content or generate and cache it.
   * @param {string} key - Unique identifier for the cache entry.
   * @param {string[]} dependencyPaths - Files whose changes invalidate the cache.
   * @param {Function} generator - Function that returns the string to cache.
   */
  getOrSet(key, dependencyPaths, generator) {
    const digest = this._computeDigest(dependencyPaths);
    const cachePath = path.join(CACHE_DIR, `${key}.json`);

    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cached.digest === digest) {
          this.hits++;
          return cached.content;
        }
      } catch (e) { /* ignore corrupt cache */ }
    }

    this.misses++;
    const content = generator();
    fs.writeFileSync(cachePath, JSON.stringify({ digest, content, timestamp: Date.now() }), 'utf8');
    return content;
  }

  getMetrics() {
    return { hits: this.hits, misses: this.misses };
  }

  _computeDigest(paths) {
    const hash = crypto.createHash('md5');
    for (const p of paths) {
      if (fs.existsSync(p)) {
        hash.update(fs.readFileSync(p));
      }
    }
    return hash.digest('hex');
  }
}

module.exports = new PromptCache();
