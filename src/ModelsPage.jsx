import { useEffect, useMemo, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import {
  filterAndSortModels,
  getModelContextWindow,
  getModelProvider,
  getModelProviderOptions,
  paginateModels
} from './modelCatalog.js';
import './ModelsPage.css';

const PAGE_SIZES = [24, 48, 96];
const AVAILABILITY_OPTIONS = ['available', 'unavailable'];

function ModelCard({ model, selected, signedIn, onOpenChat, onRequestSignIn }) {
  const availability = model.available === true
    ? 'Available'
    : model.available === false
      ? 'Unavailable'
      : 'Status not reported';
  const contextWindow = getModelContextWindow(model);

  function openModel() {
    if (signedIn) {
      onOpenChat(model.id);
    } else {
      onRequestSignIn(model.id);
    }
  }

  return (
    <article className={`models-card${selected ? ' is-selected' : ''}`}>
      <div className="models-card-heading">
        <span className="models-provider">{getModelProvider(model)}</span>
        <span className={`models-availability ${model.available === false ? 'is-unavailable' : ''}`}>
          {availability}
        </span>
      </div>
      <h3>{model.name || model.id}</h3>
      <p className="models-card-id">{model.id}</p>
      <div className="models-card-footer">
        <span>{contextWindow
          ? `${Math.round(contextWindow / 1000)}K context`
          : 'Context size not reported'}</span>
        <button type="button" onClick={openModel}>
          {signedIn ? 'Open chat' : 'Sign in to chat'}
        </button>
      </div>
    </article>
  );
}

export default function ModelsPage({
  models,
  modelsLoading,
  connected,
  selectedModel,
  initialQuery = '',
  currentUser,
  chatCount,
  onOpenHome,
  onOpenSkills,
  onLogout,
  onOpenChat,
  onRequestSignInForModel,
  onOpenSavedChats,
  onOpenApiKeys,
  onOpenIntegrations,
  onRefreshModels
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [availability, setAvailability] = useState(AVAILABILITY_OPTIONS);
  const [minimumContext, setMinimumContext] = useState('0');
  const [sort, setSort] = useState('gateway');
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [refreshNotice, setRefreshNotice] = useState('');
  const providers = useMemo(() => getModelProviderOptions(models), [models]);
  const filteredModels = useMemo(() => filterAndSortModels(models, {
    query,
    providers: selectedProviders,
    minimumContext,
    availability,
    sort
  }), [models, query, selectedProviders, minimumContext, availability, sort]);
  const pageData = useMemo(
    () => paginateModels(filteredModels, page, pageSize),
    [filteredModels, page, pageSize]
  );
  const availableCount = models.filter(model => model.available === true).length;
  const unavailableCount = models.filter(model => model.available === false).length;
  const hasFilters = Boolean(
    query.trim() ||
    selectedProviders.length ||
    minimumContext !== '0' ||
    availability.length !== AVAILABILITY_OPTIONS.length ||
    sort !== 'gateway'
  );

  useEffect(() => {
    if (!refreshNotice) return undefined;
    const timeout = window.setTimeout(() => setRefreshNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [refreshNotice]);

  function toggleProvider(provider) {
    setPage(1);
    setSelectedProviders(previous => previous.includes(provider)
      ? previous.filter(item => item !== provider)
      : [...previous, provider]);
  }

  function toggleAvailability(value) {
    setPage(1);
    setAvailability(previous => previous.includes(value)
      ? previous.filter(item => item !== value)
      : [...previous, value]);
  }

  function resetFilters() {
    setQuery('');
    setSelectedProviders([]);
    setAvailability(AVAILABILITY_OPTIONS);
    setMinimumContext('0');
    setSort('gateway');
    setPageSize(PAGE_SIZES[0]);
    setPage(1);
  }

  async function refreshModels() {
    setRefreshNotice('Refreshing model availability…');
    try {
      const refreshed = await onRefreshModels();
      setRefreshNotice(refreshed
        ? 'Model availability refreshed.'
        : 'Could not refresh model availability.');
    } catch {
      setRefreshNotice('Could not refresh model availability.');
    }
  }

  const firstResult = filteredModels.length ? (pageData.page - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(pageData.page * pageSize, filteredModels.length);
  const pageNumbers = Array.from({ length: pageData.pageCount }, (_, index) => index + 1);

  return (
    <div className="models-page">
      <header className="models-nav">
        <button className="models-brand" type="button" onClick={onOpenHome} aria-label="iamhujju Explore">
          <span className="models-brand-mark" aria-hidden="true">i</span>
          <span>iamhujju</span>
        </button>
        <nav className="models-nav-links" aria-label="Main navigation">
          <button type="button" onClick={onOpenHome}>Explore</button>
          <button type="button" className="is-current" aria-current="page">Models</button>
          <button type="button" onClick={onOpenSkills}>Skills</button>
          <button
            type="button"
            onClick={() => currentUser
              ? onOpenChat(selectedModel)
              : onRequestSignInForModel(selectedModel)}
          >
            Chat
          </button>
        </nav>
        <div className="models-nav-tools">
          <span className={`models-gateway-status${connected ? ' is-online' : ''}`} role="status">
            <span aria-hidden="true" />
            {connected ? 'Gateway online' : 'Gateway offline'}
          </span>
          {currentUser ? (
            <AccountMenu
              user={currentUser}
              connected={connected}
              modelCount={models.length}
              onLogout={onLogout}
              onOpenApiKeys={onOpenApiKeys}
              onOpenIntegrations={onOpenIntegrations}
            />
          ) : (
            <button
              type="button"
              className="models-sign-in"
              onClick={() => onRequestSignInForModel(selectedModel)}
            >
              Sign in to chat
            </button>
          )}
        </div>
      </header>

      <main className="models-main">
        <header className="models-page-heading">
          <div>
            <p className="models-eyebrow">LIVE GATEWAY CATALOG</p>
            <h1>Models</h1>
            <p>Browse models currently returned by your connected gateway.</p>
          </div>
          <button
            type="button"
            className="models-refresh"
            onClick={refreshModels}
            disabled={modelsLoading}
          >
            <span className={modelsLoading ? 'is-spinning' : ''} aria-hidden="true">↻</span>
            {modelsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <div className="models-catalog-layout">
          <aside className="models-filters" aria-label="Model filters">
            <div className="models-filter-heading">
              <h2>Filters</h2>
              <button type="button" onClick={resetFilters} disabled={!hasFilters}>
                Reset
              </button>
            </div>

            <fieldset className="models-filter-group">
              <legend>Availability</legend>
              <label>
                <input
                  type="checkbox"
                  checked={availability.includes('available')}
                  onChange={() => toggleAvailability('available')}
                />
                <span>Available</span>
                <small>{availableCount}</small>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={availability.includes('unavailable')}
                  onChange={() => toggleAvailability('unavailable')}
                />
                <span>Unavailable</span>
                <small>{unavailableCount}</small>
              </label>
            </fieldset>

            <fieldset className="models-filter-group">
              <legend>Provider</legend>
              {providers.map(provider => (
                <label key={provider.name}>
                  <input
                    type="checkbox"
                    checked={selectedProviders.includes(provider.name)}
                    onChange={() => toggleProvider(provider.name)}
                  />
                  <span>{provider.name}</span>
                  <small>{provider.count}</small>
                </label>
              ))}
            </fieldset>

            <fieldset className="models-filter-group">
              <legend>Context window</legend>
              <label className="models-context-filter">
                <span className="sr-only">Minimum context window</span>
                <select
                  value={minimumContext}
                  onChange={event => {
                    setMinimumContext(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="0">Any size</option>
                  <option value="100000">100K+</option>
                  <option value="500000">500K+</option>
                </select>
              </label>
            </fieldset>

            <p className="models-filter-note">
              Filters use metadata supplied by your gateway. Unsupported model attributes are not inferred.
            </p>
          </aside>

          <section className="models-results" aria-labelledby="models-results-title">
            <div className="models-results-toolbar">
              <p id="models-results-title">
                <strong>{filteredModels.length}</strong> {filteredModels.length === 1 ? 'model' : 'models'}
                {filteredModels.length > 0 && (
                  <span> · Showing {firstResult}–{lastResult}</span>
                )}
              </p>
              <label className="models-search">
                <span className="sr-only">Refine models</span>
                <input
                  type="search"
                  value={query}
                  onChange={event => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Refine models by name or ID"
                />
              </label>
              <label className="models-sort">
                <span>Sort by</span>
                <select
                  value={sort}
                  onChange={event => {
                    setSort(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="gateway">Gateway order</option>
                  <option value="name-asc">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                  <option value="context-desc">Largest context</option>
                  <option value="context-asc">Smallest context</option>
                </select>
              </label>
            </div>

            {modelsLoading && models.length === 0 ? (
              <div className="models-card-grid" aria-label="Loading model catalog">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="models-card-skeleton" key={index} />
                ))}
              </div>
            ) : pageData.items.length ? (
              <div className="models-card-grid">
                {pageData.items.map(model => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    selected={model.id === selectedModel}
                    signedIn={Boolean(currentUser)}
                    onOpenChat={onOpenChat}
                    onRequestSignIn={onRequestSignInForModel}
                  />
                ))}
              </div>
            ) : (
              <div className="models-empty" role="status">
                <strong>{modelsLoading ? 'Loading models…' : 'No models match these filters.'}</strong>
                <p>{connected
                  ? 'Try another search or reset the selected filters.'
                  : 'Reconnect the gateway and refresh the catalog.'}</p>
                {hasFilters && (
                  <button type="button" onClick={resetFilters}>Reset filters</button>
                )}
              </div>
            )}

            <div className="models-pagination">
              <label>
                <span>Items per page</span>
                <select
                  value={pageSize}
                  onChange={event => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZES.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <nav aria-label="Model catalog pages">
                <button
                  type="button"
                  onClick={() => setPage(pageData.page - 1)}
                  disabled={pageData.page <= 1}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                {pageNumbers.map(pageNumber => (
                  <button
                    type="button"
                    key={pageNumber}
                    className={pageNumber === pageData.page ? 'is-current' : ''}
                    aria-current={pageNumber === pageData.page ? 'page' : undefined}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage(pageData.page + 1)}
                  disabled={pageData.page >= pageData.pageCount}
                  aria-label="Next page"
                >
                  Next
                </button>
              </nav>
            </div>
          </section>
        </div>
      </main>

      {refreshNotice && <div className="models-toast" role="status">{refreshNotice}</div>}
      <footer className="models-footer">
        <button type="button" onClick={onOpenSavedChats}>
          Saved conversations{chatCount > 0 ? ` (${chatCount})` : ''}
        </button>
        <span>Model availability comes from your configured gateway.</span>
      </footer>
    </div>
  );
}
