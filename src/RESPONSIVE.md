# Responsive design – Gorythm

This project uses a **desktop-first** responsive approach. Layout and positioning of content are preserved across breakpoints; only the *source* of breakpoint values is centralized for maintainability.

---

## Strategy

- **Desktop-first:** Base styles target desktop/large viewports. Smaller viewports are handled with `max-width` media queries that override as needed.
- **Single source of truth:** All breakpoint values live in `styles/_breakpoints.scss` (SCSS variables). No raw pixel values in `@media` in global or section SCSS.
- **Layout tokens:** Default layout tokens (`:root`, container padding, grid gap, etc.) are set in `styles/_variables.scss`. Viewport-specific overrides live in **one place:** `styles/_responsive.scss`.
- **Full-bleed sections:** Sections that break out of default horizontal padding (e.g. Hero, Portfolio) should use `var(--container-padding-horizontal)` (or the same variable) for negative margins/width so one value controls default spacing.

---

## Breakpoint variables

Defined in **`src/styles/_breakpoints.scss`**.

### Global (Header, Footer, `_responsive.scss`, `respond-to` mixin)

| Variable       | Value   | Use |
|----------------|---------|-----|
| `$bp-xxl`      | 1679px  | X-Large desktop |
| `$bp-xl`       | 1439px  | Desktop |
| `$bp-lg`       | 1279px  | Small laptop |
| `$bp-md`       | 1023px  | Tablet portrait |
| `$bp-sm`       | 767px   | Mobile landscape |
| `$bp-xs`       | 479px   | Mobile portrait |
| `$bp-xxxl-min` | 1680px  | Min-width for “xxxl” |

### Section breakpoints (HomeSections, Footer)

| Variable            | Value   | Use |
|---------------------|---------|-----|
| `$bp-section-xxl`   | 1920px  | Ultra-wide |
| `$bp-section-xl`    | 1440px  | Wide desktop |
| `$bp-section-lg`    | 1280px  | Laptop |
| `$bp-section-phone-max` | 743px | Same cutoff for md + sm (phones only; iPad Mini 744+ = desktop) |
| `$bp-section-md`    | = phone-max | Stacked section layout at max-width |
| `$bp-section-sm`    | = phone-max | Narrow-screen tweaks (must match md for iPad) |
| `$bp-section-xs`    | 480px   | Small mobile |
| `$bp-section-xxs`   | 375px   | Extra small |

### HeroSection-specific (layout-preserving)

| Variable        | Value   |
|-----------------|---------|
| `$bp-hero-1200` | 1200px  |
| `$bp-hero-1400` | 1400px  |
| `$bp-hero-1600` | 1600px  |
| `$bp-hero-2000` | 2000px  |

---

## File roles

| File | Role |
|------|------|
| `styles/_breakpoints.scss` | **Single source of truth** for all breakpoint values (SCSS variables). |
| `styles/_variables.scss` | CSS custom properties (`:root`), layout tokens; imports `_breakpoints.scss`. |
| `styles/_mixins.scss` | `respond-to($breakpoint)` uses global `$bp-*`; desktop-first comment. |
| `styles/_responsive.scss` | **Single global responsive file:** `:root` and layout overrides per viewport; uses `$bp-xxl` … `$bp-xs`. |
| `components/**/*.scss` | Section/component styles import `breakpoints` and use `$bp-section-*` (and Hero vars where needed). |

---

## Using breakpoints in section SCSS

1. At the top of the file:  
   `@import '../../styles/breakpoints';`
2. In media queries, use variables instead of numbers:  
   `@media (max-width: $bp-section-sm) { ... }`  
   `@media (min-width: $bp-section-xl) { ... }`
3. For “desktop section layout” use:  
   `@media (min-width: $bp-section-md + 1) { ... }`  
   (i.e. width ≥ 744px, including iPads.)

---

## Preserving layout

When changing responsive code:

- Do **not** change breakpoint *values* in `_breakpoints.scss` unless you intend a layout/behavior change.
- Do **not** add or remove media queries in a way that changes at which width a rule applies.
- `$bp-section-md` and `$bp-section-sm` must stay equal (`$bp-section-phone-max`) so iPad Mini portrait gets desktop layout.
