import { useEffect, useMemo, useRef, useState } from 'react';
import './ModelSwitcherModal.css';

export default function ModelSwitcherModal({
  isOpen,
  onClose,
  models = [],
  selectedModel = '',
  onSelectModel,
  isModelFree = () => true,
  isFreeTierUser = false,
  onOpenIntegrations
}) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setSearch('');
      setActiveCategory('all');
    }
  }, [isOpen]);

  // Keyboard escape key to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const categories = [
    { id: 'all', label: 'All Models', icon: '🌐' },
    { id: 'free', label: '100% Free', icon: '⚡' },
    { id: 'image', label: 'Image Studio', icon: '🎨' },
    { id: 'video', label: 'Video Studio', icon: '🎬' },
    { id: 'agent', label: 'Autonomous Agents', icon: '🤖' },
    { id: 'reasoning', label: 'Reasoning & Math', icon: '🧠' },
    { id: 'coding', label: 'Coding & Dev', icon: '💻' },
    { id: 'vision', label: 'Vision & Multimodal', icon: '👁️' },
    { id: 'flash', label: 'Ultra-Fast Flash', icon: '🚀' }
  ];

  // Helper to determine provider name & theme
  function getProviderInfo(model) {
    const raw = `${model.id} ${model.provider || ''} ${model.name || ''}`.toLowerCase();
    if (raw.includes('google') || raw.includes('gemini')) {
      return { name: 'Google DeepMind', badgeClass: 'provider-google', icon: '✦' };
    }
    if (raw.includes('deepseek')) {
      return { name: 'DeepSeek AI', badgeClass: 'provider-deepseek', icon: '🐋' };
    }
    if (raw.includes('meta') || raw.includes('llama')) {
      return { name: 'Meta AI', badgeClass: 'provider-meta', icon: '🦙' };
    }
    if (raw.includes('anthropic') || raw.includes('claude')) {
      return { name: 'Anthropic', badgeClass: 'provider-anthropic', icon: '❇' };
    }
    if (raw.includes('openai') || raw.includes('gpt')) {
      return { name: 'OpenAI', badgeClass: 'provider-openai', icon: '✳' };
    }
    if (raw.includes('qwen') || raw.includes('alibaba')) {
      return { name: 'Qwen / Alibaba', badgeClass: 'provider-qwen', icon: '💻' };
    }
    if (raw.includes('mistral')) {
      return { name: 'Mistral AI', badgeClass: 'provider-mistral', icon: '🌪️' };
    }
    if (raw.includes('groq')) {
      return { name: 'Groq LPU', badgeClass: 'provider-groq', icon: '⚡' };
    }
    return { name: model.provider || 'Upstream Gateway', badgeClass: 'provider-default', icon: '🤖' };
  }

  // Filter models
  const filteredModels = useMemo(() => {
    let list = models || [];

    if (activeCategory === 'free') {
      list = list.filter(m => isModelFree(m));
    } else if (activeCategory === 'image') {
      list = list.filter(m => {
        const text = `${m.id} ${m.name || ''} ${m.modality || ''}`.toLowerCase();
        return m.modality === 'image' || text.includes('flux') || text.includes('sdxl') || text.includes('stable-diffusion') || text.includes('dall-e') || text.includes('imagen');
      });
    } else if (activeCategory === 'video') {
      list = list.filter(m => {
        const text = `${m.id} ${m.name || ''} ${m.modality || ''}`.toLowerCase();
        return m.modality === 'video' || text.includes('kling') || text.includes('wan') || text.includes('luma') || text.includes('runway') || text.includes('sora') || text.includes('video');
      });
    } else if (activeCategory === 'agent') {
      list = list.filter(m => {
        const text = `${m.id} ${m.name || ''} ${m.modality || ''}`.toLowerCase();
        return m.supportsTools || m.modality === 'agent' || text.includes('agent') || text.includes('tool') || text.includes('gpt-4o') || text.includes('claude-3-5') || text.includes('qwen-2.5-coder') || text.includes('r1');
      });
    } else if (activeCategory === 'reasoning') {
      list = list.filter(m => {
        const text = `${m.id} ${m.name}`.toLowerCase();
        return text.includes('r1') || text.includes('o1') || text.includes('o3') || text.includes('reason') || text.includes('deepseek');
      });
    } else if (activeCategory === 'coding') {
      list = list.filter(m => {
        const text = `${m.id} ${m.name}`.toLowerCase();
        return text.includes('coder') || text.includes('coding') || text.includes('code') || text.includes('qwen') || text.includes('starcoder');
      });
    } else if (activeCategory === 'vision') {
      list = list.filter(m => {
        const text = `${m.id} ${m.name}`.toLowerCase();
        return text.includes('flash') || text.includes('vision') || text.includes('vl') || text.includes('4o') || text.includes('claude') || text.includes('gemini');
      });
    } else if (activeCategory === 'flash') {
      list = list.filter(m => {
        const text = `${m.id} ${m.name}`.toLowerCase();
        return text.includes('flash') || text.includes('fast') || text.includes('instant') || text.includes('mini') || text.includes('groq');
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(m =>
        m.id.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.provider && m.provider.toLowerCase().includes(q))
      );
    }

    return list;
  }, [models, activeCategory, search, isModelFree]);

  if (!isOpen) return null;

  return (
    <div className="model-switcher-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="model-switcher-window" onClick={e => e.stopPropagation()}>
        {/* Holographic 3D Header */}
        <header className="model-switcher-header">
          <div className="model-switcher-title-group">
            <div className="model-switcher-3d-orb" aria-hidden="true">
              <span className="switcher-orb-ring ring-1" />
              <span className="switcher-orb-ring ring-2" />
              <span className="switcher-orb-core">⚡</span>
            </div>
            <div>
              <h2>Switch AI Model</h2>
              <p>Explore & toggle between 400+ frontier & free models with 1-click</p>
            </div>
          </div>

          <button
            type="button"
            className="model-switcher-close-btn"
            onClick={onClose}
            aria-label="Close model switcher"
          >
            ✕
          </button>
        </header>

        {/* Search & Category Filter Bar */}
        <div className="model-switcher-toolbar">
          <div className="model-switcher-search-box">
            <span className="search-icon">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search 400+ models (e.g. DeepSeek, Gemini, Llama, 70B, Coding)..."
              aria-label="Search models"
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="model-switcher-categories">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`category-pill ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3D Model Cards Grid */}
        <div className="model-switcher-grid">
          {filteredModels.map(model => {
            const isSelected = model.id === selectedModel;
            const isFree = isModelFree(model);
            const provider = getProviderInfo(model);
            const contextStr = model.context_length
              ? `${Math.round(model.context_length / 1000)}k ctx`
              : model.id.includes('gemini') ? '1M+ ctx' : '128k ctx';

            return (
              <div
                key={model.id}
                className={`model-card-3d ${isSelected ? 'is-selected' : ''} ${!isFree && isFreeTierUser ? 'is-pro-locked' : ''}`}
                onClick={() => {
                  if (!isFree && isFreeTierUser) {
                    if (onOpenIntegrations) onOpenIntegrations();
                    onClose();
                  } else {
                    onSelectModel(model.id);
                    onClose();
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    onSelectModel(model.id);
                    onClose();
                  }
                }}
              >
                <div className="model-card-3d-inner">
                  <div className="model-card-top">
                    <span className={`provider-badge ${provider.badgeClass}`}>
                      <span>{provider.icon}</span>
                      <span>{provider.name}</span>
                    </span>

                    {isFree ? (
                      <span className="badge-free">100% Free</span>
                    ) : (
                      <span className="badge-pro">Pro (BYOK)</span>
                    )}
                  </div>

                  <h3 className="model-card-name" title={model.name || model.id}>
                    {model.name || model.id}
                  </h3>

                  <div className="model-card-meta">
                    <span className="meta-tag context-tag">{contextStr}</span>
                    <span className="meta-tag speed-tag">⚡ ~140ms</span>
                    {model.modality === 'image' && <span className="meta-tag modality-tag">🎨 Image</span>}
                    {model.modality === 'video' && <span className="meta-tag modality-tag">🎬 Video</span>}
                    {model.modality === 'agent' && <span className="meta-tag modality-tag">⚡ Agent</span>}
                    {isSelected && (
                      <span className="meta-tag active-tag">✓ Active</span>
                    )}
                  </div>

                  {/* 3D Glass hover highlight */}
                  <div className="model-card-glow-overlay" aria-hidden="true" />
                </div>
              </div>
            );
          })}

          {filteredModels.length === 0 && (
            <div className="model-switcher-empty">
              <span className="empty-icon">🛰️</span>
              <h3>No matching models found</h3>
              <p>Try searching for "Gemini", "DeepSeek", "Llama", or clear the filter.</p>
              <button
                type="button"
                className="reset-filter-btn"
                onClick={() => { setSearch(''); setActiveCategory('all'); }}
              >
                Reset Search
              </button>
            </div>
          )}
        </div>

        {/* Footer info & shortcut note */}
        <footer className="model-switcher-footer">
          <div className="footer-tip">
            <span>💡 <strong>Tip:</strong> Press <code>Esc</code> to exit anytime. Click any model to switch instantly.</span>
          </div>
          {isFreeTierUser && (
            <button
              type="button"
              className="connect-keys-link"
              onClick={() => {
                if (onOpenIntegrations) onOpenIntegrations();
                onClose();
              }}
            >
              🔑 Connect Your Own Keys for Claude 3.5 & GPT-4o →
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
