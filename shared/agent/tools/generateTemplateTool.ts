/* eslint-disable max-len */
import type { ProviderTool } from '../contracts/provider';

export interface TemplateToolInput {
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  categoryLabel?: string;
  categoryLabels?: Record<string, string>;
  displayCategory?: string;
  displayCategoryLabel?: string;
  displayCategoryLabels?: Record<string, string>;
  platformCategories?: string[];
  platformCategoryLabels?: Record<string, string>;
  functionalCategories?: string[];
  functionalCategoryLabels?: Record<string, string>;
  accent: string;
  traits: string[];
  cssVars: Record<string, string>;
  cssAnimations?: Record<string, string>;
  visualAssets?: unknown[];
  componentTemplates: Record<string, unknown>;
  layoutDocument: Record<string, unknown>;
}

export interface TemplateToolResult {
  success: boolean;
  templateId?: string;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

export function isTemplateToolInput(value: unknown): value is TemplateToolInput {
  return (
    isRecord(value) &&
    typeof value.templateId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.tagline === 'string' &&
    typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    typeof value.accent === 'string' &&
    isStringArray(value.traits) &&
    isStringRecord(value.cssVars) &&
    (value.cssAnimations === undefined || isStringRecord(value.cssAnimations)) &&
    (value.visualAssets === undefined || Array.isArray(value.visualAssets)) &&
    isRecord(value.componentTemplates) &&
    isRecord(value.layoutDocument)
  );
}

export const GENERATE_TEMPLATE_TOOL = {
  name: 'generate_template',
  description: `Generate a UI template and save it to the database.

The template uses a component tree system with 55 core components.

## Layout containers (may have children)
- core.screen: page root (props: title, statusTime, headerActionLabel,
  surface: mini-program|mobile-app|web, chrome: wechat|app|none)
- core.panel: styled card (props: gap, tone: default|accent|promo|warm|soft|member|highlight)
- core.stack: vertical container (props: gap, alignItems)
- core.row: horizontal container (props: gap, wrap, justify, align, tone)
- core.grid: grid container (props: gap, columns)
- core.html: raw HTML wrapper (props: tag, style)
- core.navbar: top navigation bar (props: title, subtitle, leftArrow, fixed, transparent)
- core.list: list container (props: bordered, split)
- core.list-item: list item (props: title, description, note, arrow, thumb)
- core.dialog: modal dialog (props: title, visible, confirmText, cancelText)
- core.drawer: slide-out drawer (props: title, visible, placement: left|right|top|bottom)
- core.collapse: accordion panel (props: title, expanded)
- core.sidebar: side navigation (props: collapsed, width)
- core.form: form container (props: labelWidth, labelAlign: left|right|top)
- core.toolbar: action toolbar (props: title, fixed)
- core.splitter: split pane (props: direction: horizontal|vertical, min, max)
- core.timeline: event timeline (props: direction: vertical|horizontal)
- core.tree: hierarchical tree (props: data, expandAll)

## Leaf components (no children)
- core.text: text (props: text, variant: display|heading|subheading|body|caption|price|overline|eyebrow|title|subtitle)
- core.button: button (props: label, variant: primary|secondary|link|pill, active, disabled, icon)
- core.image: image (props: assetId, src, alt, title, iconColor, objectFit: cover|contain|fill)
- core.divider: horizontal rule
- core.spacer: blank space (props: size)
- core.search: search bar (props: placeholder, value)
- core.tabs: tab bar (props: tabs, activeTab). Use interactions.onTabClick for page navigation.
- core.tabbar: bottom tab bar (props: items, active, icons)
- core.breadcrumb: breadcrumb trail (props: items, separator)
- core.pagination: page navigator (props: current, total, pageSize)
- core.tag: status badge (props: label, tone: neutral|success|warning|info|hot|new|deal|member)
- core.badge: notification badge (props: count, dot, max, text, tone)
- core.progress: progress bar (props: value, max, tone: neutral|accent|success|warning|info)
- core.notice: notification banner (props: text, tone: info|warning|error|success|neutral)
- core.alert: inline alert (props: text, type: info|success|warning|error, closable)
- core.toast: toast message (props: message, type: info|success|warning|error, duration)
- core.loading: loading indicator (props: size, text, type: spinner|skeleton)
- core.empty: empty state (props: text, image, actionLabel)
- core.skeleton: loading skeleton (props: rows, animated)
- core.statistic: stat display (props: title, value, suffix, prefix, tone, trend: up|down|neutral)
- core.avatar: user avatar (props: src, text, size: small|medium|large, shape: circle|square)
- core.carousel: image carousel (props: images, autoplay, interval)
- core.input: text field (props: placeholder, label, type, value, disabled)
- core.select: dropdown (props: label, placeholder, options, value, multiple)
- core.checkbox: checkbox (props: label, checked, disabled)
- core.radio: radio button (props: label, checked, disabled, group)
- core.switch: toggle (props: checked, disabled, label)
- core.rate: star rating (props: value, count, size, disabled)
- core.slider: slider input (props: value, min, max, step, range, startValue, endValue). When range is true, set startValue/endValue for a two-thumb selected interval.
- core.datepicker: date input (props: value, format, placeholder)
- core.timepicker: time input (props: value, format, placeholder)
- core.upload: file upload (props: accept, multiple, maxCount, actionLabel)
- core.video: video player (props: src, poster, autoplay, controls)
- core.audio: audio player (props: src, autoplay, controls)
- core.tooltip: hover tooltip (props: text, placement: top|bottom|left|right)
- core.table: data table (props: columns, data, bordered, stripe)
- core.widget: safe third-party ESM widget (props: library, renderer, data)
  - Use only when the user request is better solved by a package available through esm.sh and a supported renderer.
  - library: dependency name declared in layoutDocument.dependencies.
  - allowed libraries/renderers:
    - echarts + renderer "echarts": data is an ECharts option object or { option: {...} }.
    - chart.js or chartjs + renderer "chartjs": data is a Chart.js config object or { config: {...} }; use dependency URL https://esm.sh/chart.js/auto.
    - lottie-web or lottie + renderer "lottie": data must include { animationData: {...}, loop?, autoplay? }.
    - mermaid + renderer "mermaid": data must include { definition: "graph TD; ..." } or { diagram: "..." }.
  - Never generate custom JavaScript, code strings, script URLs, inline scripts, or arbitrary module bodies.

layoutDocument.style — OPTIONAL style manifest:
  style: { cssVars: { "--accent": "#FF6B35", "--surface": "..." } }
  The service also mirrors the top-level cssVars into layoutDocument.style.cssVars
  before saving, so exported projects can compile CSS from the template JSON.

layoutDocument.dependencies — OPTIONAL array of external libraries:
  dependencies: [{ name: "echarts", url: "https://esm.sh/echarts" }]
  Each dep is loaded at runtime via dynamic import(). Use approved HTTPS
  esm.sh URLs from the allowlist only: echarts, chart.js, lottie-web,
  mermaid. Non-esm.sh URLs, non-whitelisted packages, and custom scripts
  are rejected.

layoutDocument.widgetPolicy — OPTIONAL fine-grained widget permission policy:
  widgetPolicy: {
    enabled: true,
    allowedLibraries: ["echarts"],
    allowedRenderers: ["echarts"],
    allowedCapabilities: ["chart"]
  }
  If omitted, approved widget libraries/renderers are allowed. Use the narrowest
  allowedLibraries, allowedRenderers, and allowedCapabilities needed by the template.

LayoutDocument node:
{ id, alias, layout: { mode: "flow", order, width, minHeight }, props, children }
For websites, set each page root props.surface="web" and props.chrome="none".
For phone apps, use props.surface="mobile-app" and props.chrome="app".
For WeChat mini programs, use props.surface="mini-program" and props.chrome="wechat".

ComponentTemplate: { displayName, root: TemplateNode }
TemplateNode: { alias, props (with optional $bind bindings), children }
Use $bind for dynamic props: { $bind: "propName" }

Category rules:
- category is the fine-grained functional key and must equal functionalCategories[0].
- displayCategory is the coarse marketplace group. Choose one of:
  commerce, service, content, education, health, social, finance, marketing,
  utility, dashboard, profile, other. Provide displayCategoryLabel when the
  key is not already registered.
- platformCategories identifies target runtimes: mini-program, mobile-app,
  tablet-app, web. It must match the screen surface/chrome props.

Generated-template quality rules:
- User-facing copy, page names, titles, labels, placeholders, and mock data must
  be coherent Simplified Chinese unless the user explicitly asks for another
  language.
- Compose generic UI with core.* aliases. Use componentTemplates for reusable
  business modules when they improve visual identity, consistency, or editing
  ergonomics; each custom alias must be declared in layoutDocument.components
  and expand only to safe core.* template nodes.
- Do not express a template's identity only by changing the primary/accent
  color. Use domain-specific componentTemplates and semantic cssVars for hero,
  cards, list items, KPI modules, timelines, coupons, media chips, checkout
  actions, or profile headers. Component-level tokens may include values such
  as --hero-bg, --metric-card-bg, --coupon-bg, --timeline-line,
  --editorial-rule, --map-panel-bg, --media-chip-bg, --radius-card,
  --shadow-card.
- Avoid repeating the same panel+text+button structure across pages. Mix the
  core components that fit the scenario: notice, divider, statistic, progress,
  avatar, carousel, input/select, list/list-item, timeline, table, chart widget,
  upload, rate, switch, slider, empty/skeleton/loading states.
- When a template needs images, include visualAssets with id/nodeId/pageId/role,
  prompt, alt, status, provider, and optional url. If image generation is not
  available, use provider "curated" with a /template-assets/... URL or provider
  "placeholder" with placeholder.iconColor. core.image should reference the
  asset with props.assetId and may omit src until the asset pipeline resolves it.
- core.image props.src must be a valid HTTPS URL or /template-assets/... path.
  If no reliable image URL is available, omit src and use alt/title/iconColor
  so the renderer shows the built-in placeholder.
- Every editable layoutDocument.components[].props[] item must include a
  Chinese label field, e.g. { "name": "title", "type": "string",
  "label": "标题" }, so the property inspector is localized.
- Keep each page layout compact and logically ordered: header, primary content,
  supporting sections, then navigation/actions. Avoid decorative filler nodes
  that do not support the template's scenario.`,
  parameters: {
    type: 'object',
    required: [
      'templateId',
      'name',
      'tagline',
      'description',
      'category',
      'displayCategory',
      'accent',
      'traits',
      'cssVars',
      'componentTemplates',
      'layoutDocument',
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
      displayCategory: {
        type: 'string',
        description:
          'Coarse frontend display category: commerce|service|content|education|health|social|finance|marketing|utility|dashboard|profile|other.',
      },
      displayCategoryLabel: {
        type: 'string',
        description: 'Chinese display label for displayCategory.',
      },
      displayCategoryLabels: {
        type: 'object',
        description: 'Optional map of English display category key to Chinese display label.',
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
        description:
          'CSS custom properties map. Include brand tokens plus semantic/component-level tokens, not only one accent color.',
      },
      cssAnimations: {
        type: 'object',
        description: 'Optional CSS keyframe animations map',
      },
      visualAssets: {
        type: 'array',
        description:
          'Optional image generation/fallback manifest. Each item should include id, nodeId, pageId, role, prompt, alt, status, provider, and optional url or placeholder.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            nodeId: { type: 'string' },
            pageId: { type: 'string' },
            role: { type: 'string' },
            prompt: { type: 'string' },
            alt: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'generated', 'fallback', 'failed'] },
            provider: { type: 'string', enum: ['ai-image', 'curated', 'placeholder', 'manual'] },
            url: { type: 'string' },
            fallbackReason: { type: 'string' },
            placeholder: { type: 'object' },
          },
        },
      },
      componentTemplates: {
        type: 'object',
        description:
          'Reusable custom aliases for domain-specific UI modules. Prefer a few expressive modules over color-only generic panels.',
      },
      layoutDocument: {
        type: 'object',
        description: 'Multi-page layout document with pages array and optional widgetPolicy allowlist',
      },
    },
  },
} as const satisfies ProviderTool;
