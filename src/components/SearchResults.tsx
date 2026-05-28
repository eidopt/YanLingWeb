'use client';

import { useState, useCallback } from 'react';
import {
  SearchService,
  type SearchIntentResponse,
  type TemplateSummary,
  type SearchTemplatesResult,
  type CreateBlankTemplateResult,
} from '../services/SearchService';

// ─── Types ────────────────────────────────────────────────────────

interface SearchResultsProps {
  token?: string | null;
  onSelectTemplate?: (templateId: string) => void;
  onCreateFromSchema?: (schema: Record<string, unknown>) => void;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'results'; results: SearchTemplatesResult }
  | { status: 'created'; result: CreateBlankTemplateResult }
  | { status: 'error'; message: string };

// ─── Component ────────────────────────────────────────────────────

export function SearchResults({ token, onSelectTemplate, onCreateFromSchema }: SearchResultsProps) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  const service = new SearchService(() => token ?? null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setState({ status: 'loading' });

    try {
      const result = await service.submit(trimmed);

      if (service.isSearchResult(result)) {
        setState({ status: 'results', results: result });
      } else if (service.isCreateResult(result)) {
        setState({ status: 'created', result });
        onCreateFromSchema?.(result.schema);
      }
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : '搜索失败',
      });
    }
  }, [query, token, onCreateFromSchema]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch],
  );

  return (
    <div className="search-container">
      {/* Search Input */}
      <div className="search-input-wrap">
        <input
          type="text"
          className="search-input"
          placeholder="搜索模板或描述你想要的应用..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="search-button"
          onClick={handleSearch}
          disabled={state.status === 'loading'}
        >
          {state.status === 'loading' ? '搜索中...' : '搜索'}
        </button>
      </div>

      {/* Results */}
      {state.status === 'results' && (
        <SearchResultsList
          results={state.results}
          onSelect={onSelectTemplate}
        />
      )}

      {state.status === 'created' && (
        <CreateResultCard result={state.result} />
      )}

      {state.status === 'error' && (
        <div className="search-error">{state.message}</div>
      )}
    </div>
  );
}

// ─── Search Results List ──────────────────────────────────────────

function SearchResultsList({
  results,
  onSelect,
}: {
  results: SearchTemplatesResult;
  onSelect?: (templateId: string) => void;
}) {
  if (results.total === 0) {
    return (
      <div className="search-empty">
        <p>没有找到匹配的模板</p>
        <p className="search-empty-hint">试试其他关键词，或直接描述你想要的应用</p>
      </div>
    );
  }

  return (
    <div className="search-results">
      <div className="search-results-header">
        <span>找到 {results.total} 个模板</span>
      </div>
      <div className="search-results-list">
        {results.results.map((template: TemplateSummary) => (
          <TemplateCard
            key={template.templateId}
            template={template}
            onClick={() => onSelect?.(template.templateId)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────

function TemplateCard({
  template,
  onClick,
}: {
  template: TemplateSummary;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="template-card"
      onClick={onClick}
      style={{ '--accent': template.accent } as React.CSSProperties}
    >
      <div className="template-card-header">
        <span className="template-card-name">{template.name}</span>
        <span className="template-card-category">{template.category}</span>
      </div>
      <p className="template-card-tagline">{template.tagline}</p>
      <div className="template-card-tags">
        {template.tags.slice(0, 3).map((tag: string) => (
          <span key={tag} className="template-card-tag">{tag}</span>
        ))}
      </div>
    </button>
  );
}

// ─── Create Result Card ───────────────────────────────────────────

function CreateResultCard({ result }: { result: CreateBlankTemplateResult }) {
  return (
    <div className="create-result">
      <div className="create-result-header">
        <span className="create-result-icon">✨</span>
        <span>已为你生成模板骨架</span>
      </div>
      <p className="create-result-desc">
        基于你的描述 &ldquo;{result.query}&rdquo; 生成了一个空白模板结构，
        你可以在编辑器中进一步完善。
      </p>
      <div className="create-result-meta">
        <span>模板 ID: {String(result.schema.themeId ?? '')}</span>
        <span>页面数: {Array.isArray(result.schema.pages) ? result.schema.pages.length : 0}</span>
      </div>
    </div>
  );
}
