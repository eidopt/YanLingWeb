'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-error-boundary" role="alert">
          <section className="app-error-boundary__panel">
            <h1>页面渲染失败</h1>
            <p>当前模板或组件发生异常，请刷新页面后重试。</p>
            <button type="button" onClick={() => window.location.reload()}>
              刷新
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
