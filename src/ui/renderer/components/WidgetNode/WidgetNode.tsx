'use client';

import { getLibrary } from '../../useDependencyLoader';
import { asString } from '../../valueResolvers';
import type { WidgetProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import { resolveSafeWidgetRenderer } from '@shared/agent/validation/widgetSafety';
import { useEffect, useRef } from 'react';

const WIDGET_RUNTIME_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI_WIDGETS !== 'false';

interface EChartsInstance {
  setOption: (option: Record<string, unknown>) => void;
  resize: () => void;
  dispose: () => void;
}

interface EChartsApi {
  init: (container: HTMLDivElement) => EChartsInstance;
}

interface ChartJsInstance {
  destroy: () => void;
  resize?: () => void;
}

type ChartJsConstructor = new (
  context: CanvasRenderingContext2D,
  config: Record<string, unknown>,
) => ChartJsInstance;

interface LottieAnimation {
  destroy: () => void;
}

interface LottieApi {
  loadAnimation: (options: Record<string, unknown>) => LottieAnimation;
}

interface MermaidRenderResult {
  svg: string;
}

interface MermaidApi {
  initialize?: (options: Record<string, unknown>) => void;
  render: (
    id: string,
    definition: string,
  ) => MermaidRenderResult | Promise<MermaidRenderResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveEChartsApi(lib: unknown): EChartsApi | null {
  if (isRecord(lib) && typeof lib.init === 'function') {
    return lib as unknown as EChartsApi;
  }
  if (isRecord(lib) && isRecord(lib.default) && typeof lib.default.init === 'function') {
    return lib.default as unknown as EChartsApi;
  }
  return null;
}

function resolveChartJsConstructor(lib: unknown): ChartJsConstructor | null {
  if (typeof lib === 'function') {
    return lib as ChartJsConstructor;
  }
  if (isRecord(lib) && typeof lib.Chart === 'function') {
    return lib.Chart as ChartJsConstructor;
  }
  if (isRecord(lib) && typeof lib.default === 'function') {
    return lib.default as ChartJsConstructor;
  }
  if (isRecord(lib) && isRecord(lib.default) && typeof lib.default.Chart === 'function') {
    return lib.default.Chart as ChartJsConstructor;
  }
  return null;
}

function resolveLottieApi(lib: unknown): LottieApi | null {
  if (isRecord(lib) && typeof lib.loadAnimation === 'function') {
    return lib as unknown as LottieApi;
  }
  if (isRecord(lib) && isRecord(lib.default) && typeof lib.default.loadAnimation === 'function') {
    return lib.default as unknown as LottieApi;
  }
  return null;
}

function resolveMermaidApi(lib: unknown): MermaidApi | null {
  if (isRecord(lib) && typeof lib.render === 'function') {
    return lib as unknown as MermaidApi;
  }
  if (isRecord(lib) && isRecord(lib.default) && typeof lib.default.render === 'function') {
    return lib.default as unknown as MermaidApi;
  }
  return null;
}

function resolveEChartsOption(data: unknown): Record<string, unknown> {
  if (isRecord(data) && isRecord(data.option)) {
    return data.option;
  }
  if (isRecord(data) && isRecord(data.options)) {
    return data.options;
  }
  if (isRecord(data)) {
    return data;
  }

  return {
    tooltip: {},
    xAxis: { type: 'category', data: ['A', 'B', 'C', 'D'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [12, 20, 15, 28] }],
  };
}

function resolveChartJsConfig(data: unknown): Record<string, unknown> {
  const rawConfig = isRecord(data) && isRecord(data.config)
    ? data.config
    : isRecord(data) && typeof data.type === 'string'
      ? data
      : {
          type: 'bar',
          data: {
            labels: ['A', 'B', 'C', 'D'],
            datasets: [{ label: 'Value', data: [12, 20, 15, 28] }],
          },
        };
  const rawOptions = isRecord(rawConfig.options) ? rawConfig.options : {};
  return {
    ...rawConfig,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...rawOptions,
    },
  };
}

function resolveMermaidDefinition(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (isRecord(data)) {
    const definition = data.definition ?? data.diagram ?? data.chart;
    if (typeof definition === 'string' && definition.trim()) {
      return definition;
    }
  }
  return 'graph TD; A[Start] --> B[Done];';
}

export function WidgetNode({ props, nodeLayoutStyle }: CoreNodeProps<WidgetProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const library = asString(props.library);
  const renderer = resolveSafeWidgetRenderer(library, asString(props.renderer));

  useEffect(() => {
    if (!WIDGET_RUNTIME_ENABLED) { return; }

    const container = containerRef.current;
    if (!container || !library || !renderer) {return;}
    const lib = getLibrary(library);
    if (!lib) {return;}

    let cleanup: (() => void) | undefined;
    container.innerHTML = '';

    if (renderer === 'echarts') {
      const echarts = resolveEChartsApi(lib);
      if (!echarts) {return;}
      const chart = echarts.init(container);
      chart.setOption(resolveEChartsOption(props.data));
      const resizeObserver = new ResizeObserver(() => chart.resize());
      resizeObserver.observe(container);
      cleanup = () => {
        resizeObserver.disconnect();
        chart.dispose();
      };
    }

    if (renderer === 'chartjs') {
      const Chart = resolveChartJsConstructor(lib);
      if (!Chart) {return;}
      const canvas = document.createElement('canvas');
      container.append(canvas);
      const context = canvas.getContext('2d');
      if (!context) {return;}
      const chart = new Chart(context, resolveChartJsConfig(props.data));
      const resizeObserver = new ResizeObserver(() => chart.resize?.());
      resizeObserver.observe(container);
      cleanup = () => {
        resizeObserver.disconnect();
        chart.destroy();
      };
    }

    if (renderer === 'lottie') {
      const lottie = resolveLottieApi(lib);
      if (!lottie || !isRecord(props.data)) {return;}
      const animationData = props.data.animationData ?? props.data.animation;
      if (!isRecord(animationData)) {return;}
      const animation = lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop: props.data.loop !== false,
        autoplay: props.data.autoplay !== false,
        animationData,
      });
      cleanup = () => { animation.destroy(); };
    }

    if (renderer === 'mermaid') {
      const mermaid = resolveMermaidApi(lib);
      if (!mermaid) {return;}
      let cancelled = false;
      mermaid.initialize?.({ startOnLoad: false, securityLevel: 'strict' });
      void Promise.resolve(
        mermaid.render(
          `widget-mermaid-${Math.random().toString(36).slice(2)}`,
          resolveMermaidDefinition(props.data),
        ),
      ).then((result) => {
        if (!cancelled) {
          container.innerHTML = result.svg;
        }
      }).catch((error: unknown) => {
        if (!cancelled) {
          console.error('[WidgetNode] mermaid render error', error);
        }
      });
      cleanup = () => {
        cancelled = true;
        container.innerHTML = '';
      };
    }

    return () => { cleanup?.(); };
  }, [library, renderer, props.data]);

  return (
    <div
      ref={containerRef}
      style={{ minHeight: 240, ...nodeLayoutStyle }}
      aria-label={renderer ? `${renderer} widget` : 'Unsupported widget'}
      data-widget-library={library || undefined}
      data-widget-runtime={WIDGET_RUNTIME_ENABLED ? 'enabled' : 'disabled'}
      data-widget-renderer={renderer ?? undefined}
    />
  );
}
