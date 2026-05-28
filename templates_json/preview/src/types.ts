export interface TemplateEntry {
  id: string;
  file: string;
  category: string;
  subcategory: string;
  variant: string;
  platform: string;
  platformCategories?: string[];
  categoryLabel?: string;
  themeName: string;
}

export interface TemplateCategory {
  name: string;
  label?: string;
  count: number;
  items: TemplateEntry[];
}

export interface TemplateIndex {
  total: number;
  all: TemplateEntry[];
  categories: TemplateCategory[];
  extraCategories: TemplateCategory[];
}
