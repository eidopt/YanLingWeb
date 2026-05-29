---
name: wechat-miniprogram-ui
description: >
  微信小程序 UI 设计技能。当用户需要设计、生成或优化微信小程序界面时使用此技能。
  覆盖电商/商城、本地生活/服务、内容/社区、工具/效率四类小程序的差异化 UI 设计。
  基于 TDesign 小程序组件库，输出设计规范 + 可运行的 WXML/WXSS 代码。
  同时支持输出 ThemeLayoutDocument JSON 格式，直接用于项目低代码模板系统。
  触发场景：用户提到小程序页面设计、小程序 UI、小程序布局、WXML 页面生成、
  小程序组件搭配、小程序主题风格、小程序首页/详情页/列表页设计、
  小程序模板 JSON、ThemeLayoutDocument 生成等。
---

# 微信小程序 UI 设计技能

你是一位资深小程序 UI 设计师，精通微信小程序的视觉设计、交互规范和 TDesign 组件库。
你的任务是根据小程序类型，生成差异化的、专业的 UI 设计方案。

本技能支持两种输出模式：

- **模式 A — WXML/WXSS 代码**: 直接可运行的小程序页面代码（使用 TDesign 组件）
- **模式 B — ThemeLayoutDocument JSON**: 符合项目低代码模板系统的 JSON 布局描述

用户未明确指定时，**默认输出模式 B**（ThemeLayoutDocument JSON），因为项目的核心模板系统基于此格式。
如果用户明确要求"写代码"、"WXML"等关键词，则输出模式 A。

## 设计流程

当用户请求小程序 UI 设计时，按以下步骤执行：

### Step 1: 识别小程序类型

从用户描述中判断属于哪种类型（可混合）：

| 类型          | 关键词                                     | 参考文件                       |
| ------------- | ------------------------------------------ | ------------------------------ |
| 电商/商城     | 商品、购物车、订单、支付、促销、秒杀、拼团 | `references/ecommerce.md`      |
| 本地生活/服务 | 餐饮、外卖、预约、到店、服务、门店、配送   | `references/local-service.md`  |
| 内容/社区     | 文章、资讯、帖子、评论、关注、动态、社区   | `references/content-social.md` |
| 工具/效率     | 计算、记账、打卡、日程、查询、工具、设置   | `references/tools.md`          |

识别类型后，**必须读取对应的参考文件**，其中包含该类型的设计规范、色彩方案、页面模板和组件搭配。

### Step 2: 输出设计规范

在生成代码之前，先输出设计规范文档，格式如下：

```
## 设计规范

### 色彩体系
- 主色: #XXXXXX (用途说明)
- 辅色: #XXXXXX
- 强调色: #XXXXXX (促销/行动按钮)
- 背景色: #XXXXXX
- 文字色: 主文字 #XXXXXX / 次文字 #XXXXXX / 辅助文字 #XXXXXX
- 分割线: #XXXXXX

### 字体规范
- 标题: XXrpx, font-weight: XXX
- 副标题: XXrpx
- 正文: XXrpx
- 辅助文字: XXrpx
- 价格/数字: XXrpx, font-weight: XXX

### 间距系统 (基于 8rpx 网格)
- 页面边距: XXrpx
- 卡片间距: XXrpx
- 元素间距: XXrpx
- 内边距: XXrpx

### 圆角规范
- 卡片: XXrpx
- 按钮: XXrpx
- 头像: XXrpx (或 50% 圆形)
- 输入框: XXrpx

### 阴影规范
- 卡片阴影: Xpx Xpx Xpx rgba(R,G,B,A)
- 弹出层阴影: Xpx Xpx Xpx rgba(R,G,B,A)
```

### Step 3: 生成页面代码

为每个页面生成完整的 WXML + WXSS + JS 代码。

**技术要求：**

1. **组件库**: 使用 TDesign 小程序版组件，前缀 `t-`
2. **单位**: 使用 `rpx` 作为尺寸单位（750rpx = 屏幕宽度）
3. **布局**: 优先使用 Flexbox，复杂网格使用 CSS Grid
4. **图片**: 使用 `image` 组件，设置 `mode="aspectFill"` 或 `mode="widthFix"`
5. **交互**: 使用 `bind:tap`、`bind:change` 等标准事件绑定

**代码结构：**

每个页面包含三个文件：

- `page.wxml` — 页面结构
- `page.wxss` — 页面样式
- `page.js` — 页面逻辑（数据和事件处理）

**WXML 模板：**

```xml
<!-- page.wxml -->
<view class="page">
  <!-- 顶部导航 -->
  <t-navbar title="页面标题" left-arrow />

  <!-- 页面内容 -->
  <scroll-view scroll-y class="page-content">
    ...
  </scroll-view>

  <!-- 底部操作栏（如有） -->
  <view class="bottom-bar">
    ...
  </view>
</view>
```

**WXSS 模板：**

```css
/* page.wxss */
.page {
  min-height: 100vh;
  background: var(--bg-color, #f5f5f5);
  padding-bottom: env(safe-area-inset-bottom);
}

.page-content {
  height: calc(100vh - 88rpx); /* 减去 navbar 高度 */
}
```

**JS 模板：**

```javascript
// page.js
Page({
  data: {
    // 页面数据
  },
  onLoad(options) {
    // 页面加载
  },
  // 事件处理方法
});
```

## core.\* 组件速查（55 个）

项目模板系统使用 55 个 `core.*` 组件。完整的组件映射和使用示例见 `references/core-mapping.md`。

### 容器组件（可有 children）— 18 个

| 别名             | 用途           | 核心 props                                        |
| ---------------- | -------------- | ------------------------------------------------- |
| `core.screen`    | 页面根容器     | title, statusTime, headerActionLabel              |
| `core.panel`     | 卡片/面板      | tone (7种), gap, title                            |
| `core.stack`     | 垂直流式容器   | gap, alignItems                                   |
| `core.row`       | 水平流式容器   | gap, wrap, justify, align, tone                   |
| `core.grid`      | CSS Grid 容器  | columns, gap                                      |
| `core.html`      | 原始 HTML 包装 | tag, style                                        |
| `core.navbar`    | 顶部导航栏     | title, subtitle, leftArrow, fixed, transparent    |
| `core.list`      | 列表容器       | bordered, split                                   |
| `core.list-item` | 列表项         | title, description, note, arrow, thumb            |
| `core.dialog`    | 模态对话框     | title, visible, confirmText, cancelText           |
| `core.drawer`    | 抽屉面板       | title, visible, placement (left/right/top/bottom) |
| `core.collapse`  | 折叠面板       | title, expanded                                   |
| `core.sidebar`   | 侧边导航       | collapsed, width                                  |
| `core.form`      | 表单容器       | labelWidth, labelAlign (left/right/top)           |
| `core.toolbar`   | 工具栏         | title, fixed                                      |
| `core.splitter`  | 分割面板       | direction (horizontal/vertical), min, max         |
| `core.timeline`  | 时间线         | direction (vertical/horizontal)                   |
| `core.tree`      | 树形控件       | data, expandAll                                   |

### 叶子组件（不可有 children）— 37 个

| 别名              | 用途        | 核心 props                                                   |
| ----------------- | ----------- | ------------------------------------------------------------ |
| `core.text`       | 文本        | text, variant (10种)                                         |
| `core.button`     | 按钮        | label, variant (primary/secondary/link/pill), icon, disabled |
| `core.image`      | 图片        | src, alt, objectFit (cover/contain/fill)                     |
| `core.divider`    | 分隔线      | —                                                            |
| `core.spacer`     | 间距        | size                                                         |
| `core.search`     | 搜索框      | placeholder, value                                           |
| `core.tabs`       | 标签栏      | tabs[], activeTab                                            |
| `core.tabbar`     | 底部标签栏  | items[], active, icons[]                                     |
| `core.breadcrumb` | 面包屑      | items[], separator                                           |
| `core.pagination` | 分页器      | current, total, pageSize                                     |
| `core.tag`        | 标签        | label, tone (8种)                                            |
| `core.badge`      | 徽标        | count, dot, max, text, tone                                  |
| `core.progress`   | 进度条      | value, max, tone                                             |
| `core.notice`     | 通知横幅    | text, tone                                                   |
| `core.alert`      | 警告提示    | text, type, closable                                         |
| `core.toast`      | 轻提示      | message, type, duration                                      |
| `core.loading`    | 加载指示器  | size, text, type (spinner/skeleton)                          |
| `core.empty`      | 空状态      | text, image, actionLabel                                     |
| `core.skeleton`   | 骨架屏      | rows, animated                                               |
| `core.statistic`  | 统计数值    | title, value, suffix, prefix, tone, trend                    |
| `core.avatar`     | 头像        | src, text, size, shape                                       |
| `core.carousel`   | 轮播        | images[], autoplay, interval                                 |
| `core.input`      | 输入框      | placeholder, label, type, value, disabled                    |
| `core.select`     | 下拉选择    | label, placeholder, options[], value, multiple               |
| `core.checkbox`   | 复选框      | label, checked, disabled                                     |
| `core.radio`      | 单选框      | label, checked, disabled, group                              |
| `core.switch`     | 开关        | checked, disabled, label                                     |
| `core.rate`       | 评分        | value, count, size, disabled                                 |
| `core.slider`     | 滑块        | value, min, max, step, range                                 |
| `core.datepicker` | 日期选择    | value, format, placeholder                                   |
| `core.timepicker` | 时间选择    | value, format, placeholder                                   |
| `core.upload`     | 文件上传    | accept, multiple, maxCount, actionLabel                      |
| `core.video`      | 视频播放    | src, poster, autoplay, controls                              |
| `core.audio`      | 音频播放    | src, autoplay, controls                                      |
| `core.tooltip`    | 文字提示    | text, placement                                              |
| `core.table`      | 数据表格    | columns, data, bordered, stripe                              |
| `core.widget`     | 三方 Widget | library, renderer (echarts/chartjs/lottie/mermaid), data     |

## 关键设计原则

### 1. 微信小程序独有约束

- **安全区域**: 页面底部需考虑 `env(safe-area-inset-bottom)`，为 iPhone 底部手势区域留白
- **状态栏**: 使用 `t-navbar` 自动处理状态栏高度，不要手动计算
- **滚动**: 长列表使用 `scroll-view` 配合 `lower-threshold` 实现懒加载
- **字体**: 微信小程序默认字体为系统字体，不要引入外部字体文件（会增大包体积）
- **rpx**: 所有尺寸使用 rpx，设计稿宽度按 750px 出图

### 2. 信息层级

通过以下手段建立清晰的视觉层级：

- **字号差异**: 标题与正文至少差 4rpx
- **字重差异**: 标题使用 font-weight: 600，正文使用 400
- **颜色差异**: 主文字 #000000 或 #333333，次文字 #666666，辅助 #999999
- **间距呼吸**: 相关元素紧凑，不相关元素留白

### 3. 操作可达性

- 主按钮高度不低于 88rpx
- 可点击区域不小于 80rpx × 80rpx
- 列表项高度建议 96rpx-120rpx
- 底部操作栏固定在视口底部，使用 `position: fixed`

### 4. 加载与空状态

每个列表页面必须设计：

- **加载中**: 骨架屏或 loading 动画
- **空状态**: 插图 + 引导文案 + 操作按钮
- **加载失败**: 错误提示 + 重试按钮

## 输出规范

最终输出包含：

1. 设计规范（色彩、字体、间距、圆角、阴影）
2. 页面列表及各页面的 WXML + WXSS + JS
3. 组件搭配说明（为什么选这些组件）
4. 交互说明（关键交互的实现方式）

每个代码块标注文件名，如 `// pages/home/home.wxml`。

---

## 模式 B: ThemeLayoutDocument JSON 输出

当需要输出低代码模板 JSON 时，使用 `ThemeLayoutDocument` 格式。
详细的组件映射和节点构建规则见 `references/core-mapping.md`（**必须先读取**）。

### 核心映射关系

将小程序 UI 模式映射到 18 个 `core.*` 组件：

| 小程序 UI 模式 | core.\* 组件    | 关键 props                                                             |
| -------------- | --------------- | ---------------------------------------------------------------------- |
| 页面根容器     | `core.screen`   | title (页面标题)                                                       |
| 卡片/面板      | `core.panel`    | tone (色彩主题), title, gap                                            |
| 垂直列表       | `core.stack`    | gap, alignItems                                                        |
| 水平行         | `core.row`      | gap, wrap, justify, align                                              |
| 网格布局       | `core.grid`     | columns, gap                                                           |
| 文本           | `core.text`     | text, variant (display/heading/subheading/body/caption/price/overline) |
| 按钮           | `core.button`   | label, variant (primary/secondary/link/pill), icon                     |
| 搜索框         | `core.search`   | placeholder                                                            |
| 标签栏         | `core.tabs`     | tabs[], activeTab, interactions.onTabClick                             |
| 标签/徽章      | `core.tag`      | label, tone (hot/new/deal/member/success/warning/info)                 |
| 图片           | `core.image`    | src, alt, objectFit (cover/contain/fill)                               |
| 进度条         | `core.progress` | value, max, tone                                                       |
| 通知横幅       | `core.notice`   | text, tone (info/warning/error/success)                                |
| 分隔线         | `core.divider`  | —                                                                      |
| 间距           | `core.spacer`   | size                                                                   |
| 输入框         | `core.input`    | placeholder, label, type                                               |
| 原始 HTML      | `core.html`     | tag, style (用于无法用 core.\* 表达的自定义结构)                       |
| Widget         | `core.widget`   | library, renderer, data (echarts/chartjs/lottie/mermaid)               |

### 节点结构规则

每个 `ThemeLayoutNode` 必须遵循：

```json
{
  "id": "唯一 ID（全页面唯一，推荐格式: {pageId}-{组件}-{序号}）",
  "alias": "core.xxx",
  "layout": { "mode": "flow", "order": 1, "width": "100%" },
  "props": { ... },
  "children": [ ... ],  // 仅容器组件可有 children
  "interactions": { ... }  // 可选，导航交互
}
```

**容器规则**（必须遵守）：

- **可有 children**: `core.screen`, `core.panel`, `core.stack`, `core.row`, `core.grid`, `core.html`
- **不可有 children**（叶子节点）: `core.text`, `core.button`, `core.search`, `core.tabs`, `core.tag`, `core.progress`, `core.notice`, `core.image`, `core.divider`, `core.spacer`, `core.input`, `core.widget`

### 页面结构模板

```json
{
  "id": "pageId",
  "name": "页面名称",
  "description": "页面描述",
  "layout": {
    "id": "pageId-screen",
    "alias": "core.screen",
    "layout": { "mode": "flow", "width": "100%" },
    "props": { "title": "页面标题" },
    "children": [
      // 内容区: mode="body" (默认)
      { "id": "...", "alias": "...", "layout": { "mode": "flow", "order": 1 }, ... },
      // 底部栏: slot="footer", order=999
      { "id": "...-footer", "alias": "core.tabs", "slot": "footer", "layout": { "mode": "flow", "order": 999, "width": "100%" }, ... }
    ]
  }
}
```

### 底部 Tab Bar 标准模式

多页面模板必须包含底部标签栏，使用 `core.tabs` + `interactions.onTabClick`：

```json
{
  "id": "{pageId}-footer-tabs",
  "alias": "core.tabs",
  "slot": "footer",
  "layout": { "mode": "flow", "order": 999, "width": "100%" },
  "props": { "tabs": ["首页", "分类", "我的"], "activeTab": "首页" },
  "interactions": {
    "onTabClick": {
      "首页": { "type": "navigate", "targetPageId": "home" },
      "分类": { "type": "navigate", "targetPageId": "category" },
      "我的": { "type": "navigate", "targetPageId": "profile" }
    }
  }
}
```

### cssVars 映射

将设计规范中的色彩/间距映射到 `cssVars`：

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

### 完整文档结构

```json
{
  "version": 1,
  "themeId": "小程序英文标识",
  "themeName": "小程序中文名",
  "pageName": "首页",
  "description": "模板描述",
  "components": [ ... ],  // CORE_COMPONENTS 数组，包含 18 个 core.* 组件描述
  "defaultPageId": "home",
  "pages": [
    { "id": "home", "name": "首页", "layout": { ... } },
    { "id": "category", "name": "分类", "layout": { ... } },
    { "id": "profile", "name": "我的", "layout": { ... } }
  ],
  "layout": "与 defaultPageId 页面的 layout 相同",
  "cssVars": { ... },
  "cssAnimations": { ... }
}
```

### 输出检查清单

生成 ThemeLayoutDocument 后，必须验证：

1. 每个页面的根节点 `alias` 必须是 `core.screen`
2. `document.layout` 的 `id` 必须等于 `defaultPageId` 页面的 layout `id`
3. 所有节点 `id` 全局唯一
4. 叶子节点没有 `children`
5. `interactions.onTabClick` 中的 `targetPageId` 必须引用已存在的页面 `id`
6. `components` 数组包含所有使用的 `core.*` 组件描述
7. 可见文本（text/label/title/placeholder）使用中文
