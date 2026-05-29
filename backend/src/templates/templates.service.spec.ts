import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import { validateThemeLayoutDocument } from '@shared/agent/contracts/validation';
import { CORE_COMPONENTS } from '@shared/agent/runtime';

// ─── Template Validation Tests ────────────────────────────────────

describe('Template Validation', () => {
  const validDocument: ThemeLayoutDocument = {
    version: 1,
    themeId: 'test-template',
    themeName: '测试模板',
    pageName: '首页',
    description: '用于测试的模板',
    components: CORE_COMPONENTS,
    defaultPageId: 'home',
    pages: [
      {
        id: 'home',
        name: '首页',
        layout: {
          id: 'home-screen',
          alias: 'core.screen',
          layout: { mode: 'flow', width: '100%' },
          props: { title: '首页' },
          children: [
            {
              id: 'home-title',
              alias: 'core.text',
              layout: { mode: 'flow', order: 1, width: '100%' },
              props: { text: '欢迎', variant: 'heading' },
            },
            {
              id: 'home-button',
              alias: 'core.button',
              layout: { mode: 'flow', order: 2 },
              props: { label: '开始', variant: 'primary' },
            },
          ],
        },
      },
    ],
    layout: {
      id: 'home-screen',
      alias: 'core.screen',
      layout: { mode: 'flow', width: '100%' },
      props: { title: '首页' },
      children: [
        {
          id: 'home-title',
          alias: 'core.text',
          layout: { mode: 'flow', order: 1, width: '100%' },
          props: { text: '欢迎', variant: 'heading' },
        },
      ],
    },
  };

  it('should validate a correct document', () => {
    const result = validateThemeLayoutDocument(validDocument);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject document with missing version', () => {
    const doc = { ...validDocument };
    delete (doc as Partial<ThemeLayoutDocument>).version;
    const result = validateThemeLayoutDocument(doc);
    expect(result.valid).toBe(false);
  });

  it('should reject document with empty pages', () => {
    const doc = { ...validDocument, pages: [] };
    const result = validateThemeLayoutDocument(doc);
    expect(result.valid).toBe(false);
  });

  it('should reject document with invalid defaultPageId', () => {
    const doc = { ...validDocument, defaultPageId: 'nonexistent' };
    const result = validateThemeLayoutDocument(doc);
    expect(result.valid).toBe(false);
  });

  it('should reject leaf node with children', () => {
    const doc = {
      ...validDocument,
      pages: [
        {
          id: 'home',
          name: '首页',
          layout: {
            id: 'home-screen',
            alias: 'core.screen',
            layout: { mode: 'flow' as const, width: '100%' },
            props: { title: '首页' },
            children: [
              {
                id: 'bad-text',
                alias: 'core.text',
                layout: { mode: 'flow' as const, order: 1 },
                props: { text: 'hello' },
                children: [
                  {
                    id: 'nested',
                    alias: 'core.tag',
                    layout: { mode: 'flow' as const, order: 1 },
                    props: { label: 'bad' },
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    const result = validateThemeLayoutDocument(doc);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((i) => i.message.includes('leaf') || i.message.includes('children')),
    ).toBe(true);
  });

  it('should reject unknown alias', () => {
    const doc = {
      ...validDocument,
      pages: [
        {
          id: 'home',
          name: '首页',
          layout: {
            id: 'home-screen',
            alias: 'core.screen',
            layout: { mode: 'flow' as const, width: '100%' },
            props: { title: '首页' },
            children: [
              {
                id: 'bad-node',
                alias: 'core.nonexistent',
                layout: { mode: 'flow' as const, order: 1 },
                props: {},
              },
            ],
          },
        },
      ],
    };
    const result = validateThemeLayoutDocument(doc);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((i) => i.message.includes('nonexistent') || i.message.includes('unknown')),
    ).toBe(true);
  });

  it('should validate enum props', () => {
    const doc = {
      ...validDocument,
      pages: [
        {
          id: 'home',
          name: '首页',
          layout: {
            id: 'home-screen',
            alias: 'core.screen',
            layout: { mode: 'flow' as const, width: '100%' },
            props: { title: '首页' },
            children: [
              {
                id: 'bad-tag',
                alias: 'core.tag',
                layout: { mode: 'flow' as const, order: 1 },
                props: { label: 'test', tone: 'invalid-tone' },
              },
            ],
          },
        },
      ],
    };
    const result = validateThemeLayoutDocument(doc);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (i) => i.message.includes('invalid_enum') || i.message.includes('must be one of'),
      ),
    ).toBe(true);
  });

  function createWidgetDocument(policy?: ThemeLayoutDocument['widgetPolicy']): ThemeLayoutDocument {
    const layout: ThemeLayoutDocument['layout'] = {
      id: 'home-screen',
      alias: 'core.screen',
      layout: { mode: 'flow', width: '100%' },
      props: { title: 'home' },
      children: [
        {
          id: 'chart-widget',
          alias: 'core.widget',
          layout: { mode: 'flow', order: 1 },
          props: {
            library: 'echarts',
            renderer: 'echarts',
            data: { series: [{ type: 'bar', data: [1, 2, 3] }] },
          },
        },
      ],
    };

    return {
      ...validDocument,
      dependencies: [{ name: 'echarts', url: 'https://esm.sh/echarts' }],
      widgetPolicy: policy,
      pages: [
        {
          id: 'home',
          name: 'home',
          layout,
        },
      ],
      layout,
    };
  }

  it('should allow widget dependencies permitted by widgetPolicy', () => {
    const result = validateThemeLayoutDocument(
      createWidgetDocument({
        allowedLibraries: ['echarts'],
        allowedRenderers: ['echarts'],
        allowedCapabilities: ['chart'],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('should reject widgets when widgetPolicy disables them', () => {
    const result = validateThemeLayoutDocument(createWidgetDocument({ enabled: false }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'widget_disabled_by_policy')).toBe(true);
  });

  it('should reject widget dependencies outside widgetPolicy library allowlist', () => {
    const result = validateThemeLayoutDocument(
      createWidgetDocument({
        allowedLibraries: ['mermaid'],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'blocked_dependency_url')).toBe(true);
  });

  it('should reject widget renderers outside widgetPolicy renderer allowlist', () => {
    const result = validateThemeLayoutDocument(
      createWidgetDocument({
        allowedRenderers: ['mermaid'],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'unsupported_widget_renderer')).toBe(true);
  });

  it('should reject widget renderers outside widgetPolicy capability allowlist', () => {
    const result = validateThemeLayoutDocument(
      createWidgetDocument({
        allowedCapabilities: ['diagram'],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'widget_capability_blocked')).toBe(true);
  });
});

// ─── Template JSON Import Tests ───────────────────────────────────

interface TemplateJsonPage {
  id: string;
  layout: {
    alias: unknown;
  };
}

interface TemplateJsonFile {
  version: unknown;
  themeId: unknown;
  themeName: unknown;
  pages: TemplateJsonPage[];
  components: unknown;
  defaultPageId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTemplateJsonPage(value: unknown): value is TemplateJsonPage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isRecord(value.layout) &&
    'alias' in value.layout
  );
}

function isTemplateJsonFile(value: unknown): value is TemplateJsonFile {
  return (
    isRecord(value) &&
    'version' in value &&
    'themeId' in value &&
    'themeName' in value &&
    Array.isArray(value.pages) &&
    value.pages.every(isTemplateJsonPage) &&
    'components' in value &&
    typeof value.defaultPageId === 'string'
  );
}

function readTemplateJsonFile(templatesDir: string, file: string): TemplateJsonFile {
  const filePath = path.join(templatesDir, file);
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isTemplateJsonFile(parsed)) {
    throw new Error(`Template JSON file has invalid shape: ${file}`);
  }
  return parsed;
}

describe('Template JSON Files', () => {
  const templatesDir = path.join(process.cwd(), '..', 'templates_json');

  let templateFiles: string[];

  beforeAll(() => {
    if (fs.existsSync(templatesDir)) {
      templateFiles = fs
        .readdirSync(templatesDir)
        .filter(
          (f: string) =>
            f.endsWith('.json') && !f.includes('.generated.') && !f.includes('.override.'),
        );
    } else {
      templateFiles = [];
    }
  });

  it('should tolerate an empty import inbox', () => {
    expect(fs.existsSync(templatesDir)).toBe(true);
    expect(Array.isArray(templateFiles)).toBe(true);
  });

  it('should have valid JSON in each template file', () => {
    for (const file of templateFiles) {
      const filePath = path.join(templatesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      expect(() => {
        JSON.parse(content) as unknown;
      }).not.toThrow();
    }
  });

  it('should have required fields in each template', () => {
    for (const file of templateFiles) {
      const template = readTemplateJsonFile(templatesDir, file);
      expect(template).toHaveProperty('version');
      expect(template).toHaveProperty('themeId');
      expect(template).toHaveProperty('themeName');
      expect(template).toHaveProperty('pages');
      expect(template).toHaveProperty('components');
      expect(template).toHaveProperty('defaultPageId');
      expect(Array.isArray(template.pages)).toBe(true);
      expect(template.pages.length).toBeGreaterThan(0);
    }
  });

  it('should have core.screen as root of each page', () => {
    for (const file of templateFiles) {
      const template = readTemplateJsonFile(templatesDir, file);
      for (const page of template.pages) {
        expect(page.layout.alias).toBe('core.screen');
      }
    }
  });

  it('should have matching defaultPageId', () => {
    for (const file of templateFiles) {
      const template = readTemplateJsonFile(templatesDir, file);
      const pageIds = template.pages.map((p) => p.id);
      expect(pageIds).toContain(template.defaultPageId);
    }
  });
});
