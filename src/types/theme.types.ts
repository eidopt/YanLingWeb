import type { ThemeLayoutDocument } from '../ui/layout/types';
import type { ThemeRuntime } from '../ui/renderer';

export interface ThemeSpec {
  id: string;
  recordId?: string;
  ownerUserId?: string | null;
  sourceTemplateId?: string | null;
  isPublic?: boolean;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  category: string;
  traits: string[];
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  layoutDocument: ThemeLayoutDocument;
  runtime: ThemeRuntime;
}
