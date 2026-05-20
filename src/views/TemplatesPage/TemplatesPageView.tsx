'use client';

import { templatesPageContent as c } from './TemplatesPage.content';
import styles from './TemplatesPage.module.css';
import type { TemplatesPageController } from './useTemplatesPageController';
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

export function TemplatesPageView({
  search,
  activeCategory,
  categories,
  filteredTemplates,
  loading,
  error,
  setSearch,
  setActiveCategory,
  openTemplate,
}: TemplatesPageController) {
  return (
    <Stack as="main" className={styles.page}>
      <Stack as="header" className={styles.header} gap="u1-75">
        <Heading as="h1" size="hero" variant="primary" weight="heavy">{c.title}</Heading>
        <Box className={styles.subtitle}>
          <Text size="base" variant="muted">{c.subtitle}</Text>
        </Box>

        <Box className={styles.searchRow}>
          <Input
            type="search"
            size="lg"
            variant="filled"
            placeholder={c.searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
          />
        </Box>

        <Inline className={styles.categoryTabs} gap="sm">
          {categories.map((category) => (
            <Button
              key={category}
              type="button"
              onClick={() => { setActiveCategory(category); }}
              size="sm"
              variant={category === activeCategory ? 'tab-active' : 'tab'}
            >
              {category}
            </Button>
          ))}
        </Inline>
      </Stack>

      {loading && (
        <Box className={styles.empty}>
          <Text align="center" size="md" variant="muted">加载中...</Text>
        </Box>
      )}
      {error && (
        <Box className={styles.empty}>
          <Text align="center" size="md" variant="muted">{error}</Text>
        </Box>
      )}
      {!loading && !error && filteredTemplates.length === 0 && (
        <Box className={styles.empty}>
          <Text align="center" size="md" variant="muted">{c.emptyState}</Text>
        </Box>
      )}
      {!loading && !error && filteredTemplates.length > 0 && (
        <Box className={styles.grid}>
          {filteredTemplates.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onClick={() => { openTemplate(theme); }}
              hoverLabel={c.previewHint}
            />
          ))}
        </Box>
      )}
    </Stack>
  );
}
