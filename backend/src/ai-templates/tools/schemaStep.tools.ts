import type { ProviderTool } from '@shared/agent/contracts/provider';

/** Step 1: 只输出页面 skeleton（容器层级），不包含叶子内容 */
export const SUBMIT_PAGE_SKELETON_TOOL: ProviderTool = {
  name: 'submit_page_skeleton',
  description:
    '提交页面骨架。此工具输出页面的容器层级结构，不含任何文本/图片/交互内容。每个页面指定 layout 容器的层级关系。',
  parameters: {
    type: 'object',
    required: ['templateId', 'pages', 'componentTemplateAliases', 'cssVars'],
    properties: {
      templateId: { type: 'string', description: '模板 ID，如 "food-delivery"' },
      pages: {
        type: 'array',
        minItems: 3,
        maxItems: 6,
        items: {
          type: 'object',
          required: ['id', 'name', 'kind', 'layoutTree'],
          properties: {
            id: { type: 'string', description: '页面 ID，如 "home"' },
            name: { type: 'string', description: '页面中文名，如 "首页"' },
            kind: { type: 'string', description: 'home|list|detail|order|profile|form|dashboard' },
            layoutTree: {
              type: 'string',
              description: [
                '容器层级树描述，格式为 "screen>子节点1,子节点2(子级1,子级2)"。',
                '例如："screen>navbar,search,panel(text,button),grid(panel(image,text)),tabs"。',
                '只写 alias，不写 props。',
              ].join(''),
            },
          },
        },
      },
      componentTemplateAliases: {
        type: 'array',
        items: { type: 'string' },
        description: '仅当 layoutTree 实际引用了 biz-* 节点时列出其别名；纯用 core.* 节点时传 []',
      },
      cssVars: {
        type: 'object',
        description: '主题色 token，如 {"--color-primary":"#FF2442"}',
      },
    },
  },
};

/** Step 2: 为所有页面填充节点内容（一次性） */
export const SUBMIT_NODE_CONTENT_TOOL: ProviderTool = {
  name: 'submit_node_content',
  description:
    '为所有页面填充节点 props 内容。输出 pages 数组，每个元素包含 pageId 和该页面的 node 列表。',
  parameters: {
    type: 'object',
    required: ['pages'],
    properties: {
      pages: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['pageId', 'nodes'],
          properties: {
            pageId: { type: 'string', description: '页面 ID' },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['nodeId', 'alias', 'props'],
                properties: {
                  nodeId: { type: 'string', description: '节点 ID' },
                  alias: { type: 'string', description: '组件 alias' },
                  props: {
                    type: 'object',
                    description: [
                      '组件属性。text:{text,variant}; button:{label,variant}; image:{alt};',
                      'search:{placeholder}; tag:{label,tone}; panel:{tone,gap,title};',
                      'tabs:{tabs,activeTab}; notice:{text,tone}; input:{placeholder,label};',
                      'progress:{value,max,tone}; navbar:{title}; tabbar:{items,active};',
                      'list-item:{title,description}',
                    ].join(' '),
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

/** Step 3: 生成 visual assets */
export const SUBMIT_VISUAL_ASSETS_TOOL: ProviderTool = {
  name: 'submit_visual_assets',
  description: '为模板中的所有 core.image 节点生成 visual assets。每个 asset 对应一个 image 节点。',
  parameters: {
    type: 'object',
    required: ['visualAssets'],
    properties: {
      visualAssets: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'nodeId', 'pageId', 'role', 'prompt', 'alt', 'provider'],
          properties: {
            id: { type: 'string' },
            nodeId: { type: 'string', description: '对应 core.image 节点的 nodeId' },
            pageId: { type: 'string', description: '页面 ID' },
            role: {
              type: 'string',
              enum: ['hero', 'cover', 'card', 'avatar', 'icon', 'banner', 'decoration'],
            },
            prompt: { type: 'string', description: '英文图片生成 prompt，30-50 字，描述具体场景' },
            alt: { type: 'string', description: '中文 alt 文本' },
            provider: { type: 'string', enum: ['ai-image', 'placeholder'] },
          },
        },
      },
    },
  },
};

/** Step 4 (Repair): 针对 Verifier 反馈做局部属性 / cssVars 修补，避免从头重跑 */
export const SUBMIT_SCHEMA_REPAIR_TOOL: ProviderTool = {
  name: 'submit_schema_repair',
  description: '根据 Verifier 指出的问题，对现有文档做局部 cssVars 或节点 props 修补。',
  parameters: {
    type: 'object',
    properties: {
      cssVars: {
        type: 'object',
        description: '需要补充或调整的全局 CSS 变量键值对（与原 cssVars 合并）。',
      },
      removeNodeIds: {
        type: 'array',
        items: { type: 'string' },
        description: '需要从页面树中移除的多余/冲突节点 ID（如与无底栏导航冲突的 footer tabs）。',
      },
      pages: {
        type: 'array',
        description: '需要调整文案/属性/按钮的页面节点补丁（仅列要改的节点）。',
        items: {
          type: 'object',
          required: ['pageId', 'nodes'],
          properties: {
            pageId: { type: 'string' },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['nodeId', 'props'],
                properties: {
                  nodeId: { type: 'string' },
                  props: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
  },
};

/** 工具定义汇总 */
export const SCHEMA_STEP_TOOLS = [
  SUBMIT_PAGE_SKELETON_TOOL,
  SUBMIT_NODE_CONTENT_TOOL,
  SUBMIT_VISUAL_ASSETS_TOOL,
  SUBMIT_SCHEMA_REPAIR_TOOL,
];
