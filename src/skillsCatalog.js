const INSTALLABLE_AGENTS = new Set(['all', 'claude-code', 'codex']);

function normalizedList(value) {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim());
  }

  return typeof value === 'string'
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : [];
}

export function normalizeSkillsCatalog(payload) {
  if (!payload || !Array.isArray(payload.skills)) {
    throw new Error('The skills catalog has an invalid format.');
  }

  const seen = new Set();
  const skills = payload.skills.map(skill => {
    if (
      !skill ||
      typeof skill.name !== 'string' ||
      !/^[a-z0-9][a-z0-9-]*$/i.test(skill.name) ||
      typeof skill.description !== 'string'
    ) {
      throw new Error('The skills catalog contains an invalid entry.');
    }

    if (seen.has(skill.name)) {
      throw new Error('The skills catalog contains duplicate entries.');
    }
    seen.add(skill.name);

    return {
      name: skill.name,
      description: skill.description.trim(),
      path: typeof skill.path === 'string' ? skill.path : `skills/${skill.name}`,
      product: typeof skill.product === 'string' ? skill.product : 'Uncategorized',
      category: typeof skill.category === 'string' ? skill.category : 'other',
      subdomain: typeof skill.subdomain === 'string' ? skill.subdomain : 'General',
      audiences: normalizedList(skill.audiences),
      activityTags: normalizedList(skill.activityTags)
    };
  });

  return {
    sourceRepository: typeof payload.sourceRepository === 'string'
      ? payload.sourceRepository
      : 'NVIDIA/skills',
    sourceUrl: typeof payload.sourceUrl === 'string'
      ? payload.sourceUrl
      : 'https://github.com/NVIDIA/skills',
    sourceSnapshot: typeof payload.sourceSnapshot === 'string'
      ? payload.sourceSnapshot
      : '',
    license: typeof payload.license === 'string' ? payload.license : 'CC BY 4.0',
    skills
  };
}

function valuesForFacet(skill, field) {
  const value = skill[field];
  return Array.isArray(value) ? value : [value];
}

export function getSkillFacetOptions(skills, field) {
  const counts = new Map();
  for (const skill of skills) {
    for (const value of valuesForFacet(skill, field)) {
      if (typeof value === 'string' && value) {
        counts.set(value, (counts.get(value) || 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

export function filterAndSortSkills(skills, {
  query = '',
  categories = [],
  product = '',
  subdomain = '',
  audience = '',
  activity = '',
  sort = 'catalog'
} = {}) {
  const searchTerm = query.trim().toLowerCase();
  const filtered = skills.filter(skill => {
    const matchesQuery = !searchTerm || [
      skill.name,
      skill.description,
      skill.product,
      skill.category,
      skill.subdomain,
      ...skill.audiences,
      ...skill.activityTags
    ].join(' ').toLowerCase().includes(searchTerm);

    return matchesQuery &&
      (!categories.length || categories.includes(skill.category)) &&
      (!product || skill.product === product) &&
      (!subdomain || skill.subdomain === subdomain) &&
      (!audience || skill.audiences.includes(audience)) &&
      (!activity || skill.activityTags.includes(activity));
  });

  if (sort === 'name-asc') {
    return filtered.sort((left, right) => left.name.localeCompare(right.name));
  }
  if (sort === 'name-desc') {
    return filtered.sort((left, right) => right.name.localeCompare(left.name));
  }

  return filtered;
}

export function paginateSkills(skills, page = 1, pageSize = 24) {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 24));
  const pageCount = Math.ceil(skills.length / safePageSize);
  const currentPage = Math.min(Math.max(1, Math.floor(Number(page) || 1)), Math.max(1, pageCount));
  const start = (currentPage - 1) * safePageSize;

  return {
    items: skills.slice(start, start + safePageSize),
    page: currentPage,
    pageCount,
    total: skills.length
  };
}

export function buildSkillInstallCommand(skillName, agent = 'all') {
  if (typeof skillName !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(skillName)) {
    throw new Error('Choose a valid skill before copying its install command.');
  }
  if (!INSTALLABLE_AGENTS.has(agent)) {
    throw new Error('Choose a supported coding agent.');
  }

  const command = `npx skills add nvidia/skills --skill ${skillName} --yes`;
  return agent === 'all' ? command : `${command} --agent ${agent}`;
}

export function formatSkillCategory(category) {
  const labels = {
    accelerated_computing: 'Accelerated Computing',
    ai_and_machine_learning: 'AI and Machine Learning',
    developer_tools: 'Developer Tools',
    graphics_and_media: 'Graphics and Media',
    infrastructure: 'Infrastructure',
    physical_ai: 'Physical AI'
  };

  return labels[category] || category.replace(/_/g, ' ');
}
