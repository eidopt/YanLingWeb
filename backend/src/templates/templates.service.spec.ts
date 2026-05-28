import { validateThemeLayoutDocument } from '@shared/agent/validation/themeLayoutValidator';
import { CORE_COMPONENTS } from '@shared/agent/fixtures/blankDocument';
import type { ThemeLayoutDocument } from '@shared/agent/types';

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
    const doc = { ...validDocument, version: undefined as unknown as number };
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
    expect(result.errors.some((i) => i.message.includes('leaf') || i.message.includes('children'))).toBe(true);
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
    expect(result.errors.some((i) => i.message.includes('nonexistent') || i.message.includes('unknown'))).toBe(true);
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
    expect(result.errors.some((i) => i.message.includes('invalid_enum') || i.message.includes('must be one of'))).toBe(true);
  });
});

// ─── Template JSON Import Tests ───────────────────────────────────

describe('Template JSON Files', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const templatesDir = path.join(process.cwd(), '..', 'templates_json');

  let templateFiles: string[];

  beforeAll(() => {
    if (fs.existsSync(templatesDir)) {
      templateFiles = fs.readdirSync(templatesDir)
        .filter((f: string) => f.endsWith('.json') && !f.includes('.generated.') && !f.includes('.override.'));
    } else {
      templateFiles = [];
    }
  });

  it('should have template JSON files', () => {
    expect(templateFiles.length).toBeGreaterThan(0);
  });

  it('should have valid JSON in each template file', () => {
    for (const file of templateFiles) {
      const filePath = path.join(templatesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();
    }
  });

  it('should have required fields in each template', () => {
    for (const file of templateFiles) {
      const filePath = path.join(templatesDir, file);
      const template = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
      const filePath = path.join(templatesDir, file);
      const template = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const page of template.pages) {
        expect(page.layout.alias).toBe('core.screen');
      }
    }
  });

  it('should have matching defaultPageId', () => {
    for (const file of templateFiles) {
      const filePath = path.join(templatesDir, file);
      const template = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const pageIds = template.pages.map((p: { id: string }) => p.id);
      expect(pageIds).toContain(template.defaultPageId);
    }
  });
});
