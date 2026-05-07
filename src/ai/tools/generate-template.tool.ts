export interface TemplateToolInput {
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  accent: string;
  traits: string[];
  cssVars: Record<string, string>;
  cssAnimations?: Record<string, string>;
  componentTemplates: Record<string, unknown>;
  layoutDocument: Record<string, unknown>;
}

export interface TemplateToolResult {
  success: boolean;
  templateId?: string;
  error?: string;
}

export const GENERATE_TEMPLATE_TOOL = {
  name: 'generate_template',
  description: `Generate a UI template and save it to the database.

The template uses a component tree system. Core layout components:
- core.screen: page root (props: title, statusTime, headerActionLabel)
- core.stack: vertical container (props: gap, alignItems)
- core.row: horizontal container (props: gap, wrap, justify, align, tone)
- core.grid: grid container (props: gap, columns)
- core.panel: styled card
  (props: gap, tone: default|accent|promo|warm|soft|member|highlight)
- core.text: text
  (props: text, variant: display|heading|subheading|body|caption|price|
   overline|eyebrow|title|subtitle)
- core.button: button (props: label, variant: primary|secondary|link, disabled)
- core.image: image placeholder
- core.tag: status badge
  (props: label, tone: neutral|success|warning|info|hot|new|deal|member)
- core.divider: horizontal rule
- core.spacer: blank space (props: size)
- core.input: text field (props: placeholder, label)
- core.tabs: tab bar (props: activeTab)

LayoutDocument node:
{ id, alias, layout: { mode: "flow", order, width, minHeight }, props, children }

ComponentTemplate: { displayName, root: TemplateNode }
TemplateNode: { alias, props (with optional $bind bindings), children }
Use $bind for dynamic props: { $bind: "propName" }`,
  parameters: {
    type: 'object',
    required: [
      'templateId', 'name', 'tagline', 'description',
      'category', 'accent', 'traits', 'cssVars',
      'componentTemplates', 'layoutDocument',
    ],
    properties: {
      templateId: {
        type: 'string',
        description: 'Unique semantic identifier (e.g. "fitness-tracker")',
      },
      name: { type: 'string', description: 'Display name of the template' },
      tagline: { type: 'string', description: 'Short tagline (1 sentence)' },
      description: { type: 'string', description: 'Detailed description' },
      category: {
        type: 'string',
        description: 'Category: general|commerce|service|health|finance|social',
      },
      accent: {
        type: 'string',
        description: 'Primary brand color in hex (e.g. "#FF6B35")',
      },
      traits: {
        type: 'array',
        items: { type: 'string' },
        description: 'Characteristic tags (e.g. ["modern", "clean"])',
      },
      cssVars: {
        type: 'object',
        description: 'CSS custom properties map (e.g. {"--color-accent": "#FF6B35"})',
      },
      cssAnimations: {
        type: 'object',
        description: 'Optional CSS keyframe animations map',
      },
      componentTemplates: {
        type: 'object',
        description: 'Map of component alias → ComponentTemplate definition',
      },
      layoutDocument: {
        type: 'object',
        description: 'Multi-page layout document with pages array',
      },
    },
  },
} as const;
