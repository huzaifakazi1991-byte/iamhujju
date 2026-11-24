// scripts/test_all_production_models.mjs
import fs from 'node:fs';

const MASTER_KEY = process.env.HUJJU_MASTER_KEY;
if (!MASTER_KEY || !MASTER_KEY.startsWith('sk-hujju-')) {
  console.error('Error: HUJJU_MASTER_KEY is not set.');
  console.error('Run: HUJJU_MASTER_KEY=sk-hujju-... node scripts/test_all_production_models.mjs');
  process.exit(1);
}

const BASE_URL = 'https://iamhujju.com/v1';

async function main() {
  console.log('Fetching all models from https://iamhujju.com/v1/models...');
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${MASTER_KEY}` }
  });

  const data = await res.json();
  const allModels = data.data || [];
  console.log(`Retrieved ${allModels.length} models total.\n`);

  // Filter models that are advertised or marked as free
  const freeModels = allModels.filter(m => {
    const id = m.id || '';
    return m.isFree === true ||
      m.tier === 'free' ||
      id.endsWith(':free') ||
      id.includes('/free') ||
      id === 'openrouter:openrouter/free' ||
      id === 'openrouter:openrouter/auto' ||
      id === 'auto' ||
      id === 'free-router' ||
      (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0');
  });

  console.log(`Found ${freeModels.length} candidate free models.`);
  console.log('Testing each one with POST /v1/chat/completions (max_tokens: 80)...\n');

  const testResults = [];

  for (const m of freeModels) {
    process.stdout.write(`Testing [${m.id}]... `);
    const start = Date.now();
    try {
      const chatRes = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MASTER_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: m.id,
          messages: [{ role: 'user', content: 'Say "Antigravity works!" in 2 words.' }],
          max_tokens: 80
        })
      });

      const elapsed = Date.now() - start;
      const text = await chatRes.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}

      const msg = json?.choices?.[0]?.message;
      const reply = (msg?.content || msg?.reasoning || '').trim().replace(/\n/g, ' ');

      if (chatRes.ok && reply) {
        console.log(`✅ OK (${elapsed}ms): "${reply.slice(0, 50)}"`);
        testResults.push({
          id: m.id,
          name: m.name,
          provider: m.provider || (m.id.startsWith('openrouter:') ? 'openrouter' : 'unknown'),
          status: 'WORKING',
          latencyMs: elapsed,
          sampleOutput: reply.slice(0, 100)
        });
      } else {
        const errMsg = json?.error?.message || text.slice(0, 120);
        console.log(`❌ FAIL (${chatRes.status}, ${elapsed}ms): ${errMsg}`);
        testResults.push({
          id: m.id,
          name: m.name,
          provider: m.provider || (m.id.startsWith('openrouter:') ? 'openrouter' : 'unknown'),
          status: 'FAILED',
          httpStatus: chatRes.status,
          error: errMsg
        });
      }
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      testResults.push({
        id: m.id,
        name: m.name,
        status: 'ERROR',
        error: err.message
      });
    }
  }

  fs.writeFileSync('scripts/free_models_audit_report.json', JSON.stringify(testResults, null, 2));
  console.log('\nSaved audit report to scripts/free_models_audit_report.json');

  const working = testResults.filter(r => r.status === 'WORKING');
  const failed = testResults.filter(r => r.status !== 'WORKING');
  console.log(`\n========================================`);
  console.log(`Total Tested: ${testResults.length}`);
  console.log(`Working Free Models: ${working.length}`);
  console.log(`Broken / Failed Models: ${failed.length}`);
  console.log(`========================================`);

  console.log('\n--- VERIFIED WORKING 100% FREE MODELS ---');
  working.forEach(w => console.log(`✓ ${w.id} (${w.name})`));

  console.log('\n--- BROKEN / NON-FREE MODELS TO REMOVE FROM FREE LIST ---');
  failed.forEach(f => console.log(`✗ ${f.id} (${f.httpStatus || 'ERR'}): ${f.error?.slice(0, 80)}`));
}

main().catch(console.error);
