export interface TemplateSeedException {
  templateId: string;
  ownerUserId?: string | null;
  sourceTemplateId?: string | null;
  isPublic?: boolean;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  category: string;
  displayCategory?: string;
  platformCategories?: string[];
  functionalCategories?: string[];
  traits: string[];
  tags?: string[];
  cssVars: Record<string, string>;
  cssAnimations?: Record<string, string>;
  visualAssets?: unknown[];
  componentTemplates: Record<string, unknown>;
  layoutDocument: Record<string, unknown>;
}

const CORE_COMPONENT_DESCRIPTORS = [
  {
    alias: "core.screen",
    name: "页面画布",
    kind: "layout",
    description: "页面根容器，包含状态栏和头部",
    props: [
      { name: "title", type: "string", description: "标题" },
      { name: "statusTime", type: "string", description: "状态栏时间" },
      {
        name: "headerActionLabel",
        type: "string",
        description: "右上角按钮文字",
      },
      {
        name: "headerLeftAriaLabel",
        type: "string",
        description: "左侧按钮说明",
      },
      {
        name: "headerRightAriaLabel",
        type: "string",
        description: "右侧按钮说明",
      },
    ],
  },
  {
    alias: "core.stack",
    name: "纵向容器",
    kind: "layout",
    description: "纵向排列子元素的容器",
    props: [
      { name: "gap", type: "number", description: "间距" },
      { name: "alignItems", type: "string", description: "内部对齐方式" },
    ],
  },
  {
    alias: "core.row",
    name: "横向容器",
    kind: "layout",
    description: "横向排列子元素的容器",
    props: [
      { name: "gap", type: "number", description: "间距" },
      { name: "wrap", type: "boolean", description: "是否自动换行" },
      { name: "justify", type: "string", description: "排列方式" },
      { name: "align", type: "string", description: "对齐方式" },
      {
        name: "tone",
        type: "string",
        description: "风格",
        enum: ["default", "accent", "panel", "soft"],
      },
    ],
  },
  {
    alias: "core.grid",
    name: "网格容器",
    kind: "layout",
    description: "网格布局容器",
    props: [
      { name: "gap", type: "number", description: "间距" },
      { name: "columns", type: "number", description: "列数" },
    ],
  },
  {
    alias: "core.panel",
    name: "面板容器",
    kind: "layout",
    description: "带背景色的卡片容器",
    props: [
      { name: "gap", type: "number", description: "间距" },
      {
        name: "tone",
        type: "string",
        description: "风格",
        enum: [
          "default",
          "accent",
          "promo",
          "warm",
          "soft",
          "subtle",
          "member",
          "highlight",
        ],
      },
    ],
  },
  {
    alias: "core.text",
    name: "文本",
    kind: "component",
    description: "文本显示组件",
    props: [
      { name: "text", type: "string", required: true, description: "显示内容" },
      {
        name: "variant",
        type: "string",
        description: "样式类型",
        enum: [
          "display",
          "heading",
          "subheading",
          "body",
          "caption",
          "price",
          "overline",
          "eyebrow",
          "title",
          "subtitle",
        ],
      },
    ],
  },
  {
    alias: "core.button",
    name: "按钮",
    kind: "component",
    description: "可点击按钮",
    props: [
      {
        name: "label",
        type: "string",
        required: true,
        description: "显示文字",
      },
      {
        name: "variant",
        type: "string",
        description: "样式类型",
        enum: ["primary", "secondary", "link", "pill"],
      },
      { name: "active", type: "boolean", description: "是否高亮" },
      { name: "disabled", type: "boolean", description: "是否禁用" },
      { name: "icon", type: "string", description: "前置图标文本" },
    ],
  },
  {
    alias: "core.tag",
    name: "标签",
    kind: "component",
    description: "状态标签",
    props: [
      {
        name: "label",
        type: "string",
        required: true,
        description: "显示文字",
      },
      {
        name: "tone",
        type: "string",
        description: "风格",
        enum: [
          "neutral",
          "success",
          "warning",
          "info",
          "hot",
          "new",
          "deal",
          "member",
        ],
      },
    ],
  },
  {
    alias: "core.progress",
    name: "Progress",
    kind: "component",
    description: "Progress bar",
    props: [
      { name: "value", type: "number", description: "Current value" },
      { name: "max", type: "number", description: "Maximum value" },
      {
        name: "tone",
        type: "string",
        description: "Visual tone",
        enum: ["neutral", "accent", "success", "warning", "info"],
      },
    ],
  },
  {
    alias: "core.image",
    name: "图片占位",
    kind: "component",
    description: "图片或图标占位块",
    props: [
      { name: "src", type: "string", description: "图片地址" },
      { name: "alt", type: "string", description: "替代文本" },
      { name: "title", type: "string", description: "标题" },
      { name: "iconColor", type: "string", description: "占位背景色" },
      {
        name: "objectFit",
        type: "string",
        description: "图片填充方式",
        enum: ["cover", "contain", "fill"],
      },
    ],
  },
  {
    alias: "core.tabs",
    name: "标签栏",
    kind: "component",
    description: "标签页切换栏",
    props: [
      {
        name: "tabs",
        type: "string[]",
        required: true,
        description: "标签列表",
      },
      { name: "activeTab", type: "string", description: "当前选中项" },
    ],
  },
  {
    alias: "core.search",
    name: "搜索框",
    kind: "component",
    description: "搜索输入框",
    props: [
      { name: "placeholder", type: "string", description: "占位提示文字" },
      { name: "value", type: "string", description: "当前值" },
    ],
  },
  {
    alias: "core.notice",
    name: "提示条",
    kind: "component",
    description: "提示信息条",
    props: [
      { name: "text", type: "string", required: true, description: "显示内容" },
      {
        name: "tone",
        type: "string",
        description: "风格",
        enum: ["info", "warning", "error", "success", "neutral"],
      },
    ],
  },
  {
    alias: "core.divider",
    name: "分割线",
    kind: "component",
    description: "水平分割线",
    props: [],
  },
  {
    alias: "core.spacer",
    name: "间距",
    kind: "component",
    description: "空白间距",
    props: [{ name: "size", type: "string", description: "间距尺寸" }],
  },
  {
    alias: "core.input",
    name: "输入框",
    kind: "component",
    description: "文本输入框",
    props: [
      { name: "placeholder", type: "string", description: "占位提示文字" },
      { name: "label", type: "string", description: "标签" },
      { name: "type", type: "string", description: "输入类型" },
      { name: "value", type: "string", description: "当前值" },
      { name: "disabled", type: "boolean", description: "是否禁用" },
    ],
  },
  {
    alias: "core.widget",
    name: "安全组件",
    kind: "component",
    description: "安全的第三方 ESM 可视化组件",
    props: [
      { name: "library", type: "string", description: "依赖库名称" },
      {
        name: "renderer",
        type: "string",
        description: "渲染器",
        enum: ["echarts", "chartjs", "lottie", "mermaid"],
      },
      { name: "data", type: "object", description: "渲染数据" },
    ],
  },
  {
    alias: "core.html",
    name: "自由容器",
    kind: "layout",
    description: "可指定 HTML 标签和任意 inline style 的自由容器，用于创建 core 原语无法表达的自定义组件",
    props: [
      {
        name: "tag",
        type: "string",
        description: "HTML 标签",
        enum: [
          "div", "span", "section", "article", "aside",
          "header", "footer", "main", "nav",
          "ul", "ol", "li", "figure", "figcaption",
          "p", "h1", "h2", "h3", "h4", "strong", "em", "label",
        ],
      },
      { name: "style", type: "object", description: "React CSSProperties inline 样式对象" },
    ],
  },
];

const COMMERCE_COMPONENT_DESCRIPTORS = [
  {
    alias: "com-text",
    name: "文本",
    kind: "component",
    description: "主题文本组件",
    props: [
      { name: "text", type: "string", required: true, description: "显示内容" },
      {
        name: "variant",
        type: "string",
        description: "样式类型",
        enum: [
          "display",
          "heading",
          "subheading",
          "body",
          "caption",
          "price",
          "overline",
          "eyebrow",
          "title",
          "subtitle",
        ],
      },
    ],
  },
  {
    alias: "com-button",
    name: "按钮",
    kind: "component",
    description: "主题按钮",
    props: [
      {
        name: "label",
        type: "string",
        required: true,
        description: "显示文字",
      },
      {
        name: "variant",
        type: "string",
        description: "样式类型",
        enum: ["primary", "secondary", "link"],
      },
      { name: "disabled", type: "boolean", description: "是否禁用" },
    ],
  },
  {
    alias: "com-pill",
    name: "胶囊标签",
    kind: "component",
    description: "分类选择胶囊",
    props: [
      {
        name: "label",
        type: "string",
        required: true,
        description: "显示文字",
      },
      { name: "active", type: "boolean", description: "是否高亮" },
      { name: "disabled", type: "boolean", description: "是否禁用" },
    ],
  },
  {
    alias: "com-tag",
    name: "标签",
    kind: "component",
    description: "商品状态标签",
    props: [
      {
        name: "label",
        type: "string",
        required: true,
        description: "显示文字",
      },
      {
        name: "tone",
        type: "string",
        description: "风格",
        enum: [
          "neutral",
          "success",
          "warning",
          "info",
          "hot",
          "new",
          "deal",
          "member",
        ],
      },
    ],
  },
  {
    alias: "com-info-card",
    name: "信息卡片",
    kind: "component",
    description: "带标题和正文的信息卡片",
    props: [
      { name: "overline", type: "string", description: "眉标题" },
      { name: "title", type: "string", description: "标题" },
      { name: "body", type: "string", description: "正文内容" },
      {
        name: "tone",
        type: "string",
        description: "风格",
        enum: ["default", "accent", "promo", "member", "subtle", "highlight"],
      },
    ],
  },
  {
    alias: "com-promo-card",
    name: "促销横幅",
    kind: "component",
    description: "促销信息横幅，带操作按钮",
    props: [
      { name: "overline", type: "string", description: "眉标题" },
      { name: "title", type: "string", description: "标题" },
      { name: "body", type: "string", description: "正文内容" },
      { name: "actionLabel", type: "string", description: "动作按钮文字" },
    ],
  },
  {
    alias: "com-product-card",
    name: "商品卡片",
    kind: "component",
    description: "商品展示卡片，含图片、价格和加购按钮",
    props: [
      { name: "title", type: "string", description: "标题" },
      { name: "body", type: "string", description: "正文内容" },
      { name: "price", type: "string", description: "价格文字" },
      { name: "badgeLabel", type: "string", description: "角标文字" },
      { name: "actionLabel", type: "string", description: "动作按钮文字" },
      { name: "disabled", type: "boolean", description: "是否禁用" },
    ],
  },
  {
    alias: "com-bottom-tabs",
    name: "底部导航",
    kind: "component",
    description: "底部导航标签栏",
    props: [{ name: "activeTab", type: "string", description: "当前选中项" }],
  },
];

const SERVICE_COMPONENT_DESCRIPTORS = [
  {
    alias: "svc-text",
    name: "文本",
    kind: "component",
    description: "主题文本组件",
    props: [
      { name: "text", type: "string", required: true, description: "显示内容" },
      {
        name: "variant",
        type: "string",
        description: "样式类型",
        enum: [
          "display",
          "heading",
          "subheading",
          "body",
          "caption",
          "price",
          "overline",
          "eyebrow",
          "title",
          "subtitle",
        ],
      },
    ],
  },
  {
    alias: "svc-button",
    name: "按钮",
    kind: "component",
    description: "主题按钮",
    props: [
      {
        name: "label",
        type: "string",
        required: true,
        description: "显示文字",
      },
      {
        name: "variant",
        type: "string",
        description: "样式类型",
        enum: ["primary", "secondary", "link"],
      },
      { name: "disabled", type: "boolean", description: "是否禁用" },
    ],
  },
  {
    alias: "svc-tag",
    name: "标签",
    kind: "component",
    description: "状态标签",
    props: [
      {
        name: "label",
        type: "string",
        required: true,
        description: "显示文字",
      },
      {
        name: "tone",
        type: "string",
        description: "风格",
        enum: [
          "neutral",
          "success",
          "warning",
          "info",
          "hot",
          "new",
          "deal",
          "member",
        ],
      },
    ],
  },
  {
    alias: "svc-info-card",
    name: "信息卡片",
    kind: "component",
    description: "带标题和正文的信息卡片",
    props: [
      { name: "overline", type: "string", description: "眉标题" },
      { name: "title", type: "string", description: "标题" },
      { name: "body", type: "string", description: "正文内容" },
      {
        name: "tone",
        type: "string",
        description: "风格",
        enum: [
          "default",
          "accent",
          "promo",
          "member",
          "subtle",
          "highlight",
          "warm",
        ],
      },
    ],
  },
  {
    alias: "svc-action-card",
    name: "功能入口卡片",
    kind: "component",
    description: "服务功能入口卡片，含图标和说明",
    props: [
      { name: "title", type: "string", description: "标题" },
      { name: "subtitle", type: "string", description: "副标题" },
      { name: "caption", type: "string", description: "辅助说明" },
      { name: "iconColor", type: "string", description: "图标颜色" },
    ],
  },
  {
    alias: "svc-order-cell",
    name: "订单列表项",
    kind: "component",
    description: "订单记录列表项，含状态标签",
    props: [
      { name: "title", type: "string", description: "标题" },
      { name: "subtitle", type: "string", description: "副标题" },
      { name: "statusLabel", type: "string", description: "状态文字" },
    ],
  },
  {
    alias: "svc-section-header",
    name: "分组标题栏",
    kind: "component",
    description: "分区标题，含操作按钮",
    props: [
      { name: "title", type: "string", description: "标题" },
      { name: "actionLabel", type: "string", description: "动作按钮文字" },
    ],
  },
  {
    alias: "svc-bottom-bar",
    name: "底部导航栏",
    kind: "component",
    description: "底部导航标签栏",
    props: [{ name: "activeTab", type: "string", description: "当前选中项" }],
  },
];

export const TEMPLATE_SEED_DATA: TemplateSeedException[] = [
  {
    templateId: "commerce-market",
    name: "电商集市",
    tagline: "橙意盎然的购物体验",
    description:
      "适用于生鲜、快消等日常购物场景，暖橙色调搭配流畅的多页跳转，" +
      "支持商品展示、优惠信息和购物车结算。",
    accent: "#fa9d3b",
    platformCategories: ["mini-program", "mobile-app"],
    functionalCategories: ["commerce"],
    category: "commerce",
    traits: ["生鲜电商", "多页跳转", "暖橙色调", "促销信息"],
    tags: [
      "电商",
      "购物",
      "商城",
      "生鲜",
      "商品",
      "购物车",
      "促销",
      "订单",
      "会员",
    ],
    cssVars: {
      "--accent": "#fa9d3b",
      "--surface": "linear-gradient(180deg, #fff4e7 0%, #fffaf3 100%)",
      "--surface-muted": "rgba(255, 255, 255, 0.84)",
      "--panel-bg": "rgba(255, 255, 255, 0.96)",
      "--panel-border": "rgba(250, 157, 59, 0.14)",
      "--panel-accent": "rgba(250, 157, 59, 0.16)",
      "--panel-accent-border": "rgba(250, 157, 59, 0.24)",
      "--search-bg": "rgba(255, 255, 255, 0.9)",
      "--note-bg": "rgba(250, 157, 59, 0.14)",
      "--text-base": "#1c1107",
      "--radius-base": "0.9rem",
    },
    componentTemplates: {
      "com-text": {
        displayName: "文本",
        root: {
          alias: "core.text",
          props: {
            text: { $bind: "text" },
            variant: { $bind: "variant" },
          },
        },
      },
      "com-button": {
        displayName: "按钮",
        root: {
          alias: "core.button",
          props: {
            label: { $bind: "label" },
            variant: { $bind: "variant" },
            disabled: { $bind: "disabled" },
            onClick: { $bind: "onClick" },
          },
        },
      },
      "com-pill": {
        displayName: "分类胶囊",
        root: {
          alias: "core.button",
          props: {
            label: { $bind: "label" },
            variant: "pill",
            active: { $bind: "active" },
            disabled: { $bind: "disabled" },
            onClick: { $bind: "onClick" },
          },
        },
      },
      "com-tag": {
        displayName: "标签",
        root: {
          alias: "core.tag",
          props: {
            label: { $bind: "label" },
            tone: { $bind: "tone" },
            onClick: { $bind: "onClick" },
          },
        },
      },
      "com-info-card": {
        displayName: "信息卡片",
        root: {
          alias: "core.panel",
          props: { tone: { $bind: "tone" }, gap: 8 },
          children: [
            {
              alias: "core.text",
              props: { text: { $bind: "overline" }, variant: "eyebrow" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "title" }, variant: "title" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "body" }, variant: "body" },
            },
          ],
        },
      },
      "com-promo-card": {
        displayName: "促销横幅",
        root: {
          alias: "core.panel",
          props: { tone: "promo", gap: 10 },
          children: [
            {
              alias: "core.text",
              props: { text: { $bind: "overline" }, variant: "eyebrow" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "title" }, variant: "heading" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "body" }, variant: "body" },
            },
            {
              alias: "core.button",
              props: {
                label: { $bind: "actionLabel" },
                variant: "primary",
                onClick: { $bind: "onActionClick" },
              },
            },
          ],
        },
      },
      "com-product-card": {
        displayName: "商品卡片",
        root: {
          alias: "core.panel",
          props: { gap: 8 },
          children: [
            { alias: "core.image", props: {} },
            {
              alias: "core.tag",
              props: { label: { $bind: "badgeLabel" }, tone: "hot" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "title" }, variant: "title" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "body" }, variant: "body" },
            },
            {
              alias: "core.row",
              props: { gap: 8, justify: "space-between", align: "center" },
              children: [
                {
                  alias: "core.text",
                  props: { text: { $bind: "price" }, variant: "price" },
                },
                {
                  alias: "core.button",
                  props: {
                    label: { $bind: "actionLabel" },
                    variant: "primary",
                    disabled: { $bind: "disabled" },
                    onClick: { $bind: "onActionClick" },
                  },
                },
              ],
            },
          ],
        },
      },
      "com-bottom-tabs": {
        displayName: "底部导航",
        root: {
          alias: "core.tabs",
          props: {
            tabs: ["首页", "分类", "购物车", "我的"],
            activeTab: { $bind: "activeTab" },
            onTabClick: { $bind: "onTabClick" },
          },
        },
      },
    },
    layoutDocument: {
      version: 2,
      themeId: "commerce-market",
      themeName: "电商集市",
      description: "电商类主题的多页布局模板。",
      defaultPageId: "commerce-home",
      components: [
        ...CORE_COMPONENT_DESCRIPTORS,
        ...COMMERCE_COMPONENT_DESCRIPTORS,
      ],
      pages: [
        {
          id: "commerce-home",
          name: "每日集市",
          layout: {
            id: "commerce-home-screen",
            alias: "core.screen",
            layout: { mode: "flow", width: "100%", minHeight: "100%" },
            props: {
              title: "每日集市",
              statusTime: "9:41",
              headerActionLabel: "会员专享",
            },
            children: [
              {
                id: "commerce-home-promo",
                alias: "core.panel",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tone: "promo", gap: 10 },
                interactions: {
                  onClick: { type: "navigate", targetPageId: "commerce-deals" },
                },
                children: [
                  {
                    id: "commerce-home-promo-overline",
                    alias: "core.text",
                    layout: { mode: "flow", order: 1, width: "100%" },
                    props: { text: "今日必抢", variant: "eyebrow" },
                  },
                  {
                    id: "commerce-home-promo-title",
                    alias: "core.text",
                    layout: { mode: "flow", order: 2, width: "100%" },
                    props: { text: "晚餐食材 1 小时达", variant: "heading" },
                  },
                  {
                    id: "commerce-home-promo-body",
                    alias: "core.text",
                    layout: { mode: "flow", order: 3, width: "100%" },
                    props: { text: "新鲜直达，满 79 减 18，限时活动今天结束。", variant: "body" },
                  },
                  {
                    id: "commerce-home-promo-action",
                    alias: "core.button",
                    layout: { mode: "flow", order: 4 },
                    props: { label: "去加购", variant: "primary" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-cart",
                      },
                    },
                  },
                ],
              },
              {
                id: "commerce-home-search",
                alias: "core.search",
                layout: { mode: "flow", order: 2, width: "100%" },
                props: { placeholder: "搜索生鲜百货、居家用品" },
              },
              {
                id: "commerce-home-categories",
                alias: "core.row",
                layout: { mode: "flow", order: 3, width: "100%" },
                props: { gap: 8, wrap: true },
                children: [
                  {
                    id: "commerce-home-pill-recommend",
                    alias: "core.button",
                    layout: { mode: "flow", order: 1 },
                    props: { label: "推荐", variant: "pill", active: true },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-home",
                      },
                    },
                  },
                  {
                    id: "commerce-home-pill-fresh",
                    alias: "core.button",
                    layout: { mode: "flow", order: 2 },
                    props: { label: "生鲜", variant: "pill" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-deals",
                      },
                    },
                  },
                  {
                    id: "commerce-home-pill-snacks",
                    alias: "core.button",
                    layout: { mode: "flow", order: 3 },
                    props: { label: "零食", variant: "pill" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-deals",
                      },
                    },
                  },
                  {
                    id: "commerce-home-pill-beauty",
                    alias: "core.button",
                    layout: { mode: "flow", order: 4 },
                    props: { label: "美妆", variant: "pill", disabled: true },
                  },
                ],
              },
              {
                id: "commerce-home-feature-grid",
                alias: "core.grid",
                layout: { mode: "flow", order: 4, width: "100%" },
                props: { columns: 2, gap: 12 },
                children: [
                  {
                    id: "commerce-home-feature-deals",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 1,
                      gridColumn: "1",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { tone: "promo", gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-deals",
                      },
                    },
                    children: [
                      {
                        id: "commerce-home-feature-deals-overline",
                        alias: "core.text",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { text: "限时秒杀", variant: "eyebrow" },
                      },
                      {
                        id: "commerce-home-feature-deals-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "分类会场", variant: "title" },
                      },
                      {
                        id: "commerce-home-feature-deals-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "点击进入活动分发页。", variant: "body" },
                      },
                    ],
                  },
                  {
                    id: "commerce-home-feature-cart",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 2,
                      gridColumn: "2",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { tone: "member", gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-cart",
                      },
                    },
                    children: [
                      {
                        id: "commerce-home-feature-cart-overline",
                        alias: "core.text",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { text: "购物车", variant: "eyebrow" },
                      },
                      {
                        id: "commerce-home-feature-cart-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "3 件待结算", variant: "title" },
                      },
                      {
                        id: "commerce-home-feature-cart-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "查看购物车页。", variant: "body" },
                      },
                    ],
                  },
                ],
              },
              {
                id: "commerce-home-products",
                alias: "core.grid",
                layout: { mode: "flow", order: 5, width: "100%" },
                props: { columns: 2, gap: 12 },
                children: [
                  {
                    id: "commerce-home-product-1",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 1,
                      gridColumn: "1",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-deals",
                      },
                    },
                    children: [
                      {
                        id: "commerce-home-product-1-image",
                        alias: "core.image",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: {},
                      },
                      {
                        id: "commerce-home-product-1-badge",
                        alias: "core.tag",
                        layout: { mode: "flow", order: 2 },
                        props: { label: "热卖", tone: "hot" },
                      },
                      {
                        id: "commerce-home-product-1-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "茉莉酸奶", variant: "title" },
                      },
                      {
                        id: "commerce-home-product-1-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 4, width: "100%" },
                        props: { text: "12 杯装 冷链次日达", variant: "body" },
                      },
                      {
                        id: "commerce-home-product-1-price-row",
                        alias: "core.row",
                        layout: { mode: "flow", order: 5, width: "100%" },
                        props: { gap: 8, justify: "space-between", align: "center" },
                        children: [
                          {
                            id: "commerce-home-product-1-price",
                            alias: "core.text",
                            layout: { mode: "flow", order: 1 },
                            props: { text: "¥8.90", variant: "price" },
                          },
                          {
                            id: "commerce-home-product-1-action",
                            alias: "core.button",
                            layout: { mode: "flow", order: 2 },
                            props: { label: "加购", variant: "primary" },
                            interactions: {
                              onClick: {
                                type: "navigate",
                                targetPageId: "commerce-cart",
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: "commerce-home-product-2",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 2,
                      gridColumn: "2",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-deals",
                      },
                    },
                    children: [
                      {
                        id: "commerce-home-product-2-image",
                        alias: "core.image",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: {},
                      },
                      {
                        id: "commerce-home-product-2-badge",
                        alias: "core.tag",
                        layout: { mode: "flow", order: 2 },
                        props: { label: "特惠", tone: "hot" },
                      },
                      {
                        id: "commerce-home-product-2-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "抹茶威化卷", variant: "title" },
                      },
                      {
                        id: "commerce-home-product-2-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 4, width: "100%" },
                        props: { text: "会员专享组合装", variant: "body" },
                      },
                      {
                        id: "commerce-home-product-2-price-row",
                        alias: "core.row",
                        layout: { mode: "flow", order: 5, width: "100%" },
                        props: { gap: 8, justify: "space-between", align: "center" },
                        children: [
                          {
                            id: "commerce-home-product-2-price",
                            alias: "core.text",
                            layout: { mode: "flow", order: 1 },
                            props: { text: "¥6.80", variant: "price" },
                          },
                          {
                            id: "commerce-home-product-2-action",
                            alias: "core.button",
                            layout: { mode: "flow", order: 2 },
                            props: { label: "加购", variant: "primary" },
                            interactions: {
                              onClick: {
                                type: "navigate",
                                targetPageId: "commerce-cart",
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: "commerce-home-footer",
                alias: "core.tabs",
                slot: "footer",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tabs: ["首页", "分类", "购物车", "我的"], activeTab: "首页" },
                interactions: {
                  onTabClick: {
                    首页: { type: "navigate", targetPageId: "commerce-home" },
                    分类: { type: "navigate", targetPageId: "commerce-deals" },
                    购物车: { type: "navigate", targetPageId: "commerce-cart" },
                  },
                },
              },
            ],
          },
        },
        {
          id: "commerce-deals",
          name: "分类会场",
          layout: {
            id: "commerce-deals-screen",
            alias: "core.screen",
            layout: { mode: "flow", width: "100%", minHeight: "100%" },
            props: {
              title: "分类会场",
              statusTime: "9:41",
              headerActionLabel: "限时活动",
            },
            children: [
              {
                id: "commerce-deals-nav",
                alias: "core.row",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { gap: 10, justify: "space-between", align: "center" },
                children: [
                  {
                    id: "commerce-deals-back-home",
                    alias: "core.button",
                    layout: { mode: "flow", order: 1 },
                    props: { variant: "secondary", label: "返回首页" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-home",
                      },
                    },
                  },
                  {
                    id: "commerce-deals-go-cart",
                    alias: "core.tag",
                    layout: { mode: "flow", order: 2 },
                    props: { label: "去购物车", tone: "deal" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-cart",
                      },
                    },
                  },
                ],
              },
              {
                id: "commerce-deals-hero",
                alias: "core.panel",
                layout: { mode: "flow", order: 2, width: "100%" },
                props: { tone: "promo", gap: 10 },
                children: [
                  {
                    id: "commerce-deals-hero-overline",
                    alias: "core.text",
                    layout: { mode: "flow", order: 1, width: "100%" },
                    props: { text: "今晚加餐", variant: "eyebrow" },
                  },
                  {
                    id: "commerce-deals-hero-title",
                    alias: "core.text",
                    layout: { mode: "flow", order: 2, width: "100%" },
                    props: { text: "满 79 元减 18 元", variant: "heading" },
                  },
                  {
                    id: "commerce-deals-hero-body",
                    alias: "core.text",
                    layout: { mode: "flow", order: 3, width: "100%" },
                    props: { text: "活动限时，点击直接去结算。", variant: "body" },
                  },
                  {
                    id: "commerce-deals-hero-action",
                    alias: "core.button",
                    layout: { mode: "flow", order: 4 },
                    props: { label: "去结算", variant: "primary" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-cart",
                      },
                    },
                  },
                ],
              },
              {
                id: "commerce-deals-grid",
                alias: "core.grid",
                layout: { mode: "flow", order: 3, width: "100%" },
                props: { columns: 2, gap: 12 },
                children: [
                  {
                    id: "commerce-deals-info-1",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 1,
                      gridColumn: "1",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { tone: "member", gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-cart",
                      },
                    },
                    children: [
                      {
                        id: "commerce-deals-info-1-overline",
                        alias: "core.text",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { text: "会员加价购", variant: "eyebrow" },
                      },
                      {
                        id: "commerce-deals-info-1-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "2 张券待使用", variant: "title" },
                      },
                      {
                        id: "commerce-deals-info-1-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "去购物车查看优惠。", variant: "body" },
                      },
                    ],
                  },
                  {
                    id: "commerce-deals-info-2",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 2,
                      gridColumn: "2",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { tone: "subtle", gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-home",
                      },
                    },
                    children: [
                      {
                        id: "commerce-deals-info-2-overline",
                        alias: "core.text",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { text: "回到首页", variant: "eyebrow" },
                      },
                      {
                        id: "commerce-deals-info-2-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "继续逛新品", variant: "title" },
                      },
                      {
                        id: "commerce-deals-info-2-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "保持在同一主题里。", variant: "body" },
                      },
                    ],
                  },
                ],
              },
              {
                id: "commerce-deals-footer",
                alias: "core.tabs",
                slot: "footer",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tabs: ["首页", "分类", "购物车", "我的"], activeTab: "分类" },
                interactions: {
                  onTabClick: {
                    首页: { type: "navigate", targetPageId: "commerce-home" },
                    分类: { type: "navigate", targetPageId: "commerce-deals" },
                    购物车: { type: "navigate", targetPageId: "commerce-cart" },
                  },
                },
              },
            ],
          },
        },
        {
          id: "commerce-cart",
          name: "购物车",
          layout: {
            id: "commerce-cart-screen",
            alias: "core.screen",
            layout: { mode: "flow", width: "100%", minHeight: "100%" },
            props: {
              title: "购物车",
              statusTime: "9:41",
              headerActionLabel: "满减已生效",
            },
            children: [
              {
                id: "commerce-cart-summary",
                alias: "core.panel",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tone: "accent", gap: 12 },
                children: [
                  {
                    id: "commerce-cart-overline",
                    alias: "core.text",
                    layout: { mode: "flow", order: 1, width: "100%" },
                    props: { variant: "overline", text: "待结算商品" },
                  },
                  {
                    id: "commerce-cart-title",
                    alias: "core.text",
                    layout: { mode: "flow", order: 2, width: "100%" },
                    props: { variant: "heading", text: "3 件商品已加入购物车" },
                  },
                  {
                    id: "commerce-cart-body",
                    alias: "core.text",
                    layout: { mode: "flow", order: 3, width: "100%" },
                    props: {
                      variant: "body",
                      text: "满减活动已生效，现在结算可节省 18 元。",
                    },
                  },
                ],
              },
              {
                id: "commerce-cart-items",
                alias: "core.stack",
                layout: { mode: "flow", order: 2, width: "100%" },
                props: { gap: 12 },
                children: [
                  {
                    id: "commerce-cart-item-1",
                    alias: "core.panel",
                    layout: { mode: "flow", order: 1, width: "100%" },
                    props: { tone: "promo", gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-deals",
                      },
                    },
                    children: [
                      {
                        id: "commerce-cart-item-1-overline",
                        alias: "core.text",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { text: "茉莉酸奶", variant: "eyebrow" },
                      },
                      {
                        id: "commerce-cart-item-1-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "12 杯装 已勾选", variant: "title" },
                      },
                      {
                        id: "commerce-cart-item-1-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "冷链次日达，今晚 20:00 前送达。", variant: "body" },
                      },
                    ],
                  },
                  {
                    id: "commerce-cart-item-2",
                    alias: "core.panel",
                    layout: { mode: "flow", order: 2, width: "100%" },
                    props: { tone: "subtle", gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-deals",
                      },
                    },
                    children: [
                      {
                        id: "commerce-cart-item-2-overline",
                        alias: "core.text",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { text: "空气炸锅纸", variant: "eyebrow" },
                      },
                      {
                        id: "commerce-cart-item-2-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "2 件组合装", variant: "title" },
                      },
                      {
                        id: "commerce-cart-item-2-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "满减商品，继续凑单。", variant: "body" },
                      },
                    ],
                  },
                ],
              },
              {
                id: "commerce-cart-actions",
                alias: "core.row",
                layout: { mode: "flow", order: 3, width: "100%" },
                props: {
                  gap: 10,
                  justify: "space-between",
                  align: "center",
                  tone: "soft",
                },
                children: [
                  {
                    id: "commerce-cart-continue",
                    alias: "core.button",
                    layout: { mode: "flow", order: 1 },
                    props: { variant: "secondary", label: "继续凑单" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-deals",
                      },
                    },
                  },
                  {
                    id: "commerce-cart-home",
                    alias: "core.button",
                    layout: { mode: "flow", order: 2 },
                    props: { variant: "primary", label: "去结算" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "commerce-home",
                      },
                    },
                  },
                ],
              },
              {
                id: "commerce-cart-footer",
                alias: "core.tabs",
                slot: "footer",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tabs: ["首页", "分类", "购物车", "我的"], activeTab: "购物车" },
                interactions: {
                  onTabClick: {
                    首页: { type: "navigate", targetPageId: "commerce-home" },
                    分类: { type: "navigate", targetPageId: "commerce-deals" },
                    购物车: { type: "navigate", targetPageId: "commerce-cart" },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
  {
    templateId: "service-center",
    name: "服务中心",
    tagline: "清晰高效的服务入口",
    description:
      "适用于生活服务、政务便民等场景，绿色基调搭配清晰的功能入口，" +
      "支持服务列表、订单追踪和会员管理。",
    accent: "#07c160",
    platformCategories: ["mini-program", "mobile-app"],
    functionalCategories: ["service"],
    category: "service",
    traits: ["服务入口", "订单追踪", "绿色基调", "功能分区"],
    tags: [
      "生活服务",
      "预约",
      "订单",
      "家政",
      "维修",
      "会员",
      "服务中心",
      "缴费",
    ],
    cssVars: {
      "--accent": "#07c160",
      "--surface": "linear-gradient(180deg, #eefaf2 0%, #f7fbf8 100%)",
      "--surface-muted": "rgba(255, 255, 255, 0.82)",
      "--panel-bg": "rgba(255, 255, 255, 0.96)",
      "--panel-border": "rgba(7, 193, 96, 0.12)",
      "--panel-accent": "rgba(7, 193, 96, 0.14)",
      "--panel-accent-border": "rgba(7, 193, 96, 0.22)",
      "--search-bg": "rgba(255, 255, 255, 0.88)",
      "--note-bg": "rgba(7, 193, 96, 0.12)",
      "--text-base": "#071c0f",
      "--radius-base": "1rem",
    },
    componentTemplates: {
      "svc-text": {
        displayName: "文本",
        root: {
          alias: "core.text",
          props: { text: { $bind: "text" }, variant: { $bind: "variant" } },
        },
      },
      "svc-button": {
        displayName: "按钮",
        root: {
          alias: "core.button",
          props: {
            label: { $bind: "label" },
            variant: { $bind: "variant" },
            disabled: { $bind: "disabled" },
            onClick: { $bind: "onClick" },
          },
        },
      },
      "svc-tag": {
        displayName: "标签",
        root: {
          alias: "core.tag",
          props: {
            label: { $bind: "label" },
            tone: { $bind: "tone" },
            onClick: { $bind: "onClick" },
          },
        },
      },
      "svc-info-card": {
        displayName: "信息卡片",
        root: {
          alias: "core.panel",
          props: { tone: { $bind: "tone" }, gap: 8 },
          children: [
            {
              alias: "core.text",
              props: { text: { $bind: "overline" }, variant: "eyebrow" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "title" }, variant: "title" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "body" }, variant: "body" },
            },
          ],
        },
      },
      "svc-action-card": {
        displayName: "功能入口卡片",
        root: {
          alias: "core.panel",
          props: { gap: 8 },
          children: [
            {
              alias: "core.image",
              props: { iconColor: { $bind: "iconColor" } },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "title" }, variant: "title" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "subtitle" }, variant: "body" },
            },
            {
              alias: "core.text",
              props: { text: { $bind: "caption" }, variant: "caption" },
            },
          ],
        },
      },
      "svc-order-cell": {
        displayName: "订单列表项",
        root: {
          alias: "core.row",
          props: { gap: 12, justify: "space-between", align: "center" },
          children: [
            {
              alias: "core.stack",
              props: { gap: 4 },
              children: [
                {
                  alias: "core.text",
                  props: { text: { $bind: "title" }, variant: "title" },
                },
                {
                  alias: "core.text",
                  props: { text: { $bind: "subtitle" }, variant: "body" },
                },
              ],
            },
            {
              alias: "core.tag",
              props: { label: { $bind: "statusLabel" }, tone: "success" },
            },
          ],
        },
      },
      "svc-section-header": {
        displayName: "分组标题栏",
        root: {
          alias: "core.row",
          props: { gap: 12, justify: "space-between", align: "center" },
          children: [
            {
              alias: "core.text",
              props: { text: { $bind: "title" }, variant: "subtitle" },
            },
            {
              alias: "core.button",
              props: {
                label: { $bind: "actionLabel" },
                variant: "link",
                onClick: { $bind: "onActionClick" },
              },
            },
          ],
        },
      },
      "svc-bottom-bar": {
        displayName: "底部导航栏",
        root: {
          alias: "core.tabs",
          props: {
            tabs: ["首页", "订单", "会员", "我的"],
            activeTab: { $bind: "activeTab" },
            onTabClick: { $bind: "onTabClick" },
          },
        },
      },
    },
    layoutDocument: {
      version: 2,
      themeId: "service-center",
      themeName: "服务中心",
      description: "服务类主题的多页布局模板。",
      defaultPageId: "service-home",
      components: [
        ...CORE_COMPONENT_DESCRIPTORS,
        ...SERVICE_COMPONENT_DESCRIPTORS,
      ],
      pages: [
        {
          id: "service-home",
          name: "服务首页",
          layout: {
            id: "service-home-screen",
            alias: "core.screen",
            layout: { mode: "flow", width: "100%", minHeight: "100%" },
            props: { title: "服务中心", statusTime: "9:41" },
            children: [
              {
                id: "service-home-notice",
                alias: "core.notice",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: {
                  text: "点击卡片或操作按钮即可在首页、订单页和会员页之间切换。",
                },
              },
              {
                id: "service-home-search",
                alias: "core.search",
                layout: { mode: "flow", order: 2, width: "100%" },
                props: { placeholder: "搜索服务、查询订单、联系客服" },
              },
              {
                id: "service-home-hero",
                alias: "core.panel",
                layout: { mode: "flow", order: 3, width: "100%" },
                props: { tone: "accent", gap: 12 },
                children: [
                  {
                    id: "service-home-hero-eyebrow",
                    alias: "core.text",
                    layout: { mode: "flow", order: 1, width: "100%" },
                    props: { variant: "eyebrow", text: "欢迎使用" },
                  },
                  {
                    id: "service-home-hero-title",
                    alias: "core.text",
                    layout: { mode: "flow", order: 2, width: "100%" },
                    props: { variant: "heading", text: "一站式生活服务平台" },
                  },
                  {
                    id: "service-home-hero-body",
                    alias: "core.text",
                    layout: { mode: "flow", order: 3, width: "100%" },
                    props: {
                      variant: "body",
                      text: "缴费、维修、预约、查订单，全部集中管理。",
                    },
                  },
                  {
                    id: "service-home-hero-btn",
                    alias: "core.button",
                    layout: { mode: "flow", order: 4 },
                    props: { variant: "primary", label: "查看我的订单" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-orders",
                      },
                    },
                  },
                ],
              },
              {
                id: "service-home-actions",
                alias: "core.grid",
                layout: { mode: "flow", order: 4, width: "100%" },
                props: { columns: 2, gap: 12 },
                children: [
                  {
                    id: "service-home-action-repair",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 1,
                      gridColumn: "1",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-orders",
                      },
                    },
                    children: [
                      {
                        id: "service-home-action-repair-image",
                        alias: "core.image",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { iconColor: "#fa9d3b" },
                      },
                      {
                        id: "service-home-action-repair-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "家电维修", variant: "title" },
                      },
                      {
                        id: "service-home-action-repair-subtitle",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "上门维修，1 小时内响应", variant: "body" },
                      },
                      {
                        id: "service-home-action-repair-caption",
                        alias: "core.text",
                        layout: { mode: "flow", order: 4, width: "100%" },
                        props: { text: "已服务 2.4 万次", variant: "caption" },
                      },
                    ],
                  },
                  {
                    id: "service-home-action-pay",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 2,
                      gridColumn: "2",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-member",
                      },
                    },
                    children: [
                      {
                        id: "service-home-action-pay-image",
                        alias: "core.image",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { iconColor: "#07c160" },
                      },
                      {
                        id: "service-home-action-pay-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "水电缴费", variant: "title" },
                      },
                      {
                        id: "service-home-action-pay-subtitle",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "支持多户头批量缴费", variant: "body" },
                      },
                      {
                        id: "service-home-action-pay-caption",
                        alias: "core.text",
                        layout: { mode: "flow", order: 4, width: "100%" },
                        props: { text: "已缴费 6.1 万次", variant: "caption" },
                      },
                    ],
                  },
                  {
                    id: "service-home-action-book",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 3,
                      gridColumn: "1",
                      gridRow: "2",
                      width: "100%",
                    },
                    props: { gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-orders",
                      },
                    },
                    children: [
                      {
                        id: "service-home-action-book-image",
                        alias: "core.image",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { iconColor: "#1890ff" },
                      },
                      {
                        id: "service-home-action-book-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "预约上门", variant: "title" },
                      },
                      {
                        id: "service-home-action-book-subtitle",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "保洁、搬家、安装", variant: "body" },
                      },
                      {
                        id: "service-home-action-book-caption",
                        alias: "core.text",
                        layout: { mode: "flow", order: 4, width: "100%" },
                        props: { text: "评分 4.9 分", variant: "caption" },
                      },
                    ],
                  },
                  {
                    id: "service-home-action-member",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 4,
                      gridColumn: "2",
                      gridRow: "2",
                      width: "100%",
                    },
                    props: { gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-member",
                      },
                    },
                    children: [
                      {
                        id: "service-home-action-member-image",
                        alias: "core.image",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { iconColor: "#722ed1" },
                      },
                      {
                        id: "service-home-action-member-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "会员中心", variant: "title" },
                      },
                      {
                        id: "service-home-action-member-subtitle",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "专属折扣和优先响应", variant: "body" },
                      },
                      {
                        id: "service-home-action-member-caption",
                        alias: "core.text",
                        layout: { mode: "flow", order: 4, width: "100%" },
                        props: { text: "查看权益详情", variant: "caption" },
                      },
                    ],
                  },
                ],
              },
              {
                id: "service-home-footer",
                alias: "core.tabs",
                slot: "footer",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tabs: ["首页", "订单", "会员", "我的"], activeTab: "首页" },
                interactions: {
                  onTabClick: {
                    首页: { type: "navigate", targetPageId: "service-home" },
                    订单: { type: "navigate", targetPageId: "service-orders" },
                    会员: { type: "navigate", targetPageId: "service-member" },
                  },
                },
              },
            ],
          },
        },
        {
          id: "service-orders",
          name: "我的订单",
          layout: {
            id: "service-orders-screen",
            alias: "core.screen",
            layout: { mode: "flow", width: "100%", minHeight: "100%" },
            props: { title: "我的订单", statusTime: "9:41" },
            children: [
              {
                id: "service-orders-header",
                alias: "core.row",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { gap: 12, justify: "space-between", align: "center" },
                children: [
                  {
                    id: "service-orders-header-title",
                    alias: "core.text",
                    layout: { mode: "flow", order: 1 },
                    props: { text: "近期订单", variant: "subtitle" },
                  },
                  {
                    id: "service-orders-header-action",
                    alias: "core.button",
                    layout: { mode: "flow", order: 2 },
                    props: { label: "查看全部", variant: "link" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-home",
                      },
                    },
                  },
                ],
              },
              {
                id: "service-orders-panel",
                alias: "core.panel",
                layout: { mode: "flow", order: 2, width: "100%" },
                props: { gap: 0 },
                children: [
                  {
                    id: "service-orders-order-1",
                    alias: "core.row",
                    layout: { mode: "flow", order: 1, width: "100%" },
                    props: { gap: 12, justify: "space-between", align: "center" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-home",
                      },
                    },
                    children: [
                      {
                        id: "service-orders-order-1-info",
                        alias: "core.stack",
                        layout: { mode: "flow", order: 1 },
                        props: { gap: 4 },
                        children: [
                          {
                            id: "service-orders-order-1-info-title",
                            alias: "core.text",
                            layout: { mode: "flow", order: 1 },
                            props: { text: "家电维修 - 洗衣机", variant: "title" },
                          },
                          {
                            id: "service-orders-order-1-info-subtitle",
                            alias: "core.text",
                            layout: { mode: "flow", order: 2 },
                            props: { text: "已安排技师，今晚 18:00 上门", variant: "body" },
                          },
                        ],
                      },
                      {
                        id: "service-orders-order-1-status",
                        alias: "core.tag",
                        layout: { mode: "flow", order: 2 },
                        props: { label: "待上门", tone: "success" },
                      },
                    ],
                  },
                  {
                    id: "service-orders-order-2",
                    alias: "core.row",
                    layout: { mode: "flow", order: 2, width: "100%" },
                    props: { gap: 12, justify: "space-between", align: "center" },
                    children: [
                      {
                        id: "service-orders-order-2-info",
                        alias: "core.stack",
                        layout: { mode: "flow", order: 1 },
                        props: { gap: 4 },
                        children: [
                          {
                            id: "service-orders-order-2-info-title",
                            alias: "core.text",
                            layout: { mode: "flow", order: 1 },
                            props: { text: "水电缴费 - 电费", variant: "title" },
                          },
                          {
                            id: "service-orders-order-2-info-subtitle",
                            alias: "core.text",
                            layout: { mode: "flow", order: 2 },
                            props: { text: "已缴 ¥142.50，本月账期", variant: "body" },
                          },
                        ],
                      },
                      {
                        id: "service-orders-order-2-status",
                        alias: "core.tag",
                        layout: { mode: "flow", order: 2 },
                        props: { label: "已完成", tone: "success" },
                      },
                    ],
                  },
                  {
                    id: "service-orders-order-3",
                    alias: "core.row",
                    layout: { mode: "flow", order: 3, width: "100%" },
                    props: { gap: 12, justify: "space-between", align: "center" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-home",
                      },
                    },
                    children: [
                      {
                        id: "service-orders-order-3-info",
                        alias: "core.stack",
                        layout: { mode: "flow", order: 1 },
                        props: { gap: 4 },
                        children: [
                          {
                            id: "service-orders-order-3-info-title",
                            alias: "core.text",
                            layout: { mode: "flow", order: 1 },
                            props: { text: "预约保洁 - 全屋清洁", variant: "title" },
                          },
                          {
                            id: "service-orders-order-3-info-subtitle",
                            alias: "core.text",
                            layout: { mode: "flow", order: 2 },
                            props: { text: "等待确认服务员上门时间", variant: "body" },
                          },
                        ],
                      },
                      {
                        id: "service-orders-order-3-status",
                        alias: "core.tag",
                        layout: { mode: "flow", order: 2 },
                        props: { label: "待确认", tone: "success" },
                      },
                    ],
                  },
                ],
              },
              {
                id: "service-orders-tags",
                alias: "core.row",
                layout: { mode: "flow", order: 3, width: "100%" },
                props: { gap: 8, wrap: true },
                children: [
                  {
                    id: "service-orders-tag-pending",
                    alias: "core.tag",
                    layout: { mode: "flow", order: 1 },
                    props: { label: "待处理", tone: "warning" },
                  },
                  {
                    id: "service-orders-tag-done",
                    alias: "core.tag",
                    layout: { mode: "flow", order: 2 },
                    props: { label: "已完成", tone: "success" },
                  },
                  {
                    id: "service-orders-tag-info",
                    alias: "core.tag",
                    layout: { mode: "flow", order: 3 },
                    props: { label: "待确认", tone: "info" },
                  },
                ],
              },
              {
                id: "service-orders-footer",
                alias: "core.tabs",
                slot: "footer",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tabs: ["首页", "订单", "会员", "我的"], activeTab: "订单" },
                interactions: {
                  onTabClick: {
                    首页: { type: "navigate", targetPageId: "service-home" },
                    订单: { type: "navigate", targetPageId: "service-orders" },
                    会员: { type: "navigate", targetPageId: "service-member" },
                  },
                },
              },
            ],
          },
        },
        {
          id: "service-member",
          name: "会员中心",
          layout: {
            id: "service-member-screen",
            alias: "core.screen",
            layout: { mode: "flow", width: "100%", minHeight: "100%" },
            props: { title: "会员中心", statusTime: "9:41" },
            children: [
              {
                id: "service-member-hero",
                alias: "core.panel",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tone: "highlight", gap: 8 },
                children: [
                  {
                    id: "service-member-hero-overline",
                    alias: "core.text",
                    layout: { mode: "flow", order: 1, width: "100%" },
                    props: { text: "尊享会员", variant: "eyebrow" },
                  },
                  {
                    id: "service-member-hero-title",
                    alias: "core.text",
                    layout: { mode: "flow", order: 2, width: "100%" },
                    props: { text: "黄金会员 · 本月已省 ¥86", variant: "title" },
                  },
                  {
                    id: "service-member-hero-body",
                    alias: "core.text",
                    layout: { mode: "flow", order: 3, width: "100%" },
                    props: { text: "专属折扣、优先调度、无限免费上门评估，一卡在手服务无忧。", variant: "body" },
                  },
                ],
              },
              {
                id: "service-member-perks",
                alias: "core.grid",
                layout: { mode: "flow", order: 2, width: "100%" },
                props: { columns: 2, gap: 12 },
                children: [
                  {
                    id: "service-member-perk-1",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 1,
                      gridColumn: "1",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { tone: "subtle", gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-home",
                      },
                    },
                    children: [
                      {
                        id: "service-member-perk-1-overline",
                        alias: "core.text",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { text: "优先响应", variant: "eyebrow" },
                      },
                      {
                        id: "service-member-perk-1-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "30 分钟内派单", variant: "title" },
                      },
                      {
                        id: "service-member-perk-1-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "会员订单加急处理。", variant: "body" },
                      },
                    ],
                  },
                  {
                    id: "service-member-perk-2",
                    alias: "core.panel",
                    layout: {
                      mode: "grid",
                      order: 2,
                      gridColumn: "2",
                      gridRow: "1",
                      width: "100%",
                    },
                    props: { tone: "warm", gap: 8 },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-orders",
                      },
                    },
                    children: [
                      {
                        id: "service-member-perk-2-overline",
                        alias: "core.text",
                        layout: { mode: "flow", order: 1, width: "100%" },
                        props: { text: "专属折扣", variant: "eyebrow" },
                      },
                      {
                        id: "service-member-perk-2-title",
                        alias: "core.text",
                        layout: { mode: "flow", order: 2, width: "100%" },
                        props: { text: "服务立享 8 折", variant: "title" },
                      },
                      {
                        id: "service-member-perk-2-body",
                        alias: "core.text",
                        layout: { mode: "flow", order: 3, width: "100%" },
                        props: { text: "所有维修保洁均适用。", variant: "body" },
                      },
                    ],
                  },
                ],
              },
              {
                id: "service-member-actions",
                alias: "core.row",
                layout: { mode: "flow", order: 3, width: "100%" },
                props: { gap: 12, justify: "space-between", align: "center" },
                children: [
                  {
                    id: "service-member-btn-orders",
                    alias: "core.button",
                    layout: { mode: "flow", order: 1 },
                    props: { variant: "secondary", label: "查看订单" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-orders",
                      },
                    },
                  },
                  {
                    id: "service-member-btn-home",
                    alias: "core.button",
                    layout: { mode: "flow", order: 2 },
                    props: { variant: "primary", label: "预约服务" },
                    interactions: {
                      onClick: {
                        type: "navigate",
                        targetPageId: "service-home",
                      },
                    },
                  },
                ],
              },
              {
                id: "service-member-footer",
                alias: "core.tabs",
                slot: "footer",
                layout: { mode: "flow", order: 1, width: "100%" },
                props: { tabs: ["首页", "订单", "会员", "我的"], activeTab: "会员" },
                interactions: {
                  onTabClick: {
                    首页: { type: "navigate", targetPageId: "service-home" },
                    订单: { type: "navigate", targetPageId: "service-orders" },
                    会员: { type: "navigate", targetPageId: "service-member" },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
];
