import { BadRequestException } from '@nestjs/common';

const DISPLAY_CATEGORIES = new Set([
  'commerce',
  'service',
  'content',
  'education',
  'health',
  'social',
  'finance',
  'marketing',
  'utility',
  'dashboard',
  'profile',
  'other',
  'general',
]);

export function hasCjkText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

export function isTemplateCategoryKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value) && !hasCjkText(value);
}

export function assertTemplateCategoryKey(value: string, fieldName: string): void {
  if (!isTemplateCategoryKey(value)) {
    throw new BadRequestException(`${fieldName} must be an English slug key.`);
  }
}

export function resolveDisplayCategoryFromKey(key: string | null | undefined): string {
  const normalized = typeof key === 'string' ? key.trim().toLowerCase() : '';
  if (!normalized) {
    return 'general';
  }
  if (DISPLAY_CATEGORIES.has(normalized)) {
    return normalized;
  }
  const prefix = normalized.split('-')[0];
  if (prefix === 'edu') {
    return 'education';
  }
  if (DISPLAY_CATEGORIES.has(prefix)) {
    return prefix;
  }
  if (normalized.includes('booking') || normalized.includes('food-ordering')) {
    return 'service';
  }
  if (normalized.includes('reader') || normalized.includes('news')) {
    return 'content';
  }
  if (normalized.includes('event')) {
    return 'marketing';
  }
  if (normalized.includes('wellness') || normalized.includes('fitness')) {
    return 'health';
  }
  if (normalized.includes('tools')) {
    return 'utility';
  }
  if (normalized.includes('center')) {
    return 'profile';
  }
  return 'other';
}

export function resolveTemplateCategoryKey(
  category: string | null | undefined,
  functionalCategories: readonly string[] | null | undefined,
): string {
  const current = typeof category === 'string' ? category.trim() : '';
  const primaryFunctionalCategory = functionalCategories?.[0]?.trim() ?? '';
  if (hasCjkText(current) && primaryFunctionalCategory && !hasCjkText(primaryFunctionalCategory)) {
    return primaryFunctionalCategory;
  }
  return current;
}

export function resolveTemplateDisplayCategoryKey(
  displayCategory: string | null | undefined,
  category: string | null | undefined,
  functionalCategories: readonly string[] | null | undefined,
): string {
  const current = typeof displayCategory === 'string' ? displayCategory.trim() : '';
  const primaryFunctionalCategory = functionalCategories?.[0]?.trim() ?? '';
  if (current && !hasCjkText(current)) {
    if (current !== category && current !== primaryFunctionalCategory) {
      return current;
    }
  }
  const fallbackCategory =
    primaryFunctionalCategory.length > 0
      ? primaryFunctionalCategory
      : typeof category === 'string' && category.length > 0
        ? category
        : current.length > 0
          ? current
          : 'general';
  return resolveDisplayCategoryFromKey(fallbackCategory);
}

export function buildTemplateSearchText(template: {
  name?: string;
  tagline?: string;
  description?: string;
  tags?: string[];
  category?: string;
  displayCategory?: string;
  functionalCategories?: string[];
  traits?: string[];
}): string {
  const parts = [
    template.name ?? '',
    template.tagline ?? '',
    template.description ?? '',
    template.category ?? '',
    template.displayCategory ?? '',
    ...(template.tags ?? []),
    ...(template.functionalCategories ?? []),
    ...(template.traits ?? []),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function createUserTemplateId(sourceTemplateId: string, ownerUserId: string): string {
  const ownerPrefix = ownerUserId.replace(/-/g, '').slice(0, 8);
  return `${sourceTemplateId}-copy-${ownerPrefix}-${Date.now().toString(36)}`;
}
