---
name: indie-web-ux-ui-designer
description: UX and UI design guidance for websites and web apps. Use when Codex needs to design information architecture, user flows, responsive layouts, landing pages, dashboards, design tokens, component systems, brand expression, accessible interactions, developer handoff specs, or AI image prompt direction before frontend implementation.
---

# Indie Web UX UI Designer

## Overview

Use this skill to produce developer-ready UX and visual direction for a website or web application. The output should be implementable by an independent developer without a separate design team.

This skill adapts and merges the Agency roles UI Designer, UX Architect, UX Researcher, Brand Guardian, Visual Storyteller, Image Prompt Engineer, Inclusive Visuals Specialist, and Whimsy Injector.

## Inputs

Collect:

- Product/site goal and target audience
- Primary user journey and conversion or task success target
- Existing brand assets, style references, screenshots, or competitors
- Required pages, flows, components, content sections, and constraints
- Implementation stack and styling system, if known

When no brand exists, create a lightweight visual direction rather than a full brand identity.

## Workflow

1. **Map the experience**
   - Define entry points, page hierarchy, navigation, and the primary path to success.
   - Identify states: empty, loading, error, success, disabled, authenticated, unauthenticated, mobile, and desktop.

2. **Define visual foundations**
   - Choose a restrained palette with accessible contrast.
   - Set type scale, spacing, layout grid, radius, elevation, and motion rules.
   - Keep the system small enough to implement quickly.

3. **Specify components**
   - Design reusable components before one-off screens.
   - Include props/states, responsive behavior, interaction rules, keyboard behavior, and content constraints.
   - Prefer native controls and familiar patterns.

4. **Plan responsive layouts**
   - Start mobile-first, then define tablet and desktop adaptations.
   - Use stable dimensions for boards, grids, toolbars, media, and fixed-format controls so content changes do not shift the layout.

5. **Add brand and personality carefully**
   - Use microcopy, motion, image style, and subtle interactions only where they improve clarity or memorability.
   - Do not let decorative ideas obscure the task.

6. **Prepare implementation handoff**
   - Provide tokens, component specs, screen hierarchy, asset needs, and QA notes.
   - Include accessibility requirements directly in the design spec.

## Design Rules

- Design for the product category: SaaS and operational tools should be dense, clear, and work-focused; marketing pages can be more expressive.
- Do not rely on placeholder-only labels, low contrast text, hover-only affordances, or custom widgets without keyboard support.
- Avoid design systems that require more components than the MVP needs.
- For system UI components, specify a constrained API surface. Text, heading, and button components should expose finite variants for color, size, weight, alignment, state, and emphasis rather than allowing arbitrary CSS overrides.
- Separate component responsibilities clearly: text primitives control typography only; button primitives control action appearance and states; layout primitives control structure, spacing, alignment, and containment. Do not let a single primitive become an unrestricted wrapper for all HTML attributes.
- If a visual need is missing from the system, define a reusable variant with documented purpose and states instead of relying on page-specific `className` or inline style escape hatches.
- Keep text within containers at mobile and desktop sizes.
- Prefer real product, place, object, or state images when users need to inspect the subject.
- For generated images, specify subject, environment, lighting, composition, style, accessibility/representation constraints, and prohibited stereotypes.

## Deliverable Template

```markdown
# UX/UI Spec

## Experience Goal
[What the user should accomplish and what success looks like]

## Information Architecture
- Pages:
- Navigation:
- Primary flow:
- Secondary flows:

## Visual Foundation
| Token | Value | Notes |
| --- | --- | --- |
| Color | [values] | [contrast/use] |
| Type | [scale] | [usage] |
| Spacing | [scale] | [layout rhythm] |
| Radius | [values] | [component rules] |

## Components
### [Component Name]
Purpose:
Variants:
Prop constraints:
States:
Responsive behavior:
Accessibility:
Implementation notes:

## Screens
### [Screen Name]
Layout:
Content hierarchy:
Interactions:
Empty/loading/error states:

## QA Notes
- Keyboard:
- Screen reader:
- Mobile:
- Performance:
```

## Handoff Checklist

- Primary flow is obvious without instructions.
- Components include all required states.
- Shared component APIs use constrained variants and documented props, not arbitrary CSS overrides.
- Typography and spacing are implementable with local CSS/framework primitives.
- Color contrast meets WCAG AA for text and important UI.
- Mobile and desktop layout behavior is specified.
- Assets are listed with dimensions, alt text intent, and fallback behavior.

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for practical web UX/UI design.
