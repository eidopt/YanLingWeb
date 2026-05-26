'use client';

import { templatesPageContent as c } from './TemplatesPage.content';
import styles from './TemplatesPage.module.css';
import type {
  SortKey,
  TemplatesPageController,
} from './useTemplatesPageController';
import { useCallback, useEffect, useRef } from 'react';
import { ScrollReveal, StaggerChildren } from 'ui/pages';
import {
  Box,
  Button,
  Heading,
  Inline,
  Input,
  Stack,
  Text,
} from 'ui/system';
import { ThemeCard } from 'ui/theme_card';

/* ── Sort dropdown ── */

function SortDropdown({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
}) {
  return (
    <Box className={styles.sortDropdown}>
      <select
        className={styles.sortSelect}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { onChange(e.target.value as SortKey); }}
        aria-label={c.sortLabel}
      >
        {Object.entries(c.sortOptions).map(([key, label]) => (
          <option key={key} value={key}>{c.sortLabel}: {label}</option>
        ))}
      </select>
    </Box>
  );
}

/* ── Skeleton loader ── */

function TemplateSkeleton() {
  return (
    <Box className={styles.skeletonGrid} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <Box key={i} className={styles.skeletonCard}>
          <Box className={styles.skeletonPreview} />
          <Box className={styles.skeletonMeta}>
            <Box className={styles.skeletonAccent} />
            <Box className={styles.skeletonLines}>
              <Box className={styles.skeletonLine} style={{ '--sk-width': '72%' } as React.CSSProperties} />
              <Box className={styles.skeletonLine} style={{ '--sk-width': '48%' } as React.CSSProperties} />
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/* ── Empty state ── */

function EmptyState({
  onClearSearch,
  hasActiveFilter,
}: {
  onClearSearch: () => void;
  hasActiveFilter: boolean;
}) {
  return (
    <Box className={styles.emptyState}>
      <Box className={styles.emptyIcon} aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="6" width="32" height="36" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
          <rect x="14" y="13" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          <line x1="14" y1="30" x2="34" y2="30" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
          <line x1="14" y1="34" x2="28" y2="34" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
          <circle
            cx="36"
            cy="36"
            r="7"
            fill="var(--app-surface-2)"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.5"
          />
          <path d="M33 33l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
      </Box>
      <Text align="center" size="md" variant="muted">
        {c.emptyState}
      </Text>
      <Text align="center" size="sm" variant="faint">
        {c.emptyStateHint}
      </Text>
      {hasActiveFilter && (
        <Button size="sm" variant="ghost" onClick={onClearSearch}>
          {c.emptyStateClearSearch}
        </Button>
      )}
    </Box>
  );
}

/* ── Main view ── */

export function TemplatesPageView({
  search,
  debouncedSearch,
  activeCategory,
  sortKey,
  categoriesWithCounts,
  filteredTemplates,
  totalTemplateCount: _totalTemplateCount,
  loading,
  error,
  setSearch,
  clearSearch,
  setActiveCategory,
  setSortKey,
  openTemplate,
}: TemplatesPageController) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const hasActiveSearch = debouncedSearch.trim().length > 0;
  const hasActiveFilter = hasActiveSearch || activeCategory !== c.allCategory;

  // Ctrl+K / Cmd+K shortcut to focus search
  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKey);
    return () => { document.removeEventListener('keydown', handleGlobalKey); };
  }, [handleGlobalKey]);

  return (
    <Stack as="main" className={styles.page}>
      {/* ── Header ── */}
      <ScrollReveal variant="fadeDown" duration="base">
        <Stack as="header" className={styles.header} gap="u1-75">
          <Heading as="h1" size="hero" variant="primary" weight="heavy">{c.title}</Heading>
          <Box className={styles.subtitle}>
            <Text size="base" variant="muted">{c.subtitle}</Text>
          </Box>

          {/* Search + Sort row */}
          <Box className={styles.searchRow}>
            <Box className={styles.searchInputWrap}>
              <Box className={styles.searchIcon} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="7.5" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 11l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </Box>
              <Input
                ref={searchInputRef}
                type="search"
                size="lg"
                variant="filled"
                placeholder={`${c.searchPlaceholder} (${c.searchShortcut})`}
                value={search}
                onChange={(e) => { setSearch(e.target.value); }}
                className={styles.searchInput}
              />
              {search.length > 0 && (
                <Box
                  className={styles.searchClear}
                  role="button"
                  tabIndex={0}
                  aria-label="清除搜索"
                  onClick={clearSearch}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      clearSearch();
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </Box>
              )}
            </Box>
            <SortDropdown value={sortKey} onChange={setSortKey} />
          </Box>

          {/* Category tabs with counts */}
          <Inline className={styles.categoryTabs} gap="sm">
            {categoriesWithCounts.map((cat) => (
              <Button
                key={cat.value}
                type="button"
                onClick={() => { setActiveCategory(cat.value); }}
                size="sm"
                variant={cat.value === activeCategory ? 'tab-active' : 'tab'}
              >
                {cat.label}
                <Box as="span" className={styles.categoryCount}>
                  {cat.count}
                </Box>
              </Button>
            ))}
          </Inline>

          {/* Result count */}
          {!loading && (
            <Text size="xs" variant="faint">
              {c.resultCount(filteredTemplates.length)}
              {hasActiveFilter && (
                <> &middot; <Box as="span" className={styles.filterNote}>已筛选</Box></>
              )}
            </Text>
          )}
        </Stack>
      </ScrollReveal>

      {/* ── Content ── */}
      {loading && <TemplateSkeleton />}

      {error && (
        <Box className={styles.emptyState}>
          <Text align="center" size="md" variant="muted">{error}</Text>
        </Box>
      )}

      {!loading && !error && filteredTemplates.length === 0 && (
        <EmptyState onClearSearch={clearSearch} hasActiveFilter={hasActiveFilter} />
      )}

      {!loading && !error && filteredTemplates.length > 0 && (
        <StaggerChildren staggerDelay={60} maxDelay={600}>
          <Box className={styles.grid}>
            {filteredTemplates.map((theme) => (
              <Box
                key={theme.id}
                className="sa-child sa-fade-up sa-duration-base"
              >
                <ThemeCard
                  theme={theme}
                  onClick={() => { openTemplate(theme); }}
                  hoverLabel={c.previewHint}
                />
              </Box>
            ))}
          </Box>
        </StaggerChildren>
      )}
    </Stack>
  );
}
