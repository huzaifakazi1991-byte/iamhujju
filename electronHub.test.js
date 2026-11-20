import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ELECTRONHUB_BASE,
  maskApiKey,
  getElectronHubBaseUrl,
  preflightElectronHubBase,
  verifyElectronHubApiKey,
  streamElectronHubChat,
  generateElectronHubImage,
  createElectronHubVideoTask
} from './services/electronHubAdapter.js';
import { getOmniCandidateModels, classifyPromptIntent } from './services/huzaifaOmniRouter.js';

test('1. Electron Hub Base URL & Preflight verification', async () => {
  assert.equal(getElectronHubBaseUrl(), DEFAULT_ELECTRONHUB_BASE);

  // Preflight check against mock fetch
  const mockFetch = async (url) => {
    assert.ok(url.includes('/models'));
    return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'deepseek-r1' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const preflight = await preflightElectronHubBase(DEFAULT_ELECTRONHUB_BASE, mockFetch);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.count, 2);
  assert.ok(typeof preflight.latencyMs === 'number');
});

test('2. Electron Hub Key Masking & Verification', async () => {
  assert.equal(maskApiKey('ek-1234567890abcdef'), 'ek-12••••••cdef');
  assert.equal(maskApiKey(null), null);

  const mockFetch = async (url, opts) => {
    assert.equal(opts.headers.Authorization, 'Bearer ek-valid-test-key');
    return new Response(JSON.stringify({
      data: [
        { id: 'gpt-4o', name: 'GPT-4o', context_window: 128000 },
        { id: 'deepseek-r1:free', name: 'DeepSeek R1 Free', context_window: 64000 }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await verifyElectronHubApiKey('ek-valid-test-key', { fetchImpl: mockFetch });
  assert.equal(result.ok, true);
  assert.equal(result.modelCount, 2);
  assert.equal(result.maskedKey, 'ek-va••••••-key');
  assert.equal(result.models[0].id, 'electronhub:gpt-4o');
  assert.equal(result.models[1].isFree, true);
});

test('3. Schema & Streaming Parity for Electron Hub Chat', async () => {
  let capturedPayload = null;
  const mockFetch = async (url, opts) => {
    assert.ok(url.endsWith('/chat/completions'));
    capturedPayload = JSON.parse(opts.body);
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    });
  };

  const response = await streamElectronHubChat({
    apiKey: 'ek-test-key',
    model: 'electronhub:gpt-4o',
    messages: [{ role: 'user', content: 'Hi' }],
    stream: true,
    fetchImpl: mockFetch
  });

  assert.equal(response.status, 200);
  assert.equal(capturedPayload.model, 'gpt-4o', 'Must strip electronhub: prefix');
  assert.equal(capturedPayload.stream, true);
  const text = await response.text();
  assert.ok(text.includes('data: [DONE]'));
});

test('4. Specialized Image & Video Generation Endpoints for Electron Hub', async () => {
  const mockImageFetch = async (url, opts) => {
    assert.ok(url.endsWith('/images/generations'));
    const body = JSON.parse(opts.body);
    assert.equal(body.prompt, 'a cyberpunk cat');
    return new Response(JSON.stringify({
      data: [{ url: 'https://cdn.electronhub.ai/generated-flux-cat.png' }]
    }), { status: 200 });
  };

  const imgResult = await generateElectronHubImage({
    prompt: 'a cyberpunk cat',
    apiKey: 'ek-test-key',
    fetchImpl: mockImageFetch
  });
  assert.equal(imgResult.data[0].url, 'https://cdn.electronhub.ai/generated-flux-cat.png');

  const mockVideoFetch = async (url, opts) => {
    assert.ok(url.endsWith('/videos/generations'));
    return new Response(JSON.stringify({
      task_id: 'task_kling_999',
      video_url: 'https://cdn.electronhub.ai/kling-video.mp4'
    }), { status: 200 });
  };

  const vidResult = await createElectronHubVideoTask({
    prompt: 'waves crashing on neon beach',
    apiKey: 'ek-test-key',
    fetchImpl: mockVideoFetch
  });
  assert.equal(vidResult.videoUrl, 'https://cdn.electronhub.ai/kling-video.mp4');
});

test('5. Huzaifa Kazi Omni Router integrates Electron Hub into Candidate Pool', async () => {
  const codeIntent = classifyPromptIntent('write an asynchronous queue in python');
  const candidates = getOmniCandidateModels(codeIntent, { isPaidUser: true, hasGeminiKey: true });
  assert.ok(candidates.some(c => c.provider === 'electronhub'), 'Must include Electron Hub in code reasoning candidates');
  assert.ok(candidates.some(c => c.provider === 'gemini'), 'Must include Gemini in candidates');
  assert.ok(candidates.some(c => c.provider === 'openrouter'), 'Must include OpenRouter in candidates');
});
