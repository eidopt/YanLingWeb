# 设计方案：珊瑚晚霞（Coral Sunset）品牌焕新 + 渲染器主题色契约 + 生成 Agent 设计规则

**日期**：2026-05-30
**状态**：待评审
**作者**：donle（结对 Claude）

---

## 1. 背景与目标

当前平台视觉是「Neon Craft」：紫(`#8b5cf6`) + 青(`#22d3ee`) 渐变、Inter 字体、玻璃拟态 + 发光阴影、点阵网格底。这恰好是典型「AI 味」审美（紫渐变 + Inter + glow）。

**目标**：把平台整体焕新为更现代、更活泼、去 AI 味的「珊瑚晚霞」风格（暖珊瑚 + 落日橙金），并：

1. 重定义设计 token（明 + 暗双主题），级联到全部 88 个 CSS module。
2. 优化首页 / 编辑器 / 模板广场的排版布局与必要文案。
3. 让 AI 生成 agent 也遵循统一**设计原则**（去 AI、现代活泼），各模板自选配色。
4. 渲染器建立**显式主题色契约**，彻底不回退到平台 token（修掉「漏色」与悬空 token 债）。

**非目标**：

- 不改渲染器 54 个 `core.*` 组件的语义结构/行为。
- 模板暂不做明暗双主题（保持单套 cssVars，仅提升设计质量）；双主题列为后续。
- 不改后端、AI 引擎核心逻辑（仅改提示词/校验）。

---

## 2. 关键决策（已与用户确认）

| 决策点       | 结论                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| 配色方向     | C · 珊瑚晚霞（珊瑚玫瑰 + 落日橙金）                                                           |
| 暗色背景     | 暖墨炭 `#1A1714`（非偏红、非发灰）                                                            |
| 字体         | Plus Jakarta Sans（英文/标题/数字，next/font 自托管）+ 系统 PingFang/Noto（中文）；移除 Inter |
| 平台改造范围 | 设计 token + 首页 + 编辑器页 + 模板广场页                                                     |
| 生成模板配色 | 遵循统一原则，**各模板自选色**（保持多样性）                                                  |
| 模板明暗     | **先单主题**，只提升设计质量；双主题后续                                                      |
| 渲染器解耦   | **显式主题色契约**：渲染器 CSS 不再引用平台颜色 token                                         |
| 设计规则载体 | **单一规则文档** + 注入各阶段提示词                                                           |

---

## 3. 已确认的事实（代码勘察）

- 设计 token 全部集中在 `src/styles/theme-library.css`（`--app-*`），被 ~88 个 CSS module 消费。
- `src/styles/global.css` 与 `src/app/globals.css` 内容基本重复（含背景光斑、focus ring 等）。
- 渲染器组件 **54 个** `core.*` alias（CLAUDE.md 写的「18」过时，需修正文档）。
- 模板 cssVars 通过 `ScreenNode.tsx:61` spread 到 `core.screen` 根元素 inline style，作用域到整棵渲染树。
- 渲染器组件 CSS 现状：模板作用域变量（`--accent` / `--surface` / `--panel-*` / `--tag-*` / `--text-*-color` 等）优先，**回退到平台 `--app-*` 颜色 token**（这就是「漏色」根源）。
- 渲染器引用的颜色类 `--app-*` 约 40 个，其中 `--app-text-tertiary` / `--app-error` / `--app-info` / `--app-color-orange` / `--app-color-sky` / `--app-color-black` / `--app-border-color` / `--app-ink-alpha-*` 等在 theme-library.css **未定义**（既有悬空回退债）。
- 字体：当前字体栈首选 `'Inter'` 但项目**并未实际加载 Inter webfont**，靠系统回退。
- 生成 agent 多阶段提示词：`shared/agent/prompts/templateDesignerPrompt.ts` + `templates/{sharedSpec,stageDesigner,stageSchemaGenerator,stageDiversityCritic,stageVerifier}.ts`。
- `sharedSpec.ts` 现有风格预设含 `immersive 沉浸渐变`、`dark-pro #1a1a2e 霓虹色` —— 正是「AI 味」来源。
- 无任何 cssVars 校验器。
- 散落硬编码紫/青色值：violet ~11 文件、cyan ~7 文件、其它紫 1 文件。

---

## 4. 方案设计

分三个相对独立、可分阶段验证的部分。Part A 可独立完成；Part B 与 Part C 共享「主题色契约」定义。

### Part A — 平台品牌焕新（珊瑚晚霞）

#### A1. 重写 `theme-library.css` 主题色 token

**品牌色**

```
品牌渐变  linear-gradient(135deg, #F43F5E 0%, #FB7185 38%, #FBA94C 100%)   // 珊瑚→橙，零紫蓝
主色      light #F43F5E / strong #E11D48     dark #FB7185 / strong #F43F5E
强调      light #F97316 / strong #EA580C     dark #FBA94C / strong #FBBF24   // 落日橙金
语义      成功 #10B981/#34D399 · 警告 #F59E0B/#FBBF24 · 危险 #DC2626/#F87171（纯红，区别于珊瑚）
```

**暗色主题（默认）**

```
--app-bg               #1A1714      // 暖墨炭
--app-bg-quiet         #161310
--app-bg-elevated      #221D19
--app-surface-1/2/3    rgba(255,255,255,.05 / .07 / .10)
--app-text-primary     #F3E9E4
--app-text-secondary   #C9B8B0
--app-text-muted       #9C8B83
--app-text-faint       #7A6B64
--app-editor-bg        #151210
--app-editor-panel     #1F1A16
--app-editor-panel-raised #261F1A
--app-border-subtle/border/strong  rgba(243,233,228,.08 / .14 / .24)
--app-focus-ring       #FB7185
```

**亮色主题**

```
--app-bg               #FFFBF8      // 暖纸白
--app-bg-quiet         #FFF7F1
--app-bg-elevated      #FFFFFF
--app-surface-1/2/3    #FFFFFF / #FDF1EA / #F9E4D9
--app-text-primary     #241418      // 暖墨
--app-text-secondary   #5C4A4F
--app-text-muted       #8A7077
--app-text-faint       #B0989E
--app-editor-bg        #FFF7F1
--app-editor-panel     #FFFFFF
--app-editor-panel-raised #FDF1EA
--app-border-subtle/border/strong  rgba(36,20,24,.07 / .12 / .20)
--app-focus-ring       #F43F5E
```

- 阴影系统：`--app-shadow-brand-*`、`--app-shadow-glow-*` 由紫色改为**珊瑚/橙暖光**；中性阴影带轻微暖调（rgba 含暖色分量）。
- `--app-primary-alpha-*` / `--app-accent-alpha-*` 全量改基色（珊瑚 / 橙）。
- 渐变体系 `--app-gradient-*`、`--brand-gradient*`：紫青 → 珊瑚橙。
- 旧别名（`--c-indigo` / `--page-accent` / `--color-accent` 等）保持名字、重新指向新基色，避免改动消费方。

#### A2. 背景氛围光斑

`global.css` + `globals.css` 的 `body::before` radial 光斑：紫(139,92,246)/青(34,211,238)/玫瑰 → **珊瑚(244,63,94)/橙(249,115,22)/玫瑰(251,113,133)** 暖色；亮色版同步降透明度。点阵网格底保留但调暖/降噪。

> 同步消除 `global.css` 与 `globals.css` 的重复（抽为单一来源或确认仅其一被引用）。

#### A3. 字体

- 在 `src/app/layout.tsx` 用 `next/font/google` 引入 `Plus_Jakarta_Sans`（weight 400/500/600/700/800，`variable: '--font-jakarta'`，`display: 'swap'`，`subsets: ['latin']`），挂到 `<html>` 或 `<body>` className。
- `theme-library.css` 的 `--app-font-sans` / `--app-font-display`：
  `var(--font-jakarta), 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif`（移除 Inter）。
- `--app-font-mono` 保留。
- Electron 离线：next/font 构建期自托管，无外网依赖 ✓。

#### A4. 工具类重新着色

`theme-library.css` 末尾 `.app-gradient-text` / `-warm` / `-cool` / `.app-text-glow` 由紫青 → 珊瑚橙暖色系。

#### A5. 散落硬编码颜色清理

grep 出 `#8b5cf6` / `#22d3ee` / `139,92,246` / `34,211,238` / `#7c3aed` / `#6366f1` 等（~15-19 文件，主要在 `src/views/HomePage/*`、`src/ui/*`），逐个接回新 token 或新基色。

#### A6. 页面排版与文案

**首页（`src/views/HomePage/*`）**

- Hero：居中 eyebrow 胶囊标签 + 800 字重大标题（关键词用品牌渐变文字）+ 副标题；把「AI 生成输入框」作为视觉主入口；主 CTA 珊瑚渐变、次 CTA ghost。
- 文案微调（仅必要处、保持中文）：
  - 主标题：`一句话，生成完整应用`
  - 副标题：`用自然语言描述你的想法，AI 即刻生成多页面布局；拖拽微调、一键发布，无需写代码。`
  - 各 section eyebrow/标题口语化小幅润色。
- 功能/创作模式/模板/发布流程各 section：统一垂直留白节奏；卡片暖色表面 + 彩色图标 chip + 圆角 14–16px + 柔和暖阴影。

**编辑器页（`src/views/EditorPage/EditorPage.module.css` 等）**

- 套用新暗底/面板色；降低玻璃拟态与发光强度，转向更清爽的暖中性面板；工具栏/侧栏层级用边框+表面区分而非重阴影。

**模板广场页（`src/views/TemplatesPage/TemplatesPage.module.css`）**

- 卡片网格密度与暖色卡片样式与首页统一；筛选区排版对齐节奏。

> 排版改动以「token 级联 + 局部 module 微调」为主，不大规模重写结构。

---

### Part B — 渲染器显式主题色契约（与平台解耦）

**目标**：渲染器 CSS 不再引用任何平台**颜色** token；模板的颜色完全由「主题色契约」变量提供，缺省时回退到**中性字面值**（非平台品牌色）。尺寸类（`--app-unit-*` / spacing / radius / font-size）仍共享，不属于「主题色」。

#### B1. 定义「模板主题色契约」

以渲染器已有的模板作用域变量为基础，整理为一份**规范契约**（命名沿用现有 `--*` 模板变量，新增缺口项），分组：

```
文本   --text-heading-color --text-subheading-color --text-body-color
       --text-caption-color --text-overline-color --text-muted-color --text-default-color
表面   --surface --surface-muted --panel-bg --panel-accent --panel-accent-border --panel-border
描边   --border-color
强调   --accent --accent-contrast
语义   --color-success --color-warning --color-danger --color-info（+ 对应 -bg）
标签   --tag-{neutral,hot,new,deal,info,member,success,warning}-{bg,color}
按钮   --btn-pill-bg --btn-pill-color
中性   --neutral-0 … --neutral-900（渲染器内部灰阶，给字面默认）
```

（实现时以「渲染器实际引用清单」为准，逐一覆盖，确保零遗漏。）

#### B2. 渲染器 CSS 改造（48 个 `*.module.css`）

- 把所有 `var(--app-COLOR…)` 回退**替换为契约变量 + 中性字面默认**：
  - 例：`color: var(--text-heading-color, var(--app-neutral-850))` → `var(--text-heading-color, #1f2937)`
  - 例：`color: var(--app-neutral-850)`（无前置契约变量）→ `var(--text-default-color, #1f2937)`
- 改造后渲染器 CSS **不得出现任何 `--app-` 颜色 token**（保留 `--app-unit-*` 等尺寸类）。
- 用 grep 断言验收：`grep -rE "var\(--app-(color|text|surface|border|neutral|ink|white|error|info|success|warning)" src/ui/renderer/components` 应为空。

#### B3. 渲染作用域默认（向后兼容）

- 在 `ScreenNode` 根元素加类 `app-render-scope`（cssVars 仍 spread 在同元素 inline style 上，**优先级高于类**，模板自定义照常生效）。
- 在 theme-library.css（或新建 `render-contract.css`）定义 `.app-render-scope { …契约变量全集，取值为中性字面 … }`，作为**老模板/缺省**的安全底，且**来源是中性字面，不是平台品牌色**。
- 效果：① 不完整/历史模板渲染正常且不漏平台品牌色；② 完整模板用自身 cssVars 完全覆盖。

---

### Part C — 生成 Agent 设计规则

#### C1. 新建「设计原则契约」文档

`shared/agent/prompts/templates/designPrinciples.ts`（导出字符串常量，供各阶段拼接），内容：

- **反 AI 清单**：禁止「紫渐变 on 深底 + Inter + 通体 glow」套路；避免千篇一律的居中卡片网格；避免低饱和安全灰。
- **现代活泼原则**：明确品牌/强调/中性的角色分工；足够对比；克制但有重点的留白与圆角；点睛色用于关键 CTA。
- **配色规则**：各模板**按品类自选**主色（不强制珊瑚），但需：主色 1 + 强调 1 + 中性梯度；前景/背景对比达 AA；语义色与主色可区分。
- **排版规则**：清晰层级（display/heading/body/caption）；字重对比；行长与行高适度。
- **契约要求**：模板**必须**在 cssVars 输出 Part B 的完整契约变量（明确列出 required 键），不得依赖渲染器/平台缺省。

#### C2. 注入与改写

- 在 `sharedSpec.ts` 注入设计原则契约 + 契约变量清单。
- **改写** `sharedSpec.ts` 的 `immersive`/`dark-pro` 等 AI 味预设为健康预设（暖色编辑感 / 清新 SaaS / 高对比电光 等，呼应本次方向但保留多样性）。
- `stageDesigner.ts`：选色/风格阶段引用设计原则做判断与选择。
- `stageVerifier.ts`：新增「设计规则合规 + 契约完整性」检查项。

#### C3. cssVars 契约校验器

`shared/agent/validation/` 新增 `cssVarsContract.ts`：校验生成文档的 cssVars 是否包含全部 required 契约键、值是否为合法颜色；缺失则在生成流程中报错/要求修补。补单测。

---

## 5. 构建顺序

1. **Part A**（平台焕新）— token → 字体 → 背景 → 工具类 → 硬编码清理 → 页面排版/文案。可独立交付、独立验证。
2. **Part B**（渲染器契约）— 先定契约清单 → 改 48 个渲染器 CSS → render-scope 默认 → grep 断言。
3. **Part C**（agent 规则）— 写设计原则文档（含 Part B 契约）→ 注入/改写提示词 → 校验器 + 单测。
4. 文档：修正 CLAUDE.md「18 → 54 个 core.\* 组件」；`.superpowers/` 加入 `.gitignore`。

---

## 6. 验证

- `pnpm dev` 起前端，**明 + 暗两主题**逐页实际查看：首页、编辑器、模板广场。
- 断言渲染器 CSS 无平台颜色 token（B2 的 grep）。
- 渲染若干现有模板（含一个「不完整」模板）确认不漏平台品牌色、观感与改造前一致。
- `pnpm lint` 通过；新增校验器单测通过。
- `pnpm agent:evaluate`（或最小生成冒烟）确认 agent 仍能产出合法、含完整契约的模板。

---

## 7. 风险

- **渲染器 48 文件批改**：量大易遗漏 → 用 grep 断言兜底；分组提交。
- **旧别名级联**：保持别名名字不变、仅改指向，降低消费方破坏面。
- **next/font + Electron**：构建期自托管，需在 Electron 打包后回归一次字体显示。
- **重复的 global.css / globals.css**：先确认实际引用关系再去重，避免改错文件。
