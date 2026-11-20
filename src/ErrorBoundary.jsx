import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[React ErrorBoundary caught error]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          margin: '20px auto',
          maxWidth: '600px',
          borderRadius: '14px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          color: '#fecaca',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <h3 style={{ margin: '0 0 10px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>Workspace View Recovery</span>
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.5, color: '#e2e8f0' }}>
            A rendering interruption occurred while processing this message or media. Your conversation data has been safely preserved.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Refresh Workspace View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
