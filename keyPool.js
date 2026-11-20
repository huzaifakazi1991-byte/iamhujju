// keyPool.js — High-Capacity Multi-Key Load Balancing & Zero-Downtime Failover Engine
// Provides high-throughput pooling across multiple upstream keys per provider,
// automatic 60-second cooldown on rate-limits (HTTP 429/402/503), persistent DB key vault,
// cross-provider fallback chains, and accurate token accounting.

import { createDecipheriv, createHash } from 'node:crypto';

function deriveEncryptionKey(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) return null;
  return createHash('sha256')
    .update('iamhujju-api-key-encryption-v1\0')
    .update(secret)
    .digest();
}

function decryptVaultCredential(row, encryptionKey) {
  if (!encryptionKey || !row.key_ciphertext || !row.iv || !row.auth_tag) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey,
      Buffer.from(row.iv, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.key_ciphertext, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch (err) {
    return null;
  }
}

export class KeyPool {
  constructor(options = {}) {
    this.cooldownMs = options.cooldownMs || 60000; // 60s cooldown on 429 / 503
    this.exhaustedCooldownMs = options.exhaustedCooldownMs || 3600000; // 1 hr on 402 exhausted
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
    this.registerPool('gemini', this.parseKeys(process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY));
    this.registerPool('electronhub', this.parseKeys(process.env.ELECTRONHUB_API_KEYS, process.env.ELECTRONHUB_API_KEY));
    this.registerPool('freemodel', this.parseKeys(process.env.FREEMODEL_API_KEYS, process.env.FREEMODEL_API_KEY));
    this.registerPool('freellmapi', this.parseKeys(process.env.FREELLMAPI_KEYS, process.env.FREELLMAPI_KEY));
    this.registerPool('mistral', this.parseKeys(process.env.MISTRAL_API_KEYS, process.env.MISTRAL_API_KEY));
    this.registerPool('together', this.parseKeys(process.env.TOGETHER_API_KEYS, process.env.TOGETHER_API_KEY));
    this.registerPool('cerebras', this.parseKeys(process.env.CEREBRAS_API_KEYS, process.env.CEREBRAS_API_KEY));
    this.registerPool('sambanova', this.parseKeys(process.env.SAMBANOVA_API_KEYS, process.env.SAMBANOVA_API_KEY));
    this.registerPool('cohere', this.parseKeys(process.env.COHERE_API_KEYS, process.env.COHERE_API_KEY));
    this.registerPool('huggingface', this.parseKeys(process.env.HUGGINGFACE_API_KEYS, process.env.HUGGINGFACE_API_KEY));
  }

  async loadKeysFromDatabase(db, encryptionSecret) {
    if (!db || !encryptionSecret) return 0;
    const encryptionKey = deriveEncryptionKey(encryptionSecret);
    if (!encryptionKey) return 0;

    try {
      const res = await db.query(
        `SELECT id, provider, key_label, key_ciphertext, iv, auth_tag, status, cooldown_until
         FROM system_provider_keys
         WHERE status != 'invalid'`
      );

      let loadedCount = 0;
      for (const row of res.rows) {
        const rawKey = decryptVaultCredential(row, encryptionKey);
        if (rawKey) {
          const pool = this.pools.get(row.provider) || [];
          if (!pool.some(k => k.key === rawKey)) {
            pool.push({
              key: rawKey,
              cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0,
              lastUsedAt: 0,
              totalRequests: 0,
              failureCount: 0,
              status: row.status || 'healthy',
              dbId: row.id,
              label: row.key_label
            });
            this.pools.set(row.provider, pool);
            loadedCount++;
          }
        }
      }
      if (loadedCount > 0) {
        console.log(`[KeyVault] Successfully loaded ${loadedCount} persistent provider keys from database.`);
      }
      return loadedCount;
    } catch (err) {
      console.warn(`[KeyVault] Database key vault query note: ${err.message}`);
      return 0;
    }
  }

  registerPool(providerId, rawKeys = []) {
    const existing = this.pools.get(providerId) || [];
    const pool = [...existing];

    for (const key of rawKeys.filter(Boolean)) {
      if (!pool.some(k => k.key === key)) {
        pool.push({
          key,
          cooldownUntil: 0,
          lastUsedAt: 0,
          totalRequests: 0,
          failureCount: 0,
          status: 'healthy'
        });
      }
    }
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
      if (item.status === 'invalid') continue;

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

  markKeyExhausted(providerId, key) {
    const pool = this.pools.get(providerId) || [];
    const item = pool.find(k => k.key === key);
    if (item) {
      item.cooldownUntil = Date.now() + this.exhaustedCooldownMs;
      item.status = 'exhausted';
      item.failureCount++;
      console.warn(`[KeyPool] Provider '${providerId}' key (...${key.slice(-6)}) placed on 1hr cooldown due to quota exhaustion (HTTP 402).`);
    }
  }

  markKeyInvalid(providerId, key) {
    const pool = this.pools.get(providerId) || [];
    const item = pool.find(k => k.key === key);
    if (item) {
      item.status = 'invalid';
      item.failureCount++;
      console.error(`[KeyPool] Provider '${providerId}' key (...${key.slice(-6)}) marked INVALID due to HTTP 401/403.`);
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
    maxRetries = 3,
    fallbackChain = []
  }) {
    const candidates = this.getKeyCandidates(providerId, userKey);
    let lastResponse = null;
    let lastError = null;

    if (candidates.length > 0) {
      const attempts = Math.min(candidates.length, maxRetries);

      for (let i = 0; i < attempts; i++) {
        const candidate = candidates[i];
        const key = candidate.key;

        try {
          const response = await requestFn(key, providerId);

          // Check if rate limited, exhausted, or upstream busy
          if (response.status === 429 || response.status === 503 || response.status === 502) {
            lastResponse = response;
            if (!candidate.isUserKey) {
              this.markKeyCooldown(providerId, key, response.status);
            }
            if (i < attempts - 1) {
              console.log(`[KeyPool Failover] Key hit HTTP ${response.status}. Retrying with next available key in ${providerId} pool...`);
              continue;
            }
          } else if (response.status === 402) {
            lastResponse = response;
            if (!candidate.isUserKey) {
              this.markKeyExhausted(providerId, key);
            }
            if (i < attempts - 1) {
              console.log(`[KeyPool Failover] Key hit HTTP 402 (quota). Retrying with next available key in ${providerId} pool...`);
              continue;
            }
          } else if (response.status === 401 || response.status === 403) {
            lastResponse = response;
            if (!candidate.isUserKey) {
              this.markKeyInvalid(providerId, key);
            }
            if (i < attempts - 1) {
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
    }

    // Cross-Provider Fallback Chain Execution
    if (Array.isArray(fallbackChain) && fallbackChain.length > 0) {
      for (const fallback of fallbackChain) {
        const fbProvider = typeof fallback === 'string' ? fallback : fallback.provider;
        const fbModel = typeof fallback === 'string' ? null : fallback.model;

        if (!fbProvider || fbProvider === providerId) continue;
        const fbCandidates = this.getKeyCandidates(fbProvider);
        const fbKey = fbCandidates.find(c => Date.now() >= c.cooldownUntil)?.key;

        if (fbKey) {
          try {
            console.log(`[Cross-Provider Failover] Primary '${providerId}' failed. Failing over to '${fbProvider}' (${fbModel || 'default'})...`);
            const fbRes = await requestFn(fbKey, fbProvider, fbModel);
            if (fbRes.ok || fbRes.status === 200) {
              this.markKeySuccess(fbProvider, fbKey);
              return fbRes;
            }
          } catch (fbErr) {
            console.warn(`[Cross-Provider Failover] Fallback '${fbProvider}' attempt failed: ${fbErr.message}`);
          }
        }
      }
    }

    if (lastResponse) return lastResponse;
    if (candidates.length === 0) {
      const error = new Error(`No API keys configured in pool for provider '${providerId}'.`);
      error.status = 503;
      error.code = 'no_upstream_key';
      throw error;
    }
    throw lastError || new Error(`All keys in ${providerId} pool failed.`);
  }

  getPoolHealth() {
    const status = {};
    for (const [providerId, pool] of this.pools.entries()) {
      const now = Date.now();
      const healthy = pool.filter(k => k.status !== 'invalid' && now >= k.cooldownUntil).length;
      const inCooldown = pool.filter(k => k.status !== 'invalid' && now < k.cooldownUntil).length;
      const invalid = pool.filter(k => k.status === 'invalid').length;
      const exhausted = pool.filter(k => k.status === 'exhausted').length;

      status[providerId] = {
        totalKeys: pool.length,
        healthyKeys: healthy,
        inCooldown,
        exhausted,
        invalid,
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
