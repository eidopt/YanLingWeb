function textNode(id, text, order) {
  return {
    id,
    alias: 'core.text',
    layout: { mode: 'flow', order, width: '100%' },
    props: { text, variant: order === 1 ? 'heading' : 'body' },
  };
}

function buttonNode(id, label, order) {
  return {
    id,
    alias: 'core.button',
    layout: { mode: 'flow', order },
    props: { label, variant: 'primary' },
  };
}

function screen(id, title, children) {
  return {
    id,
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%' },
    props: { title },
    children,
  };
}

const components = [
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
  'core.text',
  'core.button',
  'core.search',
  'core.tabs',
  'core.tag',
  'core.notice',
  'core.image',
  'core.html',
  'core.widget',
  'core.divider',
  'core.spacer',
  'core.input',
].map((alias) => ({
  alias,
  name: alias,
  kind: alias.includes('panel') || alias.includes('screen') ? 'layout' : 'component',
  description: alias,
  props: [],
}));

export function createMockTemplateDocument(scenario) {
  const domain = scenario.mock?.templateDomain || scenario.prompt;
  const names = ['首页', '服务', '我的'];
  const pages = names.map((name, index) => {
    const id = `page-${index + 1}`;
    const layout = screen(`${id}-screen`, `${domain}${name}`, [
      textNode(`${id}-title`, `${domain}${name}`, 1),
      textNode(`${id}-body`, `${domain}核心内容`, 2),
      buttonNode(`${id}-cta`, index === 0 ? '立即开始' : '查看详情', 3),
      {
        id: `${id}-tabs`,
        alias: 'core.tabs',
        slot: 'footer',
        layout: { mode: 'flow', order: 99, width: '100%' },
        props: { tabs: names, activeTab: name },
        interactions: {
          onTabClick: Object.fromEntries(
            names.map((label, pageIndex) => [label, { type: 'navigate', targetPageId: `page-${pageIndex + 1}` }]),
          ),
        },
      },
    ]);
    return { id, name, layout };
  });
  return {
    version: 1,
    themeId: `eval-${scenario.id}`,
    themeName: `${domain}应用`,
    pageName: '首页',
    description: `${domain}多页面应用`,
    components,
    defaultPageId: pages[0].id,
    pages,
    layout: pages[0].layout,
  };
}
