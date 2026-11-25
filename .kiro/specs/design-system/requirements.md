# Requirements: Project scaffold and design system

## Introduction

This is the first feature of Banshee Band. It creates the Vite + TypeScript project, the bun scripts, the test tooling, and the design system. `design/DESIGN.md` is the single source of truth for the UI. `src/ui/tokens.css` implements it as CSS custom properties. A styleguide page at `/styleguide.html` shows the building blocks.

Later features (audio, classification, bearing, haptics, band, ghosts, screens) build on this feature. This feature does not implement any of them. It only defines how every screen will look and lays out the screens in DESIGN.md.

Terms:

- **Scaffold**: the project configuration, scripts, folders and test tooling.
- **DESIGN.md**: `design/DESIGN.md`.
- **Tokens file**: `src/ui/tokens.css`.
- **Token**: a CSS custom property named in DESIGN.md. All tokens use the `--bb-` prefix.
- **Day theme**: the light theme, one press away from the default.
- **Night theme**: the dark Halloween variant and the default theme of every page, applied with `data-theme="night"` on the root element.
- **Styleguide**: the page served at `/styleguide.html`.
- **Pill**: a fully rounded button or label.

## Requirements

### Requirement 1: Project scaffold

**User story:** As a developer, I want a working Vite + TypeScript project with standard scripts, so that every later feature builds, tests and type-checks the same way.

#### Acceptance criteria

1. THE Scaffold SHALL provide a `package.json` with the scripts `dev`, `build`, `test`, `e2e` and `typecheck`.
2. WHEN `bun run dev` is run, THE Scaffold SHALL start the Vite dev server.
3. WHEN `bun run build` is run, THE Scaffold SHALL produce a static build that includes both `index.html` and `styleguide.html`.
4. WHEN `bun run test` is run, THE Scaffold SHALL run Vitest once and exit (no watch mode).
5. WHEN `bun run e2e` is run, THE Scaffold SHALL run Playwright against the app served on localhost.
6. WHEN `bun run typecheck` is run, THE Scaffold SHALL run `tsc --noEmit` with `strict` enabled.
7. THE Scaffold SHALL use bun as the package manager and script runner and SHALL commit `bun.lock`.
8. THE Scaffold SHALL create the folders from the structure steering file (`src/audio`, `src/classify`, `src/bearing`, `src/haptics`, `src/band`, `src/ghosts`, `src/ui`, `mcp`, `firmware`, `tests`, `e2e`, `public/clips`, `design`), each with a `.gitkeep` unless it already has content.
9. THE Scaffold SHALL NOT add runtime network dependencies, analytics, third-party scripts, web fonts loaded from a remote host, or API keys.
10. THE Scaffold SHALL keep `mcp/` free of imports from `src/`.

### Requirement 2: DESIGN.md as source of truth

**User story:** As a designer or developer, I want one document that defines the look and layout of the whole UI, so that code and design never drift apart.

#### Acceptance criteria

1. THE DESIGN.md SHALL define each of these, with a concrete value for both Day and Night themes: canvas colour, surface colour, text colours, border colour, accent colour, focus ring colour, soft shadow, corner radius, spacing scale, and type scale.
2. THE DESIGN.md SHALL define exactly one accent colour. Other colours SHALL be neutrals or tints and shades of that accent.
3. THE DESIGN.md SHALL set the card and surface radius between 16px and 20px inclusive.
4. THE DESIGN.md SHALL define the type scale with a name, size, line height and weight for each step, and SHALL use a system font stack.
5. THE DESIGN.md SHALL define one near-black pill style for the single primary action, and SHALL state that each screen has at most one primary action.
6. THE DESIGN.md SHALL define short tinted status pills for at least these states: listening, paused, band connected, band not connected, fallback active, and error. Each state SHALL have a distinct label and glyph so that colour is never the only cue.
7. THE DESIGN.md SHALL list every token in a "Token reference" table. Each row SHALL give the token name, the Day value, the Night value and the purpose.
8. THE DESIGN.md SHALL define the layout of each of these screens at desktop (1440px wide) and phone (390px wide): listening station, pipeline view, settings, onboarding, band simulator.
9. THE DESIGN.md layout of each screen SHALL describe the regions, their order, which region holds the primary action, the DOM text equivalent for any canvas content, and the tab order.
10. THE DESIGN.md SHALL define the ghost visual tokens and how glow levels pair with size and outline weight, without adding meanings beyond shape = class, position = bearing, glow = urgency.
11. THE DESIGN.md SHALL define reduced-motion behaviour: which animations stop and which static changes replace them.
12. THE DESIGN.md SHALL record a contrast table with the measured ratio for each text and UI component pair, for both themes.
13. WHEN a value in DESIGN.md changes, THE change SHALL also update the Tokens file in the same commit.

### Requirement 3: Tokens file

**User story:** As a UI developer, I want the design values available as CSS custom properties, so that no code needs hard-coded colours or sizes.

#### Acceptance criteria

1. THE Tokens file SHALL define every token named in the DESIGN.md Token reference table, on `:root` for the Day theme.
2. THE Tokens file SHALL override the Night values under `[data-theme="night"]`.
3. THE Tokens file SHALL keep its `@media (prefers-color-scheme: dark)` block with the Night values, with declarations identical to the `[data-theme="night"]` block. No page relies on it, because every HTML page ships `data-theme="night"` on `<html>`; the block stays so the parse test of both Night blocks still holds.
4. WHEN a page has `data-theme` set to `day` or `night`, THE explicit value SHALL win over `prefers-color-scheme`. The OS setting SHALL NOT pick the default theme of any page.
5. THE Tokens file SHALL define motion tokens, and WHILE `prefers-reduced-motion: reduce` is active, THE motion tokens SHALL resolve to zero duration and no animation.
6. THE Tokens file SHALL NOT contain `@import` or `url()` references to remote hosts.
7. THE Tokens file SHALL NOT define any token that DESIGN.md does not name.
8. THE Tokens file SHALL define the card radius token between 16px and 20px.

### Requirement 4: Contrast and accessibility of the system

**User story:** As a Deaf or hard-of-hearing user, I want every element to be readable and distinguishable without relying on colour, so that I can trust what I see.

#### Acceptance criteria

1. THE design system SHALL meet a contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text, UI component boundaries, focus rings and ghost fills, against their actual backgrounds, in both Day and Night themes.
2. WHEN a status pill is shown, THE pill SHALL include a text label and a glyph in addition to its tint.
3. THE focus ring SHALL be visible on every interactive element in both themes, with at least 3:1 contrast against the adjacent background.
4. WHILE `prefers-reduced-motion: reduce` is active, THE Styleguide SHALL show no animation, drift, flicker or pulsing.
5. THE design system SHALL NOT use any element that flashes more than 3 times per second.
6. THE design system SHALL NOT depend on sound.
7. THE Styleguide SHALL be fully operable by keyboard, with a logical tab order and visible focus.
8. THE interactive targets in the Styleguide SHALL be at least 44px by 44px.

### Requirement 5: Styleguide page

**User story:** As a developer, I want a page that shows every building block in both themes, so that I can check the design system by eye and by test.

#### Acceptance criteria

1. WHEN `/styleguide.html` is opened, THE Styleguide SHALL render without console errors, warnings or failed network requests.
2. THE Styleguide SHALL show the full type scale, with each step labelled by its token name.
3. THE Styleguide SHALL show pill buttons: the near-black primary pill, a secondary pill, and a disabled pill, each with its focus state reachable by keyboard.
4. THE Styleguide SHALL show every status pill state from Requirement 2.6.
5. THE Styleguide SHALL show cards with the surface colour, radius and soft shadow.
6. THE Styleguide SHALL show an event list row with class label, side, urgency text, time and a ghost glyph, styled only with tokens.
7. THE Styleguide SHALL provide a theme control that switches between Day and Night by setting `data-theme`, operable by keyboard and labelled in plain language.
7a. THE `index.html`, `band.html`, `styleguide.html` and `capture-harness.html` pages SHALL each ship `data-theme="night"` on `<html>`, so Night is the default on every page, without JavaScript too and whatever `prefers-color-scheme` says. Day SHALL be one press of the theme control away.
7b. WHEN the user presses Day or Night, THE theme control SHALL save the choice in `localStorage` under `banshee-band.theme.v1`. WHEN a page loads with a saved choice, THE saved choice SHALL win over the shipped default, on every page and every later visit. IF storage is blocked or holds a value other than `day` or `night`, THEN THE page SHALL keep the shipped Night default, and a choice made on the page SHALL hold for that page only.
8. THE Styleguide SHALL load no scripts or styles from a remote host.
9. THE Styleguide SHALL use a `<main>` landmark, one `<h1>`, and a logical heading order.
10. THE Styleguide SHALL include the sentence that Banshee Band is an aid and not a safety device.
11. IF JavaScript fails to load, THEN THE Styleguide SHALL still show all static content, in the Night theme from `data-theme="night"` in the HTML.

### Requirement 6: Token coverage unit test

**User story:** As a developer, I want a test that fails when DESIGN.md and the Tokens file disagree, so that the source of truth stays true.

#### Acceptance criteria

1. WHEN `bun run test` is run, THE unit test at `tests/ui/tokens.test.ts` SHALL parse DESIGN.md and extract every token name from the Token reference table.
2. IF a token named in DESIGN.md is missing from the Tokens file, THEN THE test SHALL fail and SHALL list the missing names.
3. IF the Tokens file defines a token that DESIGN.md does not name, THEN THE test SHALL fail and SHALL list the extra names.
4. IF a token has no Night value in DESIGN.md and is not marked as theme-independent, THEN THE test SHALL fail.
5. IF the Token reference table yields zero tokens, THEN THE test SHALL fail instead of passing vacuously.
6. THE test SHALL check that the card radius is between 16px and 20px and that exactly one accent token family exists.
7. THE test SHALL compute the contrast ratios for the pairs listed in the DESIGN.md contrast table, from the Tokens file values, and SHALL fail when any pair is below its threshold or when the stated ratio differs from the computed ratio by more than 0.1.
8. THE test SHALL run without a browser.

### Requirement 7: Styleguide end-to-end tests

**User story:** As a developer, I want automated checks of the rendered styleguide at desktop and phone sizes, so that layout and console regressions are caught.

#### Acceptance criteria

1. WHEN `bun run e2e` is run, THE Playwright test SHALL open `/styleguide.html` at a 1440px wide viewport and at a 390px wide viewport.
2. FOR EACH viewport, THE test SHALL fail if any console message of type `error` or `warning` is logged, or any page error occurs.
3. FOR EACH viewport, THE test SHALL save a full-page screenshot to `e2e/screenshots/` with the file names `styleguide-1440.png` and `styleguide-390.png`.
4. FOR EACH viewport, THE test SHALL fail if the page has horizontal scrolling (document scroll width larger than viewport width).
5. THE test SHALL render both Day and Night themes at both viewports and save the screenshots with `-day` and `-night` suffixes in the file name.
6. THE test SHALL fail if any request goes to a host other than the local server.
7. THE test SHALL tab through the Styleguide and check that every interactive element receives a visible focus ring, and that the theme control works by keyboard.
8. THE test SHALL run with `prefers-reduced-motion: reduce` and check that no element has a running animation.
9. THE Playwright configuration SHALL start the Vite dev server itself, so `bun run e2e` needs no manual step.
10. THE `e2e/screenshots/` folder SHALL be listed in `.gitignore`, with the folder kept through a `.gitkeep`.

## Out of scope

- Audio capture, YAMNet, bearing, haptics, band drivers, ghost rendering and the real screens. They use these tokens later.
- Hosting and deployment configuration.
- Any change to files outside this feature's tasks (steering files stay as they are).

## Assumptions to confirm

- The accent colour value is chosen in DESIGN.md during implementation. It must pass the contrast checks in both themes.
- In the Night theme the primary pill stays near-black and gains a light outline (3:1 against the canvas), so it keeps its identity on a dark canvas.
- Status pills are told apart by label and glyph, with tints made only from the single accent and neutrals.
- The contrast unit test (6.7) goes beyond the two tests you named. It is the only way to prove the AA claim, so I included it.
