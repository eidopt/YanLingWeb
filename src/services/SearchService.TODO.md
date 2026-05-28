# SearchService TODO

## 目标

SearchService 是模板搜索与意图识别的统一入口。用户输入一段自然语言后，服务端分析意图，返回两种结果之一：

1. **搜索模板** — 从数据库中按关键词匹配已有模板，返回候选列表
2. **创建空白模板** — 根据用户描述生成一个新的空白模板 schema（不含具体内容，仅结构骨架）

## 核心流程

```
用户输入 query
      │
      ▼
┌─────────────┐
│  LLM 意图识别  │  ← 判断是"找模板"还是"建模板"
└──────┬──────┘
       │
   ┌───┴───┐
   ▼       ▼
搜索模板   创建空白模板
   │         │
   ▼         ▼
关键词提取   结构 schema 生成
   │         │
   ▼         ▼
数据库查询   返回新模板骨架
   │         │
   ▼         ▼
      统一返回格式
```

## 两种模式详情

### 模式 A：search_templates

- **触发条件**：用户想浏览/查找已有模板（如"有没有电商类的模板"、"新闻类模板"）
- **处理步骤**：
  1. LLM 从 query 中提取关键词、类别标签
  2. 后端搜索模板表，按标题/描述/标签模糊匹配
  3. 返回匹配的模板列表（id, name, description, thumbnail, category）
- **返回字段**：`mode: 'search_templates'`, `results: TemplateSummary[]`

### 模式 B：create_blank_template

- **触发条件**：用户描述了一个具体的页面/应用需求（如"帮我建一个预约系统"、"做一个个人简历页面"）
- **处理步骤**：
  1. LLM 分析用户描述，提取页面类型、核心功能模块
  2. 生成一个最小化的 `ThemeLayoutDocument` 骨架：
     - 确定页面数量和名称
     - 确定每个页面的根容器和基础布局结构
     - 不包含具体内容文案（用户后续填充或用 AI 编辑）
  3. 返回生成的模板 schema
- **返回字段**：`mode: 'create_blank_template'`, `schema: ThemeLayoutDocument`

## API 设计

```
POST /api/search
Body: { query: string }

Response (搜索模式):
{
  mode: 'search_templates',
  query: string,
  keywords: string[],
  results: TemplateSummary[]
}

Response (创建模式):
{
  mode: 'create_blank_template',
  query: string,
  schema: ThemeLayoutDocument
}
```

## 待实现事项

### 后端

- [x] 创建 `SearchModule`（NestJS module + controller + service）— `backend/src/search/` 已实现
- [x] 实现意图识别逻辑 — 关键词评分系统（含 LLM 兜底扩展点）
- [x] 实现关键词提取 + 模板数据库搜索 — `searchText` 反规范化字段 + 分类加权
- [x] 实现空白模板 schema 生成 — `generateBlankTemplate()` 基于 core.* 组件
- [x] 统一返回格式，错误处理 — `SearchIntentResult` 联合类型

### 前端

- [x] `SearchService.submit()` 调用 `/api/search` 端点 — `src/services/SearchService.ts` 已实现
- [x] 更新 `SearchIntentResponse` 类型，支持两种 mode 的返回结构 — `SearchTemplatesResult` | `CreateBlankTemplateResult`
- [x] 搜索结果列表 UI 组件 — `src/components/SearchResults.tsx`
- [x] 创建模式：接收 schema 后跳转编辑器 or 模板预览 — `onCreateFromSchema` 回调

### 集成

- [x] SearchResults 组件已创建，支持 onSelectTemplate 和 onCreateFromSchema 回调
- [ ] 与 HomeWorkspace 搜索栏对接（当前搜索栏 → SearchService）
- [ ] 与 TemplatesPage 搜索功能对接（可选）
- [ ] 搜索结果点击后的页面跳转逻辑
