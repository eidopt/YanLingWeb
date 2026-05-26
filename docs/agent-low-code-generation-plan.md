# Agent Low-Code Generation Plan

本文档规划 YanLingWeb agent 从自然语言生成自定义低代码语法的系统化改造路径。目标是把当前“AI 直接猜节点、猜属性、调用编辑工具”的模式，收敛为“AI 生成结构化意图，系统用模板规则确定性编译和校验”的模式。

## 1. 背景和目标

当前 agent 已经具备基础编辑能力，也已经增加了 `editor_create_page_from_reference`，可以基于参考页面生成风格相近的新页面。但长期来看，如果继续让 AI 直接操作节点 ID、自由选择工具、自由生成节点结构，会遇到几个稳定性问题：

- 不同模板的节点 ID 不一致，AI 容易猜错目标节点。
- AI 容易生成不存在的组件属性，例如把不支持的 prop 写到 `core.image` 或其他 core component 上。
- 新页面容易脱离模板原有风格，出现结构、间距、颜色、排布不一致。
- 多步骤生成失败时，容易出现半写入状态。
- 后续新增模板时，缺少统一规则索引，agent 难以泛化。

最终目标：

```text
自然语言
  -> IntentPlan
  -> PageSpec / EditSpec
  -> TemplateProfile 解析
  -> 确定性编译
  -> schema / component / design policy 校验
  -> atomic apply
```

AI 负责理解用户需求和填写高层结构化 spec；系统负责 ID 生成、模板匹配、节点复制、prop 校验、设计约束、原子写入。

## 2. 核心原则

1. AI 不直接依赖真实 `nodeId`。
2. 真实 `nodeId` 只作为 compiler / resolver 的内部实现细节。
3. 模板对 agent 暴露的是稳定语义接口：
   - `pageKey`
   - `pageKind`
   - `regionKey`
   - `slotKey`
   - `patternKey`
4. 新页面优先从已有页面或 pattern 派生，不自由生成完整布局。
5. 重复结构通过 pattern 填充，不逐个手写节点。
6. 所有写入前必须经过校验和 dry run。
7. 失败时返回结构化错误，让 AI 从可用语义规则中重新选择，而不是继续猜。

## 3. MVP 范围

MVP 只做能闭环自然语言生成和修改页面的最小系统。低级编辑工具可以保留，但不作为 agent 的主路径。

### 3.1 MVP 需要实现的能力

| 能力 | 目标 |
| --- | --- |
| `TemplateProfile` | 为每个模板建立稳定语义索引 |
| `slotKey -> nodeId` resolver | 让 agent 通过语义槽位修改节点 |
| `patternKey` resolver | 支持列表、卡片、宫格等重复结构填充 |
| `pageKind` resolver | 新建页面时自动选择参考页面 |
| `PageSpec / EditSpec` | 让 AI 输出高层结构化意图 |
| `PageSpecCompiler` | 把 spec 编译成现有编辑操作 |
| 基础校验 | 防止不存在的组件、prop、node、page 被写入 |
| agent evaluation | 用固定用例验证新链路稳定性 |

### 3.2 MVP 工具清单

MVP 建议暴露 5 个语义工具。

#### 3.2.1 `editor_submit_page_spec`

主入口。用于创建或更新一个页面。AI 提交页面级 spec，系统负责编译。

示例输入：

```ts
{
  intent: 'create_page',
  pageKind: 'order',
  title: '待收货',
  contentIntent: '展示用户待收货订单列表',
  sections: [
    {
      sectionKind: 'list',
      patternKey: 'order.card',
      items: [
        { title: '智能手表', status: '待收货', price: '¥399' }
      ]
    }
  ]
}
```

MVP 规则：

- `intent` 仅支持 `create_page` 和 `update_page`。
- 新页面必须通过 `pageKind` 选择参考页面。
- spec 内不能直接出现真实 `nodeId`。
- 编译失败时不写入文档。

#### 3.2.2 `editor_update_slot`

用于修改已有语义槽位。

示例输入：

```ts
{
  slotKey: 'home.hero.title',
  props: {
    text: '新品上市'
  }
}
```

MVP 规则：

- `slotKey` 必须存在于 `TemplateProfile`。
- `props` 只能包含该 slot 声明的 `editableProps`。
- slot 声明的 component alias 必须和真实节点 alias 一致。

#### 3.2.3 `editor_fill_pattern`

用于填充重复结构，例如商品卡片、订单卡片、功能宫格、分类列表。

示例输入：

```ts
{
  patternKey: 'product.card',
  items: [
    { title: '智能手表', price: '¥399', image: 'asset://watch' },
    { title: '蓝牙耳机', price: '¥199', image: 'asset://earbuds' }
  ]
}
```

MVP 规则：

- pattern 必须有 `sourceRootNodeId`。
- 新 item 节点由系统复制 source pattern 生成。
- 系统负责生成新 node ID。
- item 字段只能映射到 pattern 声明的 slot。
- pattern 默认继承原卡片样式、布局和交互。

#### 3.2.4 `editor_create_page_from_page_kind`

用于根据页面类型创建页面。它是当前 `editor_create_page_from_reference` 的更高层封装。

示例输入：

```ts
{
  pageKind: 'order',
  name: '待收货',
  contentIntent: '新增一个待收货订单页'
}
```

MVP 规则：

- AI 不指定 `referencePageId`。
- 系统通过 `TemplateProfile.pages` 选择最接近的 reference page。
- 找不到 reference page 时返回结构化错误。
- 成功后内部可以调用 `create_page_from_reference`。

#### 3.2.5 `editor_replace_section`

用于替换一个语义区域，例如首页 banner、分类入口、订单列表区域。

示例输入：

```ts
{
  regionKey: 'home.hero',
  sectionKind: 'campaign',
  content: {
    title: '618 限时活动',
    actionLabel: '立即查看'
  }
}
```

MVP 规则：

- 只能替换 `TemplateProfile` 声明为可替换的 region。
- 替换结构必须来自现有 section pattern 或同模板兼容 section。
- 不允许 AI 自由创建任意布局。

## 4. MVP 实施步骤

### Step 1: 定义 `TemplateProfile`

新增文件：

```text
shared/agent/template/templateProfile.ts
```

建议类型：

```ts
export type TemplateDevice = 'mobile' | 'miniapp' | 'tablet' | 'desktop'

export type TemplateProfile = {
  templateId: string
  templateVersion: string
  profileVersion: string
  devices: TemplateDevice[]
  pages: TemplateProfilePage[]
  regions: TemplateProfileRegion[]
  slots: TemplateProfileSlot[]
  patterns: TemplateProfilePattern[]
  navigation?: TemplateProfileNavigation
  constraints?: TemplateProfileConstraints
}
```

验收标准：

- 类型能表达页面、区域、槽位、重复结构和设备限制。
- 不依赖具体模板的固定节点 ID 命名规则。
- `nodeId` 只出现在 profile 的解析层，不出现在 AI spec 层。

### Step 2: 增加节点语义 metadata

扩展 ThemeLayout node 的可选 metadata：

```ts
meta?: {
  pageKey?: string
  regionKey?: string
  slotKey?: string
  patternKey?: string
  aiRole?: string
}
```

验收标准：

- 不破坏现有模板文档。
- 旧模板没有 metadata 也能通过扫描器生成基础 profile。
- 新模板可以显式标注关键 slot 和 pattern。

### Step 3: 实现 `TemplateProfile` 校验器

新增文件：

```text
shared/agent/template/validateTemplateProfile.ts
```

校验项：

- `pageKey` 唯一。
- `regionKey` 唯一。
- `slotKey` 唯一。
- `patternKey` 唯一。
- 每个 `slot.nodeId` 在目标页面存在。
- `slot.component` 和真实节点 alias 一致。
- `slot.editableProps` 都是该 component 允许的 props。
- pattern 的 source root 存在。
- pattern 下声明的 slot 都能解析到真实节点。
- device 规则和模板分类一致。

验收标准：

- profile 错误能返回结构化 error code。
- 校验结果能被 agent runtime 和测试复用。

### Step 4: 实现 profile 扫描器

新增文件：

```text
shared/agent/template/buildTemplateProfile.ts
```

输入：

```ts
ThemeLayoutDocument
```

输出：

```ts
TemplateProfile
```

初版启发式：

- 页面名称推断 `pageKey` 和 `pageKind`。
- root 直接子节点推断 `regionKey`。
- `core.text`、`core.image`、`core.button`、`core.input`、`core.search` 推断 slot。
- 重复结构推断 pattern。
- bottom nav / tabs / navigation action 推断 navigation。

验收标准：

- 现有模板能生成基础 profile。
- 生成结果可人工覆盖。
- 扫描失败不会影响现有编辑器基础渲染。

### Step 5: 支持人工 profile override

推荐路径：

```text
backend/src/templates/profiles/
```

或在 template seed 中增加：

```ts
templateProfileOverrides
```

覆盖内容：

- 修正 `pageKey` / `pageKind`。
- 修正关键 `slotKey`。
- 标记 pattern。
- 标记可替换 region。
- 标记 device 限制。

验收标准：

- 自动扫描 profile 和人工 override 可以合并。
- 人工配置优先级高于启发式推断。
- 合并后必须通过 `validateTemplateProfile`。

### Step 6: 实现 resolver

新增文件：

```text
shared/agent/template/templateProfileResolver.ts
```

需要提供：

```ts
resolvePageByKind(profile, pageKind)
resolvePageByKey(profile, pageKey)
resolveRegion(profile, regionKey)
resolveSlot(profile, slotKey)
resolvePattern(profile, patternKey)
resolveEditableProps(profile, slotKey)
```

验收标准：

- resolver 不让 AI 直接访问真实 ID。
- 找不到目标时返回可恢复错误，例如 `missing_slot`、`missing_pattern`。
- 错误中包含可用候选项，方便 AI 重新选择。

### Step 7: 定义 `PageSpec` 和 `EditSpec`

新增文件：

```text
shared/agent/specs/pageSpec.ts
shared/agent/specs/editSpec.ts
```

MVP `PageSpec` 支持：

- `create_page`
- `update_page`
- `pageKind`
- `title`
- `contentIntent`
- `sections`
- `navigation`

MVP `EditSpec` 支持：

- `update_slot`
- `fill_pattern`
- `replace_section`

验收标准：

- spec 类型不包含真实 `nodeId`。
- spec 可以表达新增页面和常见内容修改。
- spec 有 runtime validator 或 type guard。

### Step 8: 实现 `PageSpecCompiler`

新增文件：

```text
shared/agent/compiler/pageSpecCompiler.ts
```

职责：

- 根据 `pageKind` 选择 reference page。
- 调用已有 `create_page_from_reference` 编译能力。
- 把 section 转换为 `update_slot`、`fill_pattern`、`replace_section`。
- 生成稳定 `pageId`。
- 生成稳定新 node ID。
- 同步 navigation。
- 保持参考页面 layout、frame、device、style 密度。

验收标准：

- 新页面生成不需要 AI 猜 `pageId` 或 `nodeId`。
- 编译结果可以直接进入现有 apply 流程。
- 编译失败不产生文档写入。

### Step 9: 实现 5 个 MVP 语义工具

需要修改：

```text
shared/agent/tools/editorEditTools.ts
src/ai/tools/editor-edit.tool.ts
backend/src/ai/tools/editor-edit.tool.ts
```

工具：

- `editor_submit_page_spec`
- `editor_update_slot`
- `editor_fill_pattern`
- `editor_create_page_from_page_kind`
- `editor_replace_section`

验收标准：

- prompt 中优先暴露语义工具。
- 低级工具保留，但提示 AI 仅在精确修复时使用。
- 后端和前端工具定义保持一致。

### Step 10: 接入 apply 流程

需要修改：

```text
shared/agent/editor/applyEditorInstructions.ts
src/ui/editor/services/aiEditInstructions.ts
src/ui/editor/controllers/useBuilderDocumentState.ts
```

接入规则：

- 语义 instruction 先通过 resolver 转成低级 instruction。
- 转换后复用现有 component prop validation。
- 多页面操作必须 atomic。
- dry run 成功后再写入 document/canvas。

验收标准：

- `update_slot` 可以修改已有节点。
- `fill_pattern` 可以复制和填充重复卡片。
- `create_page_from_page_kind` 可以生成新页面并同步导航。
- 中途失败不会出现半生成页面。

### Step 11: 更新 agent prompt 和 context

需要修改：

```text
shared/agent/prompts/editorCopilotPrompt.ts
shared/agent/context/*
```

context 应提供：

- active page
- available page kinds
- available regions
- available slots
- available patterns
- device rules
- style summary
- navigation map

prompt 规则：

- 不要猜 `nodeId`。
- 不要自由创建完整布局。
- 新页面必须通过 `pageKind`。
- 文案、图片、按钮修改必须优先通过 `slotKey`。
- 列表、卡片、宫格必须优先通过 `patternKey`。
- 不允许发明不存在的 component prop。

验收标准：

- agent 输出工具调用时优先使用语义工具。
- agent 无法解析目标时会请求可用 slot/pattern，而不是猜 ID。

### Step 12: 增加 MVP 测试和评估

新增或扩展：

```text
shared/agent/template/*.test.ts
shared/agent/compiler/*.test.ts
agent evaluation cases
```

MVP evaluation case：

- 新增“待收货”页面，风格跟订单页一致。
- 把首页 hero 标题改成指定文案。
- 把商品列表替换成 8 个商品。
- 新增一个分类页，并同步底部导航。
- 小程序模板禁止生成桌面布局。
- 平板模板生成页面时禁用桌面预览。

验收标准：

- profile 校验测试通过。
- compiler 测试通过。
- agent evaluation 通过率达到可接受阈值。
- `npm run lint`、前端 typecheck、后端 typecheck 通过。

## 5. MVP 后需要补齐的功能

### Phase 2: Profile 管理和版本化

需要补齐：

- Profile 管理 UI。
- Profile diff。
- Profile override 编辑。
- Profile 版本号。
- 模板版本和 profile 版本绑定。
- 模板结构变化后的 profile 失效检测。

验收标准：

- 用户或开发者能看到当前模板有哪些 page、region、slot、pattern。
- 修改模板后能检测哪些 slot/pattern 已失效。
- 旧模板能通过 profile migration 保持可用。

### Phase 3: Profile 自动修复

需要补齐：

- 重新扫描当前模板。
- 对比旧 profile 和新文档结构。
- 自动修复简单 nodeId 迁移。
- 对无法修复的 slot 返回人工确认项。
- 对 pattern 结构损坏给出具体提示。

验收标准：

- 用户手动移动节点后，关键 slot 仍能被重新匹配。
- 删除关键节点时，系统能指出受影响的 page/region/slot/pattern。

### Phase 4: 设计一致性校验器

新增文件：

```text
shared/agent/validation/designPolicyValidator.ts
```

需要校验：

- 颜色是否来自模板 token 或已有颜色集合。
- 字号是否来自模板 typography scale。
- 间距是否来自模板 spacing scale。
- 圆角、阴影、边框是否和模板风格一致。
- 移动端是否生成了桌面多栏布局。
- 平板模板是否错误生成桌面预览或桌面布局。
- 同一 pattern 内的卡片结构是否一致。

验收标准：

- AI 生成的新页面在 style profile 范围内。
- 明显脱离模板风格的操作会被拒绝。
- 拒绝原因可被 agent 用来修正 spec。

### Phase 5: `TemplateStyleProfile`

从模板中提取：

- colors
- font families
- font sizes
- font weights
- spacing
- radius
- shadows
- component density
- common layout patterns

用途：

- 提供给 prompt。
- 提供给 compiler。
- 提供给 design policy validator。
- 提供给导出和预览检查。

验收标准：

- 新节点默认复用已有视觉 token。
- AI 不需要自己发明样式值。

### Phase 6: 更完整的 DSL

扩展 `PageSpec` / `EditSpec`：

- 空状态。
- 加载状态。
- 表单字段。
- 列表筛选。
- tab 页面。
- 详情页字段映射。
- 操作按钮和交互。
- 页面跳转。
- 数据绑定占位。
- 多页面工作流。

验收标准：

- 常见 app、小程序、SaaS、商城页面都能用 spec 表达。
- spec 仍然不暴露真实 `nodeId`。

### Phase 7: 失败恢复协议

定义标准错误：

```ts
type AgentEditError =
  | { code: 'missing_slot'; slotKey: string; availableSlots: string[] }
  | { code: 'missing_pattern'; patternKey: string; availablePatterns: string[] }
  | { code: 'invalid_props'; component: string; props: string[]; allowedProps: string[] }
  | { code: 'missing_page_kind'; pageKind: string; availablePageKinds: string[] }
  | { code: 'design_policy_violation'; reasons: string[] }
```

验收标准：

- agent 可以根据结构化错误自我修正。
- 用户看到的是清晰原因，不是底层异常。
- 不再出现失败后继续猜节点 ID 的行为。

### Phase 8: 语义 diff 和回滚

需要补齐：

- 执行前 dry-run diff。
- 执行后 semantic diff。
- 展示新增页面、修改 slot、填充 pattern、替换 section。
- 一键撤销本次 agent 操作。
- agent 操作历史记录。

验收标准：

- 用户能明确看到 agent 做了什么。
- 每次 agent 操作都可以回滚。

### Phase 9: 资产选择系统

需要补齐：

- 用户素材库。
- 模板默认素材。
- 语义素材占位。
- 图片比例约束。
- fallback 图片策略。
- 图片来源和授权信息。

验收标准：

- `core.image` 不再依赖 AI 随机生成 URL。
- 图片比例和模板卡片结构匹配。
- 缺图时有稳定 fallback。

### Phase 10: 多模板评测集

覆盖模板：

- 电商模板。
- 小程序模板。
- SaaS 模板。
- 订单模板。
- 表单模板。
- 个人中心模板。
- 平板模板。
- 桌面管理后台模板。

评测任务：

- 新增页面。
- 更新文案。
- 填充列表。
- 替换区域。
- 同步导航。
- 设备限制。
- 失败恢复。

验收标准：

- 每类模板至少有一组固定 evaluation。
- evaluation 覆盖成功路径和失败路径。
- 新增模板前必须补 profile 和 evaluation。

### Phase 11: 观测和调试日志

每次 agent 执行记录：

```text
original request
inferred intent
selected template profile
selected pageKind
selected reference page
slots changed
patterns filled
sections replaced
compiled operations
validation result
apply result
```

验收标准：

- 可以定位 agent 是意图识别错、profile 缺失、compiler 错、还是 apply 错。
- 日志不泄露用户敏感内容给不必要的外部服务。

## 6. 推荐执行顺序

### MVP 顺序

1. 定义 `TemplateProfile` 类型。
2. 增加基础 profile 校验器。
3. 增加 profile 扫描器。
4. 支持人工 override。
5. 增加 resolver。
6. 定义 `PageSpec` / `EditSpec`。
7. 实现 `PageSpecCompiler`。
8. 实现 `editor_update_slot`。
9. 实现 `editor_fill_pattern`。
10. 实现 `editor_create_page_from_page_kind`。
11. 实现 `editor_submit_page_spec`。
12. 实现 `editor_replace_section`。
13. 接入 frontend/backend/shared apply。
14. 更新 prompt 和 agent context。
15. 增加 MVP tests 和 evaluation。

### MVP 后顺序

1. Profile 管理和版本化。
2. Profile 自动修复。
3. 设计一致性校验器。
4. `TemplateStyleProfile`。
5. 更完整 DSL。
6. 失败恢复协议。
7. 语义 diff 和回滚。
8. 资产选择系统。
9. 多模板评测集。
10. 观测和调试日志。

## 7. MVP 非目标

MVP 暂不做：

- 任意自由布局生成。
- 任意 CSS/token 生成。
- 任意 React 代码生成。
- 完整 profile 管理后台。
- 完整素材库。
- 多页面复杂业务流程编排。
- 用户级权限、审计和协同编辑改造。

这些能力会增加实现面和失败模式，应在语义生成主链路稳定后再补。

## 8. 最小验收标准

MVP 完成时应满足：

1. Agent 新增页面时不再猜 page ID。
2. Agent 修改内容时优先使用 `slotKey`。
3. Agent 填充列表时优先使用 `patternKey`。
4. 新页面默认继承参考页面结构和风格。
5. 不存在的 component prop 会在写入前被拒绝。
6. 多页面操作失败时不会半写入。
7. 至少 5 个 agent evaluation case 稳定通过。
8. 新模板可以通过 profile 被 agent 快速索引。

