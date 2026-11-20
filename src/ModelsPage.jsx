import { useEffect, useMemo, useRef, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import {
  filterAndSortModels,
  generateCodeSnippet,
  getModelBenchmarks,
  getModelContextWindow,
  getModelProvider,
  getModelProviderOptions,
  paginateModels
} from './modelCatalog.js';
import './ModelsPage.css';

const PAGE_SIZES = [24, 48, 96];
const AVAILABILITY_OPTIONS = ['available', 'unavailable'];

function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    code: <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /></>
  };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function modelInitials(model) {
  const id = (model.sourceId || model.id).toLowerCase();
  if (id.includes('gemini')) return 'G';
  if (id.includes('deepseek')) return 'D';
  if (id.startsWith('gpt-')) return 'GPT';
  if (id.includes('qwen')) return 'Q';
  if (id.includes('llama')) return 'L';
  if (id.includes('mistral')) return 'M';
  if (id.includes('glm')) return 'GLM';
  return 'AI';
}

function ModelDetailModal({ model, isOpen, onClose, onSelectModel }) {
  const [selectedLang, setSelectedLang] = useState('curl');
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  if (!model) return null;

  const benchmarks = getModelBenchmarks(model);
  const contextWindow = getModelContextWindow(model);
  const snippet = generateCodeSnippet(model.id, selectedLang);
  const isFree = model.isFree !== false && (model.isFree || model.tier === 'free' || model.id?.includes(':free') || model.id === 'openrouter:openrouter/free' || model.id === 'openrouter:openrouter/auto');

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <dialog
      className="model-detail-modal"
      ref={dialogRef}
      onCancel={onClose}
      onClick={e => { if (e.target === dialogRef.current) onClose(); }}
    >
      <div className="model-modal-content">
        <header className="model-modal-header">
          <div className="model-modal-title-group">
            <span className="model-modal-mark">{modelInitials(model)}</span>
            <div>
              <span className="model-modal-provider">{getModelProvider(model)}</span>
              <h2>{model.name || model.id}</h2>
              <span className="model-modal-slug">{model.id}</span>
            </div>
          </div>
          <button type="button" className="model-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </header>

        {/* Benchmark & Specs Matrix (AnyAPI style) */}
        <div className="model-specs-grid">
          <div className="spec-card">
            <span className="spec-label">Context Window</span>
            <strong className="spec-value">{contextWindow ? `${Math.round(contextWindow / 1000)}K tokens` : '128K tokens'}</strong>
          </div>
          <div className="spec-card">
            <span className="spec-label">Throughput / Speed</span>
            <strong className="spec-value">{benchmarks.speed} tok/s</strong>
          </div>
          <div className="spec-card">
            <span className="spec-label">Intelligence Score</span>
            <div className="spec-bar-wrapper">
              <div className="spec-bar-fill" style={{ width: `${benchmarks.intelligence}%` }} />
            </div>
            <strong className="spec-value">{benchmarks.intelligence} / 100</strong>
          </div>
          <div className="spec-card">
            <span className="spec-label">Pricing Tier</span>
            {isFree ? (
              <strong className="spec-value tag-free">100% Free Tier</strong>
            ) : (
              <strong className="spec-value tag-pro">BYOK / Pro</strong>
            )}
          </div>
        </div>

        {/* Multi-Language Code Snippet Generator */}
        <div className="model-code-generator">
          <div className="code-gen-header">
            <div className="code-lang-tabs" role="tablist">
              <button
                type="button"
                className={`code-tab ${selectedLang === 'curl' ? 'is-active' : ''}`}
                onClick={() => setSelectedLang('curl')}
              >
                cURL
              </button>
              <button
                type="button"
                className={`code-tab ${selectedLang === 'python' ? 'is-active' : ''}`}
                onClick={() => setSelectedLang('python')}
              >
                Python (SDK)
              </button>
              <button
                type="button"
                className={`code-tab ${selectedLang === 'typescript' ? 'is-active' : ''}`}
                onClick={() => setSelectedLang('typescript')}
              >
                TypeScript
              </button>
              <button
                type="button"
                className={`code-tab ${selectedLang === 'go' ? 'is-active' : ''}`}
                onClick={() => setSelectedLang('go')}
              >
                Go
              </button>
            </div>
            <button type="button" className="code-copy-btn" onClick={copyCode}>
              <Icon name={copied ? 'check' : 'copy'} size={15} />
              <span>{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>
          </div>
          <pre className="code-display">
            <code>{snippet}</code>
          </pre>
        </div>

        {/* Modal Action CTA */}
        <div className="model-modal-actions">
          <button
            type="button"
            className="model-chat-cta"
            onClick={() => {
              onClose();
              onSelectModel(model.id);
            }}
          >
            <span>Start Chatting with {model.name || model.id}</span>
            <Icon name="arrow" size={17} />
          </button>
        </div>
      </div>
    </dialog>
  );
}

function ModelCard({ model, selected, signedIn, onOpenChat, onRequestSignIn, onOpenDetail }) {
  const availability = model.available === true
    ? 'Available'
    : model.available === false
      ? 'Unavailable'
      : 'Active';
  const contextWindow = getModelContextWindow(model);
  const benchmarks = getModelBenchmarks(model);

  const isFree = model.isFree !== false && (model.isFree || model.tier === 'free' || model.id?.includes(':free') || model.id === 'openrouter:openrouter/free' || model.id === 'openrouter:openrouter/auto');

  function openModel() {
    if (signedIn) {
      onOpenChat(model.id);
    } else {
      onRequestSignIn(model.id);
    }
  }

  return (
    <article className={`any-catalog-card${selected ? ' is-selected' : ''}`}>
      <div className="any-card-top">
        <span className="any-card-badge" aria-hidden="true">
          {modelInitials(model)}
        </span>
        <div className="any-card-meta">
          <span className="any-card-provider">{getModelProvider(model)}</span>
          <h3 className="any-card-title">{model.name || model.id}</h3>
          <span className="any-card-slug">{model.id}</span>
        </div>
        <span className={`any-card-status ${model.available === false ? 'is-unavailable' : 'is-available'}`}>
          {availability}
        </span>
      </div>

      {/* Visual Benchmark Bars (AnyAPI style) */}
      <div className="any-card-benchmarks">
        <div className="benchmark-row">
          <span>Intelligence</span>
          <div className="bar-track">
            <div className="bar-fill cyan" style={{ width: `${benchmarks.intelligence}%` }} />
          </div>
          <span className="score">{benchmarks.intelligence}%</span>
        </div>
        <div className="benchmark-row">
          <span>Speed</span>
          <div className="bar-track">
            <div className="bar-fill blue" style={{ width: `${Math.min(100, benchmarks.speed)}%` }} />
          </div>
          <span className="score">{benchmarks.speed} tok/s</span>
        </div>
      </div>

      <div className="any-card-tags">
        <span className="any-tag-context">
          {contextWindow ? `${Math.round(contextWindow / 1000)}K context` : '128K context'}
        </span>
        {isFree ? (
          <span className="any-tag-free">100% Free Tier</span>
        ) : (
          <span className="any-tag-pro">BYOK / Pro</span>
        )}
        {benchmarks.modality.includes('vision') && <span className="any-tag-modality">Vision</span>}
        {benchmarks.modality.includes('code') && <span className="any-tag-modality">Code</span>}
      </div>

      <div className="any-card-footer">
        <button
          type="button"
          className="any-btn-specs"
          onClick={() => onOpenDetail(model)}
        >
          <Icon name="code" size={14} />
          <span>Code & Specs</span>
        </button>
        <button type="button" className="any-btn-chat" onClick={openModel}>
          <span>{signedIn ? 'Chat' : 'Sign in to chat'}</span>
          <Icon name="arrow" size={14} />
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
  chatCount: _chatCount,
  onOpenHome,
  onOpenSkills,
  onLogout,
  onOpenChat,
  onRequestSignInForModel,
  onOpenSavedChats,
  onOpenApiKeys,
  onOpenIntegrations,
  onOpenPricing,
  onRefreshModels
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [availability, setAvailability] = useState(AVAILABILITY_OPTIONS);
  const [minimumContext, setMinimumContext] = useState('0');
  const [sort, setSort] = useState('gateway');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [refreshNotice, setRefreshNotice] = useState('');
  const [detailModel, setDetailModel] = useState(null);

  const providers = useMemo(() => getModelProviderOptions(models), [models]);

  const freeModelsCount = useMemo(
    () => models.filter(m => m.isFree || m.tier === 'free' || m.id?.includes(':free')).length,
    [models]
  );
  const proModelsCount = useMemo(
    () => models.length - freeModelsCount,
    [models, freeModelsCount]
  );

  // Enhanced category filtering
  const categoryFiltered = useMemo(() => {
    if (categoryFilter === 'all') return models;
    return models.filter(m => {
      const isFree = m.isFree || m.tier === 'free' || m.id?.includes(':free');
      if (categoryFilter === 'free') return isFree;
      if (categoryFilter === 'pro') return !isFree;
      const b = getModelBenchmarks(m);
      if (categoryFilter === 'coding') return b.coding >= 90 || m.id.toLowerCase().includes('code');
      if (categoryFilter === 'reasoning') return b.intelligence >= 92 || m.id.toLowerCase().includes('r1') || m.id.toLowerCase().includes('reason');
      if (categoryFilter === 'vision') return b.modality.includes('vision') || m.id.toLowerCase().includes('vision');
      return true;
    });
  }, [models, categoryFilter]);

  const filteredModels = useMemo(() => filterAndSortModels(categoryFiltered, {
    query,
    providers: selectedProviders,
    minimumContext,
    availability,
    sort
  }), [categoryFiltered, query, selectedProviders, minimumContext, availability, sort]);

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
    sort !== 'gateway' ||
    categoryFilter !== 'all'
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
    setCategoryFilter('all');
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
          <div className="models-brand-mascot-ring">
            <img src="/mascot.jpg" alt="iamhujju mascot" className="models-brand-mascot-img" />
          </div>
          <span>iamhujju</span>
        </button>
        <nav className="models-nav-links" aria-label="Main navigation">
          <button type="button" onClick={onOpenHome}>Explore</button>
          <button type="button" className="is-current" aria-current="page">Models</button>
          <button type="button" onClick={onOpenSkills}>Skills</button>
          <button type="button" onClick={onOpenSavedChats}>Saved Chats</button>
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
              onOpenPricing={onOpenPricing}
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
            <p className="models-eyebrow">UNIFIED AI HUB & DIRECTORY</p>
            <h1>AI Models Catalog</h1>
            <p>Explore live models, benchmark scores, specifications, and drop-in code snippets.</p>
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

        {/* Quick Category Filter Pills (AnyAPI style) */}
        <div className="models-category-bar">
          <button
            type="button"
            className={`cat-pill ${categoryFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => { setCategoryFilter('all'); setPage(1); }}
          >
            All Models ({models.length})
          </button>
          <button
            type="button"
            className={`cat-pill ${categoryFilter === 'free' ? 'is-active' : ''}`}
            onClick={() => { setCategoryFilter('free'); setPage(1); }}
          >
            100% Free Tier ({freeModelsCount})
          </button>
          <button
            type="button"
            className={`cat-pill ${categoryFilter === 'pro' ? 'is-active' : ''}`}
            onClick={() => { setCategoryFilter('pro'); setPage(1); }}
          >
            BYOK / Pro ({proModelsCount})
          </button>
          <button
            type="button"
            className={`cat-pill ${categoryFilter === 'coding' ? 'is-active' : ''}`}
            onClick={() => { setCategoryFilter('coding'); setPage(1); }}
          >
            Coding & Tech
          </button>
          <button
            type="button"
            className={`cat-pill ${categoryFilter === 'reasoning' ? 'is-active' : ''}`}
            onClick={() => { setCategoryFilter('reasoning'); setPage(1); }}
          >
            Reasoning & Math
          </button>
          <button
            type="button"
            className={`cat-pill ${categoryFilter === 'vision' ? 'is-active' : ''}`}
            onClick={() => { setCategoryFilter('vision'); setPage(1); }}
          >
            Vision / Multimodal
          </button>
        </div>

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

            <div className="models-filter-group">
              <label htmlFor="context-filter">Minimum context</label>
              <select
                id="context-filter"
                value={minimumContext}
                onChange={e => {
                  setMinimumContext(e.target.value);
                  setPage(1);
                }}
              >
                <option value="0">Any size</option>
                <option value="32000">At least 32K</option>
                <option value="64000">At least 64K</option>
                <option value="128000">At least 128K</option>
                <option value="1000000">At least 1M</option>
              </select>
            </div>
          </aside>

          <section className="models-results" aria-label="Model results">
            <div className="models-search-bar">
              <div className="models-search-input">
                <Icon name="search" size={17} />
                <input
                  type="search"
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search models by name, slug, or provider..."
                />
              </div>

              <div className="models-sort-control">
                <label htmlFor="models-sort">Sort by</label>
                <select
                  id="models-sort"
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                >
                  <option value="gateway">Default gateway</option>
                  <option value="intelligence-desc">Intelligence (Highest)</option>
                  <option value="speed-desc">Speed (Fastest tok/s)</option>
                  <option value="context-desc">Context (Largest)</option>
                  <option value="name-asc">Name (A-Z)</option>
                </select>
              </div>
            </div>

            <div className="models-results-header">
              <span>Showing {firstResult}–{lastResult} of {filteredModels.length} models</span>
            </div>

            {pageData.items.length > 0 ? (
              <div className="any-catalog-grid">
                {pageData.items.map(model => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    selected={model.id === selectedModel}
                    signedIn={Boolean(currentUser)}
                    onOpenChat={onOpenChat}
                    onRequestSignIn={onRequestSignInForModel}
                    onOpenDetail={setDetailModel}
                  />
                ))}
              </div>
            ) : (
              <div className="models-empty-state">
                <p>No models match the selected filters.</p>
                <button type="button" onClick={resetFilters}>Reset filters</button>
              </div>
            )}

            {pageData.pageCount > 1 && (
              <div className="models-pagination">
                {pageNumbers.map(num => (
                  <button
                    key={num}
                    type="button"
                    className={num === pageData.page ? 'is-current' : ''}
                    onClick={() => setPage(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Model Detail & Code Generator Modal (AnyAPI style) */}
      <ModelDetailModal
        model={detailModel}
        isOpen={Boolean(detailModel)}
        onClose={() => setDetailModel(null)}
        onSelectModel={modelId => {
          if (currentUser) onOpenChat(modelId);
          else onRequestSignInForModel(modelId);
        }}
      />

      {refreshNotice && (
        <div className="models-toast" role="status">
          {refreshNotice}
        </div>
      )}
    </div>
  );
}
