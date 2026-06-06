import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import { validateThemeLayoutDocument } from '@shared/agent/contracts/validation';
import { CORE_COMPONENTS } from '@shared/agent/runtime';

// ─── Agent Template Generation Tests ──────────────────────────────

describe('Agent Template Generation', () => {
  // Test that the generate_template tool description is valid
  describe('generate_template tool', () => {
    it('should have all 55 core components in CORE_COMPONENTS', () => {
      const aliases = CORE_COMPONENTS.map((c) => c.alias);
      expect(aliases).toContain('core.screen');
      expect(aliases).toContain('core.text');
      expect(aliases).toContain('core.button');
      expect(aliases).toContain('core.image');
      expect(aliases).toContain('core.navbar');
      expect(aliases).toContain('core.tabbar');
      expect(aliases).toContain('core.avatar');
      expect(aliases).toContain('core.badge');
      expect(aliases).toContain('core.dialog');
      expect(aliases).toContain('core.drawer');
      expect(aliases).toContain('core.select');
      expect(aliases).toContain('core.checkbox');
      expect(aliases).toContain('core.switch');
      expect(aliases).toContain('core.rate');
      expect(aliases).toContain('core.table');
      expect(aliases).toContain('core.video');
      expect(aliases).toContain('core.audio');
      expect(aliases).toContain('core.sidebar');
      expect(aliases).toContain('core.timeline');
      expect(aliases).toContain('core.tree');
      expect(aliases).toContain('core.widget');
      expect(CORE_COMPONENTS.length).toBeGreaterThanOrEqual(55);
    });

    it('should have valid prop descriptors for each component', () => {
      for (const component of CORE_COMPONENTS) {
        expect(component.alias).toMatch(/^core\./);
        expect(component.name).toBeTruthy();
        expect(['layout', 'component']).toContain(component.kind);
        expect(Array.isArray(component.props)).toBe(true);

        for (const prop of component.props) {
          expect(prop.name).toBeTruthy();
          expect(prop.type).toBeTruthy();
          if (prop.enum) {
            expect(Array.isArray(prop.enum)).toBe(true);
            expect(prop.enum.length).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  // Test that generated templates pass validation
  describe('template validation pipeline', () => {
    function createTestTemplate(overrides: Partial<ThemeLayoutDocument> = {}): ThemeLayoutDocument {
      return {
        version: 1,
        themeId: 'test-gen',
        themeName: '测试生成模板',
        pageName: '首页',
        description: 'Agent 生成的测试模板',
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
                  id: 'home-search',
                  alias: 'core.search',
                  layout: { mode: 'flow', order: 1, width: '100%' },
                  props: { placeholder: '搜索' },
                },
                {
                  id: 'home-title',
                  alias: 'core.text',
                  layout: { mode: 'flow', order: 2, width: '100%' },
                  props: { text: '欢迎使用', variant: 'heading' },
                },
                {
                  id: 'home-panel',
                  alias: 'core.panel',
                  layout: { mode: 'flow', order: 3, width: '100%' },
                  props: { tone: 'default', gap: '12', title: '功能区' },
                  children: [
                    {
                      id: 'home-panel-text',
                      alias: 'core.text',
                      layout: { mode: 'flow', order: 1 },
                      props: { text: '内容', variant: 'body' },
                    },
                    {
                      id: 'home-panel-btn',
                      alias: 'core.button',
                      layout: { mode: 'flow', order: 2 },
                      props: { label: '操作', variant: 'primary' },
                    },
                  ],
                },
                {
                  id: 'home-footer',
                  alias: 'core.tabs',
                  slot: 'footer',
                  layout: { mode: 'flow', order: 999, width: '100%' },
                  props: { tabs: ['首页', '我的'], activeTab: '首页' },
                  interactions: {
                    onTabClick: {
                      首页: { type: 'navigate', targetPageId: 'home' },
                      我的: { type: 'navigate', targetPageId: 'profile' },
                    },
                  },
                },
              ],
            },
          },
          {
            id: 'profile',
            name: '我的',
            layout: {
              id: 'profile-screen',
              alias: 'core.screen',
              layout: { mode: 'flow', width: '100%' },
              props: { title: '我的' },
              children: [
                {
                  id: 'profile-avatar',
                  alias: 'core.avatar',
                  layout: { mode: 'flow', order: 1 },
                  props: { text: '用户', size: 'large', shape: 'circle' },
                },
                {
                  id: 'profile-name',
                  alias: 'core.text',
                  layout: { mode: 'flow', order: 2, width: '100%' },
                  props: { text: '用户昵称', variant: 'title' },
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
          children: [],
        },
        cssVars: {
          '--color-primary': '#2196F3',
          '--color-bg': '#F5F7FA',
        },
        ...overrides,
      };
    }

    it('should validate a complete multi-page template', () => {
      const template = createTestTemplate();
      const result = validateThemeLayoutDocument(template);
      expect(result.valid).toBe(true);
    });

    it('should validate template with all new components', () => {
      const template = createTestTemplate({
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
                  id: 'c1',
                  alias: 'core.navbar',
                  layout: { mode: 'flow', order: 1, width: '100%' },
                  props: { title: '导航', leftArrow: true },
                  children: [],
                },
                {
                  id: 'c2',
                  alias: 'core.search',
                  layout: { mode: 'flow', order: 2, width: '100%' },
                  props: { placeholder: '搜索' },
                },
                {
                  id: 'c3',
                  alias: 'core.carousel',
                  layout: { mode: 'flow', order: 3, width: '100%' },
                  props: { images: [], autoplay: true },
                },
                {
                  id: 'c4',
                  alias: 'core.statistic',
                  layout: { mode: 'flow', order: 4 },
                  props: { title: '访问量', value: '1,234', trend: 'up' },
                },
                {
                  id: 'c5',
                  alias: 'core.badge',
                  layout: { mode: 'flow', order: 5 },
                  props: { count: 5, tone: 'error' },
                },
                {
                  id: 'c6',
                  alias: 'core.progress',
                  layout: { mode: 'flow', order: 6, width: '100%' },
                  props: { value: 65, max: 100, tone: 'accent' },
                },
                {
                  id: 'c7',
                  alias: 'core.alert',
                  layout: { mode: 'flow', order: 7, width: '100%' },
                  props: { text: '提示信息', type: 'info' },
                },
                {
                  id: 'c8',
                  alias: 'core.rate',
                  layout: { mode: 'flow', order: 8 },
                  props: { value: 4, count: 5 },
                },
                {
                  id: 'c9',
                  alias: 'core.switch',
                  layout: { mode: 'flow', order: 9 },
                  props: { checked: true, label: '开关' },
                },
                {
                  id: 'c10',
                  alias: 'core.skeleton',
                  layout: { mode: 'flow', order: 10, width: '100%' },
                  props: { rows: 3, animated: true },
                },
                {
                  id: 'c11',
                  alias: 'core.empty',
                  layout: { mode: 'flow', order: 11, width: '100%' },
                  props: { text: '暂无数据', actionLabel: '刷新' },
                },
                {
                  id: 'c12',
                  alias: 'core.breadcrumb',
                  layout: { mode: 'flow', order: 12, width: '100%' },
                  props: { items: ['首页', '分类', '详情'], separator: '/' },
                },
                {
                  id: 'c13',
                  alias: 'core.pagination',
                  layout: { mode: 'flow', order: 13, width: '100%' },
                  props: { current: 1, total: 100, pageSize: 10 },
                },
                {
                  id: 'c14',
                  alias: 'core.table',
                  layout: { mode: 'flow', order: 14, width: '100%' },
                  props: { columns: [{ key: 'name', title: '名称' }], data: [], bordered: true },
                },
                {
                  id: 'c15',
                  alias: 'core.select',
                  layout: { mode: 'flow', order: 15, width: '100%' },
                  props: { label: '选择', options: ['A', 'B', 'C'] },
                },
                {
                  id: 'c16',
                  alias: 'core.checkbox',
                  layout: { mode: 'flow', order: 16 },
                  props: { label: '复选', checked: false },
                },
                {
                  id: 'c17',
                  alias: 'core.radio',
                  layout: { mode: 'flow', order: 17 },
                  props: { label: '单选', group: 'g1' },
                },
                {
                  id: 'c18',
                  alias: 'core.slider',
                  layout: { mode: 'flow', order: 18, width: '100%' },
                  props: { value: 50, min: 0, max: 100 },
                },
                {
                  id: 'c19',
                  alias: 'core.datepicker',
                  layout: { mode: 'flow', order: 19 },
                  props: { placeholder: '选择日期' },
                },
                {
                  id: 'c20',
                  alias: 'core.timepicker',
                  layout: { mode: 'flow', order: 20 },
                  props: { placeholder: '选择时间' },
                },
                {
                  id: 'c21',
                  alias: 'core.upload',
                  layout: { mode: 'flow', order: 21 },
                  props: { actionLabel: '上传文件', multiple: true },
                },
                {
                  id: 'c22',
                  alias: 'core.tooltip',
                  layout: { mode: 'flow', order: 22 },
                  props: { text: '提示', placement: 'top' },
                },
                {
                  id: 'c23',
                  alias: 'core.notice',
                  layout: { mode: 'flow', order: 23, width: '100%' },
                  props: { text: '公告', tone: 'info' },
                },
                {
                  id: 'c24',
                  alias: 'core.loading',
                  layout: { mode: 'flow', order: 24 },
                  props: { text: '加载中', type: 'spinner' },
                },
              ],
            },
          },
        ],
      });
      const result = validateThemeLayoutDocument(template);
      expect(result.valid).toBe(true);
    });

    it('should validate interactions reference existing pages', () => {
      const template = createTestTemplate();
      const result = validateThemeLayoutDocument(template);
      // The footer tabs reference 'home' and 'profile' which both exist
      expect(result.errors).toHaveLength(0);
    });

    it('should reject interactions referencing non-existent pages', () => {
      const template = createTestTemplate();
      // Add a bad interaction
      const footer = template.pages[0].layout.children?.find((c) => c.slot === 'footer');
      if (footer?.interactions?.onTabClick && typeof footer.interactions.onTabClick === 'object') {
        (footer.interactions.onTabClick as Record<string, unknown>)['不存在'] = {
          type: 'navigate',
          targetPageId: 'nonexistent-page',
        };
      }
      const result = validateThemeLayoutDocument(template);
      expect(result.valid).toBe(false);
    });
  });
});
