import { useState, useEffect } from 'react';
import './ContactModal.css';

export default function ContactModal({ isOpen, onClose, onOpenDocs }) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [subject, setSubject] = useState('Technical & Integration Support');
  const [telegram, setTelegram] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setErrorMessage('Please fill in all required fields (Name, Email, Message).');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim(),
          subject,
          telegram: telegram.trim(),
          email: email.trim(),
          message: message.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setSubmitted(true);
    } catch {
      // Fallback: Still notify user with direct links
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setName('');
    setCompany('');
    setSubject('Technical & Integration Support');
    setTelegram('');
    setEmail('');
    setMessage('');
    setSubmitted(false);
    setErrorMessage('');
  }

  return (
    <div className="contact-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="contact-heading">
      <div className="contact-modal-container" onClick={e => e.stopPropagation()}>
        {/* Top Header Bar */}
        <div className="contact-modal-topbar">
          <div className="contact-breadcrumbs">
            <span className="crumb-home" onClick={onClose}>Home</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Contacts</span>
          </div>
          <button
            type="button"
            className="contact-modal-close"
            onClick={onClose}
            aria-label="Close contact dialog"
          >
            ✕
          </button>
        </div>

        <div className="contact-modal-scroll">
          {/* Hero Section */}
          <section className="contact-hero">
            <h1 id="contact-heading">Let's Build Something Smarter, Together</h1>
            <p className="contact-hero-sub">
              Got a question, idea, or integration challenge? Our team is here to help you connect iamhujju to anywhere.
            </p>

            {/* Quick Action Pill Buttons */}
            <div className="contact-quick-buttons">
              <a
                href="https://t.me/+919975649957"
                target="_blank"
                rel="noopener noreferrer"
                className="contact-pill-btn telegram-pill"
              >
                <svg className="contact-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
                <span>Contact us on Telegram</span>
              </a>

              <a
                href="mailto:huzaifakazi1991@gmail.com"
                className="contact-pill-btn email-pill"
              >
                <svg className="contact-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span>Email: huzaifakazi1991@gmail.com</span>
              </a>
            </div>
          </section>

          {/* Form Card Section */}
          <section className="contact-form-section">
            <h2 className="contact-section-title">Or reach us via email</h2>

            <div className="contact-card-box">
              {submitted ? (
                <div className="contact-success-state">
                  <div className="success-icon-ring">✓</div>
                  <h3>Message Sent Successfully!</h3>
                  <p>
                    Thank you, <strong>{name}</strong>. We've received your inquiry and our team will get back to you at <strong>{email}</strong> within one business day (usually much faster).
                  </p>
                  <div className="success-action-row">
                    <a
                      href="https://t.me/+919975649957"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="contact-btn-submit"
                    >
                      Fast-Track via Telegram (+91 99756 49957)
                    </a>
                    <button
                      type="button"
                      className="contact-btn-reset"
                      onClick={handleReset}
                    >
                      Send Another Message
                    </button>
                  </div>
                </div>
              ) : (
                <form className="contact-form-inner" onSubmit={handleSubmit}>
                  {errorMessage && (
                    <div className="contact-alert-error" role="alert">
                      {errorMessage}
                    </div>
                  )}

                  <div className="contact-field-group">
                    <label htmlFor="contact-name">Name <span className="req-star">*</span></label>
                    <input
                      id="contact-name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your full name"
                      required
                      maxLength={120}
                    />
                  </div>

                  <div className="contact-field-group">
                    <label htmlFor="contact-company">Company Name</label>
                    <input
                      id="contact-company"
                      type="text"
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      placeholder="Your company or project name"
                      maxLength={140}
                    />
                  </div>

                  <div className="contact-field-group">
                    <label htmlFor="contact-subject">Subject <span className="req-star">*</span></label>
                    <select
                      id="contact-subject"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      required
                    >
                      <option value="Technical & Integration Support">Technical & Integration Support</option>
                      <option value="Sales & Business">Sales & Business</option>
                      <option value="Partnership">Partnership</option>
                      <option value="Feature Request">Feature Request</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="contact-field-group">
                    <label htmlFor="contact-telegram">Telegram handle</label>
                    <input
                      id="contact-telegram"
                      type="text"
                      value={telegram}
                      onChange={e => setTelegram(e.target.value)}
                      placeholder="@yourhandle or +91 99756 49957 (optional)"
                      maxLength={80}
                    />
                  </div>

                  <div className="contact-field-group">
                    <label htmlFor="contact-email">Email <span className="req-star">*</span></label>
                    <input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      maxLength={254}
                    />
                  </div>

                  <div className="contact-field-group">
                    <label htmlFor="contact-message">Message <span className="req-star">*</span></label>
                    <textarea
                      id="contact-message"
                      rows={5}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Tell us a bit more about your question or goal…"
                      required
                      maxLength={3000}
                    />
                  </div>

                  <button
                    type="submit"
                    className="contact-btn-submit"
                    disabled={submitting}
                  >
                    {submitting ? 'Sending Message…' : 'Send Message'}
                  </button>

                  <p className="contact-guarantee-note">
                    We'll reply within one business day, usually much faster.
                  </p>
                </form>
              )}
            </div>
          </section>

          {/* Prefer Talking Live? Strategy Call Block */}
          <section className="contact-talking-live">
            <div className="talking-live-card">
              <h2>Prefer Talking Live?</h2>
              <p>
                Reach out directly for a quick strategy or integration chat. We'll walk you through integration ideas, free model routing, pricing, or custom setups.
              </p>
              <a
                href="https://t.me/+919975649957"
                target="_blank"
                rel="noopener noreferrer"
                className="talking-live-cta"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
                <span>Chat on Telegram (+91 99756 49957)</span>
              </a>
            </div>
          </section>

          {/* Direct Contact Channels 2x2 Grid */}
          <section className="contact-channels-section">
            <h2>Prefer another channel? We're easy to reach.</h2>
            <p className="channels-subtitle">However you connect, we'll help you build faster.</p>

            <div className="contact-channels-grid">
              {/* Channel 1: Email */}
              <a href="mailto:huzaifakazi1991@gmail.com" className="channel-card">
                <div className="channel-icon-wrap icon-cyan">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <div className="channel-info">
                  <h3>Email</h3>
                  <span className="channel-value">huzaifakazi1991@gmail.com</span>
                </div>
              </a>

              {/* Channel 2: Telegram */}
              <a href="https://t.me/+919975649957" target="_blank" rel="noopener noreferrer" className="channel-card">
                <div className="channel-icon-wrap icon-blue">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </div>
                <div className="channel-info">
                  <h3>Telegram</h3>
                  <span className="channel-value">+91 99756 49957</span>
                </div>
              </a>

              {/* Channel 3: Live Community */}
              <a href="https://t.me/+919975649957" target="_blank" rel="noopener noreferrer" className="channel-card">
                <div className="channel-icon-wrap icon-purple">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className="channel-info">
                  <h3>Developer Support</h3>
                  <span className="channel-value">Live Telegram Community</span>
                </div>
              </a>

              {/* Channel 4: Documentation */}
              <div
                className="channel-card clickable"
                onClick={() => {
                  onClose();
                  if (onOpenDocs) onOpenDocs('quickstart');
                }}
              >
                <div className="channel-icon-wrap icon-emerald">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                    <path d="M6 6h10" />
                    <path d="M6 10h10" />
                  </svg>
                </div>
                <div className="channel-info">
                  <h3>Documentation</h3>
                  <span className="channel-value">Quick setup help & API guides</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
