'use client';

import { templatesPageContent as c } from './TemplatesPage.content';
import styles from './TemplatesPage.module.css';
import type { SortKey, TemplatesPageController } from './useTemplatesPageController';
import { useCallback, useEffect, useRef } from 'react';
import { Box, Button, Dropdown, Heading, Inline, Input, Stack, Text } from 'ui/base';
import { CloseIcon, SearchIcon } from 'ui/icons';
import { ScrollReveal, StaggerChildren } from 'ui/pages';
import { ThemeCard } from 'ui/theme_card';

/* ── Sort dropdown ── */
function SortDropdown({ value, onChange }: { value: SortKey; onChange: (key: SortKey) => void }) {
  return (
    <Box className={styles.sortDropdown}>
      <Dropdown
        value={value}
        onValueChange={(v) => {
          onChange(v as SortKey);
        }}
        aria-label={c.sortLabel}
        size="md"
        variant="default"
        options={Object.entries(c.sortOptions).map(([key, label]) => ({
          value: key,
          label: `${c.sortLabel}: ${label}`,
        }))}
      />
    </Box>
  );
}

/* ── Skeleton loader ── */
function TemplateSkeleton() {
  return (
    <Box className={styles.skeletonGrid} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
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
function EmptyState({ onClearSearch, hasActiveFilter }: { onClearSearch: () => void; hasActiveFilter: boolean }) {
  return (
    <Box className={styles.emptyState}>
      <Box className={styles.emptyIcon} aria-hidden="true">
        <SearchIcon width={28} height={28} />
      </Box>
      <Text align="center" size="md" variant="primary" weight="bold">
        {c.emptyState}
      </Text>
      <Text align="center" size="sm" variant="muted">
        {c.emptyStateHint}
      </Text>
      {hasActiveFilter && (
        <Button size="sm" variant="secondary" onClick={onClearSearch}>
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

  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKey);
    return () => {
      document.removeEventListener('keydown', handleGlobalKey);
    };
  }, [handleGlobalKey]);

  return (
    <Stack as="main" className={styles.page}>
      <ScrollReveal variant="fadeDown" duration="fast">
        <Stack as="header" className={styles.header} gap="md">
          <Box className={styles.headerTop}>
            <Stack gap="xs">
              <Heading as="h1" size="hero" variant="primary" weight="heavy">
                {c.title}
              </Heading>
              <Box className={styles.subtitle}>
                <Text size="sm" variant="muted">
                  {c.subtitle}
                </Text>
              </Box>
            </Stack>

            <Box className={styles.searchRow}>
              <Box className={styles.searchInputWrap}>
                <Input
                  ref={searchInputRef}
                  type="search"
                  size="md"
                  variant="default"
                  leadingIcon={<SearchIcon width={16} height={16} />}
                  trailingIcon={
                    search.length > 0 ? (
                      <button
                        type="button"
                        className={styles.searchClear}
                        aria-label="清除搜索"
                        onClick={clearSearch}
                      >
                        <CloseIcon width={14} height={14} />
                      </button>
                    ) : undefined
                  }
                  placeholder={`${c.searchPlaceholder} (${c.searchShortcut})`}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                />
              </Box>
              <SortDropdown value={sortKey} onChange={setSortKey} />
            </Box>
          </Box>

          <Box className={styles.filterToolbar}>
            <Inline className={styles.categoryTabs} gap="xs">
              {categoriesWithCounts.map((cat) => (
                <Button
                  key={cat.value}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.value);
                  }}
                  size="xs"
                  variant={cat.value === activeCategory ? 'tab-active' : 'tab'}
                >
                  {cat.label}
                  <Box as="span" className={styles.categoryCount}>
                    {cat.count}
                  </Box>
                </Button>
              ))}
            </Inline>

            {!loading && (
              <Text size="xs" variant="muted">
                {c.resultCount(filteredTemplates.length)}
                {hasActiveFilter && (
                  <>
                    {' '}
                    ·{' '}
                    <Box as="span" className={styles.filterNote}>
                      已筛选
                    </Box>
                  </>
                )}
              </Text>
            )}
          </Box>
        </Stack>
      </ScrollReveal>

      {loading && <TemplateSkeleton />}

      {error && (
        <Box className={styles.emptyState}>
          <Text align="center" size="md" variant="muted">
            {error}
          </Text>
        </Box>
      )}

      {!loading && !error && filteredTemplates.length === 0 && (
        <EmptyState onClearSearch={clearSearch} hasActiveFilter={hasActiveFilter} />
      )}

      {!loading && !error && filteredTemplates.length > 0 && (
        <Box className={styles.grid}>
          <StaggerChildren staggerDelay={30} maxDelay={300} duration="fast">
            {filteredTemplates.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                hoverLabel="预览模板"
                onClick={() => {
                  openTemplate(theme);
                }}
              />
            ))}
          </StaggerChildren>
        </Box>
      )}
    </Stack>
  );
}
