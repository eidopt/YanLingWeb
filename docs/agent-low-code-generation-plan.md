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

### 3.3 MVP 阶段的错误处理策略

虽然 Phase 7 会定义完整的失败恢复协议，但 MVP 阶段就需要基础的错误处理机制，确保系统稳定性和可调试性。

#### 3.3.1 基础错误类型定义

```ts
// shared/agent/errors/agentErrors.ts

export type AgentEditError =
  // Resolver 阶段错误
  | { code: 'slot_not_found'; slotKey: string; availableSlots: string[] }
  | { code: 'pattern_not_found'; patternKey: string; availablePatterns: string[] }
  | { code: 'page_kind_not_found'; pageKind: string; availablePageKinds: string[] }
  | { code: 'region_not_found'; regionKey: string; availableRegions: string[] }
  
  // 校验阶段错误
  | { code: 'invalid_props'; slot: string; invalidProps: string[]; allowedProps: string[] }
  | { code: 'invalid_component'; slot: string; expected: string; actual: string }
  | { code: 'device_violation'; device: string; violation: string }
  
  // 编译阶段错误
  | { code: 'compile_failed'; reason: string; recoverable: boolean }
  | { code: 'reference_page_not_found'; pageKind: string }
  | { code: 'navigation_sync_failed'; reason: string }
  
  // 应用阶段错误
  | { code: 'apply_failed'; reason: string; partialSuccess: boolean }
  | { code: 'version_conflict'; expected: number; actual: number }
  | { code: 'atomic_rollback_failed'; reason: string }

export interface AgentEditResult<T = void> {
  success: boolean
  data?: T
  error?: AgentEditError
  warnings?: string[]
}
```

#### 3.3.2 错误处理原则

1. **结构化错误**：所有错误必须包含 `code` 和足够的上下文信息
2. **可恢复性标记**：每个错误必须标记 `recoverable` 属性
3. **候选项提供**：找不到目标时，必须提供可用候选项列表
4. **错误链**：底层错误可以包装为高层错误，保留原始错误信息
5. **日志友好**：错误对象可直接序列化为日志

#### 3.3.3 重试策略

```ts
// MVP 阶段的基础重试配置
const MVP_RETRY_CONFIG = {
  maxRetries: 2,
  retryableErrors: [
    'slot_not_found',
    'pattern_not_found',
    'version_conflict'
  ],
  backoff: {
    initialMs: 100,
    maxMs: 1000,
    multiplier: 2
  }
}
```

MVP 规则：
- 只对明确标记为 `recoverable` 的错误进行重试
- 重试时必须使用错误中提供的候选项重新选择
- 超过最大重试次数后返回最终错误
- `apply_failed` 和 `atomic_rollback_failed` 不可重试

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

#### 3.3.4 安全校验（新增）

在 `validateTemplateProfile` 中增加安全相关校验：

```ts
// 安全校验项
const SECURITY_CHECKS = {
  // 1. 输入清理
  sanitizeInput: (input: string) => {
    // 移除潜在的注入字符
    // 限制字符串长度
    // 转义特殊字符
  },
  
  // 2. key 格式校验
  validateKeyFormat: (key: string) => {
    // pageKey, regionKey, slotKey, patternKey 必须符合命名规范
    // 只允许字母、数字、下划线、连字符
    // 长度限制：3-64 字符
    const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/
    return KEY_PATTERN.test(key)
  },
  
  // 3. nodeId 脱敏
  maskNodeId: (nodeId: string) => {
    // 在日志和错误信息中脱敏 nodeId
    // 只保留前 8 位和后 4 位
    return nodeId.length > 12 
      ? `${nodeId.slice(0, 8)}...${nodeId.slice(-4)}`
      : '***'
  },
  
  // 4. 敏感信息检测
  detectSensitiveData: (data: any) => {
    // 检测是否包含用户敏感信息
    // 检测是否包含内部系统路径
    // 检测是否包含密钥或 token
  }
}

// 在校验流程中调用
export function validateTemplateProfile(profile: TemplateProfile): ValidationResult {
  // ... 现有校验 ...
  
  // 安全校验
  const securityErrors = []
  
  // 校验所有 key 格式
  profile.pages.forEach(page => {
    if (!SECURITY_CHECKS.validateKeyFormat(page.pageKey)) {
      securityErrors.push({
        code: 'invalid_key_format',
        field: 'pageKey',
        value: page.pageKey,
        pattern: '^[a-zA-Z][a-zA-Z0-9_-]{2,63}$'
      })
    }
  })
  
  // 校验 slot props 中的字符串值
  profile.slots.forEach(slot => {
    Object.entries(slot.editableProps || {}).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const sanitized = SECURITY_CHECKS.sanitizeInput(value)
        if (sanitized !== value) {
          securityErrors.push({
            code: 'unsafe_prop_value',
            slot: slot.slotKey,
            prop: key,
            suggestion: sanitized
          })
        }
      }
    })
  })
  
  return {
    valid: securityErrors.length === 0,
    errors: [...existingErrors, ...securityErrors]
  }
}
```

验收标准：

- profile 错误能返回结构化 error code。
- 校验结果能被 agent runtime 和测试复用。
- 所有 key 格式符合命名规范，防止注入攻击。
- 敏感信息在日志中自动脱敏。
- 用户输入经过清理和转义。

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

#### 4.4.1 性能优化策略（新增）

Profile 扫描可能涉及大量节点遍历，需要考虑性能优化：

```ts
// shared/agent/template/profileCache.ts

interface ProfileCacheEntry {
  templateId: string
  templateVersion: string
  profile: TemplateProfile
  buildTime: number  // 构建耗时（ms）
  createdAt: number  // 缓存创建时间
  accessCount: number
}

class ProfileCache {
  private cache = new Map<string, ProfileCacheEntry>()
  private readonly MAX_CACHE_SIZE = 50
  private readonly CACHE_TTL_MS = 5 * 60 * 1000  // 5 分钟
  
  /**
   * 获取缓存的 Profile
   * 优先级：内存缓存 > 本地存储 > 重新扫描
   */
  async getProfile(templateId: string, templateVersion: string): Promise<TemplateProfile> {
    const cacheKey = `${templateId}@${templateVersion}`
    
    // 1. 检查内存缓存
    const cached = this.cache.get(cacheKey)
    if (cached && this.isValid(cached)) {
      cached.accessCount++
      return cached.profile
    }
    
    // 2. 检查本地存储（可选）
    const stored = await this.loadFromStorage(cacheKey)
    if (stored) {
      this.cache.set(cacheKey, stored)
      return stored.profile
    }
    
    // 3. 重新扫描并缓存
    return this.buildAndCache(templateId, templateVersion)
  }
  
  private isValid(entry: ProfileCacheEntry): boolean {
    const now = Date.now()
    return (now - entry.createdAt) < this.CACHE_TTL_MS
  }
  
  private async buildAndCache(templateId: string, templateVersion: string): Promise<TemplateProfile> {
    const startTime = performance.now()
    const profile = await buildTemplateProfile(templateId)
    const buildTime = performance.now() - startTime
    
    const entry: ProfileCacheEntry = {
      templateId,
      templateVersion,
      profile,
      buildTime,
      createdAt: Date.now(),
      accessCount: 1
    }
    
    this.cache.set(`${templateId}@${templateVersion}`, entry)
    
    // 如果缓存过大，淘汰低频访问的条目
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.evictLeastUsed()
    }
    
    // 记录性能指标
    this.recordMetrics(templateId, buildTime)
    
    return profile
  }
  
  private evictLeastUsed(): void {
    let minAccess = Infinity
    let minKey = ''
    
    for (const [key, entry] of this.cache) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount
        minKey = key
      }
    }
    
    if (minKey) {
      this.cache.delete(minKey)
    }
  }
  
  private recordMetrics(templateId: string, buildTime: number): void {
    // 记录到监控系统
    console.debug(`[ProfileCache] Built profile for ${templateId} in ${buildTime.toFixed(2)}ms`)
  }
  
  /**
   * 批量预热缓存
   * 在系统启动时调用，预加载常用模板
   */
  async warmup(templateIds: string[]): Promise<void> {
    const results = await Promise.allSettled(
      templateIds.map(id => this.getProfile(id, 'latest'))
    )
    
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    console.info(`[ProfileCache] Warmup complete: ${succeeded}/${templateIds.length} profiles cached`)
  }
  
  /**
   * 清除过期缓存
   * 建议每 10 分钟调用一次
   */
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if ((now - entry.createdAt) > this.CACHE_TTL_MS) {
        this.cache.delete(key)
      }
    }
  }
}

export const profileCache = new ProfileCache()
```

#### 4.4.2 迁移策略（新增）

现有模板需要平滑迁移到新的 Profile 系统：

```ts
// shared/agent/template/migration.ts

interface MigrationResult {
  templateId: string
  migrated: boolean
  warnings: string[]
  errors: string[]
}

/**
 * 批量迁移现有模板
 * 在系统升级时调用一次
 */
export async function migrateExistingTemplates(): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []
  
  // 1. 获取所有现有模板
  const templates = await getAllTemplates()
  
  for (const template of templates) {
    const result: MigrationResult = {
      templateId: template.id,
      migrated: false,
      warnings: [],
      errors: []
    }
    
    try {
      // 2. 检查是否已有 Profile
      const existingProfile = await loadProfile(template.id)
      if (existingProfile) {
        result.warnings.push('Profile already exists, skipping')
        results.push(result)
        continue
      }
      
      // 3. 扫描生成基础 Profile
      const profile = await buildTemplateProfile(template.id)
      
      // 4. 校验生成的 Profile
      const validation = validateTemplateProfile(profile)
      if (!validation.valid) {
        result.warnings.push(`Profile validation warnings: ${validation.warnings.join(', ')}`)
      }
      
      // 5. 保存 Profile
      await saveProfile(template.id, profile)
      
      result.migrated = true
      console.info(`[Migration] Successfully migrated template: ${template.id}`)
      
    } catch (error) {
      result.errors.push(`Migration failed: ${error.message}`)
      console.error(`[Migration] Failed to migrate template: ${template.id}`, error)
    }
    
    results.push(result)
  }
  
  // 6. 输出迁移报告
  const summary = {
    total: results.length,
    migrated: results.filter(r => r.migrated).length,
    skipped: results.filter(r => r.warnings.length > 0).length,
    failed: results.filter(r => r.errors.length > 0).length
  }
  
  console.info('[Migration] Migration complete:', summary)
  
  return results
}

/**
 * 验证迁移后的 Profile 兼容性
 */
export async function validateMigrationCompatibility(templateId: string): Promise<{
  compatible: boolean
  issues: string[]
}> {
  const issues: string[] = []
  
  // 1. 加载 Profile
  const profile = await profileCache.getProfile(templateId, 'latest')
  
  // 2. 检查 nodeId 是否仍然有效
  for (const slot of profile.slots) {
    const node = await findNodeById(slot.nodeId)
    if (!node) {
      issues.push(`Slot ${slot.slotKey} references non-existent node: ${slot.nodeId}`)
    } else if (node.alias !== slot.component) {
      issues.push(`Slot ${slot.slotKey} component mismatch: expected ${slot.component}, got ${node.alias}`)
    }
  }
  
  // 3. 检查 pattern source 是否存在
  for (const pattern of profile.patterns) {
    const sourceNode = await findNodeById(pattern.sourceRootNodeId)
    if (!sourceNode) {
      issues.push(`Pattern ${pattern.patternKey} source node not found: ${pattern.sourceRootNodeId}`)
    }
  }
  
  return {
    compatible: issues.length === 0,
    issues
  }
}
```

验收标准：

- 现有模板能生成基础 profile。
- 生成结果可人工覆盖。
- 扫描失败不会影响现有编辑器基础渲染。
- Profile 扫描性能：单个模板 < 100ms（目标）。
- 缓存命中率 > 80%（常用模板）。
- 现有模板批量迁移成功率 > 95%。
- 迁移后 Profile 与现有节点兼容性 > 99%。

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

#### 4.10.1 并发控制机制（新增）

当多个 agent 或用户同时编辑同一页面时，需要防止冲突：

```ts
// shared/agent/editor/concurrencyControl.ts

interface DocumentLock {
  documentId: string
  lockId: string
  lockedBy: string  // agent session id 或 user id
  lockedAt: number
  expiresAt: number
  operation: string  // 正在执行的操作描述
}

interface VersionedDocument {
  documentId: string
  version: number
  lastModified: number
  checksum: string  // 内容校验和
}

class ConcurrencyControl {
  private locks = new Map<string, DocumentLock>()
  private readonly LOCK_TIMEOUT_MS = 30 * 1000  // 30 秒
  
  /**
   * 获取文档锁
   * 使用乐观锁策略：先检查版本，再执行操作
   */
  async acquireLock(
    documentId: string,
    sessionId: string,
    operation: string
  ): Promise<{ acquired: boolean; lockId?: string; reason?: string }> {
    
    // 1. 检查是否已有锁
    const existingLock = this.locks.get(documentId)
    if (existingLock && !this.isLockExpired(existingLock)) {
      // 如果是同一 session，允许重入
      if (existingLock.lockedBy === sessionId) {
        return { acquired: true, lockId: existingLock.lockId }
      }
      return {
        acquired: false,
        reason: `Document locked by ${existingLock.lockedBy} for: ${existingLock.operation}`
      }
    }
    
    // 2. 创建新锁
    const lockId = this.generateLockId()
    const now = Date.now()
    
    const lock: DocumentLock = {
      documentId,
      lockId,
      lockedBy: sessionId,
      lockedAt: now,
      expiresAt: now + this.LOCK_TIMEOUT_MS,
      operation
    }
    
    this.locks.set(documentId, lock)
    
    // 3. 设置自动释放
    setTimeout(() => {
      this.releaseLock(documentId, lockId)
    }, this.LOCK_TIMEOUT_MS)
    
    return { acquired: true, lockId }
  }
  
  /**
   * 释放文档锁
   */
  releaseLock(documentId: string, lockId: string): boolean {
    const lock = this.locks.get(documentId)
    if (lock && lock.lockId === lockId) {
      this.locks.delete(documentId)
      return true
    }
    return false
  }
  
  /**
   * 检查文档版本
   * 在执行操作前调用，确保文档未被修改
   */
  async checkVersion(
    documentId: string,
    expectedVersion: number
  ): Promise<{ valid: boolean; currentVersion?: number; conflict?: boolean }> {
    
    const currentDoc = await this.getDocumentVersion(documentId)
    
    if (currentDoc.version === expectedVersion) {
      return { valid: true, currentVersion: currentDoc.version }
    }
    
    return {
      valid: false,
      currentVersion: currentDoc.version,
      conflict: true
    }
  }
  
  /**
   * 递增文档版本
   * 操作成功后调用
   */
  async incrementVersion(documentId: string): Promise<number> {
    const currentDoc = await this.getDocumentVersion(documentId)
    const newVersion = currentDoc.version + 1
    
    await this.updateDocumentVersion(documentId, {
      version: newVersion,
      lastModified: Date.now(),
      checksum: await this.calculateChecksum(documentId)
    })
    
    return newVersion
  }
  
  private isLockExpired(lock: DocumentLock): boolean {
    return Date.now() > lock.expiresAt
  }
  
  private generateLockId(): string {
    return `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  private async getDocumentVersion(documentId: string): Promise<VersionedDocument> {
    // 从存储中获取文档版本信息
    // 实现略
  }
  
  private async updateDocumentVersion(documentId: string, update: Partial<VersionedDocument>): Promise<void> {
    // 更新文档版本信息
    // 实现略
  }
  
  private async calculateChecksum(documentId: string): Promise<string> {
    // 计算文档内容的校验和
    // 实现略
  }
}

export const concurrencyControl = new ConcurrencyControl()
```

#### 4.10.2 原子操作和回滚机制（新增）

确保多步骤操作的原子性，失败时可以完全回滚：

```ts
// shared/agent/editor/atomicOperations.ts

interface OperationSnapshot {
  documentId: string
  snapshotId: string
  timestamp: number
  state: any  // 文档状态快照
  metadata: {
    operation: string
    sessionId: string
    description: string
  }
}

interface AtomicOperation {
  operationId: string
  documentId: string
  steps: OperationStep[]
  currentStep: number
  snapshots: OperationSnapshot[]
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back'
}

interface OperationStep {
  stepId: string
  description: string
  execute: () => Promise<void>
  rollback: () => Promise<void>
  committed: boolean
}

class AtomicOperationManager {
  private operations = new Map<string, AtomicOperation>()
  
  /**
   * 创建原子操作
   */
  async createAtomicOperation(
    documentId: string,
    sessionId: string,
    steps: OperationStep[]
  ): Promise<string> {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 1. 创建初始快照
    const snapshot = await this.createSnapshot(documentId, {
      operation: operationId,
      sessionId,
      description: 'Initial state before atomic operation'
    })
    
    const operation: AtomicOperation = {
      operationId,
      documentId,
      steps,
      currentStep: 0,
      snapshots: [snapshot],
      status: 'pending'
    }
    
    this.operations.set(operationId, operation)
    
    return operationId
  }
  
  /**
   * 执行原子操作
   * 逐步执行，每步成功后创建快照
   */
  async executeAtomicOperation(operationId: string): Promise<AgentEditResult> {
    const operation = this.operations.get(operationId)
    if (!operation) {
      return {
        success: false,
        error: {
          code: 'operation_not_found',
          reason: `Operation ${operationId} not found`,
          recoverable: false
        }
      }
    }
    
    operation.status = 'in_progress'
    
    try {
      for (let i = operation.currentStep; i < operation.steps.length; i++) {
        const step = operation.steps[i]
        
        try {
          // 执行步骤
          await step.execute()
          step.committed = true
          operation.currentStep = i + 1
          
          // 创建步骤后快照
          const snapshot = await this.createSnapshot(operation.documentId, {
            operation: operationId,
            sessionId: '',  // 从上下文获取
            description: `After step: ${step.description}`
          })
          operation.snapshots.push(snapshot)
          
        } catch (stepError) {
          // 步骤失败，开始回滚
          console.error(`[AtomicOperation] Step ${i} failed:`, stepError)
          
          const rollbackResult = await this.rollbackOperation(operationId)
          
          return {
            success: false,
            error: {
              code: 'apply_failed',
              reason: `Step ${step.description} failed: ${stepError.message}`,
              partialSuccess: false
            }
          }
        }
      }
      
      operation.status = 'completed'
      
      return {
        success: true,
        data: {
          operationId,
          stepsCompleted: operation.steps.length,
          snapshotsCreated: operation.snapshots.length
        }
      }
      
    } catch (error) {
      operation.status = 'failed'
      
      return {
        success: false,
        error: {
          code: 'apply_failed',
          reason: error.message,
          partialSuccess: false
        }
      }
    }
  }
  
  /**
   * 回滚操作
   * 从最后一个成功步骤开始，逐步回滚
   */
  async rollbackOperation(operationId: string): Promise<AgentEditResult> {
    const operation = this.operations.get(operationId)
    if (!operation) {
      return {
        success: false,
        error: {
          code: 'operation_not_found',
          reason: `Operation ${operationId} not found`,
          recoverable: false
        }
      }
    }
    
    console.info(`[AtomicOperation] Rolling back operation ${operationId}`)
    
    // 从后往前回滚已提交的步骤
    for (let i = operation.currentStep - 1; i >= 0; i--) {
      const step = operation.steps[i]
      
      if (step.committed) {
        try {
          await step.rollback()
          console.debug(`[AtomicOperation] Rolled back step: ${step.description}`)
        } catch (rollbackError) {
          console.error(`[AtomicOperation] Rollback failed for step ${i}:`, rollbackError)
          
          operation.status = 'failed'
          
          return {
            success: false,
            error: {
              code: 'atomic_rollback_failed',
              reason: `Rollback failed at step ${step.description}: ${rollbackError.message}`,
              recoverable: false
            }
          }
        }
      }
    }
    
    // 恢复到初始快照
    const initialSnapshot = operation.snapshots[0]
    await this.restoreSnapshot(initialSnapshot)
    
    operation.status = 'rolled_back'
    
    return {
      success: true,
      data: {
        operationId,
        stepsRolledBack: operation.currentStep,
        restoredToSnapshot: initialSnapshot.snapshotId
      }
    }
  }
  
  /**
   * 创建文档快照
   */
  private async createSnapshot(
    documentId: string,
    metadata: OperationSnapshot['metadata']
  ): Promise<OperationSnapshot> {
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const state = await this.captureDocumentState(documentId)
    
    const snapshot: OperationSnapshot = {
      documentId,
      snapshotId,
      timestamp: Date.now(),
      state,
      metadata
    }
    
    // 持久化快照（可选，根据存储策略）
    await this.persistSnapshot(snapshot)
    
    return snapshot
  }
  
  /**
   * 恢复快照
   */
  private async restoreSnapshot(snapshot: OperationSnapshot): Promise<void> {
    await this.restoreDocumentState(snapshot.documentId, snapshot.state)
  }
  
  private async captureDocumentState(documentId: string): Promise<any> {
    // 捕获文档当前状态
    // 实现略
  }
  
  private async restoreDocumentState(documentId: string, state: any): Promise<void> {
    // 恢复文档状态
    // 实现略
  }
  
  private async persistSnapshot(snapshot: OperationSnapshot): Promise<void> {
    // 持久化快照到存储
    // 实现略
  }
  
  /**
   * 清理过期快照
   * 建议每小时调用一次
   */
  async cleanupSnapshots(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    // 清理超过 maxAgeMs 的快照
    // 返回清理的快照数量
    return 0
  }
}

export const atomicOperationManager = new AtomicOperationManager()
```

验收标准：

- `update_slot` 可以修改已有节点。
- `fill_pattern` 可以复制和填充重复卡片。
- `create_page_from_page_kind` 可以生成新页面并同步导航。
- 中途失败不会出现半生成页面。
- 并发安全：两个 agent 同时编辑同一页面时，后者收到冲突错误（`version_conflict`）。
- 操作失败时自动回滚到操作前状态。
- 回滚成功率 > 99%（除存储故障外）。
- 编译性能：单页面 spec 编译 < 500ms（目标）。
- 应用性能：单个 slot 更新 < 100ms，pattern 填充（10 个 item）< 1s。

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

- 新增"待收货"页面，风格跟订单页一致。
- 把首页 hero 标题改成指定文案。
- 把商品列表替换成 8 个商品。
- 新增一个分类页，并同步底部导航。
- 小程序模板禁止生成桌面布局。
- 平板模板生成页面时禁用桌面预览。

#### 4.12.1 测试数据管理（新增）

为确保测试的可重复性和稳定性，需要建立完善的测试数据管理体系：

```text
backend/src/templates/test/
├── fixtures/                    # 测试固定数据
│   ├── profiles/               # 测试用 Profile
│   │   ├── ecommerce.json     # 电商模板 Profile
│   │   ├── miniapp.json       # 小程序模板 Profile
│   │   ├── saas.json          # SaaS 模板 Profile
│   │   └── order.json         # 订单模板 Profile
│   ├── specs/                  # 测试用 Spec
│   │   ├── create-order.json
│   │   ├── update-hero.json
│   │   └── fill-products.json
│   └── documents/              # 测试用文档
│       ├── base-order.json
│       └── base-home.json
├── generators/                  # 测试数据生成器
│   ├── profileGenerator.ts
│   ├── specGenerator.ts
│   └── documentGenerator.ts
├── seeds/                       # 测试种子数据
│   ├── seedTestTemplates.ts
│   └── seedTestProfiles.ts
└── helpers/                     # 测试辅助函数
    ├── testSetup.ts
    ├── assertions.ts
    └── cleanup.ts
```

测试数据生成器示例：

```ts
// backend/src/templates/test/generators/profileGenerator.ts

interface ProfileGeneratorOptions {
  templateType: 'ecommerce' | 'miniapp' | 'saas' | 'order'
  pageCount?: number
  slotCount?: number
  patternCount?: number
  includeOptional?: boolean
}

export function generateTestProfile(options: ProfileGeneratorOptions): TemplateProfile {
  const {
    templateType,
    pageCount = 3,
    slotCount = 10,
    patternCount = 2,
    includeOptional = true
  } = options
  
  // 根据模板类型生成基础结构
  const baseProfile = getBaseProfileByType(templateType)
  
  // 根据参数调整规模
  return {
    ...baseProfile,
    templateId: `test-${templateType}-${Date.now()}`,
    profileVersion: '1.0.0-test',
    pages: generatePages(pageCount, templateType),
    slots: generateSlots(slotCount, templateType),
    patterns: generatePatterns(patternCount, templateType),
    constraints: includeOptional ? generateConstraints(templateType) : undefined
  }
}

function getBaseProfileByType(type: string): Partial<TemplateProfile> {
  const bases: Record<string, Partial<TemplateProfile>> = {
    ecommerce: {
      devices: ['mobile', 'desktop'],
      navigation: {
        type: 'bottom_tabs',
        items: [
          { key: 'home', label: '首页', icon: 'home' },
          { key: 'category', label: '分类', icon: 'category' },
          { key: 'cart', label: '购物车', icon: 'cart' },
          { key: 'user', label: '我的', icon: 'user' }
        ]
      }
    },
    miniapp: {
      devices: ['mobile'],
      constraints: {
        maxColumns: 1,
        allowedLayouts: ['single_column', 'grid_2']
      }
    },
    // ... 其他类型
  }
  
  return bases[type] || bases.ecommerce
}
```

测试种子数据示例：

```ts
// backend/src/templates/test/seeds/seedTestTemplates.ts

export async function seedTestTemplates(): Promise<void> {
  console.info('[TestSeed] Seeding test templates...')
  
  const templates = [
    {
      id: 'test-ecommerce',
      name: 'Test E-commerce Template',
      type: 'ecommerce',
      pages: [
        { name: '首页', pageKey: 'home', pageKind: 'home' },
        { name: '商品列表', pageKey: 'products', pageKind: 'list' },
        { name: '订单', pageKey: 'orders', pageKind: 'order' }
      ]
    },
    {
      id: 'test-miniapp',
      name: 'Test Mini App Template',
      type: 'miniapp',
      pages: [
        { name: '首页', pageKey: 'home', pageKind: 'home' },
        { name: '个人中心', pageKey: 'profile', pageKind: 'profile' }
      ]
    }
    // ... 更多测试模板
  ]
  
  for (const template of templates) {
    await createTestTemplate(template)
    await seedTestProfile(template.id, template.type)
  }
  
  console.info(`[TestSeed] Seeded ${templates.length} test templates`)
}

export async function seedTestProfile(templateId: string, templateType: string): Promise<void> {
  const profile = generateTestProfile({
    templateType: templateType as any,
    pageCount: 3,
    slotCount: 8,
    patternCount: 2
  })
  
  await saveProfile(templateId, profile)
  console.debug(`[TestSeed] Seeded profile for template: ${templateId}`)
}
```

测试辅助函数：

```ts
// backend/src/templates/test/helpers/assertions.ts

export function expectProfileValid(profile: TemplateProfile): void {
  // 基础结构校验
  expect(profile.templateId).toBeDefined()
  expect(profile.pages).toBeInstanceOf(Array)
  expect(profile.slots).toBeInstanceOf(Array)
  expect(profile.patterns).toBeInstanceOf(Array)
  
  // key 唯一性校验
  const pageKeys = profile.pages.map(p => p.pageKey)
  expect(new Set(pageKeys).size).toBe(pageKeys.length)
  
  const slotKeys = profile.slots.map(s => s.slotKey)
  expect(new Set(slotKeys).size).toBe(slotKeys.length)
  
  // 关联完整性校验
  for (const slot of profile.slots) {
    const page = profile.pages.find(p => p.pageKey === slot.pageKey)
    expect(page).toBeDefined()
  }
}

export function expectCompilationSuccess(result: AgentEditResult): void {
  expect(result.success).toBe(true)
  expect(result.error).toBeUndefined()
  expect(result.data).toBeDefined()
}

export function expectCompilationFailure(result: AgentEditResult, expectedCode: string): void {
  expect(result.success).toBe(false)
  expect(result.error).toBeDefined()
  expect(result.error!.code).toBe(expectedCode)
}

export function expectAtomicOperationSuccess(result: AgentEditResult): void {
  expect(result.success).toBe(true)
  expect(result.data).toHaveProperty('operationId')
  expect(result.data).toHaveProperty('stepsCompleted')
}

export function expectRollbackSuccess(result: AgentEditResult): void {
  expect(result.success).toBe(true)
  expect(result.data).toHaveProperty('stepsRolledBack')
  expect(result.data).toHaveProperty('restoredToSnapshot')
}
```

测试配置：

```ts
// backend/src/templates/test/helpers/testSetup.ts

export async function setupTestEnvironment(): Promise<void> {
  // 1. 初始化测试数据库
  await initTestDatabase()
  
  // 2. 清理旧数据
  await cleanupTestData()
  
  // 3. 种子测试数据
  await seedTestTemplates()
  
  // 4. 初始化缓存
  await profileCache.warmup(['test-ecommerce', 'test-miniapp'])
  
  console.info('[TestSetup] Test environment ready')
}

export async function cleanupTestEnvironment(): Promise<void> {
  // 1. 清理测试数据
  await cleanupTestData()
  
  // 2. 清理缓存
  profileCache.cleanup()
  
  // 3. 清理快照
  await atomicOperationManager.cleanupSnapshots(0)  // 清理所有快照
  
  console.info('[TestSetup] Test environment cleaned')
}
```

验收标准：

- profile 校验测试通过。
- compiler 测试通过。
- agent evaluation 通过率达到可接受阈值。
- `npm run lint`、前端 typecheck、后端 typecheck 通过。
- 测试覆盖率 > 80%（核心模块）。
- 测试数据生成器可以快速生成各类测试场景。
- 测试环境可以在 30 秒内完成初始化和清理。
- 所有测试用例可以在 5 分钟内执行完毕。

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

### 8.1 功能验收标准

1. Agent 新增页面时不再猜 page ID。
2. Agent 修改内容时优先使用 `slotKey`。
3. Agent 填充列表时优先使用 `patternKey`。
4. 新页面默认继承参考页面结构和风格。
5. 不存在的 component prop 会在写入前被拒绝。
6. 多页面操作失败时不会半写入。
7. 至少 5 个 agent evaluation case 稳定通过。
8. 新模板可以通过 profile 被 agent 快速索引。

### 8.2 性能验收标准

9. Profile 扫描性能：单个模板 < 100ms（目标），< 200ms（可接受）。
10. Profile 缓存命中率：常用模板 > 80%。
11. 编译性能：单页面 spec 编译 < 500ms（目标），< 1s（可接受）。
12. 应用性能：
    - 单个 slot 更新 < 100ms。
    - pattern 填充（10 个 item）< 1s。
    - 页面创建（基于 pageKind）< 2s。
13. 批量操作性能：
    - 100 个 slot 批量更新 < 5s。
    - 50 个 item 的 pattern 填充 < 3s。

### 8.3 并发和稳定性验收标准

14. 并发安全：两个 agent 同时编辑同一页面时，后者收到 `version_conflict` 错误。
15. 原子性：多步骤操作失败时自动回滚，回滚成功率 > 99%。
16. 错误处理：所有错误返回结构化错误码，包含候选项或修复建议。
17. 重试机制：可恢复错误自动重试，最多重试 2 次。
18. 资源清理：过期锁、快照、缓存自动清理，无内存泄漏。

### 8.4 安全验收标准

19. 输入校验：所有用户输入经过清理和转义。
20. Key 格式：所有 pageKey、regionKey、slotKey、patternKey 符合命名规范。
21. 敏感信息：日志中 nodeId 等敏感信息自动脱敏。
22. 权限控制：agent 只能访问授权的模板和页面。

### 8.5 测试验收标准

23. 单元测试覆盖率：核心模块 > 80%。
24. 集成测试：所有 5 个语义工具都有对应的集成测试。
25. 性能测试：所有性能指标都有对应的基准测试。
26. 并发测试：至少 3 个并发场景的测试用例。
27. 回滚测试：所有原子操作都有回滚测试。
28. 测试执行时间：完整测试套件 < 5 分钟。

### 8.6 迁移验收标准

29. 向后兼容：现有模板无需修改即可生成基础 Profile。
30. 迁移成功率：现有模板批量迁移成功率 > 95%。
31. 兼容性：迁移后 Profile 与现有节点兼容性 > 99%。
32. 回滚支持：迁移失败时可以回滚到迁移前状态。

### 8.7 文档和可观测性验收标准

33. API 文档：所有 5 个语义工具都有完整的 API 文档。
34. 错误码文档：所有错误码都有说明和修复建议。
35. 日志：关键操作都有日志记录，便于问题定位。
36. 监控指标：成功率、性能指标、错误分布可监控。

### 8.8 验收标准优先级

**P0（必须满足）**：1-8, 14-16, 19-22, 29-30
**P1（应该满足）**：9-13, 17-18, 23-28, 31-32, 33-36
**P2（可以推迟）**：性能指标的优化版本（如 < 100ms → < 50ms）

## 附录

### A. 新增内容总结

本文档在原有基础上补充了以下关键内容，以确保系统的稳定性、安全性和可维护性：

#### A.1 错误处理策略（Section 3.3）
- **基础错误类型定义**：定义了 15 种结构化错误类型，覆盖 resolver、校验、编译、应用四个阶段
- **错误处理原则**：结构化、可恢复性标记、候选项提供、错误链、日志友好
- **重试策略**：可恢复错误自动重试，最多 2 次，支持指数退避

#### A.2 安全机制（Section 3.3.4）
- **输入清理**：移除潜在注入字符，限制字符串长度，转义特殊字符
- **Key 格式校验**：所有语义 key 必须符合 `^[a-zA-Z][a-zA-Z0-9_-]{2,63}$` 规范
- **nodeId 脱敏**：日志中自动脱敏敏感信息
- **敏感信息检测**：检测并阻止用户敏感信息泄露

#### A.3 性能优化（Section 4.4.1）
- **Profile 缓存**：内存缓存 + 本地存储，TTL 5 分钟，LRU 淘汰策略
- **批量预热**：系统启动时预加载常用模板
- **性能监控**：记录扫描耗时、缓存命中率等指标

#### A.4 迁移策略（Section 4.4.2）
- **批量迁移**：现有模板一键迁移，成功率 > 95%
- **兼容性验证**：迁移后自动验证 Profile 与节点的兼容性
- **回滚支持**：迁移失败时可回滚到迁移前状态

#### A.5 并发控制（Section 4.10.1）
- **文档锁**：乐观锁策略，30 秒超时，支持重入
- **版本控制**：操作前检查版本，冲突时返回 `version_conflict` 错误
- **锁管理**：自动释放过期锁，防止死锁

#### A.6 原子操作和回滚（Section 4.10.2）
- **快照机制**：操作前创建快照，每步成功后创建增量快照
- **逐步回滚**：从最后成功步骤开始，逐步回滚到初始状态
- **资源清理**：过期快照自动清理，防止存储泄漏

#### A.7 测试数据管理（Section 4.12.1）
- **测试数据生成器**：快速生成各类测试场景的 Profile、Spec、Document
- **测试种子数据**：预置常用测试模板和数据
- **测试辅助函数**：断言函数、环境初始化、数据清理

#### A.8 完整验收标准（Section 8）
- **8 个维度**：功能、性能、并发稳定性、安全、测试、迁移、文档可观测性
- **36 项验收标准**：明确的指标和阈值
- **优先级分级**：P0（必须）、P1（应该）、P2（可以推迟）

### B. 关键设计决策说明

#### B.1 为什么选择乐观锁而非悲观锁？
- **场景特点**：agent 操作通常是短时间的（< 30 秒），冲突概率较低
- **用户体验**：悲观锁会导致长时间等待，乐观锁可以快速失败并重试
- **实现复杂度**：乐观锁实现更简单，不需要复杂的锁管理

#### B.2 为什么在 MVP 阶段就引入错误处理？
- **稳定性要求**：agent 操作涉及用户数据，必须保证稳定性
- **调试效率**：结构化错误可以快速定位问题，减少调试时间
- **AI 自我修正**：错误中的候选项可以帮助 AI 自动修正 spec

#### B.3 为什么引入 Profile 缓存？
- **性能瓶颈**：Profile 扫描涉及大量节点遍历，可能成为性能瓶颈
- **使用模式**：同一模板通常会被多次访问（创建、编辑、预览）
- **资源优化**：缓存可以减少 CPU 和 I/O 消耗

#### B.4 为什么需要原子操作和回滚？
- **数据一致性**：多步骤操作必须保证原子性，避免半写入状态
- **用户信任**：操作失败时可以完全恢复，增强用户信任
- **调试便利**：快照可以帮助重现和调试问题

### C. 实施建议

#### C.1 开发顺序建议
```
Phase 1（基础）：
  - 错误类型定义
  - 安全校验
  - Profile 缓存

Phase 2（核心）：
  - 并发控制
  - 原子操作
  - 测试框架

Phase 3（完善）：
  - 迁移工具
  - 性能监控
  - 文档生成
```

#### C.2 技术选型建议
- **缓存**：内存缓存（Map）+ 可选的 Redis（分布式场景）
- **锁**：内存锁（单机）+ Redis 分布式锁（多机）
- **快照**：内存快照（小规模）+ 文件存储（大规模）
- **测试**：Jest + 自定义断言 + 测试数据生成器

#### C.3 监控指标建议
```ts
const METRICS = {
  // 性能指标
  profileScanDuration: 'histogram',
  compilationDuration: 'histogram',
  applyDuration: 'histogram',
  
  // 成功率指标
  compilationSuccessRate: 'gauge',
  applySuccessRate: 'gauge',
  rollbackSuccessRate: 'gauge',
  
  // 资源指标
  cacheHitRate: 'gauge',
  lockWaitDuration: 'histogram',
  snapshotCount: 'gauge',
  
  // 业务指标
  slotUpdateCount: 'counter',
  patternFillCount: 'counter',
  pageCreateCount: 'counter'
}
```

### D. 风险和缓解措施

#### D.1 性能风险
- **风险**：Profile 扫描耗时过长，影响用户体验
- **缓解**：引入缓存、异步扫描、增量更新

#### D.2 并发风险
- **风险**：高并发场景下锁竞争激烈，性能下降
- **缓解**：乐观锁、细粒度锁、锁超时机制

#### D.3 数据一致性风险
- **风险**：回滚失败导致数据不一致
- **缓解**：多次快照、手动恢复工具、数据校验

#### D.4 迁移风险
- **风险**：现有模板迁移失败，影响正常使用
- **缓解**：兼容模式、迁移回滚、人工干预

### E. 术语表

| 术语 | 定义 |
|------|------|
| TemplateProfile | 模板的语义索引，包含页面、区域、槽位、模式等信息 |
| PageSpec | 页面级结构化意图，描述创建或更新页面的需求 |
| EditSpec | 编辑级结构化意图，描述修改槽位、填充模式、替换区域的需求 |
| Slot | 语义槽位，对应一个可编辑的节点（如标题、图片、按钮） |
| Pattern | 重复结构模式，对应一组可重复的节点（如商品卡片、订单卡片） |
| Region | 语义区域，对应页面中的一个功能区域（如 banner、列表区） |
| PageKind | 页面类型，用于选择参考页面（如 order、home、profile） |
| Atomic Operation | 原子操作，保证多步骤操作的原子性，失败时完全回滚 |
| Optimistic Lock | 乐观锁，假设冲突很少发生，冲突时快速失败并重试 |

