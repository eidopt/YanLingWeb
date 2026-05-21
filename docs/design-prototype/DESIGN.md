# YanLing 设计系统规格书 v2

## 设计哲学：霓虹匠造 (Neon Craft)

上一版的「暖意精密」追求人文温度，但作为 AI 产品设计工具，YanLing 需要在
**科技活力**与**设计匠心**之间找到平衡。新版「霓虹匠造」用深色底衬托高饱和渐变，
用编辑级排版 (Fraunces) 在科技语境中保留人文质感，用玻璃态卡片和柔和辉光
替代传统投影，营造 AI 时代的轻盈感。

核心理念：
- AI 不必冰冷，但可以带电。深色底 + 渐变霓虹 = 科技感与活力的交集
- 避免单一蓝紫套路——三色渐变光谱 (violet → cyan → coral) 让页面有层次有温度
- 辉光只做点缀，(shadow-glow-violet/cyan) 控制在卡片边框和徽章上，不滥用
- Fraunces 衬线标题在暗底上形成"科技中的编辑感"专属辨识度

---

## 色彩系统

基于 OKLCH 感知均匀性，以深色底 + 高饱和点缀构建。

### 主色调

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-bg` | `#090d14` | 页面主背景 |
| `--color-bg-alt` | `#0d1220` | 区块交替背景 |
| `--color-surface` | `rgba(255,255,255,0.035)` | 玻璃态卡片 |
| `--color-surface-hover` | `rgba(255,255,255,0.06)` | 悬停加深 |
| `--color-text-primary` | `#ede8f5` | 主文字 (暖白) |
| `--color-text-secondary` | `#a8aec8` | 辅助文字 |
| `--color-text-tertiary` | `#6c728a` | 次要信息 |

### 强调色光谱

| Token | 色值 | 角色 |
|-------|------|------|
| `--color-accent-violet` | `#8b5cf6` | 主 CTA / 核心强调 |
| `--color-accent-cyan` | `#22d3ee` | 状态标签 / 链接悬停 |
| `--color-accent-coral` | `#fb7185` | 暖色调点缀 / 推广 |
| `--color-accent-amber` | `#fbbf24` | 效率数据 / 高亮 |

**60-30-10 法则**：
- 60% 深色背景 + 玻璃表面
- 30% 中性次要文字
- 10% 渐变 / 辉光点缀

### 渐变

| Token | 定义 |
|-------|------|
| `--gradient-primary` | `violet → indigo → blue` (CTA 按钮) |
| `--gradient-hero` | `violet → indigo` (Hero 柔光背景) |
| `--gradient-card-glow` | `violet → cyan → coral` (卡片悬停辉光) |

---

## 字体系统

与 v1 保持一致，但在深色底上微调了视觉权重。

### 字体配对

| 角色 | 字体 | 来源 |
|------|------|------|
| 标题/展示 | Fraunces (可变衬线, 300-700) | Google Fonts |
| 正文/界面 | Plus Jakarta Sans (300-800) | Google Fonts |

深色底注意事项：正文 `line-height` 提升至 1.75，比浅色底多 0.1。

### 字体比例 (1.25 Major Third)

| 层级 | 尺寸 | 用途 |
|------|------|------|
| `--text-xs` | 0.75rem | 标签、版权 |
| `--text-sm` | 0.875rem | 卡片描述、导航 |
| `--text-base` | 1rem | 正文 |
| `--text-lg` | 1.125rem | 引言 |
| `--text-xl` | 1.25rem | 卡片标题 |
| `--text-2xl` | 1.75rem | 步骤标题 |
| `--text-3xl` | 2.5rem | 区块标题 |
| `--text-4xl` | 3.5rem | 展示标题 |
| `--text-5xl` | 4.5rem | Hero 标题 |

---

## 空间系统 (4pt 基准)

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-1` | 4px | 极小间距 |
| `--space-2` | 8px | 紧密间距 |
| `--space-3` | 12px | 常规内边距 |
| `--space-4` | 16px | 标准间距 |
| `--space-6` | 24px | 区块内间距 |
| `--space-8` | 32px | 区块间距 |
| `--space-12` | 48px | 段落间距 |
| `--space-16` | 64px | 大区块间距 |
| `--space-24` | 96px | Section 上下留白 |

---

## 布局策略

### 网格
- 最大内容宽度：1280px (`--max-width`)
- 非对称 Hero：左右分栏 (1:1)，左文右图 + 柔光背景
- Bento Grid 特性区：3 列自适应，支持跨列卡片和霓虹强调卡
- 模板横向滚动：`scroll-snap` + 隐藏滚动条

### 设计方差 (DESIGN_VARIANCE: 8/10)
- Hero 非对称布局
- Bento grid 混合卡片尺寸和视觉权重
- 拒绝居中三列等宽卡片的套路

### 视觉密度 (VISUAL_DENSITY: 3/10)
- 深色底天然降低视觉密度
- 卡片间距充足 (16px+)
- 段落行宽控制在 50-65ch

---

## 组件规范

### 按钮

| 变体 | 样式 | 使用场景 |
|------|------|----------|
| Primary | `violet→blue 渐变 + 辉光阴影` | 主要 CTA |
| Ghost | `透明 + 边框悬停` | 次要操作 |
| Outline | `透明白边 + 悬停背景` | 深色区次要 |

悬停反馈：`translateY(-2px)` + 辉光扩大。

### 卡片

- 玻璃态表面 (`rgba(255,255,255,0.035)`) + `1px 半透明边框`
- 悬停时边框变霓虹色 + `transform: translateY(-3px)` + 渐变辉光覆盖
- 强调卡：紫色渐变底色 + 紫辉光阴影
- 不使用厚重的 `box-shadow` 区分卡片层级

### 导航

- 固定定位 + `backdrop-filter: blur(20px) saturate(180%)`
- 导航链接下划线悬停动画
- 品牌图标用主渐变背景 + 辉光

---

## 动效规范 (MOTION_INTENSITY: 5/10)

比 v1 略活跃，但仍保持克制。

| 动效 | 实现 | 持续时间 |
|------|------|----------|
| 按钮悬停 | CSS `transition` + `::before` 渐变切换 | 150ms |
| 滚动渐现 | IntersectionObserver + CSS class | 800ms |
| 编辑器骨架 | CSS `::after` shimmer 扫光 | 3s 循环 |
| Hero 浮动徽章 | CSS keyframes float | 3s 循环 |
| 状态指示灯 | CSS keyframes pulse + glow | 2s 循环 |
| 卡片悬停辉光 | CSS `::before` 渐变覆盖 | 300ms |

**硬性规则**：
- 所有动效使用 GPU 属性 (`transform`, `opacity`)
- 必须尊重 `prefers-reduced-motion`
- 不混用动画库 (纯 CSS + 原生 JS)
- 辉光效果不滥用——仅卡片悬停和品牌元素

---

## 无障碍 (WCAG AA)

| 要求 | 实现方式 |
|------|----------|
| 色彩对比度 ≥ 4.5:1 | 暖白文字 (#ede8f5) 在深色底上满足 |
| 键盘导航 | 所有交互元素可聚焦 |
| Focus 可见指示器 | `:focus-visible` 2px 紫色轮廓 |
| 语义化 HTML | `<nav>`, `<section>`, `<footer>` |
| 动态内容通知 | `aria-live="polite"` |
| 减少动画 | `prefers-reduced-motion` 媒体查询 |
| 深色底易读性 | 正文 `line-height: 1.75`，增加行间距补偿 |

---

## v1 → v2 变更总结

| 维度 | v1 (暖意精密) | v2 (霓虹匠造) |
|------|-------------|-------------|
| 背景 | 暖象牙白 #faf7f3 | 深靛蓝 #090d14 |
| 强调色 | 暖陶土 #c8704f | 电紫 #8b5cf6 → 青 #22d3ee |
| 色彩数量 | 单强调色 | 三色光谱 (紫/青/珊瑚) |
| 卡片 | 白底 + 暖边框 | 玻璃态 + 渐变辉光 |
| 动效强度 | 4/10 | 5/10 |
| 导航 | 毛玻璃透明 | 毛玻璃 + 链接下划线动画 |
| 氛围 | 温暖编辑感 | 科技活力 + 编辑匠心 |

---

## 实现指南

### 当前状态
此设计系统以纯 HTML/CSS/JS 原型交付。所有 CSS 变量可直接迁移至 Next.js + CSS Modules。

### 关键 CSS 变量位置
`design-prototype/index.html` 中的 `:root {}` 块包含所有设计 token。

### 组件映射
| 原型组件 | Next.js 实现建议 |
|----------|-----------------|
| `.btn` | `src/ui/base/Button.tsx` |
| `.feature-card` | `src/ui/base/Card.tsx` |
| `.template-card` | `src/views/TemplatesPage/TemplateCard.tsx` |
| `.nav` | `src/ui/global_nav/` |
| `.hero` | `src/views/HomePage/HeroSection.tsx` |
| `.reveal` | `src/hooks/useScrollReveal.ts` |
