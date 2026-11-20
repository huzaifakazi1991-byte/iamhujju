// keyPool.js — High-Capacity Multi-Key Load Balancing & Zero-Downtime Failover Engine
// Provides high-throughput pooling across multiple upstream keys per provider,
// automatic 60-second cooldown on rate-limits (HTTP 429/402/503), transparent retry failover,
// and accurate token accounting.

export class KeyPool {
  constructor(options = {}) {
    this.cooldownMs = options.cooldownMs || 60000; // 60s cooldown on 429 / 402 / 503
    this.pools = new Map(); // providerId -> Array of KeyState
    this.initFromEnv();
  }

  parseKeys(envMulti, envSingle) {
    const keys = [];
    if (envMulti) {
      envMulti.split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
        if (!keys.includes(k)) keys.push(k);
      });
    }
    if (envSingle && envSingle.trim()) {
      const single = envSingle.trim();
      if (!keys.includes(single)) keys.push(single);
    }
    return keys;
  }

  initFromEnv() {
    this.registerPool('openrouter', this.parseKeys(process.env.OPENROUTER_API_KEYS, process.env.OPENROUTER_API_KEY));
    this.registerPool('groq', this.parseKeys(process.env.GROQ_API_KEYS, process.env.GROQ_API_KEY));
    this.registerPool('electronhub', this.parseKeys(process.env.ELECTRONHUB_API_KEYS, process.env.ELECTRONHUB_API_KEY));
    this.registerPool('freemodel', this.parseKeys(process.env.FREEMODEL_API_KEYS, process.env.FREEMODEL_API_KEY));
    this.registerPool('freellmapi', this.parseKeys(process.env.FREELLMAPI_KEYS, process.env.FREELLMAPI_KEY));
    this.registerPool('gemini', this.parseKeys(process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY));
    this.registerPool('together', this.parseKeys(process.env.TOGETHER_API_KEYS, process.env.TOGETHER_API_KEY));
    this.registerPool('mistral', this.parseKeys(process.env.MISTRAL_API_KEYS, process.env.MISTRAL_API_KEY));
  }

  registerPool(providerId, rawKeys = []) {
    const pool = rawKeys.filter(Boolean).map(key => ({
      key,
      cooldownUntil: 0,
      lastUsedAt: 0,
      totalRequests: 0,
      failureCount: 0,
      status: 'healthy'
    }));
    this.pools.set(providerId, pool);
  }

  hasKeys(providerId) {
    const pool = this.pools.get(providerId);
    return Boolean(pool && pool.length > 0);
  }

  getKeyCandidates(providerId, userOverrideKey = null) {
    if (userOverrideKey) {
      return [{ key: userOverrideKey, cooldownUntil: 0, isUserKey: true }];
    }
    const pool = this.pools.get(providerId) || [];
    if (pool.length === 0) return [];

    const now = Date.now();
    const healthy = [];
    const cooldown = [];

    for (const item of pool) {
      if (now >= item.cooldownUntil) {
        healthy.push(item);
      } else {
        cooldown.push(item);
      }
    }

    // Least recently used order for smooth load distribution
    healthy.sort((a, b) => a.lastUsedAt - b.lastUsedAt);

    // Earliest expiring cooldown first if all healthy are exhausted
    cooldown.sort((a, b) => a.cooldownUntil - b.cooldownUntil);

    return healthy.length > 0 ? [...healthy, ...cooldown] : cooldown;
  }

  markKeyCooldown(providerId, key, status = 429) {
    const pool = this.pools.get(providerId) || [];
    const item = pool.find(k => k.key === key);
    if (item) {
      item.cooldownUntil = Date.now() + this.cooldownMs;
      item.status = 'cooldown';
      item.failureCount++;
      console.warn(`[KeyPool] Provider '${providerId}' key (...${key.slice(-6)}) placed on 60s cooldown due to HTTP ${status}.`);
    }
  }

  markKeySuccess(providerId, key) {
    const pool = this.pools.get(providerId) || [];
    const item = pool.find(k => k.key === key);
    if (item) {
      item.lastUsedAt = Date.now();
      item.totalRequests++;
      item.status = 'healthy';
      item.cooldownUntil = 0;
    }
  }

  async executeWithFailover({
    providerId,
    userKey = null,
    requestFn,
    maxRetries = 3
  }) {
    const candidates = this.getKeyCandidates(providerId, userKey);
    if (candidates.length === 0) {
      const error = new Error(`No API keys configured in pool for provider '${providerId}'.`);
      error.status = 503;
      error.code = 'no_upstream_key';
      throw error;
    }

    let lastResponse = null;
    let lastError = null;
    const attempts = Math.min(candidates.length, maxRetries);

    for (let i = 0; i < attempts; i++) {
      const candidate = candidates[i];
      const key = candidate.key;

      try {
        const response = await requestFn(key);

        // Check if rate limited, exhausted, or upstream busy
        if (response.status === 429 || response.status === 402 || response.status === 503 || response.status === 502) {
          lastResponse = response;
          if (!candidate.isUserKey) {
            this.markKeyCooldown(providerId, key, response.status);
          }
          if (i < attempts - 1) {
            console.log(`[KeyPool Failover] Key hit HTTP ${response.status}. Retrying with next available key in ${providerId} pool...`);
            continue;
          }
        } else {
          if (!candidate.isUserKey) {
            this.markKeySuccess(providerId, key);
          }
          return response;
        }
      } catch (err) {
        lastError = err;
        if (!candidate.isUserKey) {
          this.markKeyCooldown(providerId, key, 500);
        }
        if (i < attempts - 1) continue;
      }
    }

    if (lastResponse) return lastResponse;
    throw lastError || new Error(`All keys in ${providerId} pool failed.`);
  }

  getPoolHealth() {
    const status = {};
    for (const [providerId, pool] of this.pools.entries()) {
      const now = Date.now();
      const healthy = pool.filter(k => now >= k.cooldownUntil).length;
      status[providerId] = {
        totalKeys: pool.length,
        healthyKeys: healthy,
        inCooldown: pool.length - healthy,
        state: healthy > 0 ? 'operational' : (pool.length > 0 ? 'recovering' : 'unconfigured')
      };
    }
    return status;
  }

  getStatus() {
    return this.getPoolHealth();
  }
}

// Accurate token estimator for payloads and responses
export function estimateTokens(content) {
  if (!content) return 0;
  if (typeof content === 'string') {
    return Math.max(1, Math.ceil(content.length / 3.8));
  }
  if (Array.isArray(content)) {
    let totalChars = 0;
    for (const msg of content) {
      if (typeof msg?.content === 'string') {
        totalChars += msg.content.length;
      }
    }
    return Math.max(1, Math.ceil(totalChars / 3.8));
  }
  return 0;
}

export const defaultKeyPool = new KeyPool();
