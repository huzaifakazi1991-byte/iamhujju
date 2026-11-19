import { useState } from 'react';
import './DocsModal.css';

export default function DocsModal({ isOpen, onClose, initialTab = 'quickstart', onOpenChat, onOpenApiKeys }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [copiedCode, setCopiedCode] = useState(null);

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
      <div className="docs-modal-container" onClick={e => e.stopPropagation()}>
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
              Pricing & BYOK
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
            <div className="docs-tab-content">
              <h3>Transparent Pricing On Your Terms</h3>
              <div className="docs-pricing-grid">
                <div className="docs-pricing-card">
                  <div className="docs-pricing-header">
                    <h4>Community & Free Tier</h4>
                    <div className="docs-price">$0 <span>/ forever</span></div>
                  </div>
                  <ul className="docs-pricing-list">
                    <li>✓ Auto Router with 100% Free models</li>
                    <li>✓ Zero API key requirement for chat</li>
                    <li>✓ Cloud synced chat history (Neon PostgreSQL + Firebase)</li>
                    <li>✓ 450+ installable Agent Skills</li>
                    <li>✓ 2,048 tokens output limit per turn</li>
                  </ul>
                  <button className="docs-action-btn" onClick={() => { onClose(); onOpenChat(); }}>
                    Start Chatting Free
                  </button>
                </div>
                <div className="docs-pricing-card featured">
                  <div className="docs-pricing-header">
                    <h4>Pro Workspace (BYOK)</h4>
                    <div className="docs-price">Cost-Only <span>/ 0% Markup</span></div>
                  </div>
                  <ul className="docs-pricing-list">
                    <li>✓ Access all 400+ Pro & Frontier Models</li>
                    <li>✓ Bring your own OpenRouter API key</li>
                    <li>✓ Zero platform fees or markup on tokens</li>
                    <li>✓ Extended context up to 2M tokens</li>
                    <li>✓ Priority routing & AES-256 encrypted keys</li>
                  </ul>
                  <button className="docs-action-btn primary" onClick={() => { onClose(); onOpenApiKeys(); }}>
                    Connect Provider Key
                  </button>
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
