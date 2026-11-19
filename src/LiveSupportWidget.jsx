import { useEffect, useRef, useState } from 'react';
import './LiveSupportWidget.css';

export default function LiveSupportWidget({
  isOpen,
  onToggle,
  onOpenFullChat,
  selectedModel = 'openrouter:openrouter/free',
  connected = true
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "👋 **Hi! I'm your iamhujju Live Assistant.**\n\nI'm here to help you browse 400+ models, get code snippets, set up your API keys, or build new features. How can I assist you right now?"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const quickPrompts = [
    'Which free models are available?',
    'How do I use the OpenAI SDK with iamhujju?',
    'How do I connect my OpenRouter key?',
    'Show me an AnyCLI example'
  ];

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  async function handleSend(promptText) {
    const textToSend = promptText || input.trim();
    if (!textToSend || loading) return;

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
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel || 'openrouter:openrouter/free',
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          max_tokens: 1024,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`API error (${response.status})`);
      }

      const data = await response.json();
      const assistantText = data?.choices?.[0]?.message?.content ||
        "I'm here to help! Try exploring the 400+ models in the Models Hub or test our drop-in OpenAI SDK.";

      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: assistantText
        }
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: "I'm currently operating in offline mode. You can open the **Full Workspace Chat** for advanced streaming, or explore the **Models Hub**!"
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
                <span>Live AI Support · 100% Free</span>
              </div>
            </div>

            <div className="live-support-header-actions">
              <button
                type="button"
                className="live-support-expand-btn"
                onClick={onOpenFullChat}
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
                <div key={msg.id} className={`live-msg-row ${msg.role === 'user' ? 'is-user' : 'is-bot'}`}>
                  {msg.role === 'assistant' && (
                    <img src="/copilot.jpg" alt="AI" className="live-msg-avatar" />
                  )}
                  <div className="live-msg-bubble">
                    <p>{msg.content}</p>
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
            {messages.length <= 2 && (
              <div className="live-quick-prompts">
                <span className="live-quick-title">Suggested questions:</span>
                <div className="live-quick-pills">
                  {quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="live-quick-pill"
                      onClick={() => handleSend(prompt)}
                      disabled={loading}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input Footer */}
          <footer className="live-support-footer">
            <textarea
              className="live-support-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or request a feature..."
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
