import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSkillInstallCommand,
  filterAndSortSkills,
  getSkillFacetOptions,
  normalizeSkillsCatalog,
  paginateSkills
} from './skillsCatalog.js';

const catalog = normalizeSkillsCatalog({
  sourceRepository: 'NVIDIA/skills',
  skills: [
    {
      name: 'cuopt-api',
      description: 'Optimize routing with cuOpt.',
      product: 'cuOpt',
      category: 'accelerated_computing',
      subdomain: 'optimization',
      audiences: ['developer', 'researcher'],
      activityTags: ['optimize', 'configure']
    },
    {
      name: 'cuda-guide',
      description: 'Develop CUDA applications.',
      product: 'CUDA',
      category: 'accelerated_computing',
      subdomain: 'compute',
      audiences: ['developer'],
      activityTags: ['get_started']
    },
    {
      name: 'physical-ai-setup',
      description: 'Set up a robotics workflow.',
      product: 'Isaac Sim',
      category: 'physical_ai',
      subdomain: 'robotics',
      audiences: ['researcher'],
      activityTags: ['configure']
    }
  ]
}).skills;

test('skill search and metadata filters combine without mutating input', () => {
  const results = filterAndSortSkills(catalog, {
    query: 'routing',
    categories: ['accelerated_computing'],
    product: 'cuOpt',
    audience: 'developer',
    activity: 'optimize'
  });

  assert.deepEqual(results.map(skill => skill.name), ['cuopt-api']);
  assert.deepEqual(catalog.map(skill => skill.name), ['cuopt-api', 'cuda-guide', 'physical-ai-setup']);
});

test('skill catalog supports category facets and alphabetical sorting', () => {
  assert.deepEqual(
    getSkillFacetOptions(catalog, 'category').map(option => option.value),
    ['accelerated_computing', 'physical_ai']
  );
  assert.deepEqual(
    filterAndSortSkills(catalog, { sort: 'name-desc' }).map(skill => skill.name),
    ['physical-ai-setup', 'cuopt-api', 'cuda-guide']
  );
});

test('skill pagination clamps pages and reports the filtered result total', () => {
  const result = paginateSkills(catalog, 9, 2);
  assert.equal(result.page, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.total, 3);
  assert.deepEqual(result.items.map(skill => skill.name), ['physical-ai-setup']);
});

test('install commands copy documented targets and reject unsafe values', () => {
  assert.equal(
    buildSkillInstallCommand('cuopt-api'),
    'npx skills add nvidia/skills --skill cuopt-api --yes'
  );
  assert.equal(
    buildSkillInstallCommand('cuopt-api', 'claude-code'),
    'npx skills add nvidia/skills --skill cuopt-api --yes --agent claude-code'
  );
  assert.throws(() => buildSkillInstallCommand('x; Remove-Item'));
  assert.throws(() => buildSkillInstallCommand('cuda-guide', 'unsupported'));
});

test('invalid and duplicate catalog entries are rejected', () => {
  assert.throws(() => normalizeSkillsCatalog({ skills: [{ name: 'bad name', description: 'x' }] }));
  assert.throws(() => normalizeSkillsCatalog({
    skills: [
      { name: 'same-skill', description: 'One' },
      { name: 'same-skill', description: 'Two' }
    ]
  }));
});
