import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Route render error', error, info);
  }

  componentDidUpdate(prevProps) {
    // Moving to another page must not leave the error screen stuck on.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="content-container" role="alert" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>This page failed to load. Try again, or go back to the home page.</p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '1rem', marginRight: '0.75rem', display: 'inline-block' }}
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
          <a href="/" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Go home
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
