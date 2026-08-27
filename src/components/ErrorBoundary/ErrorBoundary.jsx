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

  render() {
    if (this.state.hasError) {
      return (
        <div className="content-container" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>This page failed to load. Try refreshing or go back to the home page.</p>
          <a href="/" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Go home
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
