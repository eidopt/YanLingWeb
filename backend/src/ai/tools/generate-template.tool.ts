export interface TemplateToolInput {
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  categoryLabel?: string;
  categoryLabels?: Record<string, string>;
  platformCategories?: string[];
  platformCategoryLabels?: Record<string, string>;
  functionalCategories?: string[];
  functionalCategoryLabels?: Record<string, string>;
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
- core.button: button (props: label, variant: primary|secondary|link|pill, active, disabled, icon)
- core.image: image or placeholder (props: src, alt, title, iconColor, objectFit)
- core.tag: status badge
  (props: label, tone: neutral|success|warning|info|hot|new|deal|member)
- core.progress: progress bar
  (props: value, max, tone: neutral|accent|success|warning|info)
- core.divider: horizontal rule
- core.spacer: blank space (props: size)
- core.input: text field (props: placeholder, label, type, value, disabled)
- core.tabs: tab bar (props: activeTab)
- core.search: search bar (props: placeholder, value)
- core.notice: notification banner (props: text, tone)
- core.html: raw HTML wrapper (props: tag, style). Use only for markup that
  can't be expressed with other core.* aliases.
- core.widget: safe third-party ESM widget
  (props: library, renderer, data)
  - Use only when the user request is better solved by a package available
    through esm.sh and a supported renderer.
  - library: dependency name declared in dependencies.
  - allowed libraries/renderers:
    - echarts + renderer "echarts": data is an ECharts option object
      or { option: {...} }
    - chart.js or chartjs + renderer "chartjs": data is a Chart.js config
      object or { config: {...} }; use dependency URL https://esm.sh/chart.js/auto
    - lottie-web or lottie + renderer "lottie": data must include
      { animationData: {...}, loop?, autoplay? }
    - mermaid + renderer "mermaid": data must include
      { definition: "graph TD; ..." } or { diagram: "..." }
  - Never generate custom JavaScript, code strings, script URLs, inline
    scripts, or arbitrary module bodies.

LayoutDocument node:
{ id, alias, layout: { mode: "flow", order, width, minHeight }, props, children }
Optional layoutDocument.style:
{ cssVars: { "--accent": "#FF6B35", "--surface": "..." } }
The service mirrors top-level cssVars into layoutDocument.style.cssVars before
saving, so exported projects can compile CSS from the template JSON.
Optional layoutDocument.dependencies:
  dependencies: [{ name: "echarts", url: "https://esm.sh/echarts" }]
Use approved HTTPS esm.sh URLs from the allowlist only: echarts, chart.js,
lottie-web, mermaid. Non-whitelisted packages and custom scripts are rejected.

ComponentTemplate: { displayName, root: TemplateNode }
TemplateNode: { alias, props (with optional $bind bindings), children }
Use $bind for dynamic props: { $bind: "propName" }

Generated-template quality rules:
- User-facing copy, page names, titles, labels, placeholders, and mock data must
  be coherent Simplified Chinese unless the user explicitly asks for another
  language.
- Compose with core.* aliases by default. Leave componentTemplates as {} unless
  the user explicitly asks for a reusable custom alias and it can be fully
  represented by core.* nodes.
- core.image props.src must be a valid HTTPS URL. If no reliable image URL is
  available, omit src and use alt/title/iconColor so the renderer shows the
  built-in placeholder.
- Every editable layoutDocument.components[].props[] item must include a
  Chinese label field, e.g. { "name": "title", "type": "string",
  "label": "标题" }, so the property inspector is localized.
- Keep each page layout compact and logically ordered: header, primary content,
  supporting sections, then navigation/actions. Avoid decorative filler nodes
  that do not support the template's scenario.`,
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
        description: [
          'Stable English category key/slug, e.g.',
          'general|commerce|service|health|finance|social|profile.',
          'Never use Chinese here.',
        ].join(' '),
      },
      categoryLabel: {
        type: 'string',
        description: 'Chinese display label for category, e.g. "电商购物". Required when creating a new category key.',
      },
      categoryLabels: {
        type: 'object',
        description: 'Optional map of English category key to Chinese display label.',
      },
      platformCategories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Stable English platform keys, e.g. ["mini-program", "mobile-app", "web"].',
      },
      platformCategoryLabels: {
        type: 'object',
        description: 'Optional map of English platform category key to Chinese display label.',
      },
      functionalCategories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Stable English functional category keys. The first item should match category.',
      },
      functionalCategoryLabels: {
        type: 'object',
        description: 'Optional map of English functional category key to Chinese display label.',
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
        description: 'Use {} by default. Custom aliases are only allowed when explicitly requested.',
      },
      layoutDocument: {
        type: 'object',
        description: 'Multi-page layout document with pages array',
      },
    },
  },
} as const;
