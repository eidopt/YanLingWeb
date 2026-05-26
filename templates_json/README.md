# templates_json 模板导入规范

`templates_json` 是后端启动时的临时模板导入目录。后端启动后会扫描目录下的根级
`*.json` 模板 schema，并把模板及其 Agent 配置写入数据库。

## 目录结构

推荐结构如下：

```text
templates_json/
  <templateId>.json
  configs/
    <templateId>.generated.json
    <templateId>.override.json
    <templateId>.assets.json
    <templateId>.permissions.json
    <templateId>.evaluation.json
```

说明：

- 模板 schema 只放在 `templates_json/<templateId>.json`。
- 模板配置统一放在 `templates_json/configs/`。
- `configs` 下的文件名前缀必须和模板 schema 的 `templateId` 一致。
- 目前已支持并推荐的配置文件：
  - `<templateId>.generated.json` -> `profileGenerated`
  - `<templateId>.override.json` -> `profileOverride`
  - `<templateId>.assets.json` -> `assets`
  - `<templateId>.permissions.json` -> `permissions`
  - `<templateId>.evaluation.json` -> `evaluation`

## 兼容目录

后端仍兼容旧 sidecar 目录，但不再推荐新模板使用：

```text
templates_json/<templateId>/
  profile.generated.json
  profile.override.json
  assets.json
  permissions.json
  evaluation.json
```

如果同一个模板同时存在嵌入配置、旧 sidecar 配置和 `configs` 集中配置，优先级为：

```text
模板 JSON 内嵌配置 < 旧 sidecar 目录配置 < configs 集中配置
```

## 启动导入行为

后端启动时 `TemplatesService.onModuleInit()` 会执行导入：

1. 扫描 `templates_json` 根目录下的 `*.json`。
2. 读取对应的 `templates_json/configs/<templateId>.*.json` 配置文件。
3. 校验模板 layout 和 Agent profile。
4. 写入模板表及对应 Agent 配置表。
5. 当 `TEMPLATE_JSON_DELETE_AFTER_IMPORT=true`（默认值）时，删除已成功导入的
   根模板 JSON 和对应的 `configs/<templateId>.*.json` 文件。

`templates_json/configs` 目录本身可以长期保留；只有对应模板已导入成功的配置文件会被删除。

## 模板 schema 必填字段

根模板 JSON 至少包含：

```json
{
  "templateId": "booking-reservation",
  "name": "预约预订",
  "tagline": "适合预约、预订和服务下单的小程序模板",
  "description": "模板说明",
  "accent": "#8b5cf6",
  "category": "booking-reservation",
  "categoryLabel": "预约预订",
  "platformCategories": ["mini-program", "mobile-app"],
  "functionalCategories": ["booking-reservation", "booking", "reservation"],
  "functionalCategoryLabels": {
    "booking-reservation": "预约预订",
    "booking": "预约",
    "reservation": "预订"
  },
  "traits": ["多页结构", "移动端优先"],
  "tags": ["预约", "小程序"],
  "cssVars": {
    "--color-primary": "#8b5cf6"
  },
  "componentTemplates": {},
  "layoutDocument": {}
}
```

## 分类规则

- `category` 和 `functionalCategories` 必须使用英文/slug key，不能写中文。
- 中文展示文案写入 `categoryLabel` 和 `functionalCategoryLabels`。
- `category` 必须等于 `functionalCategories[0]`。
- 新增分类 key 时必须同时提供中文 label；后端会把中英文映射保存到
  `backend/data/template-category-labels.json`。
- 前端筛选和后端查询使用英文 key，前端展示使用后端返回的中文 label。

## 生成质量规则

`templates_json` 会作为启动导入源进入公共模板库，所以这里的模板必须满足比普通用户
手工编辑更严格的规则：

- 默认只使用 `core.*` 组件，`componentTemplates` 必须为 `{}`。不要生成 `com-icon`、
  `com-badge` 等自定义 alias；图标类视觉可用 `core.image` 的占位态或已有 core 组件近似。
- `core.image.props.src` 如果存在，必须是合法 HTTPS URL；没有可靠图片地址时不要写
  `src`，保留 `alt` / `title` / `iconColor`，让渲染器显示内置占位符。
- 用户可见文案必须使用简体中文，并且页面内容要围绕同一个业务场景组织，不要混入
  默认英文样例、无意义英文 slug 或不相关段落。
- `layoutDocument.components[].props[]` 中的每个可编辑属性都必须配置中文 `label`，
  例如 `{ "name": "title", "type": "string", "label": "标题" }`。前端颗粒化编辑面板
  会优先展示这个 `label`。
- 页面结构保持“头部、主内容、辅助区块、动作/导航”的顺序；避免堆叠过多装饰节点导致
  小程序预览排版混乱。

## 校验

导入前可以运行：

```bash
pnpm templates:validate
```

校验脚本只扫描 `templates_json` 根目录的模板 schema，不会把 `configs` 下的配置文件当作模板。
