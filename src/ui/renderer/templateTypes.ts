export type TemplatePropLiteral = string | number | boolean | null;

export type TemplatePropValue =
  | TemplatePropLiteral
  | TemplatePropLiteral[]
  | { $bind: string }
  | Record<string, TemplatePropLiteral>;

export interface TemplateNode {
  alias: string;
  props?: Record<string, TemplatePropValue>;
  children?: TemplateNode[];
}

export interface ComponentTemplate {
  displayName?: string;
  root: TemplateNode;
}

export type ComponentTemplateMap = Record<string, ComponentTemplate>;
