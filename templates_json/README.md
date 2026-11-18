# templates_json 模板导入规范

> **团队共享模板**请放在仓库根目录的 [`mock/`](../mock/README.md)（会提交到 Git，导入后保留）。
> `templates_json/` 仍用于 `pnpm templates:generate` 的临时产物，默认导入成功后删除。

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
  "displayCategory": "service",
  "displayCategoryLabel": "本地服务",
  "displayCategoryLabels": {
    "service": "本地服务"
  },
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
  "cssAnimations": {
    "soft-pulse": "0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.92; transform: scale(1.02); }"
  },
  "componentTemplates": {
    "biz-hero-banner": {
      "root": {
        "id": "hero-root",
        "alias": "core.panel",
        "props": {}
      }
    }
  },
  "layoutDocument": {}
}
```

## 分类规则

- `category` 和 `functionalCategories` 必须使用英文/slug key，不能写中文。
- `displayCategory` 是前端展示和筛选用的大类，建议从 `commerce`、`service`、`content`、`education`、`health`、`social`、`finance`、`marketing`、`utility`、`dashboard`、`profile`、`other` 中选择。
- 中文展示文案写入 `categoryLabel`、`displayCategoryLabel` 和 `functionalCategoryLabels`。
- `category` 必须等于 `functionalCategories[0]`。
- 新增分类 key 时必须同时提供中文 label；后端会把中英文映射保存到
  `backend/data/template-category-labels.json`。
- 前端筛选和后端查询使用英文 key，前端展示使用后端返回的中文 label。

## 生成质量规则

`templates_json` 会作为启动导入源进入公共模板库，所以这里的模板必须满足比普通用户
手工编辑更严格的规则：

- `core.*` 是基础组件库，不是模板能力上限。优先用 `core.*` 表达通用结构；当业务需要更强
  视觉识别或更完整的模块时，可以定义 `componentTemplates` 自定义组件。
- 自定义组件必须是声明式、可编辑、可渲染的模板组件：alias 要稳定，props 要有中文 `label`，
  结构要能被 renderer 解释，不能依赖任意运行时代码、远程脚本或不受控 widget。
- `core.image.props.src` 如果存在，必须是合法 HTTPS URL；没有可靠图片地址时不要写
  `src`，保留 `alt` / `title` / `iconColor`，让渲染器显示内置占位符。
- 用户可见文案必须使用简体中文，并且页面内容要围绕同一个业务场景组织，不要混入
  默认英文样例、无意义英文 slug 或不相关段落。
- `layoutDocument.components[].props[]` 中的每个可编辑属性都必须配置中文 `label`，
  例如 `{ "name": "title", "type": "string", "label": "标题" }`。前端颗粒化编辑面板
  会优先展示这个 `label`。
- 页面结构保持“头部、主内容、辅助区块、动作/导航”的顺序；避免堆叠过多装饰节点导致
  小程序预览排版混乱。
- 不要生成“全白背景 + 白色卡片 + 文本列表”的低信息量 UI。模板必须有明确主题色、操作按钮、
  状态标签、图片/图标、输入/搜索或业务专属组件参与界面表达。

## 统一 UI 设计规范

这部分是给 AI 生成模板 schema 时优先读取的设计约束。生成模板时不要自由发挥一套新的
视觉系统，而是为同一个模板建立一套稳定的页面结构、组件组合、文字层级和视觉 token。

### 1. 模板整体设计目标

每个模板必须像一个完整产品，而不是互不相关页面的集合：

- 所有页面必须服务于同一个业务场景，例如餐饮点单、预约预订、内容阅读、健康管理。
- 同一模板内页面必须共享同一套颜色、字号、间距、圆角、按钮样式、卡片样式和导航结构。
- 每个页面都要有明确用户目标，避免只堆砌展示型模块。
- 每个页面都必须有至少一个明确的用户行动或状态反馈，例如下单、预约、收藏、发布、筛选、
  查看详情、继续学习、提交表单、联系客服、查看进度。
- 页面之间应该形成可解释的信息架构，例如首页 -> 列表/分类 -> 详情/订单 -> 个人中心。
- 不要把多个行业的内容混在一个模板里，例如餐饮模板里不要出现健身课程、金融收益等无关内容。
- 模板必须有可识别的行业视觉特征。例如餐饮要有菜单/价格/购物车/口味标签，预约要有时间段/
  服务人员/确认动作，教育要有课程进度/课时/讲师，不能只换文字。

### 2. 设备与布局规则

模板的 `platformCategories` 决定布局边界：

- 每个页面根节点 `core.screen.props.surface` 必须和目标平台一致：小程序用 `mini-program`，手机 App 用
  `mobile-app`，网站用 `web`。不要只改 `platformCategories` 而让页面根节点继续使用错误外壳。
- 每个页面根节点 `core.screen.props.chrome` 必须和外壳一致：微信小程序用 `wechat`，手机 App 用 `app`，
  网站用 `none`。`web + none` 会隐藏手机状态栏、标题栏和微信胶囊，按网页宽屏渲染。
- `mini-program` / `mobile-app`：
  - 默认按手机窄屏设计，页面内容单列为主。
  - section 级大组件必须默认占满可用宽度，例如主内容 `core.panel`、列表容器、
    banner、表单区、订单卡片容器通常应设置为 `width: "100%"` 或等效全宽布局。
- 不要生成桌面式侧边栏、复杂多栏表格、宽屏 dashboard。
- `core.grid.props.columns` 默认不超过 `2`，功能宫格最多可用 `4` 列，但每个 item 必须短小。
- 页面底部可以使用 `core.tabs` 作为主导航，并且每个页面的 tabs 内容必须一致。
- 小程序首页不能只是把网页 hero、搜索框、卡片列表改成手机宽度。应优先使用小程序常见业务
  结构，例如横向频道/故事圈、日期或时间段条、功能宫格、双栏点餐、签到/进度面板、优惠券横滑、
  订单状态入口、底部结算栏、浮动发布区、工具面板等。
- 同一批模板的首页不能复用同一个 `hero + search + grid/list + button` 骨架。每个行业模板的
  首屏结构必须能一眼看出业务差异，例如餐饮是左分类右菜品，社交是故事圈和发布框，健康是
  指标环和计划卡，预约是日期条和时段选择。
- `tablet-app`：
  - 可以使用更宽的内容区和 2 列布局。
  - 不要生成 desktop 管理后台式密集数据表。
  - 同一模板内 tablet 页面应保持相同内容宽度、卡片密度和导航位置。
- `web`：
  - 可以使用更宽布局，但仍要保持清晰的信息层级。
  - dashboard 类模板可以使用多栏卡片和数据区，但移动类模板不能伪装成 web。

如果模板只声明 `mini-program` 或 `mobile-app`，不要在页面结构、文案或 props 中暗示桌面端能力。

### 3. 页面结构规则

每个页面都应按稳定骨架组织：

```text
core.screen
  header / title area
  main content sections
  supporting section or secondary actions
  footer tabs or primary action
```

具体要求：

- 每个页面必须有一个清晰的页面标题或 header，不要只放卡片列表。
- 首页和关键详情页必须有一个有视觉识别度的 header/业务入口区域，不能只用普通白色 panel + 文本。
  这个区域不一定是网页式大 banner；小程序模板更应该按业务选择签到卡、状态卡、横滑封面、
  时间选择器、会员卡、发布框、菜单区等原生移动结构。
- 每个页面最多使用一个 `core.text.variant = "display"`，通常只用于首页或主页面。
- 普通页面优先使用 `heading` / `subheading` / `body` / `caption`，不要滥用大标题。
- 主内容区域应由 2-5 个稳定 section 构成，避免十几个无关 panel 堆叠。
- 每个页面至少要混合使用 3 类以上 UI 元素，例如文本、图片/图标、按钮、标签、搜索、输入、
  进度、tabs、列表 pattern 或自定义业务组件。不要只使用容器 + 文本。
- 非纯阅读页面至少要有一个明显主按钮或主操作区；列表页至少要有筛选/搜索/详情入口之一。
- 同类页面要保持相似结构，例如订单类页面都使用同一种订单卡片 pattern。
- 空状态、提示、表单说明可以使用 `core.notice`，不要用多个大段文本模拟提示系统。

推荐页面类型：

| 页面类型 | 推荐 pageKind | 结构重点 |
| --- | --- | --- |
| 首页 | `home` | 业务入口、核心推荐、主行动 |
| 分类/列表 | `category` / `list` | 筛选、列表、卡片 pattern |
| 详情 | `detail` | 标题、关键图片/信息、价格/状态、主按钮 |
| 订单/记录 | `order` | 状态筛选、记录卡片、操作按钮 |
| 表单 | `form` | 输入项、说明、提交按钮 |
| 个人中心 | `profile` | 用户摘要、功能入口、设置/服务 |
| 仪表盘 | `dashboard` | 指标卡、趋势区、任务/提醒 |

### 4. 跨页面风格一致性规则

同一个模板内，不同页面必须满足以下一致性：

- 页面根节点 `core.screen` 的背景、标题风格、状态栏风格要一致。
- 同等级标题使用同一个 `variant`，不要某页用 `display`，另一页用多个 `heading` 模拟 display。
- 主要按钮只保留一种 primary 样式；次级按钮用 `secondary` 或 `link`，不要每页换一套。
- 主题色必须贯穿关键页面：header/hero、主按钮、选中状态、重点 tag、进度/价格/状态等至少
  3 类元素要体现主色或辅助强调色。
- 不要让 80% 以上的可见 UI 都是白色卡片。可以使用浅色背景、主题色 header、渐变块、
  色带、状态底色、图标底色或业务插画来形成层次。
- `core.panel.props.tone` 不要超过 3-4 种，且同一业务含义使用同一个 tone。
- `core.tag.props.tone` 必须语义稳定，例如成功状态统一用 `success`，风险/提醒统一用 `warning`。
- 卡片内字段顺序一致，例如商品卡片始终为图片/标题/描述/价格/操作。
- 同类列表页面的卡片密度、gap、按钮位置、tag 位置要一致。
- 底部导航 tabs 的顺序、label、icon/占位表现和跳转目标在所有页面保持一致。

如果必须出现视觉变化，只能服务于业务状态变化，例如选中态、促销态、警告态，而不是随机换颜色。

### 5. 颜色、字号和间距规则

模板必须通过 `cssVars` 建立稳定设计 token：

- 至少提供主色、背景色、前景文字色、弱文字色、边框/分隔色。
- 同一模板内不要使用超过 1 个主色和 1 个辅助强调色。
- 避免整套模板被单一色相淹没；卡片、背景、文字、强调色要有层次。
- 主色不能只写在 `accent` 或 `cssVars` 里不用；必须实际出现在 header、按钮、tag、进度、
  图标底色、价格或重要状态中。
- 背景不能只使用纯白。移动端小程序建议使用浅灰/浅彩背景承托白色内容区，或使用主题色
  header + 浅色内容背景。
- 不要在节点 props 里随机写十几个独立颜色值；优先复用 `cssVars`。
- 字号层级控制在 4-6 档：display、heading、body、caption、price 等。
- 同一类 section 的 `gap`、`columns`、卡片间距要一致。
- 不要通过大量 `core.spacer` 堆出布局；优先通过容器 `gap` 控制节奏。

### 6. 组件使用与多样性规则

优先使用这些稳定组合，但不要被它们限制：

- 页面容器：`core.screen`
- 分区卡片：`core.panel`
- 垂直布局：`core.stack`
- 水平信息行：`core.row`
- 宫格/卡片列表：`core.grid`
- 标题/正文/价格：`core.text`
- 主操作：`core.button`
- 状态：`core.tag`
- 图片或图标占位：`core.image`
- 进度：`core.progress`
- 搜索：`core.search`
- 输入：`core.input`
- 提示：`core.notice`
- 导航：`core.tabs`
- 更完整的内置 alias 还包括导航（`core.navbar`、`core.tabbar`、`core.breadcrumb`、`core.pagination`）、
  数据展示（`core.list`、`core.list-item`、`core.statistic`、`core.table`、`core.timeline`）、
  表单控件（`core.select`、`core.checkbox`、`core.radio`、`core.switch`、`core.rate`、`core.slider`、
  `core.datepicker`、`core.timepicker`、`core.form`、`core.upload`）、
  反馈组件（`core.alert`、`core.toast`、`core.loading`、`core.empty`、`core.skeleton`、`core.tooltip`）、
  媒体与高级布局（`core.carousel`、`core.video`、`core.audio`、`core.avatar`、`core.badge`、`core.sidebar`、
  `core.toolbar`、`core.drawer`、`core.dialog`、`core.splitter`、`core.collapse`、`core.tree`）。按业务需要选择，
  但 `layoutDocument.components` 仍然只声明实际出现在布局树里的组件。

限制：

- 不要使用未知 alias。
- 不要使用 `core.html` 模拟复杂 UI，除非明确需要静态富文本。
- 可以使用 `core.widget` 嵌入简单的外置图形 UI，例如 ECharts 图表、高德地图（AMap）、Mermaid 流程图等。
  必须在 `layoutDocument.dependencies` 中声明依赖，且只允许使用 esm.sh 白名单内的库。
  Widget 适合数据可视化、地图展示、流程图等场景，但不要用它模拟复杂交互 UI。
- 不要用多个嵌套 panel 做装饰外框；panel 只用于真实内容分组。
- 不要用空 text、无意义 spacer 或重复 divider 制造视觉复杂度。

组件多样性要求：

- 每个模板必须至少包含 5 类以上视觉/交互元素，例如 button、tag、image、search、input、
  tabs、progress、notice、自定义业务卡片、自定义状态组件。
- 不能让 `core.panel` + `core.text` 占据绝大多数界面。容器只负责结构，不应成为视觉主体。
- 卡片容器要服务于业务实体，例如商品、订单、课程、医生、活动、工具；不要把每两行文字都
  包成一个 panel。
- 每个核心业务流至少要有一个主行动按钮，例如“立即预约”“加入购物车”“开始学习”“发布动态”。
- 列表/卡片必须包含状态、价格、图片、标签、操作或进度中的至少两类信息，避免纯文本列表。

### 7. 自定义组件规则

当 `core.*` 组件无法表达模板的业务识别度时，应该使用 `componentTemplates` 定义自定义组件。

适合自定义的场景：

- 行业专属卡片：商品卡、订单卡、课程卡、医生卡、活动卡、工具卡。
- 复合状态组件：进度卡、配送轨迹、预约时间段、会员权益、优惠券、排行榜。
- 品牌化入口：带主题色背景、图标、数字、状态和行动按钮的组合模块。
- 稳定复用 section：首页 hero、分类入口、业务摘要、个人中心菜单组。

自定义组件要求：

- alias 使用英文 slug，例如 `biz-product-card`、`biz-order-card`、`biz-hero-banner`。
- 必须在 `layoutDocument.components` 中声明 alias、中文 name、kind、description 和 props。
- 每个可编辑 prop 必须有中文 `label`。
- 组件内部仍应使用可解释的结构和字段，不要把整块 UI 藏成不可编辑黑盒。
- 同一个模板内同类自定义组件必须复用同一 alias 和字段结构。
- 自定义组件不能绕过安全限制，不能加载远程脚本，不能使用任意 JS 运行时能力。

### 8. 图片与图标规则

- 有可靠图片时，`core.image.props.src` 必须是合法 HTTPS URL 或 `/template-assets/...` 本地静态路径。
- 需要 AI 生图时，在顶层 `visualAssets` 中声明图片资产，并让 `core.image.props.assetId`
  指向对应资产；后端会用 `AI_IMAGE_MODEL` 尝试生成并保存到 `/template-assets/generated/...`。
- `visualAssets` 至少应包含 `id`、`nodeId` 或 `assetId` 关联、`prompt`、`alt`，并可包含
  `role`、`aspectRatio`、`provider`、`placeholder`。
- 没有可靠图片或生图不可用时不要写假 URL，保留 `alt` / `title` / `iconColor` 或
  `visualAssets.placeholder` 使用内置占位。
- 同一类图片必须保持相同 `objectFit`，商品/封面一般用 `cover`，图标/徽章一般用 `contain`。
- 图片文案必须和业务场景一致，不要复用无关行业的 alt/title。
- 图标类视觉可用 `core.image` 的占位态表达，不要发明 icon 组件 alias。
- 不要只用通用“图片”“图标”作为所有 alt/title；应该写业务语义，例如“招牌菜图片”、
  “课程封面”、“预约服务图标”。

### 9. TemplateProfile 语义规则

为了让后续 agent 能稳定编辑模板，新模板必须有可推断或可覆盖的语义结构：

- 页面名称和 id 应能推断 `pageKind`，例如 `home`、`order`、`profile`、`category`、`detail`。
- 关键 section 的节点 id 应有语义，例如 `home-hero`、`order-list`、`profile-actions`。
- 重复卡片区域要结构一致，方便生成 `patternKey`。
- 关键可编辑文案、图片、按钮应能映射成 `slotKey`。
- 如果自动生成的 profile 不够准确，必须在 `templates_json/configs/<templateId>.override.json`
  中补充或修正 `pages`、`regions`、`slots`、`patterns`。

推荐语义命名：

```text
pageKey: home | category | detail | order | profile | form | dashboard
regionKey: home.hero | home.featureGrid | order.list | profile.actions
slotKey: home.hero.title | home.hero.subtitle | order.card.status
patternKey: product.card | order.card | feature.gridItem
```

### 10. 动画与动效规则

模板可以通过顶层 `cssAnimations` 声明可复用的 CSS keyframes，再在节点 `props.style.animation` 或
`props.style.transition` 中引用。动画是视觉增强，不是业务逻辑；不要用 schema 动画模拟游戏循环、实时状态机或复杂手势逻辑。

推荐写法：

```json
{
  "cssAnimations": {
    "soft-pulse": "0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.92; transform: scale(1.02); }",
    "slide-up": "0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); }"
  },
  "layoutDocument": {
    "layout": {
      "id": "home-screen",
      "alias": "core.screen",
      "props": {
        "surface": "mobile-app",
        "chrome": "app"
      },
      "children": [
        {
          "id": "home-hero",
          "alias": "core.panel",
          "props": {
            "style": {
              "animation": "slide-up 360ms ease-out both"
            }
          }
        }
      ]
    }
  }
}
```

具体约束：

- `cssAnimations` 的 key 是动画名称，只写英文字母、数字、`_`、`-`，不要包含空格或特殊符号。
- `cssAnimations` 的 value 只写 keyframes 内部 body，不要再包一层 `@keyframes name { ... }`。
- 节点引用动画时使用标准 CSS 字符串，例如 `"animation": "soft-pulse 1800ms ease-in-out infinite"`。
- 动画属性写在 `props.style` 中，必须使用标准 CSS 属性和值；不要使用 rpx、wxs、小程序专属动画 API 或远程脚本。
- 动画数量保持克制：每个模板建议 1-3 个通用动效，优先用于首屏入场、状态强调、加载/进度反馈或轻量悬浮反馈。
- 不要给大面积列表中每个重复卡片都加无限动画，避免预览和导出项目出现性能问题。
- 动画必须可降级：去掉动画后页面信息结构和主要操作仍然完整。
- React source export 会把 `cssAnimations` 编译为 `@keyframes`，并保留简单的 `props.style.animation` / `transition`。

### 11. AI 生成模板 schema 的工作流

让 AI 生成一批模板时，必须按这个顺序工作：

1. 先确定业务场景、目标用户、平台类型和页面清单。
2. 定义统一视觉方向：主色、辅助色、背景、文字层级、卡片风格、按钮风格。
3. 定义动效策略：是否需要 `cssAnimations`，哪些节点引用动画，动画是否可降级且不承担业务逻辑。
4. 定义组件策略：哪些用 `core.*`，哪些需要 `componentTemplates` 自定义业务组件。
5. 先设计页面结构和跨页面共享 pattern，再写 JSON。
6. 每个模板只围绕一个业务场景生成内容。
7. 每个页面都复用同一套导航、卡片、按钮、tag、标题层级。
8. 写完模板 JSON 后，为需要稳定编辑的模板补 `configs/<templateId>.generated.json`
   或 `configs/<templateId>.override.json`。
9. 运行 `pnpm templates:validate`，修复所有 error，再人工检查 warning。
10. 对多页面模板额外检查：页面密度、卡片结构、颜色和导航是否一致。
11. 检查最终 UI 是否只是白卡片和文字；如果是，必须增加主题色区域、业务组件、按钮、标签、
    图片/图标或进度/状态组件。

### 12. 人工审查清单

导入前至少检查：

- 是否所有页面都像同一个产品。
- 是否每个页面都有清晰用户任务。
- 是否每个非阅读页面都有明确主按钮或主操作。
- 是否每个页面根节点 `core.screen` 都设置了和 `platformCategories` 一致的 `surface` / `chrome`。
- 是否主题色真实参与了关键 UI，而不是只存在于 token。
- 如果使用 `cssAnimations`，是否只包含合法 keyframes body，且节点动画引用、持续时间和降级表现都合理。
- 是否避免了全白背景、白色卡片、文本堆叠的廉价感。
- 是否有足够组件多样性，而不是 `core.panel` + `core.text` 占据绝大多数界面。
- 是否在 core 不够表达业务时使用了可编辑的 `componentTemplates` 自定义组件。
- 是否存在明显文字溢出或过密卡片。
- 是否颜色、按钮、tag、panel tone 在页面之间保持一致。
- 是否 bottom tabs 在所有页面一致。
- 是否重复结构可以被识别为 pattern。
- 是否模板没有混入无关行业内容。
- 是否没有假图片 URL、未知 alias 或自定义组件。
- 是否所有 inline style 使用 CSS 标准单位（px、rem、%），没有 rpx 等小程序专属单位。
- 是否 `layoutDocument.components` 只包含布局树中实际使用的组件声明。

### 13. 单位与渲染兼容规则

模板由 web 渲染器（DynamicThemeRenderer）渲染，不是微信小程序运行时：

- 所有 inline style 必须使用 CSS 标准单位（px、rem、%、vh/vw），禁止使用 rpx、upx 等小程序专属单位。
- 间距、字号、圆角推荐使用 px；响应式宽度使用 % 或 vw。
- 如果从 rpx 换算，参考值：`1rpx ≈ 0.5px`（基于 375px 设计稿），例如 `24rpx` → `12px`。
- 不要在 style 中使用 `calc()` 搭配 rpx；calc 表达式内的所有值都必须是标准 CSS 单位。

### 14. 组件声明精简规则

`layoutDocument.components` 是模板的组件目录，供编辑器展示可用组件列表：

- 只声明布局树中实际使用的 `core.*` 组件和自定义组件。
- 不要声明"可能用到"但布局树中未出现的组件。编辑器会从内置注册表补全所有 core.* 组件。
- 如果模板不使用 `core.input`、`core.notice`、`core.divider`、`core.spacer` 等组件，
  不要在 `components` 中声明它们。
- 自定义组件（`biz-*`）必须在 `components` 中声明，因为编辑器无法从内置注册表推断。

### 15. 视觉原型规则

每个模板必须选择一种视觉原型并贯穿整个模板。不同模板应选择不同原型，避免批量生成时视觉雷同。

| 原型 ID | 名称 | Hero 风格 | 卡片风格 | 背景 | 圆角 | 阴影 | 适用场景 |
|---------|------|----------|---------|------|------|------|---------|
| `fresh` | 清新标准 | 浅色卡片+功能图标区 | 白卡+细分隔线 | 浅灰 #f5f7fa | 8-12px | 轻微 box-shadow | 工具、效率、生活服务 |
| `immersive` | 沉浸渐变 | 深色渐变全覆盖+叠层文字 | 半透明白/毛玻璃卡 | 深色渐变底 | 16-24px | 彩色 glow 阴影 | 活动、会员、品牌 |
| `editorial` | 杂志排版 | 大图+文字叠层/纯文字排版 | 无边框分区/底部分隔线 | 米白/纸色 #faf8f5 | 4-8px 或 0 | 无阴影 | 阅读、资讯、博客 |
| `vibrant` | 活力社交 | 彩色图标流/故事圈/封面卡 | 彩色圆角卡+彩色图标 | 浅彩底色 | 20-28px | 轻微 shadow | 社交、电商、年轻用户 |
| `dark-pro` | 深色专业 | 暗色面板+霓虹色数据点缀 | 深色半透明卡 | 深灰 #1a1a2e 或黑 | 12-16px | 霓虹 glow 阴影 | 健康、数据、工具 |

每个原型的具体约束：

**fresh（清新标准）**:
- 首页 hero 使用白色/浅色卡片 + 业务图标网格或日期选择条
- 卡片背景 `#fff`，边框 `1px solid #e5e7eb` 或无边框
- 间距使用 8px 倍数（8, 12, 16, 20, 24）
- 主按钮使用 `variant: "primary"`，圆角 8px
- 页面背景 `#f5f7fa`

**immersive（沉浸渐变）**:
- 首页 hero 使用全宽渐变覆盖区域（min-height 200px）+ 叠层白色文字
- 卡片使用 `background: rgba(255,255,255,0.12)` + `backdrop-filter: blur(10px)`
- 间距偏大（16, 20, 24, 32）
- 圆角大（16-24px），阴影使用主色 glow
- 页面背景使用深色渐变

**editorial（杂志排版）**:
- 首页 hero 使用大封面图 + 标题叠层，或纯文字排版（大号 display + 引言）
- 卡片无边框无阴影，仅通过间距和分隔线区分区块
- 间距偏宽松（16, 20, 24, 32）
- 圆角极小（4-8px）或无圆角
- 页面背景 `#faf8f5`（暖纸色）
- 大量使用 `core.text` 的不同 variant（display, heading, body, caption, overline）

**vibrant（活力社交）**:
- 首页 hero 使用彩色故事圈/头像横滑流/大型封面卡
- 卡片使用彩色背景（浅粉、浅蓝、浅黄等），不用纯白
- 图标使用彩色圆形底色
- 圆角超大（20-28px）
- 主色高饱和度，辅助色丰富
- 按钮使用 `variant: "pill"` 或自定义圆角

**dark-pro（深色专业）**:
- 首页 hero 使用暗色面板 + 霓虹色（青、紫、绿）数据/指标展示
- 卡片背景 `rgba(255,255,255,0.06)` 或 `#1e1e2f`
- 文字使用 `#e2e8f0`（主）和 `#94a3b8`（次）
- 数据展示使用 `core.progress`、`core.tag`（tone: info/success）
- 主按钮使用霓虹色渐变背景
- 页面背景 `#0f0f1a` 或 `#1a1a2e`

### 16. 首页入口模式多样性

同一批生成的模板不能都使用同一个首页结构。首页第一屏（hero 区域）应根据业务场景选择不同的入口模式：

| 模式 | 描述 | 适合场景 |
|------|------|---------|
| 日期/时间条 | 横向滚动日期选择 + 时段/价格 | 预约、酒店、课程 |
| 功能宫格 | 4-6 宫格图标入口 | 工具、生活服务、分类 |
| 封面故事 | 大图封面 + 标题叠层 + 行动按钮 | 阅读、资讯、品牌 |
| 指标仪表盘 | 环形进度/数字卡/趋势摘要 | 健康、数据、运动 |
| 故事/头像圈 | 横向滚动头像/封面 + 状态 | 社交、内容、社区 |
| 双栏内容区 | 左侧分类 + 右侧内容列表 | 餐饮点单、电商 |
| 计时/倒计时 | 倒计时 banner + 促销入口 | 活动、限时、促销 |
| 搜索+筛选条 | 搜索框 + 横向标签筛选 + 列表 | 资讯、商品、服务列表 |

每个模板的首页 hero 必须选择一种模式，且同批次模板之间应尽量不重复。

### 17. Flex 布局行为规则

小程序模板的布局大量使用 flex。与其事后用 CSS 修补挤压问题，不如在设计阶段就避免空间冲突。

**核心原则：一行只有一个弹性元素，其余都是固定尺寸。**

```text
推荐模式：
┌─[头像 40px]──[标题区 flex:1]──[Tag nowrap]─┐
│                标题区内可嵌套多行文本         │
└────────────────────────────────────────────┘

避免模式：
┌─[头像]─[标题]─[Tag]─[价格]─[按钮]─┐  ← 5个元素抢375px
└────────────────────────────────────┘
```

具体规则：

- **一行不超过 3 个逻辑区域**。典型组合：固定元素 + 弹性主内容 + 固定附属元素。
  如果需要展示更多信息（价格、标签、按钮），用 stack 分成多行。
- **主内容区使用 `flex: "1"` + `minWidth: "0"`**，让它自动占据剩余空间。
  标题、描述等长文本应放在这个弹性区内。
  **禁止**同时设置 `width: "100%"` 和 `flex: "1"`——前者强制占满整行，会把同行的固定元素挤出容器。
  弹性区的正确写法是 `{ flex: "1", minWidth: "0" }`，不要设 `width`。
- **固定元素设置 `flexShrink: "0"`**：头像（40px）、图标（32px）、Tag、短按钮等
  不应被压缩的元素。
- **不要把 Tag、价格、按钮都放在同一行**。推荐分层：
  - 第一行：头像 + 标题 + Tag（Tag 固定宽度，标题弹性）
  - 第二行：价格 + 操作按钮（或价格在右侧独立区域）
- **横向滚动区域**：故事圈、日期条、标签筛选等需要横向滚动的 row，
  所有子元素必须 `flexShrink: "0"`，容器设置 `overflowX: "auto"`。
- **搜索框在 row 中**：搜索框设置 `flex: "1"` + `minWidth: "0"`，
  旁边的按钮/图标固定宽度。

示例——商品卡片正确布局：

```text
core.row { gap: "12px" }           ← 一行两个区域
  core.image { width: "80px", flexShrink: "0" }   ← 固定
  core.stack { flex: "1", minWidth: "0" }          ← 弹性
    core.text { variant: "subheading" }            ← 标题（自动截断）
    core.row { gap: "6px" }                        ← 嵌套行
      core.tag { flexShrink: "0" }                 ← Tag 固定
      core.text { variant: "caption" }             ← 说明弹性
    core.row { justifyContent: "space-between" }   ← 底部行
      core.text { variant: "price" }               ← 价格
      core.button { flexShrink: "0" }              ← 按钮固定
```

## 校验

导入前可以运行：

```bash
pnpm templates:validate
```

校验脚本只扫描 `templates_json` 根目录的模板 schema，不会把 `configs` 下的配置文件当作模板。
