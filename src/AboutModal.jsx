import { useEffect } from 'react';
import './AboutModal.css';

export default function AboutModal({
  isOpen,
  onClose,
  onStartBuilding,
  onOpenContact,
  onOpenDocs
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="about-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-main-heading"
    >
      <div className="about-modal-container" onClick={e => e.stopPropagation()}>
        {/* Topbar & Breadcrumbs */}
        <div className="about-modal-topbar">
          <div className="about-breadcrumbs">
            <span className="crumb-home" onClick={onClose}>Home</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">About</span>
          </div>
          <button
            type="button"
            className="about-modal-close"
            onClick={onClose}
            aria-label="Close about dialog"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="about-modal-scroll">
          {/* SECTION 1: HERO */}
          <section className="about-hero">
            <div className="about-preheader-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
              </svg>
              <span>THE FUTURE OF AI INTEGRATION</span>
            </div>

            <h1 id="about-main-heading">
              iamhujju is a more magical way to <span className="about-gradient-text">build and scale</span>.
            </h1>

            <p className="about-hero-sub">
              Our powerful unified API helps you access and deploy AI models seamlessly. Power chatbots, generate images, analyze docs, or spin up custom AI agents.
            </p>

            <div className="about-hero-actions">
              <button
                type="button"
                className="about-btn-primary"
                onClick={() => {
                  onClose();
                  if (onStartBuilding) onStartBuilding();
                }}
              >
                <span>Start building</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
              <button
                type="button"
                className="about-btn-secondary"
                onClick={() => {
                  onClose();
                  if (onOpenContact) onOpenContact();
                }}
              >
                <span>Contact Us</span>
              </button>
            </div>

            <div className="about-philosophy-quote">
              <span className="quote-mark">“</span>
              <p>We’re building iamhujju because we believe in you and your creations.</p>
            </div>
          </section>

          {/* SECTION 2: WHY BUILDERS LOVE IAMHUJJU (BENTO GRID) */}
          <section className="about-bento-section">
            <div className="about-section-header">
              <div className="about-sub-badge">
                <span>⭐ Trusted by thousands</span>
              </div>
              <h2>Why builders love iamhujju</h2>
              <p className="about-section-desc">One powerful toolkit that handles everything.</p>
            </div>

            <div className="about-bento-grid">
              {/* Bento Card 1: Reliability at Scale */}
              <div className="about-bento-card bento-wide">
                <div className="bento-badge-tag">INFRASTRUCTURE</div>
                <h3>Reliability at Scale</h3>
                <p>APIs should never fail your users. iamhujju keeps your flows running smoothly.</p>
                <div className="bento-feature-checklist">
                  <div className="bento-check-item">
                    <span className="bento-check-bullet">✓</span>
                    <span>Multi-region routing (EU / US / ASIA)</span>
                  </div>
                  <div className="bento-check-item">
                    <span className="bento-check-bullet">✓</span>
                    <span>Automatic fallbacks & smart health-checks</span>
                  </div>
                  <div className="bento-check-item">
                    <span className="bento-check-bullet">✓</span>
                    <span>Request prioritization & concurrency queues</span>
                  </div>
                  <div className="bento-check-item">
                    <span className="bento-check-bullet">✓</span>
                    <span>Python & Node.js drop-in streaming SDK</span>
                  </div>
                </div>
              </div>

              {/* Bento Card 2: Advanced Capabilities */}
              <div className="about-bento-card">
                <div className="bento-badge-tag">INNOVATION</div>
                <h3>Advanced Capabilities</h3>
                <p>Move beyond simple completions with cutting-edge workflows.</p>
                <div className="bento-tags-cloud">
                  <span className="bento-pill">Finetuned models</span>
                  <span className="bento-pill">Computer Use automation</span>
                  <span className="bento-pill">RAG & vector stores</span>
                  <span className="bento-pill">Structured JSON</span>
                  <span className="bento-pill">Tool calling</span>
                </div>
              </div>

              {/* Bento Card 3: Enterprise Security */}
              <div className="about-bento-card">
                <div className="bento-badge-tag security-tag">SECURITY</div>
                <h3>Enterprise Security</h3>
                <p>End-to-end isolation and privacy safeguards built into every layer.</p>
                <div className="bento-tags-cloud">
                  <span className="bento-pill green-pill">AES-256 Encrypted</span>
                  <span className="bento-pill green-pill">Neon PostgreSQL</span>
                  <span className="bento-pill green-pill">Zero Model Training</span>
                  <span className="bento-pill">Audit logs</span>
                  <span className="bento-pill">SOC 2 / ISO 27001 Ready</span>
                </div>
              </div>

              {/* Bento Card 4: Future Ready */}
              <div className="about-bento-card bento-wide">
                <div className="bento-badge-tag future-tag">ROADMAP</div>
                <h3>Future Ready</h3>
                <p>Built for what comes next in agentic software engineering.</p>
                <div className="bento-roadmap-row">
                  <div className="bento-roadmap-item">
                    <span className="roadmap-icon">🤖</span>
                    <div>
                      <strong>Multi-Agent Systems</strong>
                      <span>Swarm orchestration & cooperative problem solving</span>
                    </div>
                  </div>
                  <div className="bento-roadmap-item">
                    <span className="roadmap-icon">🔄</span>
                    <div>
                      <strong>Shared Context</strong>
                      <span>Cross-model persistent conversation memory</span>
                    </div>
                  </div>
                  <div className="bento-roadmap-item">
                    <span className="roadmap-icon">⚡</span>
                    <div>
                      <strong>Smart Auto-Routing</strong>
                      <span>Lowest latency and cheapest capable model picker</span>
                    </div>
                  </div>
                  <div className="bento-roadmap-item">
                    <span className="roadmap-icon">📱</span>
                    <div>
                      <strong>AnyChat Mobile</strong>
                      <span>PWA responsive companion for desktop and mobile</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="about-tagline-footer">
              <span>Ship smarter.</span>
              <span className="dot-sep">·</span>
              <span>Scale faster.</span>
              <span className="dot-sep">·</span>
              <span>Connect anything.</span>
            </div>
          </section>

          {/* SECTION 3: CREW OF BUILDERS & COMMUNITY */}
          <section className="about-team-section">
            <div className="about-section-header">
              <h2>
                We’re a crew of builders, dreamers, <span className="about-cyan-highlight">and night-owl coders</span>
              </h2>
              <p className="about-section-desc">
                ... who thrive on code, collaboration, and a relentless curiosity:
              </p>
            </div>

            <div className="about-roles-grid">
              <span className="role-chip">AI Engineers</span>
              <span className="role-chip">Platform Architects</span>
              <span className="role-chip">DevRel Advocates</span>
              <span className="role-chip">Infrastructure Wizards</span>
              <span className="role-chip">API Designers</span>
              <span className="role-chip">Security Experts</span>
              <span className="role-chip">Open Source Contributors</span>
              <span className="role-chip">Startup Veterans</span>
              <span className="role-chip">Coffee Enthusiasts</span>
              <span className="role-chip">Keyboard Nerds</span>
              <span className="role-chip">Late Night Debuggers</span>
            </div>

            {/* Founder Card Spotlight */}
            <div className="about-founder-card">
              <div className="founder-avatar-wrap">
                <img src="/copilot.jpg" alt="Huzaifa Kazi" className="founder-avatar-img" />
                <span className="founder-status-ring" title="Active on Telegram & Email" />
              </div>
              <div className="founder-info">
                <h3>Huzaifa Kazi</h3>
                <span className="founder-title">Founder & Principal Systems Architect</span>
                <p>
                  "We built iamhujju to dismantle the complexity of multi-model AI routing, giving developers and creators one unified, rock-solid interface with zero subscription barriers and total data privacy."
                </p>
                <div className="founder-contact-pills">
                  <a
                    href="https://t.me/+919975649957"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="founder-link-pill telegram"
                  >
                    <span>Telegram (+91 99756 49957)</span>
                  </a>
                  <a
                    href="mailto:huzaifakazi1991@gmail.com"
                    className="founder-link-pill email"
                  >
                    <span>huzaifakazi1991@gmail.com</span>
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 4: AI THAT NEVER SLEEPS (METRICS) */}
          <section className="about-metrics-section">
            <div className="about-section-header">
              <div className="about-sub-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
                </svg>
                <span>Built for reliability</span>
              </div>
              <h2>
                AI That <span className="about-cyan-highlight">Never Sleeps</span>
              </h2>
              <p className="about-section-desc">
                From dev sandbox to production, latency, uptime, and security are already handled.
              </p>
            </div>

            <div className="about-metrics-grid">
              <div className="metric-box">
                <span className="metric-number">99.9%</span>
                <h4>99.9% Service Availability</h4>
                <p>Enterprise-grade reliability you can count on, every second of every day.</p>
              </div>

              <div className="metric-box">
                <span className="metric-number">&lt;50ms</span>
                <h4>Lightning Fast</h4>
                <p>Average gateway overhead that keeps your applications blazing fast.</p>
              </div>

              <div className="metric-box">
                <span className="metric-number">AES-256</span>
                <h4>Hardware-Grade Security</h4>
                <p>Encrypted credentials, isolated cloud database, and zero model training.</p>
              </div>

              <div className="metric-box">
                <span className="metric-number">400+</span>
                <h4>Models Available</h4>
                <p>Access to the world’s top AI models through one unified OpenAI-compatible API.</p>
              </div>
            </div>
          </section>

          {/* SECTION 5: FINAL CTA */}
          <section className="about-cta-section">
            <div className="about-cta-card">
              <h2>Start Building with iamhujju Today</h2>
              <p>
                Behind that simple interface is a lot of messy engineering we’re happy to own so you don’t have to.
              </p>
              <div className="about-cta-buttons">
                <button
                  type="button"
                  className="about-btn-primary"
                  onClick={() => {
                    onClose();
                    if (onStartBuilding) onStartBuilding();
                  }}
                >
                  <span>Start for free</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="about-btn-secondary"
                  onClick={() => {
                    onClose();
                    if (onOpenDocs) onOpenDocs('quickstart');
                  }}
                >
                  <span>API Quickstart</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
