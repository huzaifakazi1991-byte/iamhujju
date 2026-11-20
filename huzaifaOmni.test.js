// huzaifaOmni.test.js — Unit Tests for Huzaifa Kazi Omni Model Router & Intent Classifier
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUZAIFA_OMNI_MODEL_ID,
  HUZAIFA_OMNI_MODEL_METADATA,
  classifyPromptIntent,
  buildHuzaifaOmniSystemPrompt,
  getOmniCandidateModels
} from './services/huzaifaOmniRouter.js';

test('1. Huzaifa Kazi Omni Metadata: correctly defines model ID, branding and multimodal capabilities', () => {
  assert.equal(HUZAIFA_OMNI_MODEL_ID, 'huzaifa-kazi-omni');
  assert.equal(HUZAIFA_OMNI_MODEL_METADATA.id, 'huzaifa-kazi-omni');
  assert.equal(HUZAIFA_OMNI_MODEL_METADATA.name, 'Huzaifa Kazi (Omni AI)');
  assert.equal(HUZAIFA_OMNI_MODEL_METADATA.owned_by, 'Huzaifa Kazi');
  assert.equal(HUZAIFA_OMNI_MODEL_METADATA.tier, 'free');
  assert.equal(HUZAIFA_OMNI_MODEL_METADATA.isFree, true);
  assert.equal(HUZAIFA_OMNI_MODEL_METADATA.capabilities.image_generation, true);
  assert.equal(HUZAIFA_OMNI_MODEL_METADATA.capabilities.web_search, true);
});

test('2. Sub-50ms Intent Classifier: accurately detects Image Generation intent', () => {
  const t1 = classifyPromptIntent('generate an image of a cybernetic tiger in neon Tokyo');
  assert.equal(t1.modality, 'image');
  assert.ok(t1.extractedPrompt.includes('cybernetic tiger'));

  const t2 = classifyPromptIntent('draw a photorealistic landscape with purple mountains');
  assert.equal(t2.modality, 'image');
  assert.ok(t2.extractedPrompt.includes('photorealistic landscape'));

  const t3 = classifyPromptIntent('/imagine futuristic supercar on Mars');
  assert.equal(t3.modality, 'image');
  assert.ok(t3.extractedPrompt.includes('futuristic supercar'));
});

test('3. Sub-50ms Intent Classifier: accurately detects Video Generation intent', () => {
  const t1 = classifyPromptIntent('generate a video of ocean waves crashing at sunset');
  assert.equal(t1.modality, 'video');
  assert.ok(t1.extractedPrompt.includes('ocean waves'));

  const t2 = classifyPromptIntent('animate a floating astronaut in deep space');
  assert.equal(t2.modality, 'video');
  assert.ok(t2.extractedPrompt.includes('floating astronaut'));
});

test('4. Sub-50ms Intent Classifier: accurately detects Live News & Real-Time Data intent', () => {
  const t1 = classifyPromptIntent("What is today's date?");
  assert.equal(t1.modality, 'news');

  const t2 = classifyPromptIntent('What is the latest news regarding AI models today?');
  assert.equal(t2.modality, 'news');

  const t3 = classifyPromptIntent('current price of Bitcoin in USD');
  assert.equal(t3.modality, 'news');
});

test('5. Sub-50ms Intent Classifier: accurately detects Code & Deep Reasoning intent', () => {
  const t1 = classifyPromptIntent('Write a Python function to parse JSON files with error handling');
  assert.equal(t1.modality, 'code_reasoning');

  const t2 = classifyPromptIntent('```javascript\nconst x = 10;\n``` Fix this bug in my code');
  assert.equal(t2.modality, 'code_reasoning');
});

test('6. Sub-50ms Intent Classifier: classifies everyday queries as general_fast', () => {
  const t1 = classifyPromptIntent('Hello! How are you doing today?');
  assert.equal(t1.modality, 'general_fast');

  const t2 = classifyPromptIntent('Give me 3 tips for effective time management');
  assert.equal(t2.modality, 'general_fast');
});

test('7. System Persona: includes Huzaifa Kazi directives and verified current date', () => {
  const prompt = buildHuzaifaOmniSystemPrompt('Friday, November 20, 2026');
  assert.ok(prompt.includes('Huzaifa Kazi'));
  assert.ok(prompt.includes('Friday, November 20, 2026'));
  assert.ok(prompt.includes('Never expose internal upstream model IDs'));
});

test('8. Tier-Aware Candidate Pools: routes paid users to premium models and free users to free pool', () => {
  const paidPool = getOmniCandidateModels({ modality: 'code_reasoning' }, { isPaidUser: true, hasGeminiKey: true });
  assert.equal(paidPool[0].provider, 'gemini');
  assert.equal(paidPool[0].model, 'gemini-2.5-pro');

  const freePool = getOmniCandidateModels({ modality: 'code_reasoning' }, { isPaidUser: false, hasGeminiKey: false });
  assert.equal(freePool[0].provider, 'openrouter');
  assert.equal(freePool[0].model, 'deepseek/deepseek-r1:free');
});

test('9. Universal Router Alias: resolveModelTarget maps huzaifa-kazi-omni and omni to auto router', async () => {
  const { resolveModelTarget } = await import('./services/aiGateway.js');
  const target1 = resolveModelTarget('huzaifa-kazi-omni');
  assert.equal(target1.provider, 'openrouter');
  assert.equal(target1.sourceModel, 'openrouter/free');

  const target2 = resolveModelTarget('omni');
  assert.equal(target2.provider, 'openrouter');
  assert.equal(target2.sourceModel, 'openrouter/free');
});
