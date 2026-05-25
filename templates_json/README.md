# 模板 JSON 规范

`templates_json` 是待导入后端公共模板库的临时入口目录。这里的 JSON 不会长期保留：后端启动时会扫描目录，合法模板会写入数据库，随后删除对应 JSON；不合法模板会保留，并在同目录生成 `.validation.log`。

`pnpm templates:validate` 只做预校验和写 log，不再生成后端 seed 文件。真正入库发生在后端启动时。

## 校验命令

```bash
pnpm templates:validate
```

也可以只处理指定文件或目录：

```bash
node scripts/validate-template-json.mjs templates_json/profile-center.json
```

脚本行为：

- 扫描目标目录下的所有 `.json` 模板。
- 合法模板只清理同名旧 validation log。
- 不合法模板会在同目录生成 `<模板文件名>.validation.log`。
- 只要存在不合法模板，命令会以非零状态退出，方便 CI 或提交前检查。

后端启动导入行为：

- 默认扫描 `templates_json`。
- 合法模板 upsert 为 public template。
- 数据库 flush 成功后删除对应 JSON，避免下次启动重复读取。
- 不合法模板保留原 JSON，并写入 `<模板文件名>.validation.log`。
- 可用 `TEMPLATE_JSON_IMPORT_ENABLED=false` 关闭启动导入。
- 可用 `TEMPLATE_JSON_IMPORT_DIR` 指定目录。
- 可用 `TEMPLATE_JSON_DELETE_AFTER_IMPORT=false` 保留已导入 JSON。

## 顶层结构

每个模板 JSON 必须包含：

- `templateId`: 全局唯一模板标识，建议和文件名一致。
- `name`: 模板名称。
- `tagline`: 一句话简介。
- `description`: 详细描述。
- `accent`: 主色，十六进制颜色。
- `category`: 兼容字段，必须等于 `functionalCategories[0]`。
- `platformCategories`: 平台分类数组，用于一级分类。
- `functionalCategories`: 功能分类数组，用于二级分类。
- `traits`: 字符串数组，用于展示模板特征。
- `tags`: 可选字符串数组，用于搜索。
- `cssVars`: CSS 自定义属性。所有 key 必须以 `--` 开头。
- `componentTemplates`: 自定义组件模板。
- `layoutDocument`: 多页面布局文档。

## 分类规范

示例：

```json
{
  "category": "commerce",
  "platformCategories": ["mini-program", "mobile-app"],
  "functionalCategories": ["commerce", "social"]
}
```

### 一级分类：平台

`platformCategories` 表示模板适配的平台，可以有多个：

| 值 | 含义 |
| --- | --- |
| `mini-program` | 小程序 |
| `mobile-app` | 手机端 App |
| `tablet-app` | 平板 App |
| `web` | 网页 |

### 二级分类：功能

`functionalCategories` 表示模板的业务/功能类型，可以有多个：

| 值 | 含义 |
| --- | --- |
| `commerce` | 电商/购物 |
| `social` | 社媒/社区 |
| `content` | 内容/阅读/资讯 |
| `service` | 服务/预约 |
| `education` | 教育/学习 |
| `health` | 健康/运动/医疗 |
| `finance` | 金融/账务 |
| `marketing` | 营销/活动 |
| `utility` | 工具/效率 |
| `dashboard` | 数据看板 |
| `profile` | 个人中心/账号 |

规则：

- 两个分类字段都必须是非空字符串数组。
- 一个模板可以同时属于多个平台和多个功能分类。
- `category` 必须等于 `functionalCategories[0]`，用于兼容当前旧字段和旧 UI。

## layoutDocument

`layoutDocument` 必须包含：

- `version`: 数字版本。
- `themeId`: 通常等于 `templateId`。
- `themeName`: 模板显示名称。
- `description`: 布局说明。
- `components`: 组件目录 descriptor 数组。
- `defaultPageId`: 默认页面 id。
- `pages`: 页面数组。
- `layout`: 默认页面的根 layout，必须和 `pages` 中 `defaultPageId` 对应页面的 `layout` 完全一致。

每个页面根节点必须是 `core.screen`。所有 node id 在整个文档内必须唯一，不只是单页唯一。

## 合法 Core Alias

当前可以直接使用的内建 alias：

| Alias | 用途 |
| --- | --- |
| `core.screen` | 页面根容器 |
| `core.panel` | 面板容器 |
| `core.stack` | 纵向容器 |
| `core.row` | 横向容器 |
| `core.grid` | 网格容器 |
| `core.text` | 文本，使用 `props.text` |
| `core.button` | 按钮，使用 `props.label` |
| `core.search` | 搜索框 |
| `core.tabs` | 标签页 |
| `core.tag` | 标签/徽章，使用 `props.label` |
| `core.notice` | 通知条 |
| `core.image` | 图片占位 |
| `core.html` | 受限 HTML 容器 |
| `core.widget` | 安全第三方 ESM widget |
| `core.divider` | 分割线 |
| `core.spacer` | 留白 |
| `core.input` | 输入框 |
| `core.progress` | 进度条，使用 `props.value`、`props.max`、`props.tone` |

不要在 JSON 里自行创造新的 `core.*` alias，例如 `core.icon`、`core.badge`。`core.*` 只代表前端 renderer 内建组件，必须先在 renderer 和共享 validator 中实现后才能使用。

## 自定义组件

自定义 alias 必须满足三个条件：

1. alias 不能以 `core.` 开头，例如使用 `com-icon`、`com-badge`。
2. 必须在顶层 `componentTemplates` 中定义。
3. 必须在 `layoutDocument.components` 中声明 descriptor，这样编辑器和校验器才能识别。

`componentTemplates` 内部的 `root` 只能展开为合法 `core.*` alias。当前模板解释器不会在自定义组件内部继续递归渲染另一个自定义 alias。

## 常见错误

- `core.text` 写成 `props.content`：不会渲染，必须写 `props.text`。
- `cssVars` 使用 `color-bg`：不会作为 CSS 变量注入，必须写成 `--color-bg`。
- `layoutDocument` 只有 `pages` 没有 `layout`：公共模板源文件必须显式提供默认 layout，便于稳定校验。
- 自定义 alias 只写在 `layoutDocument.components`：编辑器可能认识，但前端运行时没有 `componentTemplates` 就无法渲染。
- 自定义 alias 只写在 `componentTemplates`：运行时能找到模板，但编辑器和校验脚本会认为组件目录不完整。
- 只写 `category` 不写 `platformCategories`/`functionalCategories`：无法支撑平台和功能两级筛选。
