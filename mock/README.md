# mock — 共享页面模板库

`mock/` 存放**可提交到 Git** 的公共页面模板（`ThemeLayoutDocument` seed JSON），供团队 clone 后直接进入模板广场，无需在本机重新跑 AI 生成。

## 目录结构

```
mock/
  <templateId>.json          # 模板 schema（与 templates_json 相同格式）
  configs/
    <templateId>.generated.json   # 可选：TemplateProfile
    <templateId>.assets.json        # 可选：资产清单
  assets/                      # 模板配图（提交到 Git，推荐 AVIF）
    <templateId>/*.avif        # 运行时同步到 public/template-assets/generated/
```

格式与校验规则详见 [`templates_json/README.md`](../templates_json/README.md)。

## 开发接入

后端启动时默认会扫描 **`mock/`** 与 **`templates_json/`**（若存在）：

1. `mock/` 中的 JSON **导入后保留**（不会删除），适合版本库共享。
2. `templates_json/` 由 `pnpm templates:generate` 写入；默认 **`TEMPLATE_JSON_DELETE_AFTER_IMPORT=true`** 时导入成功后会删除，适合本地临时产物。

可通过环境变量覆盖行为（见 `backend/.env.example`）：

- `TEMPLATE_JSON_IMPORT_ENABLED=true`
- `TEMPLATE_JSON_IMPORT_DIR=/绝对路径` — 仅扫描指定目录（不再默认双目录）
- `TEMPLATE_JSON_DELETE_AFTER_IMPORT=true` — 只影响 `templates_json/`，`mock/` 永远保留

模板 JSON 内图片路径仍为 `/template-assets/generated/...`。**仓库内源文件在 `mock/assets/`**；
`pnpm dev:all` 与 `pnpm mock:sync-assets` 会将其同步到 `public/template-assets/generated/`（该目录在 `.gitignore` 中，不直接提交）。

clone 后跑 `pnpm dev:all` 或先执行 `pnpm mock:sync-assets`，无需再跑 `pnpm assets:pregenerate` 即可看到配图。

配图默认以 **AVIF** 入库（`pnpm mock:compress-assets`）。`core.image` 仍用普通 `<img src>`，现代浏览器（Chrome / Firefox / Safari 16+）可直接解码；若某张图 AVIF 反而更大，脚本会保留原 PNG。

## 维护命令

```bash
# 从本地 SQLite 重新导出公共模板到 mock/（含收集配图到 mock/assets）
pnpm templates:export-mock

# 仅把 mock/assets 同步到 public/（前端静态资源）
pnpm mock:sync-assets

# 将 mock/assets 内 PNG 转为 AVIF（更小），并更新 mock/*.json 中的路径
pnpm mock:compress-assets

# 仅根据 mock/*.json 引用，从 public/generated 回收到 mock/assets
pnpm mock:bundle-assets

# 校验 mock 与 templates_json 根目录模板 schema
pnpm templates:validate
```

更新 `mock/` 后请运行 `pnpm templates:validate` 再提交。