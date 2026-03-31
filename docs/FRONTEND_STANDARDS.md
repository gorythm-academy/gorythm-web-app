# Frontend Standards

This document defines project-wide frontend standards for responsive behavior, SCSS structure, and code quality.

## Responsive Contract

- Never hardcode media-query pixel values in component SCSS.
- Use breakpoint tokens from `src/styles/_breakpoints.scss`.
- Prefer `respond-to()` mixins from `src/styles/_mixins.scss` where available.
- Keep orientation-specific rules only for sections that truly need them.
- Validate each UI change on these baseline viewports:
  - `360x800` (mobile portrait)
  - `390x844` (mobile portrait)
  - `768x1024` (tablet portrait)
  - `1024x768` (tablet landscape)
  - `1280x800` (desktop)
  - `1440x900` (desktop)

## SCSS Architecture Rules

- One SCSS file should own one primary responsibility.
- For large feature styles, split into partials:
  - base/layout
  - responsive/orientation
  - modal/overlay/state-specific blocks
- Keep nesting shallow and readable:
  - target max nesting depth: 4
  - avoid deep selector chains and specificity escalations
- Avoid `!important`; solve conflicts with structure/specificity order.

## Naming and Scope

- Prefer component-scoped class names to avoid cross-feature collisions.
- Keep global utility selectors minimal and intentional.
- Do not leave dead selectors in shared files.

## Lint and Quality Gates

Run these before commit:

- `npm run lint:js`
- `npm run lint:styles`
- `npm run lint`

These scripts should stay green before merge.

## Refactor Safety Workflow

When refactoring styles:

1. Keep behavior unchanged first.
2. Extract blocks to partials.
3. Re-run lint.
4. Re-check baseline viewport matrix.

This keeps visual regressions low while improving maintainability.
