import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAndSortModels,
  getModelProviderOptions,
  paginateModels
} from './modelCatalog.js';

const models = [
  {
    id: 'gamma-model',
    name: 'Gamma',
    owned_by: 'freellmapi',
    context_window: 128000,
    available: true
  },
  {
    id: 'alpha-model',
    name: 'Alpha',
    owned_by: 'openrouter',
    context_length: 64000,
    available: true
  },
  {
    id: 'beta-model',
    name: 'Beta',
    owned_by: 'freellmapi',
    context_window: 512000,
    available: false
  }
];

test('model catalog search matches ids and names case-insensitively', () => {
  assert.deepEqual(
    filterAndSortModels(models, { query: 'GAMMA' }).map(model => model.id),
    ['gamma-model']
  );
  assert.deepEqual(
    filterAndSortModels(models, { query: 'alpha-model' }).map(model => model.id),
    ['alpha-model']
  );
});

test('provider, availability, and context filters use model metadata', () => {
  const filtered = filterAndSortModels(models, {
    providers: ['FreeLLMAPI'],
    minimumContext: 100000,
    availability: ['available']
  });

  assert.deepEqual(filtered.map(model => model.id), ['gamma-model']);
  assert.deepEqual(getModelProviderOptions(models), [
    { name: 'FreeLLMAPI', count: 2 },
    { name: 'OpenRouter', count: 1 }
  ]);
});

test('models without an availability field remain visible only when both statuses are included', () => {
  const model = { id: 'unknown-status', name: 'Unknown status' };

  assert.equal(filterAndSortModels([model]).length, 1);
  assert.equal(filterAndSortModels([model], { availability: ['available'] }).length, 0);
});

test('catalog sorting supports names and context windows without mutating input', () => {
  assert.deepEqual(
    filterAndSortModels(models, { sort: 'name-asc' }).map(model => model.id),
    ['alpha-model', 'beta-model', 'gamma-model']
  );
  assert.deepEqual(
    filterAndSortModels(models, { sort: 'context-desc' }).map(model => model.id),
    ['beta-model', 'gamma-model', 'alpha-model']
  );
  assert.equal(models[0].id, 'gamma-model');
});

test('pagination clamps out-of-range pages and reports totals', () => {
  const result = paginateModels(models, 9, 2);

  assert.deepEqual(result, {
    items: [models[2]],
    page: 2,
    pageCount: 2,
    total: 3
  });
});
