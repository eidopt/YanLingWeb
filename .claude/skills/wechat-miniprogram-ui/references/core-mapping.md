# core.\* 组件与小程序 UI 映射指南

本文件详细说明如何将小程序 UI 设计映射到 `ThemeLayoutDocument` 的 `core.*` 组件系统。
生成 ThemeLayoutDocument JSON 时**必须先读取本文件**。

## 目录

1. [组件速查表](#组件速查表)
2. [布局模式](#布局模式)
3. [类型模板示例](#类型模板示例)
4. [常见 UI 模式映射](#常见-ui-模式映射)
5. [style 与 cssVars](#style-与-cssvars)

---

## 组件速查表

### 容器组件（可有 children）— 18 个

| 别名             | 用途          | 核心 props                                                               |
| ---------------- | ------------- | ------------------------------------------------------------------------ |
| `core.screen`    | 页面根容器    | `title`, `statusTime`, `headerActionLabel`                               |
| `core.panel`     | 卡片/面板     | `tone` (default/accent/promo/warm/soft/member/highlight), `gap`, `title` |
| `core.stack`     | 垂直流式容器  | `gap`, `alignItems`                                                      |
| `core.row`       | 水平流式容器  | `gap`, `wrap`, `justify`, `align`, `tone`                                |
| `core.grid`      | CSS Grid 容器 | `columns`, `gap`                                                         |
| `core.html`      | 自定义 HTML   | `tag`, `style`                                                           |
| `core.navbar`    | 顶部导航栏    | `title`, `subtitle`, `leftArrow`, `fixed`, `transparent`                 |
| `core.list`      | 列表容器      | `bordered`, `split`                                                      |
| `core.list-item` | 列表项        | `title`, `description`, `note`, `arrow`, `thumb`                         |
| `core.dialog`    | 模态对话框    | `title`, `visible`, `confirmText`, `cancelText`                          |
| `core.drawer`    | 抽屉面板      | `title`, `visible`, `placement` (left/right/top/bottom)                  |
| `core.collapse`  | 折叠面板      | `title`, `expanded`                                                      |
| `core.sidebar`   | 侧边导航      | `collapsed`, `width`                                                     |
| `core.form`      | 表单容器      | `labelWidth`, `labelAlign` (left/right/top)                              |
| `core.toolbar`   | 工具栏        | `title`, `fixed`                                                         |
| `core.splitter`  | 分割面板      | `direction` (horizontal/vertical), `min`, `max`                          |
| `core.timeline`  | 时间线        | `direction` (vertical/horizontal)                                        |
| `core.tree`      | 树形控件      | `data`, `expandAll`                                                      |

### 叶子组件（不可有 children）— 37 个

| 别名              | 用途        | 核心 props                                                           |
| ----------------- | ----------- | -------------------------------------------------------------------- |
| `core.text`       | 文本        | `text`, `variant` (10种)                                             |
| `core.button`     | 按钮        | `label`, `variant` (primary/secondary/link/pill), `icon`, `disabled` |
| `core.image`      | 图片        | `src`, `alt`, `objectFit` (cover/contain/fill)                       |
| `core.divider`    | 分隔线      | —                                                                    |
| `core.spacer`     | 间距        | `size`                                                               |
| `core.search`     | 搜索框      | `placeholder`, `value`                                               |
| `core.tabs`       | 标签栏      | `tabs[]`, `activeTab`                                                |
| `core.tabbar`     | 底部标签栏  | `items[]`, `active`, `icons[]`                                       |
| `core.breadcrumb` | 面包屑      | `items[]`, `separator`                                               |
| `core.pagination` | 分页器      | `current`, `total`, `pageSize`                                       |
| `core.tag`        | 标签        | `label`, `tone` (8种)                                                |
| `core.badge`      | 徽标        | `count`, `dot`, `max`, `text`, `tone`                                |
| `core.progress`   | 进度条      | `value`, `max`, `tone`                                               |
| `core.notice`     | 通知横幅    | `text`, `tone`                                                       |
| `core.alert`      | 警告提示    | `text`, `type`, `closable`                                           |
| `core.toast`      | 轻提示      | `message`, `type`, `duration`                                        |
| `core.loading`    | 加载指示器  | `size`, `text`, `type` (spinner/skeleton)                            |
| `core.empty`      | 空状态      | `text`, `image`, `actionLabel`                                       |
| `core.skeleton`   | 骨架屏      | `rows`, `animated`                                                   |
| `core.statistic`  | 统计数值    | `title`, `value`, `suffix`, `prefix`, `tone`, `trend`                |
| `core.avatar`     | 头像        | `src`, `text`, `size` (small/medium/large), `shape` (circle/square)  |
| `core.carousel`   | 轮播        | `images[]`, `autoplay`, `interval`                                   |
| `core.input`      | 输入框      | `placeholder`, `label`, `type`, `value`, `disabled`                  |
| `core.select`     | 下拉选择    | `label`, `placeholder`, `options[]`, `value`, `multiple`             |
| `core.checkbox`   | 复选框      | `label`, `checked`, `disabled`                                       |
| `core.radio`      | 单选框      | `label`, `checked`, `disabled`, `group`                              |
| `core.switch`     | 开关        | `checked`, `disabled`, `label`                                       |
| `core.rate`       | 评分        | `value`, `count`, `size`, `disabled`                                 |
| `core.slider`     | 滑块        | `value`, `min`, `max`, `step`, `range`                               |
| `core.datepicker` | 日期选择    | `value`, `format`, `placeholder`                                     |
| `core.timepicker` | 时间选择    | `value`, `format`, `placeholder`                                     |
| `core.upload`     | 文件上传    | `accept`, `multiple`, `maxCount`, `actionLabel`                      |
| `core.video`      | 视频播放    | `src`, `poster`, `autoplay`, `controls`                              |
| `core.audio`      | 音频播放    | `src`, `autoplay`, `controls`                                        |
| `core.tooltip`    | 文字提示    | `text`, `placement`                                                  |
| `core.table`      | 数据表格    | `columns`, `data`, `bordered`, `stripe`                              |
| `core.widget`     | 三方 Widget | `library`, `renderer` (echarts/chartjs/lottie/mermaid), `data`       |

---

## 布局模式

### Flow 布局（默认，推荐）

```json
{
  "layout": { "mode": "flow", "order": 1, "width": "100%" }
}
```

- 子节点按 `order` 从上到下排列
- `width` 支持 `"100%"` 或具体数值
- 适合：列表、表单、详情页等垂直排列场景

### Grid 布局

```json
{
  "layout": { "mode": "grid", "width": "100%" },
  "props": { "columns": 2, "gap": "16" }
}
```

- 父节点设置 `columns`，子节点自动按列排列
- 适合：商品网格、分类入口、图片墙

### Absolute 布局

```json
{
  "layout": { "mode": "flow", "width": "100%" },
  "frame": { "position": "absolute", "x": 0, "y": 0, "width": "100%", "height": "200", "zIndex": 10 }
}
```

- 使用 `frame` 属性进行绝对定位
- 适合：浮层、角标、悬浮按钮

---

## 类型模板示例

### 示例 1: 电商首页

```json
{
  "id": "home",
  "name": "首页",
  "description": "电商首页，包含搜索、轮播、促销、商品列表",
  "layout": {
    "id": "home-screen",
    "alias": "core.screen",
    "layout": { "mode": "flow", "width": "100%" },
    "props": { "title": "精选好物" },
    "children": [
      {
        "id": "home-search",
        "alias": "core.search",
        "layout": { "mode": "flow", "order": 1, "width": "100%" },
        "props": { "placeholder": "搜索商品" }
      },
      {
        "id": "home-notice",
        "alias": "core.notice",
        "layout": { "mode": "flow", "order": 2, "width": "100%" },
        "props": { "text": "限时满减：满 199 减 30", "tone": "warning" }
      },
      {
        "id": "home-banner",
        "alias": "core.image",
        "layout": { "mode": "flow", "order": 3, "width": "100%", "height": "320" },
        "props": { "src": "https://example.com/banner.jpg", "alt": "促销横幅", "objectFit": "cover" }
      },
      {
        "id": "home-flash-title",
        "alias": "core.row",
        "layout": { "mode": "flow", "order": 4, "width": "100%" },
        "props": { "justify": "space-between", "align": "center" },
        "children": [
          {
            "id": "home-flash-heading",
            "alias": "core.text",
            "layout": { "mode": "flow", "order": 1 },
            "props": { "text": "限时秒杀", "variant": "heading" }
          },
          {
            "id": "home-flash-more",
            "alias": "core.button",
            "layout": { "mode": "flow", "order": 2 },
            "props": { "label": "更多 ›", "variant": "link" }
          }
        ]
      },
      {
        "id": "home-flash-grid",
        "alias": "core.grid",
        "layout": { "mode": "flow", "order": 5, "width": "100%" },
        "props": { "columns": 3, "gap": "12" },
        "children": [
          {
            "id": "home-flash-1",
            "alias": "core.panel",
            "layout": { "mode": "flow", "order": 1 },
            "props": { "tone": "promo", "gap": "8" },
            "children": [
              {
                "id": "home-flash-1-img",
                "alias": "core.image",
                "layout": { "mode": "flow", "order": 1 },
                "props": { "src": "https://example.com/p1.jpg", "objectFit": "cover" }
              },
              {
                "id": "home-flash-1-name",
                "alias": "core.text",
                "layout": { "mode": "flow", "order": 2 },
                "props": { "text": "云南蓝莓", "variant": "caption" }
              },
              {
                "id": "home-flash-1-price",
                "alias": "core.text",
                "layout": { "mode": "flow", "order": 3 },
                "props": { "text": "¥19.9", "variant": "price" }
              }
            ]
          }
        ]
      },
      {
        "id": "home-recommend-title",
        "alias": "core.text",
        "layout": { "mode": "flow", "order": 6, "width": "100%" },
        "props": { "text": "为你推荐", "variant": "heading" }
      },
      {
        "id": "home-product-grid",
        "alias": "core.grid",
        "layout": { "mode": "flow", "order": 7, "width": "100%" },
        "props": { "columns": 2, "gap": "16" },
        "children": [
          {
            "id": "home-product-1",
            "alias": "core.panel",
            "layout": { "mode": "flow", "order": 1 },
            "props": { "tone": "default", "gap": "8" },
            "children": [
              {
                "id": "home-product-1-img",
                "alias": "core.image",
                "layout": { "mode": "flow", "order": 1 },
                "props": { "src": "https://example.com/goods1.jpg", "objectFit": "cover" }
              },
              {
                "id": "home-product-1-title",
                "alias": "core.text",
                "layout": { "mode": "flow", "order": 2 },
                "props": { "text": "新疆阿克苏苹果 5斤装", "variant": "body" }
              },
              {
                "id": "home-product-1-tags",
                "alias": "core.row",
                "layout": { "mode": "flow", "order": 3 },
                "props": { "gap": "8" },
                "children": [
                  {
                    "id": "home-product-1-tag1",
                    "alias": "core.tag",
                    "layout": { "mode": "flow", "order": 1 },
                    "props": { "label": "包邮", "tone": "deal" }
                  }
                ]
              },
              {
                "id": "home-product-1-price",
                "alias": "core.text",
                "layout": { "mode": "flow", "order": 4 },
                "props": { "text": "¥29.9", "variant": "price" }
              },
              {
                "id": "home-product-1-sales",
                "alias": "core.text",
                "layout": { "mode": "flow", "order": 5 },
                "props": { "text": "已售 1.2万", "variant": "caption" }
              }
            ]
          }
        ]
      },
      {
        "id": "home-footer-tabs",
        "alias": "core.tabs",
        "slot": "footer",
        "layout": { "mode": "flow", "order": 999, "width": "100%" },
        "props": { "tabs": ["首页", "分类", "购物车", "我的"], "activeTab": "首页" },
        "interactions": {
          "onTabClick": {
            "首页": { "type": "navigate", "targetPageId": "home" },
            "分类": { "type": "navigate", "targetPageId": "category" },
            "购物车": { "type": "navigate", "targetPageId": "cart" },
            "我的": { "type": "navigate", "targetPageId": "profile" }
          }
        }
      }
    ]
  }
}
```

### 示例 2: 记账工具首页

```json
{
  "id": "home",
  "name": "首页",
  "description": "记账工具首页，包含月度概览和记录列表",
  "layout": {
    "id": "home-screen",
    "alias": "core.screen",
    "layout": { "mode": "flow", "width": "100%" },
    "props": { "title": "记账" },
    "children": [
      {
        "id": "home-overview",
        "alias": "core.panel",
        "layout": { "mode": "flow", "order": 1, "width": "100%" },
        "props": { "tone": "accent", "gap": "16", "title": "5月概览" },
        "children": [
          {
            "id": "home-overview-row",
            "alias": "core.row",
            "layout": { "mode": "flow", "order": 1, "width": "100%" },
            "props": { "justify": "space-around", "align": "center" },
            "children": [
              {
                "id": "home-expense",
                "alias": "core.stack",
                "layout": { "mode": "flow", "order": 1 },
                "props": { "gap": "4", "alignItems": "center" },
                "children": [
                  {
                    "id": "home-expense-label",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 1 },
                    "props": { "text": "支出", "variant": "caption" }
                  },
                  {
                    "id": "home-expense-value",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 2 },
                    "props": { "text": "¥3,280.50", "variant": "price" }
                  }
                ]
              },
              {
                "id": "home-income",
                "alias": "core.stack",
                "layout": { "mode": "flow", "order": 2 },
                "props": { "gap": "4", "alignItems": "center" },
                "children": [
                  {
                    "id": "home-income-label",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 1 },
                    "props": { "text": "收入", "variant": "caption" }
                  },
                  {
                    "id": "home-income-value",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 2 },
                    "props": { "text": "¥8,500.00", "variant": "price" }
                  }
                ]
              }
            ]
          },
          {
            "id": "home-budget",
            "alias": "core.progress",
            "layout": { "mode": "flow", "order": 2, "width": "100%" },
            "props": { "value": 65, "max": 100, "tone": "accent" }
          },
          {
            "id": "home-budget-text",
            "alias": "core.text",
            "layout": { "mode": "flow", "order": 3 },
            "props": { "text": "月预算剩余 ¥1,720", "variant": "caption" }
          }
        ]
      },
      {
        "id": "home-records-title",
        "alias": "core.row",
        "layout": { "mode": "flow", "order": 2, "width": "100%" },
        "props": { "justify": "space-between", "align": "center" },
        "children": [
          {
            "id": "home-records-heading",
            "alias": "core.text",
            "layout": { "mode": "flow", "order": 1 },
            "props": { "text": "今日明细", "variant": "heading" }
          },
          {
            "id": "home-records-total",
            "alias": "core.text",
            "layout": { "mode": "flow", "order": 2 },
            "props": { "text": "支出 ¥128.00", "variant": "caption" }
          }
        ]
      },
      {
        "id": "home-record-list",
        "alias": "core.stack",
        "layout": { "mode": "flow", "order": 3, "width": "100%" },
        "props": { "gap": "0" },
        "children": [
          {
            "id": "home-record-1",
            "alias": "core.panel",
            "layout": { "mode": "flow", "order": 1, "width": "100%" },
            "props": { "tone": "default", "gap": "8" },
            "children": [
              {
                "id": "home-record-1-row",
                "alias": "core.row",
                "layout": { "mode": "flow", "order": 1, "width": "100%" },
                "props": { "justify": "space-between", "align": "center" },
                "children": [
                  {
                    "id": "home-record-1-cat",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 1 },
                    "props": { "text": "餐饮 · 午餐", "variant": "body" }
                  },
                  {
                    "id": "home-record-1-amount",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 2 },
                    "props": { "text": "-¥35.00", "variant": "price" }
                  }
                ]
              },
              {
                "id": "home-record-1-note",
                "alias": "core.text",
                "layout": { "mode": "flow", "order": 2 },
                "props": { "text": "公司楼下麻辣烫", "variant": "caption" }
              }
            ]
          },
          {
            "id": "home-divider-1",
            "alias": "core.divider",
            "layout": { "mode": "flow", "order": 2, "width": "100%" }
          },
          {
            "id": "home-record-2",
            "alias": "core.panel",
            "layout": { "mode": "flow", "order": 3, "width": "100%" },
            "props": { "tone": "default", "gap": "8" },
            "children": [
              {
                "id": "home-record-2-row",
                "alias": "core.row",
                "layout": { "mode": "flow", "order": 1, "width": "100%" },
                "props": { "justify": "space-between", "align": "center" },
                "children": [
                  {
                    "id": "home-record-2-cat",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 1 },
                    "props": { "text": "交通 · 地铁", "variant": "body" }
                  },
                  {
                    "id": "home-record-2-amount",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 2 },
                    "props": { "text": "-¥6.00", "variant": "price" }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### 示例 3: 文章详情页

```json
{
  "id": "detail",
  "name": "文章详情",
  "description": "文章阅读页面，包含标题、作者、正文、评论",
  "layout": {
    "id": "detail-screen",
    "alias": "core.screen",
    "layout": { "mode": "flow", "width": "100%" },
    "props": { "title": "文章详情" },
    "children": [
      {
        "id": "detail-cover",
        "alias": "core.image",
        "layout": { "mode": "flow", "order": 1, "width": "100%", "height": "400" },
        "props": { "src": "https://example.com/article-cover.jpg", "objectFit": "cover" }
      },
      {
        "id": "detail-title",
        "alias": "core.text",
        "layout": { "mode": "flow", "order": 2, "width": "100%" },
        "props": { "text": "2024年最值得关注的10个设计趋势", "variant": "display" }
      },
      {
        "id": "detail-author-row",
        "alias": "core.row",
        "layout": { "mode": "flow", "order": 3, "width": "100%" },
        "props": { "justify": "space-between", "align": "center" },
        "children": [
          {
            "id": "detail-author-info",
            "alias": "core.row",
            "layout": { "mode": "flow", "order": 1 },
            "props": { "gap": "12", "align": "center" },
            "children": [
              {
                "id": "detail-author-avatar",
                "alias": "core.image",
                "layout": { "mode": "flow", "order": 1 },
                "props": { "src": "https://example.com/avatar.jpg", "alt": "作者头像" }
              },
              {
                "id": "detail-author-text",
                "alias": "core.stack",
                "layout": { "mode": "flow", "order": 2 },
                "props": { "gap": "4" },
                "children": [
                  {
                    "id": "detail-author-name",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 1 },
                    "props": { "text": "设计小助手", "variant": "subtitle" }
                  },
                  {
                    "id": "detail-author-bio",
                    "alias": "core.text",
                    "layout": { "mode": "flow", "order": 2 },
                    "props": { "text": "资深UI设计师", "variant": "caption" }
                  }
                ]
              }
            ]
          },
          {
            "id": "detail-follow-btn",
            "alias": "core.button",
            "layout": { "mode": "flow", "order": 2 },
            "props": { "label": "+ 关注", "variant": "primary" }
          }
        ]
      },
      { "id": "detail-divider-1", "alias": "core.divider", "layout": { "mode": "flow", "order": 4, "width": "100%" } },
      {
        "id": "detail-meta",
        "alias": "core.row",
        "layout": { "mode": "flow", "order": 5, "width": "100%" },
        "props": { "gap": "20" },
        "children": [
          {
            "id": "detail-meta-time",
            "alias": "core.text",
            "layout": { "mode": "flow", "order": 1 },
            "props": { "text": "2024-03-15", "variant": "caption" }
          },
          {
            "id": "detail-meta-reads",
            "alias": "core.text",
            "layout": { "mode": "flow", "order": 2 },
            "props": { "text": "2.3万阅读", "variant": "caption" }
          },
          {
            "id": "detail-meta-words",
            "alias": "core.text",
            "layout": { "mode": "flow", "order": 3 },
            "props": { "text": "3200字", "variant": "caption" }
          }
        ]
      },
      {
        "id": "detail-body",
        "alias": "core.html",
        "layout": { "mode": "flow", "order": 6, "width": "100%" },
        "props": { "tag": "article" }
      },
      {
        "id": "detail-tags",
        "alias": "core.row",
        "layout": { "mode": "flow", "order": 7, "width": "100%" },
        "props": { "gap": "12", "wrap": true },
        "children": [
          {
            "id": "detail-tag-1",
            "alias": "core.tag",
            "layout": { "mode": "flow", "order": 1 },
            "props": { "label": "设计趋势", "tone": "info" }
          },
          {
            "id": "detail-tag-2",
            "alias": "core.tag",
            "layout": { "mode": "flow", "order": 2 },
            "props": { "label": "UI设计", "tone": "info" }
          }
        ]
      },
      { "id": "detail-divider-2", "alias": "core.divider", "layout": { "mode": "flow", "order": 8, "width": "100%" } },
      {
        "id": "detail-action-row",
        "alias": "core.row",
        "layout": { "mode": "flow", "order": 9, "width": "100%" },
        "props": { "justify": "space-around" },
        "children": [
          {
            "id": "detail-like-btn",
            "alias": "core.button",
            "layout": { "mode": "flow", "order": 1 },
            "props": { "label": "点赞 128", "variant": "link" }
          },
          {
            "id": "detail-fav-btn",
            "alias": "core.button",
            "layout": { "mode": "flow", "order": 2 },
            "props": { "label": "收藏", "variant": "link" }
          },
          {
            "id": "detail-share-btn",
            "alias": "core.button",
            "layout": { "mode": "flow", "order": 3 },
            "props": { "label": "分享", "variant": "link" }
          }
        ]
      }
    ]
  }
}
```

---

## 常见 UI 模式映射

### 搜索栏

```json
{
  "id": "{page}-search",
  "alias": "core.search",
  "layout": { "mode": "flow", "order": 1, "width": "100%" },
  "props": { "placeholder": "搜索商品" }
}
```

### 通知/公告条

```json
{
  "id": "{page}-notice",
  "alias": "core.notice",
  "layout": { "mode": "flow", "order": 2, "width": "100%" },
  "props": { "text": "满 199 减 30，限时优惠中", "tone": "warning" }
}
```

### Banner/轮播图（用图片模拟）

```json
{
  "id": "{page}-banner",
  "alias": "core.image",
  "layout": { "mode": "flow", "order": 3, "width": "100%", "height": "300" },
  "props": { "src": "https://...", "objectFit": "cover" }
}
```

### 入口宫格（分类导航）

```json
{
  "id": "{page}-grid",
  "alias": "core.grid",
  "layout": { "mode": "flow", "order": 4, "width": "100%" },
  "props": { "columns": 4, "gap": "16" },
  "children": [
    {
      "id": "{page}-grid-1",
      "alias": "core.stack",
      "layout": { "mode": "flow", "order": 1 },
      "props": { "gap": "8", "alignItems": "center" },
      "children": [
        {
          "id": "{page}-grid-1-icon",
          "alias": "core.image",
          "layout": { "mode": "flow", "order": 1 },
          "props": { "src": "https://...", "alt": "分类名" }
        },
        {
          "id": "{page}-grid-1-text",
          "alias": "core.text",
          "layout": { "mode": "flow", "order": 2 },
          "props": { "text": "分类名", "variant": "caption" }
        }
      ]
    }
  ]
}
```

### 商品卡片

```json
{
  "id": "{page}-product-{n}",
  "alias": "core.panel",
  "layout": { "mode": "flow", "order": {n} },
  "props": { "tone": "default", "gap": "8" },
  "children": [
    { "id": "...-img", "alias": "core.image", "layout": { "mode": "flow", "order": 1 }, "props": { "src": "https://...", "objectFit": "cover" } },
    { "id": "...-title", "alias": "core.text", "layout": { "mode": "flow", "order": 2 }, "props": { "text": "商品名称", "variant": "body" } },
    { "id": "...-tags", "alias": "core.row", "layout": { "mode": "flow", "order": 3 }, "props": { "gap": "8" }, "children": [
      { "id": "...-tag1", "alias": "core.tag", "layout": { "mode": "flow", "order": 1 }, "props": { "label": "包邮", "tone": "deal" } }
    ]},
    { "id": "...-price", "alias": "core.text", "layout": { "mode": "flow", "order": 4 }, "props": { "text": "¥99.00", "variant": "price" } },
    { "id": "...-sales", "alias": "core.text", "layout": { "mode": "flow", "order": 5 }, "props": { "text": "已售 500+", "variant": "caption" } }
  ]
}
```

### 门店卡片

```json
{
  "id": "{page}-store-{n}",
  "alias": "core.panel",
  "layout": { "mode": "flow", "order": {n} },
  "props": { "tone": "default", "gap": "8" },
  "children": [
    { "id": "...-img", "alias": "core.image", "layout": { "mode": "flow", "order": 1 }, "props": { "src": "https://...", "objectFit": "cover" } },
    { "id": "...-name", "alias": "core.text", "layout": { "mode": "flow", "order": 2 }, "props": { "text": "门店名称", "variant": "title" } },
    { "id": "...-meta", "alias": "core.row", "layout": { "mode": "flow", "order": 3 }, "props": { "gap": "12" }, "children": [
      { "id": "...-rating", "alias": "core.tag", "layout": { "mode": "flow", "order": 1 }, "props": { "label": "4.8分", "tone": "warning" } },
      { "id": "...-distance", "alias": "core.text", "layout": { "mode": "flow", "order": 2 }, "props": { "text": "1.2km", "variant": "caption" } }
    ]},
    { "id": "...-tags", "alias": "core.row", "layout": { "mode": "flow", "order": 4 }, "props": { "gap": "8" }, "children": [
      { "id": "...-tag1", "alias": "core.tag", "layout": { "mode": "flow", "order": 1 }, "props": { "label": "免配送费", "tone": "success" } }
    ]}
  ]
}
```

### 表单页

```json
{
  "id": "{page}-form",
  "alias": "core.panel",
  "layout": { "mode": "flow", "order": 1, "width": "100%" },
  "props": { "tone": "default", "gap": "0" },
  "children": [
    {
      "id": "...-name",
      "alias": "core.input",
      "layout": { "mode": "flow", "order": 1, "width": "100%" },
      "props": { "label": "姓名", "placeholder": "请输入姓名" }
    },
    { "id": "...-divider1", "alias": "core.divider", "layout": { "mode": "flow", "order": 2, "width": "100%" } },
    {
      "id": "...-phone",
      "alias": "core.input",
      "layout": { "mode": "flow", "order": 3, "width": "100%" },
      "props": { "label": "手机号", "placeholder": "请输入手机号", "type": "number" }
    },
    { "id": "...-divider2", "alias": "core.divider", "layout": { "mode": "flow", "order": 4, "width": "100%" } },
    {
      "id": "...-remark",
      "alias": "core.input",
      "layout": { "mode": "flow", "order": 5, "width": "100%" },
      "props": { "label": "备注", "placeholder": "有什么特殊要求？" }
    }
  ]
}
```

### 数据图表（使用 Widget）

```json
{
  "id": "{page}-chart",
  "alias": "core.widget",
  "layout": { "mode": "flow", "order": 5, "width": "100%", "height": "400" },
  "props": {
    "library": "echarts",
    "renderer": "echarts",
    "data": {
      "option": {
        "xAxis": { "type": "category", "data": ["周一", "周二", "周三", "周四", "周五"] },
        "yAxis": { "type": "value" },
        "series": [{ "data": [120, 200, 150, 80, 70], "type": "bar" }]
      }
    }
  }
}
```

---

## style 与 cssVars

### 节点级 style

每个节点可以通过 `props.style` 设置内联样式：

```json
{
  "id": "...",
  "alias": "core.panel",
  "props": {
    "style": {
      "padding": "24",
      "borderRadius": "16",
      "background": "#FFFFFF",
      "boxShadow": "0 2 12 rgba(0,0,0,0.06)"
    }
  }
}
```

### 全局 cssVars

在文档根级别定义 CSS 自定义属性，供渲染器全局应用：

```json
{
  "cssVars": {
    "--color-primary": "#FF4D4F",
    "--color-primary-light": "#FFF0F0",
    "--color-bg": "#F8F8F8",
    "--color-bg-card": "#FFFFFF",
    "--color-text-primary": "#1A1A1A",
    "--color-text-secondary": "#666666",
    "--color-text-caption": "#999999",
    "--color-border": "#EEEEEE",
    "--color-price": "#FF4D4F",
    "--spacing-page": "24",
    "--spacing-card": "20",
    "--spacing-element": "16",
    "--radius-card": "16",
    "--radius-button": "44"
  }
}
```

### 不同类型的 cssVars 参考

**电商促销型**:

```json
{
  "--color-primary": "#FF4D4F",
  "--color-primary-light": "#FFF0F0",
  "--color-accent": "#FF7A45",
  "--color-price": "#FF4D4F"
}
```

**品质简约型**:

```json
{
  "--color-primary": "#1A1A1A",
  "--color-primary-light": "#F5F3EF",
  "--color-accent": "#C9A96E",
  "--color-price": "#1A1A1A"
}
```

**本地服务型**:

```json
{
  "--color-primary": "#FF6B35",
  "--color-primary-light": "#FFF4EF",
  "--color-accent": "#FFB800"
}
```

**工具效率型**:

```json
{
  "--color-primary": "#333333",
  "--color-primary-light": "#F5F5F5",
  "--color-accent": "#07C160",
  "--color-success": "#07C160",
  "--color-error": "#FA5151"
}
```
