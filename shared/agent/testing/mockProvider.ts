import { createBlankDocument, createScreenNode } from '../fixtures/blankDocument';
import type { AgentEvalScenario, ThemeLayoutDocument, ThemeLayoutNode } from '../types';

function textNode(id: string, text: string, order: number): ThemeLayoutNode {
  return {
    id,
    alias: 'core.text',
    layout: { mode: 'flow', order, width: '100%' },
    props: { text, variant: order === 1 ? 'heading' : 'body' },
  };
}

function buttonNode(id: string, label: string, order: number): ThemeLayoutNode {
  return {
    id,
    alias: 'core.button',
    layout: { mode: 'flow', order },
    props: { label, variant: 'primary' },
  };
}

export function createMockGeneratedDocument(scenario: AgentEvalScenario): ThemeLayoutDocument {
  const domain = scenario.mock?.templateDomain ?? scenario.prompt;
  const base = createBlankDocument(`eval-${scenario.id}`);
  const pageNames = ['首页', '服务', '我的'];
  const pages = pageNames.map((name, index) => {
    const id = `page-${index + 1}`;
    const layout = createScreenNode(`${id}-screen`, `${domain}${name}`, [
      textNode(`${id}-title`, `${domain}${name}`, 1),
      textNode(`${id}-body`, `${domain}核心内容`, 2),
      buttonNode(`${id}-cta`, index === 0 ? '立即开始' : '查看详情', 3),
      {
        id: `${id}-tabs`,
        alias: 'core.tabs',
        slot: 'footer',
        layout: { mode: 'flow', order: 99, width: '100%' },
        props: { tabs: pageNames, activeTab: name },
        interactions: {
          onTabClick: Object.fromEntries(
            pageNames.map((label, pageIndex) => [
              label,
              { type: 'navigate' as const, targetPageId: `page-${pageIndex + 1}` },
            ]),
          ),
        },
      },
    ]);
    return { id, name, layout };
  });
  return {
    ...base,
    themeName: `${domain}应用`,
    pageName: '首页',
    description: `${domain}多页面应用`,
    defaultPageId: pages[0].id,
    pages,
    layout: pages[0].layout,
  };
}

export function createMockTemplateToolInput(scenario: AgentEvalScenario) {
  const layoutDocument = createMockGeneratedDocument(scenario);
  return {
    templateId: `eval-${scenario.id}`,
    name: layoutDocument.themeName,
    tagline: 'Agent eval generated template',
    description: layoutDocument.description,
    category: 'general',
    displayCategory: 'general',
    accent: '#2563eb',
    traits: ['eval', 'mock'],
    cssVars: {
      '--color-accent': '#2563eb',
      '--color-bg': '#ffffff',
      '--color-surface': '#f8fafc',
      '--color-text': '#111827',
    },
    componentTemplates: {},
    layoutDocument,
  };
}

export function createMockToolCallForScenario(scenario: AgentEvalScenario) {
  if (scenario.mode === 'template_generation') {
    return {
      name: 'generate_template',
      arguments: createMockTemplateToolInput(scenario),
    };
  }
  return {
    name: 'apply_editor_edits',
    arguments: {
      operations: scenario.mock?.operations ?? [],
      reason: `Mock edits for ${scenario.id}`,
    },
  };
}
