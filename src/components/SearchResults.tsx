'use client';

import {
  type CreateWithAiResult,
  SearchService,
  type SearchTemplatesResult,
  type TemplateSummary,
} from '../services/SearchService';
import { useCallback, useMemo } from 'react';
import { searchResultsStateActions, useSearchResultsSnapshot } from 'state/searchResultsState';

interface SearchResultsProps {
  token?: string | null;
  onSelectTemplate?: (templateId: string) => void;
  onCreateWithAi?: (query: string) => void;
}

export function SearchResults({ token, onSelectTemplate, onCreateWithAi }: SearchResultsProps) {
  const state = useSearchResultsSnapshot();
  const service = useMemo(() => new SearchService(() => token ?? null), [token]);

  const handleSearch = useCallback(async () => {
    const trimmed = state.query.trim();
    if (!trimmed) {
      return;
    }

    searchResultsStateActions.setLoading();

    try {
      const result = await service.submit(trimmed);

      if (service.isSearchResult(result)) {
        searchResultsStateActions.setResults(result);
      } else if (service.isCreateResult(result)) {
        searchResultsStateActions.setCreated(result);
        onCreateWithAi?.(result.query);
      }
    } catch (err) {
      searchResultsStateActions.setError(err instanceof Error ? err.message : '搜索失败');
    }
  }, [state.query, service, onCreateWithAi]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        void handleSearch();
      }
    },
    [handleSearch],
  );

  return (
    <div className="search-container">
      <div className="search-input-wrap">
        <input
          type="text"
          className="search-input"
          placeholder="搜索模板，或直接描述你想要的应用..."
          value={state.query}
          onChange={(event) => searchResultsStateActions.setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="search-button" onClick={handleSearch} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? '搜索中...' : '搜索'}
        </button>
      </div>

      {state.status === 'results' && <SearchResultsList results={state.results} onSelect={onSelectTemplate} />}

      {state.status === 'created' && <CreateResultCard result={state.result} />}

      {state.status === 'error' && <div className="search-error">{state.message}</div>}
    </div>
  );
}

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
        <p>未找到匹配的模板。</p>
        <p className="search-empty-hint">试试换个关键词，或直接描述你想要生成的应用。</p>
      </div>
    );
  }

  return (
    <div className="search-results">
      <div className="search-results-header">
        <span>共找到 {results.total} 个模板</span>
      </div>
      <div className="search-results-list">
        {results.results.map((template: TemplateSummary) => (
          <TemplateCard key={template.templateId} template={template} onClick={() => onSelect?.(template.templateId)} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template, onClick }: { template: TemplateSummary; onClick?: () => void }) {
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
          <span key={tag} className="template-card-tag">
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

function CreateResultCard({ result }: { result: CreateWithAiResult }) {
  return (
    <div className="create-result">
      <div className="create-result-header">
        <span className="create-result-icon">已就绪</span>
        <span>正在打开编辑器，AI 将为你生成模板。</span>
      </div>
      <p className="create-result-desc">基于你的描述“{result.query}”</p>
    </div>
  );
}
