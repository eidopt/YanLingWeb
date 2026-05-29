import type { ThemeLayoutDataSource } from 'ui/layout/types';

function isSafePublicJsonEndpoint(value: string): boolean {
  if (value.startsWith('/')) {
    return !value.startsWith('//');
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function safeJsonExpression(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return 'null';
  }
}

function normalizeDataSources(dataSources: ThemeLayoutDataSource[] = []): ThemeLayoutDataSource[] {
  return dataSources
    .filter((source) => source.id)
    .map((source) => ({
      ...source,
      url:
        source.kind === 'publicJsonEndpoint' && source.url && isSafePublicJsonEndpoint(source.url)
          ? source.url
          : undefined,
    }))
    .filter((source) => source.kind === 'staticJson' || Boolean(source.url));
}

export function generateDataSourcesModule(dataSources: ThemeLayoutDataSource[]): string {
  const entries = normalizeDataSources(dataSources)
    .map((source) =>
      [
        `  ${JSON.stringify(source.id)}: {`,
        `    id: ${JSON.stringify(source.id)},`,
        `    kind: ${JSON.stringify(source.kind)},`,
        source.description ? `    description: ${JSON.stringify(source.description)},` : '',
        source.url ? `    url: ${JSON.stringify(source.url)},` : '',
        source.select ? `    select: ${JSON.stringify(source.select)},` : '',
        `    data: ${safeJsonExpression(source.data)},`,
        `    fallback: ${safeJsonExpression(source.fallback)},`,
        '  },',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  return `export interface ExportedDataSource {
  id: string;
  kind: 'staticJson' | 'publicJsonEndpoint';
  description?: string;
  url?: string;
  select?: string;
  data?: unknown;
  fallback?: unknown;
}

export const dataSources = {
${entries}
} satisfies Record<string, ExportedDataSource>;

export function getDataSource(sourceId: string): ExportedDataSource | undefined {
  return dataSources[sourceId as keyof typeof dataSources];
}

export function selectData(value: unknown, selector?: string): unknown {
  if (!selector) {
    return value;
  }
  return selector.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, value);
}

export function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

export function readDisplayValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}
`;
}

export function generateUseExportedDataHook(): string {
  return `import { useEffect, useMemo, useState } from 'react';

import { getDataSource, selectData } from './dataSources';

export interface ExportedDataResult {
  data: unknown;
  error: string | null;
  loading: boolean;
}

export function useExportedData(sourceId: string, selector?: string): ExportedDataResult {
  const source = getDataSource(sourceId);
  const resolvedSelector = selector || source?.select;
  const [remoteState, setRemoteState] = useState<ExportedDataResult>({
    data: source?.fallback,
    error: source ? null : 'Data source not found.',
    loading: source?.kind === 'publicJsonEndpoint',
  });

  useEffect(() => {
    if (!source || source.kind !== 'publicJsonEndpoint') {
      return;
    }
    let cancelled = false;
    setRemoteState((current) => ({ ...current, loading: true, error: null }));
    fetch(source.url || '')
      .then((response) => {
        if (!response.ok) {
          throw new Error(\`Request failed with \${response.status}\`);
        }
        return response.json();
      })
      .then((json: unknown) => {
        if (!cancelled) {
          setRemoteState({ data: json, error: null, loading: false });
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setRemoteState({
            data: source.fallback,
            error: error.message || 'Unable to load data.',
            loading: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return useMemo(() => {
    if (!source) {
      return remoteState;
    }
    if (source.kind === 'staticJson') {
      return { data: selectData(source.data, resolvedSelector), error: null, loading: false };
    }
    return { ...remoteState, data: selectData(remoteState.data, resolvedSelector) };
  }, [remoteState, resolvedSelector, source]);
}
`;
}
