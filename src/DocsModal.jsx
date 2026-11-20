import { useEffect, useState } from 'react';
import './DocsModal.css';

function TabIcon({ name, size = 16 }) {
  if (name === 'check') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (name === 'sparkle') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
        <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
      </svg>
    );
  }
  if (name === 'arrow') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    );
  }
  return null;
}

export default function DocsModal({
  isOpen,
  onClose,
  initialTab = 'quickstart',
  onOpenChat,
  onOpenApiKeys,
  onOpenContact,
  currentUser,
  onOpenSignup,
  onOpenCheckout
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [pricingBillingCycle, setPricingBillingCycle] = useState('monthly');
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  function copyToClipboard(text, id) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCode(id);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  }

  const curlExample = `curl https://iamhujju.com/api/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "openrouter/free",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello from iamhujju API!"}
    ],
    "max_tokens": 1024
  }'`;

  const nodeExample = `import OpenAI from 'openai';

// Drop-in compatible with standard OpenAI SDK
const client = new OpenAI({
  baseURL: 'https://iamhujju.com/api',
  apiKey: process.env.IAMHUJJU_API_KEY || 'your-key'
});

async function main() {
  const completion = await client.chat.completions.create({
    model: 'openrouter/free', // Auto-routes to fastest free model
    messages: [{ role: 'user', content: 'Explain quantum computing in 2 sentences' }]
  });

  console.log(completion.choices[0].message.content);
}

main();`;

  const pythonExample = `from openai import OpenAI

# Drop-in compatible with standard OpenAI Python library
client = OpenAI(
    base_url="https://iamhujju.com/api",
    api_key="YOUR_API_KEY"
)

response = client.chat.completions.create(
    model="openrouter/free",
    messages=[{"role": "user", "content": "What are the latest AI breakthroughs?"}],
    max_tokens=1024
)

print(response.choices[0].message.content)`;

  const cliExample = `# 1. Install iamhujju CLI globally via npm
npm install -g @iamhujju/cli

# 2. Or execute directly without installing
npx @iamhujju/cli chat --model openrouter/free "What is the airspeed velocity of an unladen swallow?"

# 3. Configure your API key
iamhujju config set-key <YOUR_KEY>

# 4. Stream chat in terminal
iamhujju chat --stream`;

  return (
    <div className="docs-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="docs-title">
      <div className={`docs-modal-container ${activeTab === 'pricing' ? 'is-pricing-wide' : ''}`} onClick={e => e.stopPropagation()}>
        <header className="docs-modal-header">
          <div className="docs-modal-title-row">
            <div className="docs-brand-badge">
              <img src="/mascot.jpg" alt="iamhujju" className="docs-brand-img" />
              <span className="docs-brand-name">iamhujju Docs & API</span>
            </div>
            <button className="docs-close-btn" onClick={onClose} aria-label="Close dialog">×</button>
          </div>
          <nav className="docs-modal-tabs" aria-label="Documentation tabs">
            <button
              className={`docs-tab-btn ${activeTab === 'quickstart' ? 'active' : ''}`}
              onClick={() => setActiveTab('quickstart')}
            >
              Quickstart
            </button>
            <button
              className={`docs-tab-btn ${activeTab === 'cli' ? 'active' : ''}`}
              onClick={() => setActiveTab('cli')}
            >
              AnyCLI
            </button>
            <button
              className={`docs-tab-btn ${activeTab === 'models' ? 'active' : ''}`}
              onClick={() => setActiveTab('models')}
            >
              400+ Models & Auto-Router
            </button>
            <button
              className={`docs-tab-btn ${activeTab === 'pricing' ? 'active' : ''}`}
              onClick={() => setActiveTab('pricing')}
            >
              Pricing & Plans
            </button>
          </nav>
        </header>

        <div className="docs-modal-body">
          {activeTab === 'quickstart' && (
            <div className="docs-tab-content">
              <h3>Drop-In OpenAI Compatibility</h3>
              <p>
                iamhujju provides an OpenAI-compatible HTTP gateway. Any SDK, library, or tool that works with OpenAI
                works out of the box with iamhujju by simply switching <code>baseURL</code>.
              </p>

              <div className="docs-code-header">
                <span>cURL Request</span>
                <button
                  className="docs-copy-btn"
                  onClick={() => copyToClipboard(curlExample, 'curl')}
                >
                  {copiedCode === 'curl' ? 'Copied!' : 'Copy cURL'}
                </button>
              </div>
              <pre className="docs-code-block"><code>{curlExample}</code></pre>

              <div className="docs-code-header">
                <span>TypeScript / JavaScript (OpenAI SDK)</span>
                <button
                  className="docs-copy-btn"
                  onClick={() => copyToClipboard(nodeExample, 'node')}
                >
                  {copiedCode === 'node' ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
              <pre className="docs-code-block"><code>{nodeExample}</code></pre>

              <div className="docs-code-header">
                <span>Python SDK</span>
                <button
                  className="docs-copy-btn"
                  onClick={() => copyToClipboard(pythonExample, 'python')}
                >
                  {copiedCode === 'python' ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
              <pre className="docs-code-block"><code>{pythonExample}</code></pre>
            </div>
          )}

          {activeTab === 'cli' && (
            <div className="docs-tab-content">
              <h3>Run AI From Your Terminal (AnyCLI)</h3>
              <p>
                Interact with 400+ AI models, test endpoint latency, switch providers on the fly, and inspect responses
                directly from your shell with the iamhujju CLI.
              </p>

              <div className="docs-code-header">
                <span>Terminal Commands</span>
                <button
                  className="docs-copy-btn"
                  onClick={() => copyToClipboard(cliExample, 'cli')}
                >
                  {copiedCode === 'cli' ? 'Copied!' : 'Copy Commands'}
                </button>
              </div>
              <pre className="docs-code-block"><code>{cliExample}</code></pre>

              <div className="docs-cli-features">
                <div className="docs-feature-pill">⚡ Fast streaming responses directly in bash, zsh, and powershell</div>
                <div className="docs-feature-pill">🔒 Zero telemetry · Keys encrypted locally</div>
                <div className="docs-feature-pill">🌐 Intelligent auto-failover across 400+ providers</div>
              </div>
            </div>
          )}

          {activeTab === 'models' && (
            <div className="docs-tab-content">
              <h3>400+ Models & Auto-Router Architecture</h3>
              <p>
                Access all leading frontier and open-weight models under a unified namespace.
              </p>
              <div className="docs-grid-cards">
                <div className="docs-info-card">
                  <h4>Auto Router (100% Free)</h4>
                  <p>
                    Select <code>openrouter/free</code> or <code>openrouter/auto</code> to automatically dispatch your request
                    to the fastest available free model without consuming any credit balance.
                  </p>
                  <span className="docs-badge free">100% Free Tier</span>
                </div>
                <div className="docs-info-card">
                  <h4>Frontier Pro Models (BYOK)</h4>
                  <p>
                    Connect your personal OpenRouter API key in Account Settings to access GPT-4o, Claude 3.5 Sonnet,
                    Gemini 1.5 Pro, and DeepSeek R1 with zero markup.
                  </p>
                  <span className="docs-badge pro">400+ Models</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pricing' && (
            <div className="docs-tab-content is-pricing-tab">
              {/* Atmospheric Background Layers */}
              <div className="pricing_glow_circle" aria-hidden="true" />
              <div className="pricing_perspective_grid" aria-hidden="true" />
              <div className="pricing_fader_bg is--top" aria-hidden="true" />
              <div className="pricing_fader_bg is--bottom" aria-hidden="true" />

              <div className="pricing_container">
                {/* Header */}
                <div className="pricing_header">
                  <div className="pricing_preheader">
                    <TabIcon name="sparkle" size={15} />
                    <span>NO HIDDEN FEES. SCALE AS YOU GROW.</span>
                  </div>

                  <h2 className="pricing_heading">
                    One AI Workspace. <span className="is--blue is_underline">400+ Models.</span> Access more, spend less.
                  </h2>

                  <p className="pricing_subhead">
                    Transparent, predictable pricing for developers, creators, and teams. All plans converted to Indian Rupees (INR) with matching 1:1 USD benchmark rates.
                  </p>

                  {/* Interactive Billing Cycle Switcher */}
                  <div className="pricing_cycle_toggle_wrapper">
                    <div className="pricing_cycle_toggle" role="tablist" aria-label="Billing Cycle">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={pricingBillingCycle === 'monthly'}
                        className={`pricing_toggle_tab ${pricingBillingCycle === 'monthly' ? 'is--active' : ''}`}
                        onClick={() => setPricingBillingCycle('monthly')}
                      >
                        Monthly Billing
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={pricingBillingCycle === 'annual'}
                        className={`pricing_toggle_tab ${pricingBillingCycle === 'annual' ? 'is--active' : ''}`}
                        onClick={() => setPricingBillingCycle('annual')}
                      >
                        Annual Billing
                        <span className="pricing_save_pill">SAVE 20%</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Top Row: Dual Quickstart / Flexible Usage Cards */}
                <div className="pricing_top_cards_grid">
                  {/* 1. Free Tier */}
                  <div className="pricing_plan is--free">
                    <div className="pricing_plan_head">
                      <div className="pricing_plan_meta">
                        <span className="pricing_plan_category">Getting started</span>
                        <h3 className="pricing_plan_name">Free</h3>
                      </div>
                      <div className="pricing_price_block">
                        <div className="pricing_price_row">
                          <span className="pricing_amount">₹0</span>
                          <span className="pricing_unit">/ mo</span>
                        </div>
                        <span className="pricing_usd_badge">$0 / mo</span>
                      </div>
                    </div>

                    <p className="pricing_desc">Perfect for testing and personal experimentation.</p>

                    <div className="pricing_metrics_box">
                      <div className="pricing_metric_item">
                        <span className="metric_label">ANY Tokens:</span>
                        <span className="metric_val">100K / day</span>
                      </div>
                      <div className="pricing_metric_item">
                        <span className="metric_label">Users:</span>
                        <span className="metric_val">Unlimited</span>
                      </div>
                    </div>

                    <div className="pricing_features_block">
                      <span className="pricing_features_title">Core features:</span>
                      <ul className="pricing_features_list">
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>All <strong className="is--blue">free models</strong> (DeepSeek, Llama, Gemma, etc.)</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>iamhujju SDK & AnyCLI Access</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>AnyChat Playground & Companion Workspace</span>
                        </li>
                      </ul>
                    </div>

                    <div className="pricing_highlights_strip">
                      <span>Plan Highlights: · No credit card required · Community support · Instant setup</span>
                    </div>

                    <button
                      type="button"
                      className="pricing_cta_btn is--secondary"
                      onClick={() => {
                        onClose();
                        if (currentUser) {
                          if (onOpenChat) onOpenChat();
                        } else {
                          if (onOpenSignup) onOpenSignup();
                          else if (onOpenChat) onOpenChat();
                        }
                      }}
                    >
                      <span>Start for free</span>
                      <TabIcon name="arrow" size={16} />
                    </button>
                  </div>

                  {/* 2. Pay-as-you-go Tier */}
                  <div className="pricing_plan is--payg">
                    <div className="pricing_plan_head">
                      <div className="pricing_plan_meta">
                        <span className="pricing_plan_category">Flexible usage</span>
                        <h3 className="pricing_plan_name">Pay-as-you-go</h3>
                      </div>
                      <div className="pricing_price_block">
                        <div className="pricing_price_row">
                          <span className="pricing_amount">₹1,699</span>
                          <span className="pricing_unit">usage-based</span>
                        </div>
                        <span className="pricing_usd_badge">From $20 usage-based</span>
                      </div>
                    </div>

                    <p className="pricing_desc">Only pay for what you consume. Zero monthly commitment.</p>

                    <div className="pricing_metrics_box">
                      <div className="pricing_metric_item">
                        <span className="metric_label">ANY Tokens:</span>
                        <span className="metric_val">80 M+</span>
                      </div>
                      <div className="pricing_metric_item">
                        <span className="metric_label">Users:</span>
                        <span className="metric_val">Unlimited</span>
                      </div>
                    </div>

                    <div className="pricing_features_block">
                      <span className="pricing_features_title">Core features:</span>
                      <ul className="pricing_features_list">
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>All <strong className="is--blue">400+ models</strong> included</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>iamhujju SDK · AnyCLI · AnyChat</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>BYOK (Bring Your Own Key) zero markup</span>
                        </li>
                      </ul>
                    </div>

                    <div className="pricing_highlights_strip">
                      <span>Plan Highlights: · No monthly commitment · Scale as needed · Standard support · Usage-based billing</span>
                    </div>

                    <button
                      type="button"
                      className="pricing_cta_btn is--secondary"
                      onClick={() => {
                        onClose();
                        if (onOpenCheckout) {
                          onOpenCheckout({
                            planId: 'payg',
                            name: 'Pay-as-you-go',
                            amountInr: 1699,
                            amountFormatted: '₹1,699',
                            billingCycle: 'once',
                            amountUsd: 'From $20'
                          });
                        } else if (currentUser) {
                          if (onOpenApiKeys) onOpenApiKeys();
                        } else {
                          if (onOpenSignup) onOpenSignup();
                          else if (onOpenApiKeys) onOpenApiKeys();
                        }
                      }}
                    >
                      <span>Choose Pay-as-you-go</span>
                      <TabIcon name="arrow" size={16} />
                    </button>
                  </div>
                </div>

                {/* Main 3-Column Tier Grid (Developer / Pro / Enterprise) */}
                <div className="pricing_main_grid">
                  {/* 3. Developer Tier */}
                  <div className="pricing_plan is--developer">
                    <div className="pricing_plan_head">
                      <div className="pricing_plan_meta">
                        <span className="pricing_plan_category">Side projects & MVPs</span>
                        <h3 className="pricing_plan_name">Developer</h3>
                      </div>
                      <div className="pricing_price_block">
                        <div className="pricing_price_row">
                          <span className="pricing_amount">
                            {pricingBillingCycle === 'annual' ? '₹1,359' : '₹1,699'}
                          </span>
                          <span className="pricing_unit">/ mo</span>
                        </div>
                        <span className="pricing_usd_badge">
                          {pricingBillingCycle === 'annual' ? '≈ $15.90 / mo (billed ₹16,308/yr)' : '$19.90 / mo'}
                        </span>
                      </div>
                    </div>

                    <p className="pricing_desc">Ideal for small projects, personal companion apps, and MVPs.</p>

                    <div className="pricing_metrics_box">
                      <div className="pricing_metric_item">
                        <span className="metric_label">ANY Tokens:</span>
                        <span className="metric_val">100 M <small>(Rollover)</small></span>
                      </div>
                      <div className="pricing_metric_item">
                        <span className="metric_label">Users:</span>
                        <span className="metric_val">Unlimited</span>
                      </div>
                    </div>

                    <div className="pricing_features_block">
                      <span className="pricing_features_title">Core features:</span>
                      <ul className="pricing_features_list">
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>All 400+ models unlocked</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>iamhujju SDK · AnyCLI · AnyChat</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>Cloud conversation sync & storage</span>
                        </li>
                      </ul>
                    </div>

                    <div className="pricing_highlights_strip">
                      <span>Plan Highlights: · Standard support · Shared high-speed infra · Basic analytics</span>
                    </div>

                    <button
                      type="button"
                      className="pricing_cta_btn is--secondary"
                      onClick={() => {
                        onClose();
                        if (onOpenCheckout) {
                          onOpenCheckout({
                            planId: 'developer',
                            name: 'Developer Plan',
                            amountInr: pricingBillingCycle === 'annual' ? 16308 : 1699,
                            amountFormatted: pricingBillingCycle === 'annual' ? '₹16,308 (₹1,359/mo)' : '₹1,699 / mo',
                            billingCycle: pricingBillingCycle,
                            amountUsd: pricingBillingCycle === 'annual' ? '$15.90 / mo' : '$19.90 / mo'
                          });
                        } else if (currentUser) {
                          if (onOpenApiKeys) onOpenApiKeys();
                        } else {
                          if (onOpenSignup) onOpenSignup();
                          else if (onOpenApiKeys) onOpenApiKeys();
                        }
                      }}
                    >
                      <span>Upgrade to Developer</span>
                      <TabIcon name="arrow" size={16} />
                    </button>
                  </div>

                  {/* 4. Pro Tier (MOST POPULAR) */}
                  <div className="pricing_plan is--pro is--active">
                    <div className="pricing_popular_badge">
                      <span>🔥 Most popular</span>
                    </div>

                    <div className="pricing_plan_head">
                      <div className="pricing_plan_meta">
                        <span className="pricing_plan_category">Growing teams & startups</span>
                        <h3 className="pricing_plan_name">Pro</h3>
                      </div>
                      <div className="pricing_price_block">
                        <div className="pricing_price_row">
                          <span className="pricing_amount">
                            {pricingBillingCycle === 'annual' ? '₹6,559' : '₹8,199'}
                          </span>
                          <span className="pricing_unit">/ mo</span>
                        </div>
                        <span className="pricing_usd_badge">
                          {pricingBillingCycle === 'annual' ? '≈ $76.70 / mo (billed ₹78,708/yr)' : '$95.90 / mo'}
                        </span>
                      </div>
                    </div>

                    <p className="pricing_desc">Scales with growing projects and high-volume workloads.</p>

                    <div className="pricing_metrics_box">
                      <div className="pricing_metric_item">
                        <span className="metric_label">ANY Tokens:</span>
                        <span className="metric_val">500 M <small>(Rollover)</small></span>
                      </div>
                      <div className="pricing_metric_item">
                        <span className="metric_label">Users:</span>
                        <span className="metric_val">Unlimited</span>
                      </div>
                    </div>

                    <div className="pricing_features_block">
                      <span className="pricing_features_title">Core features:</span>
                      <ul className="pricing_features_list">
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>All 400+ frontier & open models</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>iamhujju SDK · AnyCLI · AnyChat</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>Priority smart routing & auto-failover</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>120 RPM rate limits & zero queueing</span>
                        </li>
                      </ul>
                    </div>

                    <div className="pricing_highlights_strip">
                      <span>Plan Highlights: · Priority support · Team collaboration · Advanced analytics · 99.9% Uptime</span>
                    </div>

                    <button
                      type="button"
                      className="pricing_cta_btn is--primary"
                      onClick={() => {
                        onClose();
                        if (onOpenCheckout) {
                          onOpenCheckout({
                            planId: 'pro',
                            name: 'Pro Plan',
                            amountInr: pricingBillingCycle === 'annual' ? 78708 : 8199,
                            amountFormatted: pricingBillingCycle === 'annual' ? '₹78,708 (₹6,559/mo)' : '₹8,199 / mo',
                            billingCycle: pricingBillingCycle,
                            amountUsd: pricingBillingCycle === 'annual' ? '$76.70 / mo' : '$95.90 / mo'
                          });
                        } else if (currentUser) {
                          if (onOpenApiKeys) onOpenApiKeys();
                        } else {
                          if (onOpenSignup) onOpenSignup();
                          else if (onOpenApiKeys) onOpenApiKeys();
                        }
                      }}
                    >
                      <span>Upgrade to Pro</span>
                      <TabIcon name="arrow" size={16} />
                    </button>
                  </div>

                  {/* 5. Enterprise Tier */}
                  <div className="pricing_plan is--enterprise">
                    <div className="pricing_plan_head">
                      <div className="pricing_plan_meta">
                        <span className="pricing_plan_category">Large teams & production apps</span>
                        <h3 className="pricing_plan_name">Enterprise</h3>
                      </div>
                      <div className="pricing_price_block">
                        <div className="pricing_price_row">
                          <span className="pricing_amount">
                            {pricingBillingCycle === 'annual' ? '₹19,199' : '₹23,999'}
                          </span>
                          <span className="pricing_unit">/ mo</span>
                        </div>
                        <span className="pricing_usd_badge">
                          {pricingBillingCycle === 'annual' ? '≈ $223.90 / mo (billed ₹230,388/yr)' : '$279.90 / mo'}
                        </span>
                      </div>
                    </div>

                    <p className="pricing_desc">Designed for high-traffic applications, custom fine-tuning & VPCs.</p>

                    <div className="pricing_metrics_box">
                      <div className="pricing_metric_item">
                        <span className="metric_label">ANY Tokens:</span>
                        <span className="metric_val">1.5 B <small>(Rollover)</small></span>
                      </div>
                      <div className="pricing_metric_item">
                        <span className="metric_label">Users:</span>
                        <span className="metric_val">Unlimited</span>
                      </div>
                    </div>

                    <div className="pricing_features_block">
                      <span className="pricing_features_title">Core features:</span>
                      <ul className="pricing_features_list">
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>All 400+ models + custom fine-tunes</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>iamhujju SDK · AnyCLI · AnyChat · MCP</span>
                        </li>
                        <li>
                          <TabIcon name="check" size={14} />
                          <span>Dedicated GPU instances & VPC peering</span>
                        </li>
                      </ul>
                    </div>

                    <div className="pricing_highlights_strip">
                      <span>Plan Highlights: · Dedicated support · Custom integrations · Advanced logging · 99.99% SLA</span>
                    </div>

                    <button
                      type="button"
                      className="pricing_cta_btn is--secondary"
                      onClick={() => {
                        onClose();
                        if (onOpenCheckout) {
                          onOpenCheckout({
                            planId: 'enterprise',
                            name: 'Enterprise Plan',
                            amountInr: pricingBillingCycle === 'annual' ? 230388 : 23999,
                            amountFormatted: pricingBillingCycle === 'annual' ? '₹230,388 (₹19,199/mo)' : '₹23,999 / mo',
                            billingCycle: pricingBillingCycle,
                            amountUsd: pricingBillingCycle === 'annual' ? '$223.90 / mo' : '$279.90 / mo'
                          });
                        } else if (onOpenContact) {
                          onOpenContact();
                        } else {
                          window.location.href = 'mailto:contact@iamhujju.com?subject=iamhujju Enterprise Plan Inquiry (INR)';
                        }
                      }}
                    >
                      <span>Upgrade or Contact Enterprise</span>
                      <TabIcon name="arrow" size={16} />
                    </button>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="pricing_disclaimer">
                  <p>* All plans are displayed in Indian Rupees (INR / ₹) matching standard USD benchmark exchange rates. Taxes and local fees may apply based on your jurisdiction.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="docs-modal-footer">
          <span>Need custom enterprise deployment? Contact <strong>contact@iamhujju.com</strong></span>
          <button className="docs-close-btn-bottom" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}
