export function getModelProvider(model) {
  const provider = String(model?.provider || model?.owned_by || 'Unknown provider');
  const normalized = provider.toLowerCase();

  if (normalized === 'freellmapi') return 'FreeLLMAPI';
  if (normalized === 'openrouter') return 'OpenRouter';
  return provider;
}

export function getModelContextWindow(model) {
  const context = Number(model?.context_window ?? model?.context_length);
  return Number.isFinite(context) && context > 0 ? context : 0;
}

export function getModelProviderOptions(models) {
  const counts = new Map();
  for (const model of models) {
    const provider = getModelProvider(model);
    counts.set(provider, (counts.get(provider) || 0) + 1);
  }

  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function filterAndSortModels(models, {
  query = '',
  providers = [],
  minimumContext = 0,
  availability = ['available', 'unavailable'],
  sort = 'gateway'
} = {}) {
  const term = query.trim().toLowerCase();
  const selectedProviders = new Set(providers);
  const selectedAvailability = new Set(availability);
  const filtered = models.filter(model => {
    const searchable = [
      model.id,
      model.name,
      model.owned_by,
      model.provider,
      model.description
    ].filter(Boolean).join(' ').toLowerCase();
    const available = model.available === true
      ? 'available'
      : model.available === false
        ? 'unavailable'
        : null;
    const matchesAvailability = available
      ? selectedAvailability.has(available)
      : selectedAvailability.size === 2;

    return (!term || searchable.includes(term))
      && (!selectedProviders.size || selectedProviders.has(getModelProvider(model)))
      && getModelContextWindow(model) >= Number(minimumContext || 0)
      && matchesAvailability;
  });

  if (sort === 'name-asc') {
    filtered.sort((left, right) =>
      String(left.name || left.id).localeCompare(String(right.name || right.id))
    );
  } else if (sort === 'name-desc') {
    filtered.sort((left, right) =>
      String(right.name || right.id).localeCompare(String(left.name || left.id))
    );
  } else if (sort === 'context-desc') {
    filtered.sort((left, right) =>
      getModelContextWindow(right) - getModelContextWindow(left)
    );
  } else if (sort === 'context-asc') {
    filtered.sort((left, right) =>
      getModelContextWindow(left) - getModelContextWindow(right)
    );
  }

  return filtered;
}

export function paginateModels(models, page, pageSize) {
  const total = models.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    items: models.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    total
  };
}
