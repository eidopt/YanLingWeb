import type { ThemeLayoutDocument } from '../layout/types';
import type { ThemeRuntime } from '../renderer';

export interface LayoutBuilderTheme {
  id: string;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  platformCategories?: string[];
  layoutDocument: ThemeLayoutDocument;
  runtime: ThemeRuntime;
}

export interface BuilderCanvas {
  id: string;
  name: string;
  defaultName: string;
  themeId: string;
  document: ThemeLayoutDocument;
}
