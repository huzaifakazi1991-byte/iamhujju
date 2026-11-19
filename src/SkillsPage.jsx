import { useEffect, useMemo, useRef, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import {
  buildSkillInstallCommand,
  filterAndSortSkills,
  formatSkillCategory,
  getSkillFacetOptions,
  normalizeSkillsCatalog,
  paginateSkills
} from './skillsCatalog.js';
import './SkillsPage.css';

const PAGE_SIZES = [24, 48, 96];
const AGENT_OPTIONS = [
  { value: 'all', label: 'All agents' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' }
];
const EMPTY_SKILLS = [];

async function requestSkillsCatalog(signal) {
  const response = await fetch('/skills-catalog.json', { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`Catalog request failed (HTTP ${response.status}).`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The local skills catalog could not be read.');
  }

  return normalizeSkillsCatalog(payload);
}

function FilterSelect({ label, value, options, onChange }) {
  const allLabel = label === 'Activity'
    ? 'All activities'
    : `All ${label.toLowerCase()}s`;

  return (
    <label className="skills-filter-select">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map(option => (
          <option value={option.value} key={option.value}>
            {option.value} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

function SkillCard({ skill, agent, onCopy }) {
  let command = '';
  try {
    command = buildSkillInstallCommand(skill.name, agent);
  } catch {
    command = '';
  }

  return (
    <article className="skills-card">
      <div className="skills-card-body">
        <div className="skills-card-title-row">
          <h2>{skill.name}</h2>
          <span className="skills-category-tag">{formatSkillCategory(skill.category)}</span>
        </div>
        <p>{skill.description}</p>
        <div className="skills-card-metadata">
          <span>{skill.product}</span>
          <span>{skill.subdomain}</span>
          {skill.audiences.slice(0, 3).map(audience => (
            <span key={audience}>{audience.replace(/_/g, ' ')}</span>
          ))}
        </div>
        {skill.activityTags.length > 0 && (
          <div className="skills-activity-tags" aria-label="Skill activities">
            {skill.activityTags.slice(0, 5).map(tag => (
              <span key={tag}>{tag.replace(/_/g, ' ')}</span>
            ))}
          </div>
        )}
      </div>
      <div className="skills-card-actions">
        <a
          href={`https://github.com/NVIDIA/skills/tree/main/${encodeURIComponent(skill.path).replace(/%2F/g, '/')}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View source
        </a>
        <button type="button" onClick={() => onCopy(command, skill.name)} disabled={!command}>
          Copy install command
        </button>
      </div>
    </article>
  );
}

export default function SkillsPage({
  currentUser,
  connected,
  selectedModel,
  modelCount,
  chatCount,
  onOpenHome,
  onOpenModels,
  onOpenChat,
  onRequestSignIn,
  onLogout,
  onOpenApiKeys,
  onOpenIntegrations,
  onOpenSavedChats
}) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState([]);
  const [product, setProduct] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [audience, setAudience] = useState('');
  const [activity, setActivity] = useState('');
  const [sort, setSort] = useState('catalog');
  const [agent, setAgent] = useState('all');
  const [selectedSkillName, setSelectedSkillName] = useState('');
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const commandInputRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    requestSkillsCatalog(controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setCatalog(result);
      })
      .catch(error => {
        if (error.name !== 'AbortError' && !controller.signal.aborted) {
          setLoadError('Could not load the local skills catalog. Retry to try again.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const skills = catalog?.skills || EMPTY_SKILLS;
  const categoryOptions = useMemo(() => getSkillFacetOptions(skills, 'category'), [skills]);
  const productOptions = useMemo(() => getSkillFacetOptions(skills, 'product'), [skills]);
  const subdomainOptions = useMemo(() => getSkillFacetOptions(skills, 'subdomain'), [skills]);
  const audienceOptions = useMemo(() => getSkillFacetOptions(skills, 'audiences'), [skills]);
  const activityOptions = useMemo(() => getSkillFacetOptions(skills, 'activityTags'), [skills]);
  const filteredSkills = useMemo(() => filterAndSortSkills(skills, {
    query,
    categories,
    product,
    subdomain,
    audience,
    activity,
    sort
  }), [skills, query, categories, product, subdomain, audience, activity, sort]);
  const pageData = useMemo(
    () => paginateSkills(filteredSkills, page, pageSize),
    [filteredSkills, page, pageSize]
  );
  const commandSkill = filteredSkills.find(skill => skill.name === selectedSkillName)
    || pageData.items[0]
    || filteredSkills[0];
  const command = commandSkill ? buildSkillInstallCommand(commandSkill.name, agent) : '';
  const filtersActive = Boolean(
    query.trim() || categories.length || product || subdomain || audience || activity || sort !== 'catalog'
  );

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  function toggleCategory(value) {
    setCategories(previous => previous.includes(value)
      ? previous.filter(category => category !== value)
      : [...previous, value]);
    setPage(1);
  }

  function resetFilters() {
    setQuery('');
    setCategories([]);
    setProduct('');
    setSubdomain('');
    setAudience('');
    setActivity('');
    setSort('catalog');
    setPageSize(PAGE_SIZES[0]);
    setPage(1);
  }

  function retryCatalog() {
    setLoading(true);
    setLoadError('');
    setLoadAttempt(attempt => attempt + 1);
  }

  async function copyCommand(value, skillName) {
    if (skillName) setSelectedSkillName(skillName);

    try {
      await navigator.clipboard.writeText(value);
      setNotice('Install command copied. Run it in your terminal to install the skill.');
    } catch {
      setNotice('Clipboard access was blocked. The command field is selected; press Ctrl+C or Command+C to copy.');
      window.requestAnimationFrame(() => {
        commandInputRef.current?.focus();
        commandInputRef.current?.select();
      });
    }
  }

  const firstResult = filteredSkills.length ? (pageData.page - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(pageData.page * pageSize, filteredSkills.length);

  return (
    <div className="skills-page">
      <header className="skills-nav">
        <div className="skills-nav-inner">
          <button className="skills-brand" type="button" onClick={onOpenHome} aria-label="iamhujju Explore">
            <span className="skills-brand-mark" aria-hidden="true">i</span>
            <span>iamhujju</span>
          </button>
          <nav className="skills-nav-links" aria-label="Main navigation">
            <button type="button" onClick={onOpenHome}>Explore</button>
            <button type="button" onClick={() => onOpenModels()}>Models</button>
            <button type="button" className="is-current" aria-current="page">Skills</button>
            <button type="button" onClick={onOpenSavedChats}>Saved Chats</button>
            <button
              type="button"
              onClick={() => currentUser
                ? onOpenChat(selectedModel)
                : onRequestSignIn(selectedModel)}
            >
              Chat
            </button>
          </nav>
          <div className="skills-nav-tools">
            <span className={`skills-gateway-status${connected ? ' is-online' : ''}`} role="status">
              <span aria-hidden="true" />
              {connected ? 'Gateway online' : 'Gateway offline'}
            </span>
            {currentUser ? (
              <AccountMenu
                user={currentUser}
                connected={connected}
                modelCount={modelCount}
                onLogout={onLogout}
                onOpenApiKeys={onOpenApiKeys}
                onOpenIntegrations={onOpenIntegrations}
              />
            ) : (
              <button
                className="skills-sign-in"
                type="button"
                onClick={() => onRequestSignIn(selectedModel)}
              >
                Sign in
              </button>
            )}
            <button
              className="skills-open-chat"
              type="button"
              onClick={() => currentUser
                ? onOpenChat(selectedModel)
                : onRequestSignIn(selectedModel)}
            >
              Open chat
            </button>
          </div>
        </div>
      </header>

      <main className="skills-main">
        <header className="skills-page-heading">
          <div>
            <p className="skills-eyebrow">IAMHUJJU SKILLS CATALOG</p>
            <h1>Skills</h1>
            <p>Browse verified skill metadata and copy an install command for your coding agent.</p>
          </div>
          <span className="skills-count-badge">{skills.length} skills</span>
        </header>

        {catalog && (
          <section className="skills-install-bar" aria-labelledby="skills-install-title">
            <div className="skills-install-intro">
              <h2 id="skills-install-title">Install a skill</h2>
              <p>Commands are copied only; iamhujju never runs an installer.</p>
            </div>
            <label className="skills-agent-select">
              <span>Install for</span>
              <select value={agent} onChange={event => setAgent(event.target.value)}>
                {AGENT_OPTIONS.map(option => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <input
              ref={commandInputRef}
              id="skills-install-command"
              className="skills-command"
              type="text"
              aria-label={commandSkill ? `Install command for ${commandSkill.name}` : 'Skill install command'}
              readOnly
              value={command || 'No skill selected'}
              onFocus={event => event.currentTarget.select()}
            />
            <button
              className="skills-copy-featured"
              type="button"
              onClick={() => copyCommand(command, commandSkill?.name)}
              disabled={!command}
            >
              Copy command
            </button>
            <a href="https://github.com/NVIDIA/skills" target="_blank" rel="noopener noreferrer">
              Source repository
            </a>
          </section>
        )}

        <div className="skills-catalog-layout">
          <aside className="skills-filters" aria-label="Skill filters">
            <div className="skills-filter-heading">
              <h2>Filters</h2>
              <button type="button" onClick={resetFilters} disabled={!filtersActive}>
                Reset
              </button>
            </div>

            <fieldset className="skills-category-filter">
              <legend>Category</legend>
              {categoryOptions.map(option => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={categories.includes(option.value)}
                    onChange={() => toggleCategory(option.value)}
                  />
                  <span>{formatSkillCategory(option.value)}</span>
                  <small>{option.count}</small>
                </label>
              ))}
            </fieldset>

            <FilterSelect
              label="Product"
              value={product}
              options={productOptions}
              onChange={value => changeFilter(setProduct, value)}
            />
            <FilterSelect
              label="Subdomain"
              value={subdomain}
              options={subdomainOptions}
              onChange={value => changeFilter(setSubdomain, value)}
            />
            <FilterSelect
              label="Audience"
              value={audience}
              options={audienceOptions}
              onChange={value => changeFilter(setAudience, value)}
            />
            <FilterSelect
              label="Activity"
              value={activity}
              options={activityOptions}
              onChange={value => changeFilter(setActivity, value)}
            />
          </aside>

          <section className="skills-results" aria-label="Skills results">
            <div className="skills-toolbar">
              <form className="skills-search" role="search" onSubmit={event => event.preventDefault()}>
                <label className="sr-only" htmlFor="skills-search-input">Search skills</label>
                <input
                  id="skills-search-input"
                  type="search"
                  value={query}
                  onChange={event => changeFilter(setQuery, event.target.value)}
                  placeholder="Search skills by name, product, or capability..."
                />
              </form>
              <label className="skills-sort">
                <span>Sort by</span>
                <select value={sort} onChange={event => changeFilter(setSort, event.target.value)}>
                  <option value="catalog">Catalog order</option>
                  <option value="name-asc">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                </select>
              </label>
            </div>

            <div className="skills-results-summary" role="status" aria-live="polite">
              {loading
                ? 'Loading the local skills catalog…'
                : loadError
                  ? loadError
                  : `${filteredSkills.length} skills · Showing ${firstResult}–${lastResult}`}
            </div>

            {loading ? (
              <div className="skills-card-grid" aria-label="Loading skills">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="skills-card-skeleton" key={index} />
                ))}
              </div>
            ) : loadError ? (
              <div className="skills-empty-state" role="alert">
                <p>{loadError}</p>
                <button type="button" onClick={retryCatalog}>
                  Retry loading catalog
                </button>
              </div>
            ) : pageData.items.length ? (
              <div className="skills-card-grid">
                {pageData.items.map(skill => (
                  <SkillCard key={skill.name} skill={skill} agent={agent} onCopy={copyCommand} />
                ))}
              </div>
            ) : (
              <div className="skills-empty-state" role="status">
                <p>No skills match the current search and filters.</p>
                <button type="button" onClick={resetFilters}>Reset filters</button>
              </div>
            )}

            {!loading && !loadError && pageData.pageCount > 0 && (
              <nav className="skills-pagination" aria-label="Skills pagination">
                <label>
                  <span>Items per page</span>
                  <select
                    value={pageSize}
                    onChange={event => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZES.map(size => <option value={size} key={size}>{size}</option>)}
                  </select>
                </label>
                <div className="skills-pagination-controls">
                  <button
                    type="button"
                    onClick={() => setPage(current => Math.max(1, current - 1))}
                    disabled={pageData.page <= 1}
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <span>Page {pageData.page} of {pageData.pageCount}</span>
                  <button
                    type="button"
                    onClick={() => setPage(current => Math.min(pageData.pageCount, current + 1))}
                    disabled={pageData.page >= pageData.pageCount}
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </nav>
            )}
          </section>
        </div>

        {catalog && (
          <p className="skills-attribution">
            Catalog metadata adapted from <a href={catalog.sourceUrl} target="_blank" rel="noopener noreferrer">
              {catalog.sourceRepository}
            </a> · {catalog.skills.length} entries · {catalog.sourceSnapshot} · Licensed under{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
              {catalog.license}
            </a>
          </p>
        )}
      </main>

      <footer className="skills-footer">
        <span>iamhujju · One Workspace for 400+ Models</span>
        <span>{chatCount} saved {chatCount === 1 ? 'conversation' : 'conversations'} on this device</span>
        <button type="button" onClick={onOpenHome}>Back to Explore</button>
      </footer>

      {notice && <div className="skills-toast" role="status" aria-live="polite">{notice}</div>}
    </div>
  );
}
