'use client';

import { templatesPageContent as c } from './TemplatesPage.content';
import styles from './TemplatesPage.module.css';
import { cx } from 'base/classname';
import { useAppServices } from 'hooks/useAppServices';
import { useTemplates } from 'hooks/useTemplates';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ThemeSpec } from 'types/theme.types';
import { showDialog } from 'ui/authenticating';
import { ThemeCard } from 'ui/theme_card';
import { showThemePreviewModal } from 'ui/theme_preview_modal';

const ALL_CATEGORY = c.allCategory;

function getCategories(themes: ThemeSpec[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [ALL_CATEGORY];
  for (const theme of themes) {
    if (theme.category && !seen.has(theme.category)) {
      seen.add(theme.category);
      result.push(theme.category);
    }
  }
  return result;
}

export function TemplatesPage() {
  const router = useRouter();
  const { authService, templateService } = useAppServices();
  const { templates, loading, error } = useTemplates();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);
  const categories = useMemo(() => getCategories(templates), [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((theme) => {
      if (
        activeCategory !== ALL_CATEGORY
        && theme.category !== activeCategory
      ) {
        return false;
      }
      if (!q) { return true; }
      return (
        theme.name.toLowerCase().includes(q) ||
        theme.tagline.toLowerCase().includes(q) ||
        theme.description.toLowerCase().includes(q) ||
        theme.traits.some((t) => t.toLowerCase().includes(q)) ||
        theme.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [templates, search, activeCategory]);

  function handleOpen(theme: ThemeSpec) {
    showThemePreviewModal(theme, () => {
      if (!authService.isLoggedIn()) {
        showDialog((redirect) => {
          if (redirect) { router.push(redirect); }
        });
        return;
      }

      void templateService.duplicate(theme.id).then((copy) => {
        router.push(`/editor?templateId=${encodeURIComponent(copy.id)}`);
      });
    });
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{c.title}</h1>
        <p className={styles.subtitle}>{c.subtitle}</p>

        <div className={styles.searchRow}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder={c.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.categoryTabs}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={cx(
                styles.categoryTab,
                cat === activeCategory && styles.categoryTabActive,
              )}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {loading && <p className={styles.empty}>加载中…</p>}
      {error && <p className={styles.empty}>{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className={styles.empty}>{c.emptyState}</p>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className={styles.grid}>
          {filtered.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onClick={() => handleOpen(theme)}
              hoverLabel={c.previewHint}
            />
          ))}
        </div>
      )}
    </main>
  );
}
