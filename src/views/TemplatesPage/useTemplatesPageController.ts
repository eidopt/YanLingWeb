'use client';

import { templatesPageContent as c } from './TemplatesPage.content';
import { useAppServices } from 'hooks/useAppServices';
import { useTemplates } from 'hooks/useTemplates';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  type TemplatesPageSortKey,
  templatesPageStateActions,
  useTemplatesPageSnapshot,
} from 'state/templatesPageState';
import type { ThemeSpec } from 'types/theme.types';
import { showDialog } from 'ui/authenticating';
import { showThemePreviewModal } from 'ui/theme_preview_modal';

const ALL_CATEGORY = c.allCategory;

export type SortKey = TemplatesPageSortKey;

export interface CategoryMeta {
  value: string;
  label: string;
  count: number;
}

export interface TemplatesPageController {
  search: string;
  debouncedSearch: string;
  activeCategory: string;
  sortKey: SortKey;
  categories: string[];
  categoriesWithCounts: CategoryMeta[];
  filteredTemplates: ThemeSpec[];
  totalTemplateCount: number;
  matchedCount: number;
  loading: boolean;
  error: string | null;
  setSearch: (value: string) => void;
  clearSearch: () => void;
  setActiveCategory: (value: string) => void;
  setSortKey: (value: SortKey) => void;
  openTemplate: (theme: ThemeSpec) => void;
}

export function useTemplatesPageController(): TemplatesPageController {
  const router = useRouter();
  const { authService, templateService } = useAppServices();
  const { templates, loading, error } = useTemplates();
  const { search, debouncedSearch, activeCategory: storedActiveCategory, sortKey } = useTemplatesPageSnapshot();
  const activeCategory = storedActiveCategory || ALL_CATEGORY;

  const clearSearch = useCallback(() => {
    templatesPageStateActions.clearSearch();
  }, []);

  const categories = useMemo(() => getCategories(templates), [templates]);

  const filteredTemplates = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let results = templates.filter((theme) => {
      if (activeCategory !== ALL_CATEGORY && theme.category !== activeCategory) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        theme.name.toLowerCase().includes(q) ||
        theme.tagline.toLowerCase().includes(q) ||
        theme.description.toLowerCase().includes(q) ||
        theme.traits.some((trait) => trait.toLowerCase().includes(q)) ||
        theme.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });

    // Apply sorting
    if (sortKey === 'name-asc') {
      results = [...results].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    } else if (sortKey === 'newest') {
      results = [...results].sort((a, b) => {
        const aTime = a.createdAt ?? '';
        const bTime = b.createdAt ?? '';
        // Descending by date string (ISO 8601 works lexicographically)
        if (aTime > bTime) {
          return -1;
        }
        if (aTime < bTime) {
          return 1;
        }
        return 0;
      });
    }

    return results;
  }, [templates, debouncedSearch, activeCategory, sortKey]);

  const categoriesWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const theme of templates) {
      const cat = theme.category || ALL_CATEGORY;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return categories.map((cat) => ({
      value: cat,
      label: getCategoryLabel(templates, cat),
      count: cat === ALL_CATEGORY ? templates.length : (counts.get(cat) ?? 0),
    }));
  }, [templates, categories]);

  const openTemplate = (theme: ThemeSpec) => {
    showThemePreviewModal(theme, () => {
      if (!authService.isLoggedIn()) {
        showDialog((redirect) => {
          if (redirect) {
            router.push(redirect);
          }
        });
        return;
      }

      void templateService.duplicate(theme.id).then((copy) => {
        router.push(`/editor?templateId=${encodeURIComponent(copy.id)}`);
      });
    });
  };

  return {
    search,
    debouncedSearch,
    activeCategory,
    sortKey,
    categories,
    categoriesWithCounts,
    filteredTemplates,
    totalTemplateCount: templates.length,
    matchedCount: filteredTemplates.length,
    loading,
    error,
    setSearch: templatesPageStateActions.setSearch,
    clearSearch,
    setActiveCategory: templatesPageStateActions.setActiveCategory,
    setSortKey: templatesPageStateActions.setSortKey,
    openTemplate,
  };
}

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

function getCategoryLabel(themes: ThemeSpec[], category: string): string {
  if (category === ALL_CATEGORY) {
    return ALL_CATEGORY;
  }
  return themes.find((theme) => theme.category === category)?.categoryLabel ?? category;
}
