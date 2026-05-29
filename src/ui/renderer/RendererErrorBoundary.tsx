'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type ResetKeys = readonly unknown[];

interface RendererErrorBoundaryProps {
  children: ReactNode;
  /**
   * When any value in this array changes, the boundary resets its error state.
   * Pass a stable identity that changes when the rendered surface should retry,
   * e.g. the active page id or document id.
   */
  resetKeys?: ResetKeys;
}

interface RendererErrorBoundaryState {
  error: Error | null;
}

function resetKeysChanged(prev: ResetKeys | undefined, next: ResetKeys | undefined): boolean {
  if (prev === next) {
    return false;
  }
  if (!prev || !next) {
    return true;
  }
  if (prev.length !== next.length) {
    return true;
  }
  return prev.some((value, index) => !Object.is(value, next[index]));
}

/**
 * Renderer-scoped error boundary. Unlike AppErrorBoundary (a full-page
 * takeover), this renders a compact inline fallback so a single bad
 * (AI-generated) template node degrades gracefully without unmounting the
 * surrounding app shell. Resets its error state when `resetKeys` change so
 * navigating/editing recovers automatically.
 */
export class RendererErrorBoundary extends Component<RendererErrorBoundaryProps, RendererErrorBoundaryState> {
  state: RendererErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: RendererErrorBoundaryProps) {
    if (this.state.error && resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RendererErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="renderer-error-boundary" role="alert">
          <strong>此区域渲染失败</strong>
          <p>该模板节点存在异常，已跳过渲染。请调整内容或切换页面后重试。</p>
        </div>
      );
    }

    return this.props.children;
  }
}
