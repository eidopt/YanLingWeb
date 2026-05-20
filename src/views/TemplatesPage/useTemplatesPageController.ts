'use client';

import { templatesPageContent as c } from './TemplatesPage.content';
import { useAppServices } from 'hooks/useAppServices';
import { useTemplates } from 'hooks/useTemplates';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ThemeSpec } from 'types/theme.types';
import { showDialog } from 'ui/authenticating';
import { showThemePreviewModal } from 'ui/theme_preview_modal';

const ALL_CATEGORY = c.allCategory;

export interface TemplatesPageController {
  search: string;
  activeCategory: string;
  categories: string[];
  filteredTemplates: ThemeSpec[];
  loading: boolean;
  error: string | null;
  setSearch: (value: string) => void;
  setActiveCategory: (value: string) => void;
  openTemplate: (theme: ThemeSpec) => void;
}

export function useTemplatesPageController(): TemplatesPageController {
  const router = useRouter();
  const { authService, templateService } = useAppServices();
  const { templates, loading, error } = useTemplates();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);
  const categories = useMemo(() => getCategories(templates), [templates]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((theme) => {
      if (
        activeCategory !== ALL_CATEGORY
        && theme.category !== activeCategory
      ) {
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
  }, [templates, search, activeCategory]);

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
    activeCategory,
    categories,
    filteredTemplates,
    loading,
    error,
    setSearch,
    setActiveCategory,
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
