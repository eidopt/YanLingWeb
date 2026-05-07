import type { ThemeLayoutDocument } from '../ui/layout/types';
import type { ThemeRuntime } from '../ui/renderer';

export interface ThemeSpec {
  id: string;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  category: string;
  traits: string[];
  layoutDocument: ThemeLayoutDocument;
  runtime: ThemeRuntime;
}
