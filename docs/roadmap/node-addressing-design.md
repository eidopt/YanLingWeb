# 编辑器 AI 节点定位改进方案

> **版本**: v1.0  
> **日期**: 2026-06-03  
> **状态**: 设计 + PoC 验证

---

## 1. 问题定义

### 1.1 当前系统的节点定位流程

```
用户: "把搜索框的 placeholder 改成搜索商品"
  ↓
系统构建 messages，其中包含 Node ID Quick Reference:
  home-scr | core.screen | title=今日精选
  home-sea | core.search | placeholder=搜索水果零食
  home-tit | core.text   | text=今日爆款
  home-not | core.notice | text=满 59 元免配送费
  home-pro | core.panel  | title=商品卡片
  ...
  ↓
AI 需要: 从列表中找到 "搜索框" 对应的完整 ID
  → 看到 home-sea（截断） → 猜测 home-search ？
  → 输出 editor_update_props(nodeId="home-search", props={placeholder:"搜索商品"})
  ↓
如果猜错 → tool 执行报错 "Node not found" → 注入提示 → 重新猜测 → 重试
```

### 1.2 三个叠加的问题

| #   | 问题                                                       | 严重度 | 当前代码位置                                 |
| --- | ---------------------------------------------------------- | ------ | -------------------------------------------- |
| 1   | **Node ID 被截断到 8 字符** — AI 看不到完整 ID，必须猜后缀 | 致命   | `editorContext.ts:166` `node.id.slice(0, 8)` |
| 2   | **平铺列表无结构** — 50+ 节点平铺，无分组、无层级感        | 高     | `buildNodeIndex()` 递归但无缩进分组          |
| 3   | **无 displayName** — AI 只能通过 props 推断节点用途        | 高     | 没有从 props 提取可读名称的逻辑              |

### 1.3 影响量化

从代码分析推断的典型失败路径：

```
简单编辑（如"改文字"）:
  当前: 2-3 轮 LLM × 5-10秒 = 10-30秒（第一轮猜错 ID → 第二轮修正）
  目标: 1 轮 LLM × 3-8秒 = 3-8秒（首轮选对 ID）

复杂编辑（如"添加新页面"）:
  当前: 5-8 轮 LLM × 5-10秒 = 25-80秒
  目标: 2-3 轮 LLM × 3-8秒 = 6-24秒
```

---

## 2. 方案设计

### 2.1 核心思路

**给 AI 一个结构化的封闭候选集，而不是让它从截断的平铺列表里猜。**

AI 的任务被清晰地分成两叉：

```
编辑已有元素:
  → 从候选集中选择一个 ID（封闭选择题）
  → 候选集包含: 完整 ID、组件类型、displayName、所属容器

新建元素:
  → AI 自己生成一个新 ID
  → parentId 必须来自候选集中的容器节点
  → alias 必须来自组件目录
```

### 2.2 送给 AI 的上下文格式

#### 当前格式（Node ID Quick Reference）

```
Node ID Quick Reference (use these exact IDs in tool calls):
  home-scr | core.screen | — | title=今日精选
  home-sea | core.search | parent=home-scr | placeholder=搜索水果零食
  home-tit | core.text   | parent=home-scr | text=今日爆款
  home-not | core.notice | parent=home-scr | text=满 59 元免配送费
  home-pro | core.panel  | parent=home-scr | title=商品卡片
  home-car | core.text   | parent=home-pro | text=云南蓝莓 125g
  home-pri | core.button | parent=home-pro | label=马上抢
  home-dup | core.button | parent=home-pro | label=马上抢
  home-ser | core.panel  | parent=home-scr | title=服务入口
  home-ser | core.text   | parent=home-ser | text=会员专享
  home-ser | core.button | parent=home-ser | label=查看权益
  home-foo | core.tabs   | parent=home-scr | tabs=首页,订单,我的
  ...50 more nodes omitted
```

**问题**:

- ID 被截断到 8 字符，AI 无法直接使用
- 无 displayName，AI 需推断"搜索水果零食"就是搜索框
- 平铺列表，看不出容器关系
- 超过 50 行被截断

#### 新格式（Node Candidate Set）

```yaml
# 当前页面可编辑节点（编辑操作请从以下 ID 中选择）
# 标记 [C] 的是容器节点，可作为 parentId

[C] home-screen (core.screen) — 页面:今日精选
    home-search (core.search) — 搜索框 [placeholder=搜索水果零食、家清百货]
    home-title (core.text) — 标题 [text=今日爆款]
    home-notice (core.notice) — 通知 [text=满 59 元免配送费]
  [C] home-product-panel (core.panel) — 商品卡片
      home-card-title (core.text) — 商品名 [text=云南蓝莓 125g]
      home-card-subtitle (core.text) — 商品描述 [text=冷链现摘，酸甜平衡]
      home-filter-tag (core.tag) — 标签 [label=限时, tone=deal]
      home-primary-button (core.button) — 按钮 [label=马上抢]
      home-duplicate-button (core.button) — 按钮 [label=马上抢]
  [C] home-service-card (core.panel) — 服务入口
      home-service-title (core.text) — 标题 [text=会员专享]
      home-service-button (core.button) — 按钮 [label=查看权益]
    home-footer-tabs (core.tabs) — 底部导航 [tabs=首页,订单,我的]

# 可用于新建的组件
可用组件: core.text, core.button, core.image, core.input, core.search,
  core.notice, core.tag, core.progress, core.divider, core.spacer,
  core.panel, core.stack, core.row, core.grid, core.tabs, core.html
```

**改进**:

- 完整 ID，不截断
- 每个节点有 displayName（如"搜索框"、"商品卡片"）
- 缩进表示容器层级
- `[C]` 标记容器节点（可作为 parentId）
- 独立列出可用组件（用于新建）

### 2.3 AI 输出格式

编辑和新建使用不同的操作类型：

```typescript
// 编辑已有节点: targetId 必须来自候选集
interface EditOperation {
  action: 'update_props' | 'delete' | 'set_layout' | 'move' | 'update_interactions';
  targetId: string; // 必须是候选集中的完整 ID
  params: Record<string, unknown>;
}

// 新建节点: parentId 必须是候选集中的容器节点 [C]
interface InsertOperation {
  action: 'insert';
  parentId: string; // 必须是候选集中标记 [C] 的 ID
  alias: string; // 必须来自可用组件列表
  newId: string; // AI 生成的唯一 ID
  params: Record<string, unknown>;
}
```

### 2.4 displayName 推断规则

从节点的 props 中自动提取可读名称，优先级如下：

```typescript
function inferDisplayName(node: ThemeLayoutNode): string {
  const props = node.props ?? {};

  // 1. 搜索框 → placeholder
  if (node.alias === 'core.search') return '搜索框';

  // 2. 按钮 → label
  if (node.alias === 'core.button') {
    const label = typeof props.label === 'string' ? props.label : '';
    return label ? `按钮:${label}` : '按钮';
  }

  // 3. 文本 → text 前 20 字符
  if (node.alias === 'core.text') {
    const text = typeof props.text === 'string' ? props.text : '';
    return text ? `文字:${text.slice(0, 20)}` : '文字';
  }

  // 4. 通知 → text 前 20 字符
  if (node.alias === 'core.notice') {
    const text = typeof props.text === 'string' ? props.text : '';
    return text ? `通知:${text.slice(0, 20)}` : '通知';
  }

  // 5. 面板 → title
  if (node.alias === 'core.panel') {
    const title = typeof props.title === 'string' ? props.title : '';
    return title ? `卡片:${title}` : '卡片';
  }

  // 6. 标签页 → tabs
  if (node.alias === 'core.tabs') {
    return node.slot === 'footer' ? '底部导航' : '标签栏';
  }

  // 7. 标签 → label
  if (node.alias === 'core.tag') {
    const label = typeof props.label === 'string' ? props.label : '';
    return label ? `标签:${label}` : '标签';
  }

  // 8. 图片
  if (node.alias === 'core.image') return '图片';

  // 9. 输入框
  if (node.alias === 'core.input') {
    const placeholder = typeof props.placeholder === 'string' ? props.placeholder : '';
    return placeholder ? `输入框:${placeholder.slice(0, 15)}` : '输入框';
  }

  // 10. 兜底: 用 alias
  return node.alias.replace('core.', '');
}
```

---

## 3. 实施步骤

### Phase 1: 修复硬伤（0.5 天）

- [ ] 移除 `buildNodeIndex` 中的 `slice(0, 8)` 截断
- [ ] 确保所有 ID 完整展示

### Phase 2: 改造上下文格式（1 天）

- [ ] 实现 `inferDisplayName()`
- [ ] 实现 `buildNodeCandidateSet()` 替代 `buildNodeIndex()`
- [ ] 输出格式: 缩进层级 + displayName + [C] 容器标记
- [ ] 底部附加"可用组件"列表

### Phase 3: 改造 system prompt（0.5 天）

- [ ] 教 AI 使用候选集中的完整 ID
- [ ] 区分编辑（选 ID）和新建（造 ID）
- [ ] 强调 targetId 必须精确匹配候选集

### Phase 4: 端到端验证（1 天）

- [ ] 用 commerce-market 文档测试 AI 选对 ID 的准确率
- [ ] 对比新旧格式下的首次选择准确率
- [ ] 验证新建节点场景

---

## 4. 风险

| 风险                    | 缓解                                               |
| ----------------------- | -------------------------------------------------- |
| 候选集过大（100+ 节点） | 按当前选中节点的容器裁剪，只展示相关子树           |
| displayName 推断错误    | 兜底用 alias，不阻塞流程                           |
| AI 仍然选错 ID          | 现有的 multiStrategyResolveNodeId 模糊匹配作为兜底 |

---

## 5. PoC 验证

见 `shared/agent/editor/nodeCandidateSet.spec.ts`

对比测试：

- 旧格式（截断 ID + 平铺）的 AI 选择准确率
- 新格式（完整 ID + displayName + 分组）的 AI 选择准确率
