import React, { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, border: '1px solid #f5c2c7', background: '#f8d7da', color: '#842029', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>页面发生错误</div>
          <div style={{ marginBottom: 8 }}>{String(this.state.error)}</div>
          {this.state.info && this.state.info.componentStack && (
            <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', background: '#fff', padding: 8, border: '1px solid #f5c2c7', borderRadius: 6 }}>
              {this.state.info.componentStack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}