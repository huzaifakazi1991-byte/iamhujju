import { useEffect, useRef, useState } from 'react';
import './LiveSupportWidget.css';
import { resolvePlan } from './pricingConfig.js';

function FormattedMessage({ content, onActionClick }) {
  const actionRegex = /\[\[action:([a-zA-Z0-9_\-:]+)\|([^\]]+)\]\]/g;
  const actions = [];
  let match;
  while ((match = actionRegex.exec(content)) !== null) {
    actions.push({ type: match[1], label: match[2] });
  }

  const cleanText = content.replace(actionRegex, '').trim();
  const parts = cleanText.split(/(```[\s\S]*?```)/g);

  return (
    <div className="live-msg-bubble-inner">
      {parts.map((part, pIdx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trim().split('\n');
          const firstLine = lines[0].trim();
          const codeBody =
            lines.length > 1 && !firstLine.includes(' ') && firstLine.length < 15
              ? lines.slice(1).join('\n')
              : lines.join('\n');

          return (
            <pre key={pIdx} className="live-msg-code">
              <code>{codeBody}</code>
            </pre>
          );
        }

        return part.split('\n').map((line, lIdx) => {
          if (!line.trim()) return <div key={lIdx} className="live-msg-gap" />;

          const tokens = line.split(/(\*\*.*?\*\*|`.*?`)/g);

          return (
            <p key={lIdx} className="live-msg-p">
              {tokens.map((token, tIdx) => {
                if (token.startsWith('**') && token.endsWith('**')) {
                  return <strong key={tIdx}>{token.slice(2, -2)}</strong>;
                }
                if (token.startsWith('`') && token.endsWith('`')) {
                  return (
                    <code key={tIdx} className="live-inline-code">
                      {token.slice(1, -1)}
                    </code>
                  );
                }
                return token;
              })}
            </p>
          );
        });
      })}

      {actions.length > 0 && (
        <div className="live-msg-actions">
          {actions.map((act, aIdx) => (
            <button
              key={aIdx}
              type="button"
              className="live-action-pill"
              onClick={() => onActionClick(act.type)}
            >
              {act.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getClientKnowledgeReply(query = '', context = {}) {
  const q = String(query).toLowerCase().trim();
  const { models = [], currentUser = null } = context;
  const countStr = models.length > 0 ? `${models.length}+` : '400+';

  if (
    q.includes('model') ||
    q.includes('free') ||
    q.includes('gemini') ||
    q.includes('deepseek') ||
    q.includes('claude') ||
    q.includes('gpt') ||
    q.includes('llama') ||
    q.includes('catalog')
  ) {
    return `iamhujju gives you instant access to **${countStr} AI models** across all major providers.

**100% Free Tier Models (No API Key Required):**
• **Google Gemini 2.5 Flash** — Ultra-fast (~140ms latency), 1M+ token context window, multimodal
• **DeepSeek V3 & R1** — State-of-the-art coding and math reasoning
• **Meta Llama 3.3 70B** — Top-tier open weights intelligence
• **Qwen 2.5 72B** — Superior multilingual and reasoning capability

**Pro Models (Bring-Your-Own-Key):**
You can also connect your personal OpenRouter key in Account settings for Claude 3.5 Sonnet, GPT-4o, and o3 with direct per-token pass-through pricing (0% markup).

[[action:models|🚀 Open Model Hub]] [[action:chat|⚡ Try Free Models in AnyChat]]`;
  }

  if (
    q.includes('price') ||
    q.includes('cost') ||
    q.includes('plan') ||
    q.includes('bill') ||
    q.includes('tier') ||
    q.includes('subscription') ||
    q.includes('token') ||
    q.includes('razorpay') ||
    q.includes('upi') ||
    q.includes('pay') ||
    q.includes('upgrade') ||
    q.includes('inr') ||
    q.includes('rupee')
  ) {
    return `**Pricing & Payment Options (INR / ₹ & USD):**

iamhujju offers transparent plans in Indian Rupees with Razorpay & UPI support:
• **Free Forever ($0 / ₹0):** 18+ high-speed models without entering payment or API keys.
• **Developer Plan (₹1,699/mo · $19.90):** 100M tokens across all 400+ models.
• **Pro Plan (₹8,199/mo · $95.90):** 500M tokens, priority smart routing & 120 RPM.
• **Enterprise Plan (₹23,999/mo · $279.90):** Dedicated instances, 1.5B tokens & 99.99% SLA.

**Payment Methods:**
• **Razorpay:** UPI (GPay, PhonePe, Paytm, CRED), Cards, NetBanking.
• **Direct UPI:** \`9975649957@mbk\` (Huzaifa Kazi / iamhujju).

[[action:checkout:pro|💳 Upgrade to Pro]] [[action:checkout:developer|⚡ Upgrade to Developer]] [[action:pricing|💰 View All Plans]]`;
  }

  if (
    q.includes('api') ||
    q.includes('sdk') ||
    q.includes('openai') ||
    q.includes('curl') ||
    q.includes('python') ||
    q.includes('node') ||
    q.includes('endpoint') ||
    q.includes('code')
  ) {
    return `**Drop-in OpenAI SDK Compatibility:**

You can integrate iamhujju into any app or script by pointing the standard OpenAI SDK to our endpoint:

\`\`\`javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://iamhujju.com/api',
  apiKey: process.env.IAMHUJJU_API_KEY || 'your-key'
});

const response = await client.chat.completions.create({
  model: 'openrouter/free',
  messages: [{ role: 'user', content: 'Hello iamhujju!' }]
});
console.log(response.choices[0].message.content);
\`\`\`

[[action:docs:quickstart|📖 View Quickstart & cURL]] [[action:scroll:unified-api-section|⚡ Unified API Architecture]]`;
  }

  if (
    q.includes('cli') ||
    q.includes('terminal') ||
    q.includes('command') ||
    q.includes('npx') ||
    q.includes('install')
  ) {
    return `**AnyCLI — Run AI from Your Terminal:**

Chat with models and manage configurations directly from your command line without installing dependencies:

\`\`\`bash
# Launch interactive chat with the fastest free model
npx iamhujju chat --model "auto"

# Test a prompt with custom temperature
npx iamhujju chat -m "google/gemini-2.5-flash" -p "Summarize README"
\`\`\`

[[action:docs:cli|💻 AnyCLI Terminal Setup]] [[action:scroll:anycli-section|🖥️ Terminal Features]]`;
  }

  if (
    q.includes('skill') ||
    q.includes('mcp') ||
    q.includes('agent') ||
    q.includes('tool') ||
    q.includes('orchestrat')
  ) {
    return `**Skills & Agent Orchestrator:**

iamhujju includes a catalog of **34+ curated AI developer skills** and MCP (Model Context Protocol) tool integrations:
• Automated codebase audits and refactoring
• Multi-database migrations and query tuning
• Real-time web search and live verification
• OWASP security scanning & vulnerability checks

[[action:skills|🛠️ Browse Skills Catalog]]`;
  }

  if (
    q.includes('database') ||
    q.includes('privacy') ||
    q.includes('security') ||
    q.includes('firestore') ||
    q.includes('neon') ||
    q.includes('postgre') ||
    q.includes('train') ||
    q.includes('retention')
  ) {
    return `**Privacy & Dual-Persistence Architecture:**

• **Zero Data Retention / Training:** Your prompts and files are strictly private and never used to train models.
• **Neon PostgreSQL:** Stores account credentials encrypted with AES-256-GCM and isolates session tokens.
• **Cloud Firestore:** Automatically mirrors your conversation history across devices under \`users/{userId}/conversations/{chatId}\`.

[[action:saved|☁️ View Saved Chats]] [[action:scroll:about|ℹ️ Security Architecture]]`;
  }

  if (
    q.includes('sign in') ||
    q.includes('login') ||
    q.includes('auth') ||
    q.includes('google') ||
    q.includes('account') ||
    q.includes('signup') ||
    q.includes('register')
  ) {
    if (currentUser) {
      return `You are currently signed in as **${currentUser.email || currentUser.displayName || 'Authenticated User'}** (Tier: **${currentUser.tier || 'free'}**).

You can manage your custom provider keys, check rate limits, or sign out via the Account menu in the top navigation!

[[action:chat|⚡ Launch AnyChat Workspace]] [[action:saved|☁️ View Saved Chats]]`;
    }
    return `**Authentication & Account Access:**

• **Google Sign-In:** 1-click sign in via Firebase Google Authentication.
• **Email & Password:** Secure password hashing with session cookie protection.
• **Dual Database Sync:** Logging in links your Neon PostgreSQL account with Cloud Firestore for instant cross-device continuity.

[[action:auth|🔐 Sign In to Workspace]]`;
  }

  if (
    q.includes('who') ||
    q.includes('creator') ||
    q.includes('founder') ||
    q.includes('huzaifa') ||
    q.includes('contact') ||
    q.includes('support') ||
    q.includes('help')
  ) {
    return `**iamhujju Support & Community:**

• **Founder & Engineer:** Huzaifa Kazi
• **Email:** \`huzaifakazi1991@gmail.com\` / \`support@iamhujju.com\`
• **Website:** https://iamhujju.com

I am your 24/7 in-app AI assistant! Ask me any question about models, code, setup, or features, and I'll guide you directly.

[[action:about|ℹ️ About iamhujju]] [[action:contact|✉️ Contact Founder]] [[action:models|🚀 Explore Models]] [[action:chat|⚡ Launch AnyChat]]`;
  }

  return `I'm your **iamhujju Copilot**! I can help you with anything across the platform:

• **Explore ${countStr} Models:** Live benchmarks, context sizes, and free tier routing.
• **AnyChat Playground:** Test prompts and compare model responses side-by-side.
• **Unified API & SDKs:** Drop-in OpenAI compatibility for Node.js, Python, and cURL.
• **AnyCLI:** Run AI straight from your terminal.
• **Skills Catalog:** 34+ AI orchestrator and agent skills.

What would you like to explore or do right now?

[[action:models|🚀 Open Model Hub]] [[action:chat|⚡ Open AnyChat Playground]] [[action:pricing|💰 View Pricing]] [[action:docs:quickstart|📖 API Docs]]`;
}

export default function LiveSupportWidget({
  isOpen,
  onToggle,
  onOpenFullChat,
  onOpenModels,
  onOpenSkills,
  onOpenSavedChats,
  onOpenDocs,
  onOpenAuth,
  onOpenContact,
  onOpenAbout,
  onOpenCheckout,
  onScrollTo,
  selectedModel = 'openrouter:openrouter/free',
  connected = true,
  currentUser = null,
  models = []
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: `👋 **Hi! I'm your iamhujju Copilot & Platform Navigator.**

I have complete knowledge of everything on **iamhujju.com** — from our **400+ AI models**, drop-in **OpenAI SDK**, **AnyCLI**, and **Pricing**, to **Firebase Auth** and **Cloud Firestore** sync.

Ask me any question or tell me where you'd like to navigate!

[[action:models|🚀 Explore 400+ Models]] [[action:pricing|💰 View Pricing]] [[action:docs:quickstart|📖 API Quickstart]]`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const quickPrompts = [
    { label: '🚀 Which models are 100% free?', query: 'Which models are 100% free?' },
    { label: '💰 How does pricing work?', query: 'How does pricing work?' },
    { label: '📖 Drop-in OpenAI SDK code', query: 'Show me the drop-in OpenAI SDK code' },
    { label: '💻 Install & run AnyCLI', query: 'How do I run AnyCLI from terminal?' },
    { label: '🛠️ Explore 34+ Skills', query: 'Tell me about the 34+ skills catalog' },
    { label: '🔐 Google Sign-In & Privacy', query: 'How does Firebase Auth and privacy work?' },
    { label: '✉️ Contact Founder', query: 'Who built iamhujju and how do I contact support?' }
  ];

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  function executeAction(actionType) {
    if (!actionType) return;
    const [action, param] = actionType.split(':');

    switch (action) {
      case 'models':
        if (onOpenModels) onOpenModels();
        break;
      case 'chat':
        if (onOpenFullChat) onOpenFullChat(param || selectedModel);
        break;
      case 'skills':
        if (onOpenSkills) onOpenSkills();
        break;
      case 'saved':
        if (onOpenSavedChats) onOpenSavedChats();
        break;
      case 'docs':
        if (onOpenDocs) onOpenDocs(param || 'quickstart');
        break;
      case 'pricing':
        if (onOpenDocs) onOpenDocs('pricing');
        else if (onScrollTo) onScrollTo('pricing');
        break;
      case 'checkout':
        if (onOpenCheckout) {
          onOpenCheckout(resolvePlan(param || 'pro'));
        } else if (onOpenDocs) {
          onOpenDocs('pricing');
        }
        break;
      case 'auth':
        if (onOpenAuth) onOpenAuth(param || 'login');
        break;
      case 'scroll':
        if (onScrollTo) onScrollTo(param);
        break;
      case 'contact':
        if (onOpenContact) onOpenContact();
        else window.location.href = 'mailto:huzaifakazi1991@gmail.com';
        break;
      case 'about':
        if (onOpenAbout) onOpenAbout();
        break;
      case 'telegram':
        window.open('https://t.me/+919975649957', '_blank', 'noopener,noreferrer');
        break;
      default:
        break;
    }
  }

  function detectAutoNavigation(text) {
    const q = text.toLowerCase().trim();
    if (/^(take me to|navigate to|go to|open|show me)\s+(models|model hub|catalog)/i.test(q)) {
      if (onOpenModels) onOpenModels();
      return true;
    }
    if (/^(take me to|navigate to|go to|open|show me)\s+(pricing|plans|cost)/i.test(q)) {
      if (onOpenDocs) onOpenDocs('pricing');
      else if (onScrollTo) onScrollTo('pricing');
      return true;
    }
    if (/^(take me to|navigate to|go to|open|show me)\s+(chat|anychat|playground)/i.test(q)) {
      if (onOpenFullChat) onOpenFullChat(selectedModel);
      return true;
    }
    if (/^(take me to|navigate to|go to|open|show me)\s+(skills|skills catalog)/i.test(q)) {
      if (onOpenSkills) onOpenSkills();
      return true;
    }
    if (/^(take me to|navigate to|go to|open|show me)\s+(docs|api docs|quickstart)/i.test(q)) {
      if (onOpenDocs) onOpenDocs('quickstart');
      return true;
    }
    if (/^(take me to|navigate to|go to|open|show me)\s+(cli|terminal)/i.test(q)) {
      if (onOpenDocs) onOpenDocs('cli');
      return true;
    }
    if (/^(take me to|navigate to|go to|open|show me)\s+(saved chats|history)/i.test(q)) {
      if (onOpenSavedChats) onOpenSavedChats();
      return true;
    }
    if (/^(take me to|navigate to|go to|open|show me|surf)\s+(contact|contact us|contacts)/i.test(q)) {
      if (onOpenContact) onOpenContact();
      return true;
    }
    if (/^(take me to|navigate to|go to|open|show me|surf)\s+(about|about us|story|team|creator)/i.test(q)) {
      if (onOpenAbout) onOpenAbout();
      return true;
    }
    if (/^(sign in|log in|sign me in|open login|register|sign up)/i.test(q)) {
      if (onOpenAuth) onOpenAuth('login');
      return true;
    }
    return false;
  }

  async function handleSend(promptText) {
    const textToSend = promptText || input.trim();
    if (!textToSend || loading) return;

    // Detect if user asked for a direct navigation action
    detectAutoNavigation(textToSend);

    const userMessage = {
      id: String(Date.now()),
      role: 'user',
      content: textToSend
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    if (!promptText) setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: newMessages.slice(-6).map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.reply) {
          setMessages(prev => [
            ...prev,
            {
              id: String(Date.now() + 1),
              role: 'assistant',
              content: data.reply
            }
          ]);
          return;
        }
      }
      throw new Error('Fallback to local knowledge');
    } catch {
      // Local Knowledge Engine fallback
      const localReply = getClientKnowledgeReply(textToSend, { models, currentUser });
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: localReply
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleResetChat() {
    setMessages([
      {
        id: String(Date.now()),
        role: 'assistant',
        content: `👋 **Chat reset!** How can I help you navigate or explore iamhujju right now?

[[action:models|🚀 Open Model Hub]] [[action:pricing|💰 View Pricing]] [[action:docs:quickstart|📖 API Docs]]`
      }
    ]);
  }

  return (
    <div className="live-support-wrapper">
      {isOpen && (
        <aside
          className="live-support-window"
          role="complementary"
          aria-label="iamhujju Live Support Copilot"
        >
          {/* Header */}
          <header className="live-support-header">
            <div className="live-support-header-brand">
              <div className="live-support-avatar">
                <img src="/copilot.jpg" alt="iamhujju copilot" />
                <span className={`live-support-status-dot ${connected ? 'is-online' : ''}`} />
              </div>
              <div className="live-support-header-info">
                <strong>iamhujju Copilot</strong>
                <span>Live AI Support & Navigator · 100% Free</span>
              </div>
            </div>

            <div className="live-support-header-actions">
              <button
                type="button"
                className="live-support-icon-btn"
                onClick={handleResetChat}
                title="Restart conversation"
                aria-label="Restart conversation"
              >
                ↺
              </button>
              <button
                type="button"
                className="live-support-expand-btn"
                onClick={() => {
                  if (onOpenFullChat) onOpenFullChat(selectedModel);
                }}
                title="Open in full workspace"
                aria-label="Open full chat"
              >
                ⤢ Full Chat
              </button>
              <button
                type="button"
                className="live-support-close-btn"
                onClick={onToggle}
                title="Minimize live support"
                aria-label="Minimize"
              >
                ✕
              </button>
            </div>
          </header>

          {/* Messages Area */}
          <div className="live-support-body">
            <div className="live-support-messages">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`live-msg-row ${msg.role === 'user' ? 'is-user' : 'is-bot'}`}
                >
                  {msg.role === 'assistant' && (
                    <img src="/copilot.jpg" alt="AI" className="live-msg-avatar" />
                  )}
                  <div className="live-msg-bubble">
                    <FormattedMessage
                      content={msg.content}
                      onActionClick={executeAction}
                    />
                  </div>
                </div>
              ))}
              {loading && (
                <div className="live-msg-row is-bot">
                  <img src="/copilot.jpg" alt="AI" className="live-msg-avatar" />
                  <div className="live-msg-bubble is-loading">
                    <span className="live-typing-dot" />
                    <span className="live-typing-dot" />
                    <span className="live-typing-dot" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompt Suggestions */}
            <div className="live-quick-prompts">
              <span className="live-quick-title">Explore & Navigate:</span>
              <div className="live-quick-pills">
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="live-quick-pill"
                    onClick={() => handleSend(prompt.query)}
                    disabled={loading}
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Input Footer */}
          <footer className="live-support-footer">
            <textarea
              className="live-support-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or say 'take me to models'..."
              rows={1}
              disabled={loading}
              aria-label="Message live AI assistant"
            />
            <button
              type="button"
              className="live-support-send-btn"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              ↑
            </button>
          </footer>
        </aside>
      )}

      {/* Floating Launcher Button */}
      <button
        type="button"
        className={`any-floating-chat-bubble ${isOpen ? 'is-active' : ''}`}
        onClick={onToggle}
        aria-label={isOpen ? 'Close Live AI Support' : 'Open Live AI Support'}
        title="Live AI Copilot · Ask Me Anything!"
      >
        <img src="/copilot.jpg" alt="iamhujju copilot" className="any-floating-mascot-img" />
        <span className="any-floating-online-dot" />
        {!isOpen && (
          <span className="any-floating-label">
            Ask Me Anything!
          </span>
        )}
      </button>
    </div>
  );
}
