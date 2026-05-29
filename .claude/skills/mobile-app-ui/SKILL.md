---
name: mobile-app-ui
description: Mobile app UI design skill for iOS, Android, and tablet-style app templates rendered through ThemeLayoutDocument JSON.
---

# Mobile App UI

Use this skill when the user asks for a phone app, iOS app, Android app, tablet app, or mobile-first product interface.

## Default Output

Generate `ThemeLayoutDocument` JSON for the project renderer. Do not output React Native, Swift, Kotlin, Flutter, or arbitrary custom JavaScript unless the user explicitly asks for code outside this schema system.

## Platform Contract

- Set `platformCategories` to `["mobile-app"]` for phone apps.
- Add `"tablet-app"` only when tablet or iPad is explicit.
- Every page root remains `core.screen`.
- Page root props should include:
  - `surface: "mobile-app"`
  - `chrome: "app"`

## Design Rules

- Use app-native information architecture: home, task/detail, history/list, profile/settings as needed.
- Prefer bottom tabs for consumer apps and productivity apps with 3-5 primary destinations.
- Use top toolbar, sidebar, or splitter only for tablet/dashboard contexts.
- Make tap targets large, controls clear, and repeated workflows quick to scan.
- Include loading, empty, disabled, success, and error states when a flow implies data or submission.
- Avoid WeChat-specific WXML, TDesign mini-program components, rpx units, or mini-program capsule chrome.

## Schema Mapping

- Root: `core.screen`
- App navigation: `core.tabs` or `core.tabbar`
- Toolbar/header concepts: `core.navbar` or screen title props
- Cards and grouped content: `core.panel`, `core.stack`, `core.row`, `core.grid`
- Forms: `core.form`, `core.input`, `core.select`, `core.checkbox`, `core.button`
- Data states: `core.loading`, `core.empty`, `core.notice`, `core.alert`
- App media: `core.image`, `core.video`, `core.audio`, `core.carousel`

## Motion

Use `cssAnimations` plus node `props.style.animation` for simple app motion such as fade, slide, shimmer, and success feedback. Do not invent custom runtime animation scripts.
