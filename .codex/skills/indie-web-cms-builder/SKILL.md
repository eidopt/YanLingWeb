---
name: indie-web-cms-builder
description: CMS implementation for independent websites. Use when Codex needs to build or modify WordPress themes, WordPress plugins, Gutenberg or ACF blocks, Drupal themes/modules/Twig templates, content models, headless CMS integrations, editorial workflows, migrations, accessibility, performance, or code-first CMS customizations.
---

# Indie Web CMS Builder

## Overview

Use this skill for CMS-backed websites where content modeling, editorial workflow, theme rendering, and safe customization matter. Prefer code-first, version-controlled changes over fragile admin-only configuration when the project is intended to be maintained.

This skill adapts and merges the Agency roles CMS Developer, Frontend Developer, Backend Architect, Technical Writer, Accessibility Auditor, and SEO Specialist.

## Workflow

1. **Discover the CMS shape**
   - Identify platform and version, theme/plugin/module structure, package/build tooling, templates, custom fields, content types, routing, deployment, and hosting constraints.
   - Check whether the project is classic WordPress, block theme, headless CMS, Drupal theme/module, or static build consuming CMS content.

2. **Model content**
   - Define content types, fields, taxonomies, relationships, editorial states, permissions, preview needs, and migration/backfill approach.
   - Make content reusable instead of page-builder-only when it will appear in multiple places.

3. **Implement theme or frontend**
   - Use accessible semantic templates.
   - Keep CSS/JS scoped to the theme or block where possible.
   - Preserve cacheability and avoid heavy frontend dependencies for simple content pages.

4. **Implement plugins/modules/blocks**
   - Put custom behavior in a plugin/module when it is not purely presentation.
   - Validate, sanitize, escape, nonce-check, and capability-check.
   - Avoid editing CMS core or third-party vendor files.

5. **Optimize and verify**
   - Check responsive behavior, keyboard navigation, image sizes, cache headers, schema, metadata, and editorial preview.
   - Test logged-out and relevant logged-in roles.

## WordPress Rules

- Never edit WordPress core.
- Put reusable functionality in plugins; presentation in themes.
- Escape output with the appropriate escaping helper.
- Sanitize and validate all saved data.
- Use nonces and capability checks for admin actions.
- Register scripts/styles through enqueue APIs.
- For custom post types and taxonomies, define rewrite, archive, REST, capability, and editor behavior intentionally.

## Drupal Rules

- Keep custom behavior in modules and presentation in themes.
- Use render arrays, Twig templates, libraries, and preprocess hooks according to Drupal conventions.
- Do not bypass Drupal access control or caching metadata.
- Attach cache tags/contexts/max-age when output depends on content, user, language, or route state.
- Prefer configuration export/import for portable site configuration.

## Headless CMS Rules

- Define typed content contracts and preview behavior.
- Handle draft/published states explicitly.
- Cache with invalidation paths or webhooks.
- Keep SEO metadata and image variants part of the content model.
- Protect write tokens and preview secrets.

## Deliverable Template

```markdown
# CMS Implementation Plan

## Platform
CMS:
Theme/frontend:
Custom code location:
Deployment:

## Content Model
| Type | Fields | Relationships | Editorial Notes |
| --- | --- | --- | --- |

## Templates / Blocks
| Template or Block | Data Source | States | Accessibility |
| --- | --- | --- | --- |

## Custom Behavior
- Plugin/module:
- Hooks/actions/routes:
- Permissions:
- Validation/sanitization:

## Verification
- [ ] Logged-out rendering
- [ ] Editor/admin workflow
- [ ] Mobile layout
- [ ] Keyboard navigation
- [ ] Cache behavior
- [ ] SEO metadata/schema
```

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for CMS website development.
