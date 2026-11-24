import type {
  AIProvider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderStreamEvent,
} from '@shared/agent/contracts/provider';

import type { AiTemplatePipelineProvider } from '../../ai/pipelineProvider.port';
import type { DesignerOutput } from '../orchestrator/pipeline.types';
import { SchemaGeneratorAgent } from './schemaGenerator.agent';

const capabilities: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: false,
  supportsStructuredOutput: false,
  supportsReasoningEffort: false,
  supportsServerSideContext: false,
  reasoningMode: 'none',
  cacheStrategy: 'cache_key',
  supportsDeveloperRole: false,
};

class FakeProvider implements AIProvider {
  readonly name = 'fake-provider';
  readonly requests: ProviderRequest[] = [];

  constructor(private readonly batches: ProviderStreamEvent[][]) {}

  getCapabilities(): ProviderCapabilities {
    return capabilities;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    this.requests.push(request);
    await Promise.resolve();
    const batch = this.batches.shift() ?? [];
    for (const event of batch) {
      yield event;
    }
  }

  cancel(): void {
    // No-op test provider.
  }
}

function createBrief(): DesignerOutput {
  return {
    templateId: 'fresh-market',
    name: '鲜果优选',
    tagline: '当日采摘直达',
    archetype: 'fresh',
    variant: 'compact',
    heroMode: 'function-grid',
    platform: 'mini-program',
    chrome: 'wechat',
    scenario: '生鲜水果即时配送',
    audience: '社区家庭用户',
    pages: [
      { id: 'home', name: '首页', kind: 'home', userTask: '浏览生鲜' },
      { id: 'orders', name: '订单', kind: 'order', userTask: '查看订单' },
    ],
    cssVars: {
      '--accent': '#16A34A',
      '--surface': '#FFFFFF',
      '--surface-muted': '#F4F7F5',
      '--text-heading-color': '#111827',
      '--text-body-color': '#374151',
      '--text-muted-color': '#6B7280',
      '--panel-bg': '#FFFFFF',
      '--panel-border': '#E5E7EB',
      '--border-color': '#E5E7EB',
    },
    componentTemplatesDraft: [
      { alias: 'biz-fruit-card', role: 'card', description: '水果商品卡片' },
    ],
    bottomTabs: [
      { targetPageId: 'home', label: '首页' },
      { targetPageId: 'orders', label: '订单' },
    ],
    category: 'commerce',
    displayCategory: 'commerce',
    whyArchetype: 'fresh fits groceries',
    whyHeroMode: 'function grid helps browse categories',
    diversitySignature: 'fresh green produce grid',
  };
}

describe('SchemaGeneratorAgent', () => {
  it('assigns unique nodeIds across panels, sums tokens, and binds assets', async () => {
    const provider = new FakeProvider([
      // Phase A: skeleton
      [
        {
          type: 'tool_call',
          id: 'call-a',
          name: 'submit_page_skeleton',
          arguments: JSON.stringify({
            templateId: 'fresh-market',
            pages: [
              {
                id: 'home',
                name: '首页',
                kind: 'home',
                layoutTree: 'screen>navbar,panel(image,text,button),panel(image,text,button),tabs',
              },
              {
                id: 'orders',
                name: '订单',
                kind: 'order',
                layoutTree: 'screen>navbar,panel(text),tabs',
              },
            ],
            componentTemplateAliases: ['biz-fruit-card'],
            cssVars: { '--color-primary': '#16A34A' },
          }),
        },
        { type: 'done', usage: { inputTokens: 100, outputTokens: 40, cacheHitTokens: 10 } },
      ],
      // Phase B: content fill (using exact nodeIds from Phase A tree build)
      [
        {
          type: 'tool_call',
          id: 'call-b',
          name: 'submit_node_content',
          arguments: JSON.stringify({
            pages: [
              {
                pageId: 'home',
                nodes: [
                  { nodeId: 'home-navbar-1', alias: 'core.navbar', props: { title: '鲜果优选' } },
                  { nodeId: 'home-image-1', alias: 'core.image', props: { alt: '红富士苹果' } },
                  { nodeId: 'home-text-1', alias: 'core.text', props: { text: '红富士苹果' } },
                  { nodeId: 'home-button-1', alias: 'core.button', props: { label: '加入购物车' } },
                  { nodeId: 'home-image-2', alias: 'core.image', props: { alt: '海南芒果' } },
                  { nodeId: 'home-text-2', alias: 'core.text', props: { text: '海南芒果' } },
                  { nodeId: 'home-button-2', alias: 'core.button', props: { label: '立即抢购' } },
                  {
                    nodeId: 'home-tabs-1',
                    alias: 'core.tabs',
                    props: { tabs: ['首页', '订单'], activeTab: '首页' },
                  },
                ],
              },
              {
                pageId: 'orders',
                nodes: [
                  { nodeId: 'orders-navbar-1', alias: 'core.navbar', props: { title: '我的订单' } },
                  {
                    nodeId: 'orders-text-1',
                    alias: 'core.text',
                    props: { text: '暂无进行中订单' },
                  },
                  {
                    nodeId: 'orders-tabs-1',
                    alias: 'core.tabs',
                    props: { tabs: ['首页', '订单'], activeTab: '订单' },
                  },
                ],
              },
            ],
          }),
        },
        { type: 'done', usage: { inputTokens: 200, outputTokens: 80, cacheHitTokens: 20 } },
      ],
      // Phase C: visual assets
      [
        {
          type: 'tool_call',
          id: 'call-c',
          name: 'submit_visual_assets',
          arguments: JSON.stringify({
            visualAssets: [
              {
                id: 'home-image-1',
                nodeId: 'home-image-1',
                pageId: 'home',
                role: 'card',
                prompt: 'Fresh red apples in minimal basket, bright daylight studio photo',
                alt: '红富士苹果',
                provider: 'ai-image',
              },
              {
                id: 'home-image-2',
                nodeId: 'home-image-2',
                pageId: 'home',
                role: 'card',
                prompt: 'Ripe golden mangoes sliced on white plate, clean food photo',
                alt: '海南芒果',
                provider: 'ai-image',
              },
            ],
          }),
        },
        { type: 'done', usage: { inputTokens: 50, outputTokens: 30, cacheHitTokens: 5 } },
      ],
    ]);

    const pipelineProvider: AiTemplatePipelineProvider = {
      getProviderForTemplatePipeline: () => ({
        provider,
        model: 'test-pro',
        liteModel: 'test-lite',
        apiKeyConfigured: true,
      }),
    };

    const agent = new SchemaGeneratorAgent(pipelineProvider);
    const result = await agent.run(createBrief(), 1);

    expect(result.inputTokens).toBe(350);
    expect(result.outputTokens).toBe(150);
    expect(result.cacheHitTokens).toBe(35);
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests.map((req) => req.cacheKey)).toEqual([
      'pipeline-schema-skeleton',
      'pipeline-schema-content',
      'pipeline-schema-assets',
    ]);

    const home = result.output.document.pages[0];
    const panel1 = home.layout.children?.[1];
    const panel2 = home.layout.children?.[2];
    expect(panel1?.children?.[0]?.id).toBe('home-image-1');
    expect(panel1?.children?.[0]?.props?.assetId).toBe('home-image-1');
    expect(panel1?.children?.[1]?.props?.text).toBe('红富士苹果');
    expect(panel2?.children?.[0]?.id).toBe('home-image-2');
    expect(panel2?.children?.[0]?.props?.assetId).toBe('home-image-2');
    expect(panel2?.children?.[1]?.props?.text).toBe('海南芒果');

    const footerTabs = home.layout.children?.[3];
    expect(footerTabs?.slot).toBe('footer');
    expect(footerTabs?.interactions?.onTabClick).toEqual({
      首页: { type: 'navigate', targetPageId: 'home' },
      订单: { type: 'navigate', targetPageId: 'orders' },
    });
    expect(result.output.document.cssVars?.['--accent']).toBe('#16A34A');
    expect(result.output.document.componentTemplates).toEqual({});
  });

  it('auto-fills missing required theme cssVars via ensureThemeContract', async () => {
    const briefWithLegacyCss = createBrief();
    briefWithLegacyCss.cssVars = { '--color-primary': '#16A34A' };

    const provider = new FakeProvider([
      [
        {
          type: 'tool_call',
          id: 'call-a',
          name: 'submit_page_skeleton',
          arguments: JSON.stringify({
            templateId: 'fresh-market',
            pages: [
              {
                id: 'home',
                name: '首页',
                kind: 'home',
                layoutTree: 'screen>navbar,panel(text,button),tabs',
              },
              {
                id: 'orders',
                name: '订单',
                kind: 'order',
                layoutTree: 'screen>navbar,panel(text),tabs',
              },
            ],
            componentTemplateAliases: [],
            cssVars: {},
          }),
        },
        { type: 'done', usage: { inputTokens: 80, outputTokens: 30 } },
      ],
      [
        {
          type: 'tool_call',
          id: 'call-b',
          name: 'submit_node_content',
          arguments: JSON.stringify({
            pages: [
              {
                pageId: 'home',
                nodes: [
                  { nodeId: 'home-navbar-1', alias: 'core.navbar', props: { title: '鲜果优选' } },
                  { nodeId: 'home-text-1', alias: 'core.text', props: { text: '当日鲜果' } },
                  { nodeId: 'home-button-1', alias: 'core.button', props: { label: '立即选购' } },
                  {
                    nodeId: 'home-tabs-1',
                    alias: 'core.tabs',
                    props: { tabs: ['首页', '订单'], activeTab: '首页' },
                  },
                ],
              },
              {
                pageId: 'orders',
                nodes: [
                  { nodeId: 'orders-navbar-1', alias: 'core.navbar', props: { title: '我的订单' } },
                  { nodeId: 'orders-text-1', alias: 'core.text', props: { text: '暂无订单' } },
                  {
                    nodeId: 'orders-tabs-1',
                    alias: 'core.tabs',
                    props: { tabs: ['首页', '订单'], activeTab: '订单' },
                  },
                ],
              },
            ],
          }),
        },
        { type: 'done', usage: { inputTokens: 120, outputTokens: 50 } },
      ],
    ]);

    const pipelineProvider: AiTemplatePipelineProvider = {
      getProviderForTemplatePipeline: () => ({
        provider,
        model: 'test-pro',
        liteModel: 'test-lite',
        apiKeyConfigured: true,
      }),
    };

    const agent = new SchemaGeneratorAgent(pipelineProvider);
    const result = await agent.run(briefWithLegacyCss, 1, undefined, 'missing css vars');

    expect(result.output.document.cssVars?.['--accent']).toBe('#16A34A');
    expect(result.output.document.cssVars?.['--surface']).toBeTruthy();
    expect(result.output.document.cssVars?.['--text-heading-color']).toBeTruthy();
    expect(provider.requests[0]?.messages[1]?.content).toContain('missing css vars');
  });

  it('recovers via 1-shot repair when assembleDocument validation fails', async () => {
    const provider = new FakeProvider([
      [
        {
          type: 'tool_call',
          id: 'call-a',
          name: 'submit_page_skeleton',
          arguments: JSON.stringify({
            templateId: 'fresh-market',
            pages: [
              {
                id: 'home',
                name: '首页',
                kind: 'home',
                layoutTree: 'screen>navbar,panel(text,button),tabs',
              },
              {
                id: 'orders',
                name: '订单',
                kind: 'order',
                layoutTree: 'screen>navbar,panel(text),tabs',
              },
            ],
            componentTemplateAliases: [],
            cssVars: { '--color-primary': '#16A34A' },
          }),
        },
        { type: 'done', usage: { inputTokens: 80, outputTokens: 30 } },
      ],
      [
        {
          type: 'tool_call',
          id: 'call-b',
          name: 'submit_node_content',
          arguments: JSON.stringify({
            pages: [
              {
                pageId: 'home',
                nodes: [
                  { nodeId: 'home-navbar-1', alias: 'core.navbar', props: { title: '鲜果优选' } },
                  { nodeId: 'home-text-1', alias: 'core.text', props: { text: '当日鲜果' } },
                  {
                    nodeId: 'home-button-1',
                    alias: 'core.button',
                    props: { label: 'Order Fresh Apples Now' },
                  },
                  {
                    nodeId: 'home-tabs-1',
                    alias: 'core.tabs',
                    props: { tabs: ['首页', '订单'], activeTab: '首页' },
                  },
                ],
              },
              {
                pageId: 'orders',
                nodes: [
                  { nodeId: 'orders-navbar-1', alias: 'core.navbar', props: { title: '我的订单' } },
                  { nodeId: 'orders-text-1', alias: 'core.text', props: { text: '暂无订单' } },
                  {
                    nodeId: 'orders-tabs-1',
                    alias: 'core.tabs',
                    props: { tabs: ['首页', '订单'], activeTab: '订单' },
                  },
                ],
              },
            ],
          }),
        },
        { type: 'done', usage: { inputTokens: 120, outputTokens: 50 } },
      ],
      [
        {
          type: 'tool_call',
          id: 'call-repair',
          name: 'submit_schema_repair',
          arguments: JSON.stringify({
            pages: [
              {
                pageId: 'home',
                nodes: [{ nodeId: 'home-button-1', props: { label: '立即购买' } }],
              },
            ],
          }),
        },
        { type: 'done', usage: { inputTokens: 40, outputTokens: 15 } },
      ],
    ]);

    const pipelineProvider: AiTemplatePipelineProvider = {
      getProviderForTemplatePipeline: () => ({
        provider,
        model: 'test-pro',
        liteModel: 'test-lite',
        apiKeyConfigured: true,
      }),
    };

    const agent = new SchemaGeneratorAgent(pipelineProvider);
    const result = await agent.run(createBrief(), 1);

    expect(result.inputTokens).toBe(240);
    expect(result.outputTokens).toBe(95);
    const home = result.output.document.pages[0];
    const button = home.layout.children?.[1]?.children?.[1];
    expect(button?.props?.label).toBe('立即购买');
  });
});
