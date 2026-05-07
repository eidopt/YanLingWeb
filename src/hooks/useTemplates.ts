'use client';

import { useAppServices } from 'hooks/useAppServices';
import { useEffect, useState } from 'react';
import type { ThemeSpec } from 'types/theme.types';

export interface UseTemplatesResult {
  templates: ThemeSpec[];
  loading: boolean;
  error: string | null;
}

export function useTemplates(): UseTemplatesResult {
  const { templateService } = useAppServices();
  const [templates, setTemplates] = useState<ThemeSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    templateService.fetchAll()
      .then(setTemplates)
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Failed to load templates',
        );
      })
      .finally(() => { setLoading(false); });
  }, [templateService]);

  return { templates, loading, error };
}
