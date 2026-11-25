# Tasks: Project scaffold and design system

Run `bun run typecheck` and `bun run test` after each task that changes code. Run `bun run e2e` after tasks 7 and 8. Requirement numbers refer to `requirements.md`.

- [x] 1. Scaffold the project
  - Create `package.json` with scripts `dev`, `build`, `test`, `e2e`, `typecheck` as given in design.md.
  - Run `bun add -d vite typescript vitest fast-check @playwright/test @types/node`, and `bunx playwright install chromium`.
  - Create `tsconfig.json` (strict), `vite.config.ts` (inputs: `index.html`, `styleguide.html`), `vitest.config.ts`, `playwright.config.ts` (Chromium, `webServer: bun run dev`, 5173).
  - Create the folders from `structure.md` with `.gitkeep` where empty, `index.html`, `src/main.ts` (placeholder), `e2e/screenshots/.gitkeep`.
  - Add `e2e/screenshots/*.png`, `test-results/` and `playwright-report/` to `.gitignore`.
  - Verify: `bun run typecheck`, `bun run build`, `bun run test` (a placeholder passing test is allowed until task 5).
  - _Requirements: 1.1-1.10, 7.9, 7.10_

- [x] 2. Write the token parsers and contrast helper, test first
  - [x] 2.1 Create `tests/ui/contrast.ts` with pure functions: `parseHex`, `relativeLuminance`, `contrastRatio`.
    - _Requirements: 6.7_
  - [x] 2.2 Write `tests/ui/contrast.test.ts` with fast-check properties: symmetry, range [1, 21], `contrast(a, a) === 1`, plus known values (black on white = 21).
    - _Requirements: 6.7_
  - [x] 2.3 Create `tests/ui/design-parse.ts` with `parseTokenTable(markdown)` and `parseCssTokens(css)` (separate results for Day, Night attribute block, Night media block, reduced-motion block).
    - _Requirements: 6.1, 6.5_
  - [x] 2.4 Write `tests/ui/design-parse.test.ts` using small inline strings: valid table, missing table, row with wrong column count, `same` Night cell, empty table.
    - _Requirements: 6.1, 6.4, 6.5_

- [x] 3. Write `design/DESIGN.md`
  - Follow the ten-section structure in design.md. Section 10 is the `## Token reference` table.
  - Choose the single accent and neutral values. Compute the contrast table with the helper from task 2 (a short throwaway script is fine). Adjust values until every pair passes in Day and Night.
  - Set `--bb-radius-card` to 16-20px, the near-black pill, the Night pill outline, and the six status pills with labels and glyphs.
  - Specify all ten screen layouts (five screens, desktop and phone), each with regions, order, primary action, text equivalent and tab order.
  - Define ghost glow levels paired with size and outline weight, and the reduced-motion replacements.
  - State the "aid, not a safety device" wording to reuse in the UI.
  - _Requirements: 2.1-2.13, 4.1_

- [x] 4. Implement `src/ui/tokens.css`
  - Define every token from the table on `:root`.
  - Add the Night block under `@media (prefers-color-scheme: dark) { :root:not([data-theme="day"]) { ... } }` and `:root[data-theme="night"]`, with identical declarations. The media-query block stays although no page relies on it (every page ships `data-theme="night"`), so the parse test of both Night blocks still holds.
  - Add the `prefers-reduced-motion: reduce` block that zeroes the motion tokens.
  - No remote `@import` or `url()`.
  - _Requirements: 3.1-3.8_

- [x] 5. Write `tests/ui/tokens.test.ts`
  - Implement checks 1-9 from the design.md testing table, using the helpers from task 2.
  - Fail messages list missing and extra token names.
  - Prove the test can fail: temporarily remove one token from `tokens.css` and confirm the test names it, then restore it. Do the same for an extra token and for a contrast pair set below threshold.
  - _Requirements: 6.1-6.8, 3.5, 3.6, 3.7, 4.1_

- [x] 6. Build the styleguide page
  - [x] 6.1 Create `styleguide.html` with `<main>`, one `<h1>`, sections for type scale, pill buttons, status pills, cards and an event list row, plus the "aid, not a safety device" sentence. No remote resources.
    - _Requirements: 5.1-5.6, 5.8-5.10_
  - [x] 6.2 Create `src/ui/styleguide.css` using only `var(--bb-*)` values: pills, status pills, cards, event row, focus ring, 44px targets, responsive layout for 390px with no horizontal scroll.
    - _Requirements: 4.2, 4.3, 4.8, 5.3-5.6_
  - [x] 6.3 Create `src/ui/styleguide.ts` with the theme control: sets `data-theme`, keyboard operable, plain-language label, `aria-pressed` state. Without JavaScript the page stays readable in the theme shipped in the HTML.
    - _Requirements: 5.7, 5.11, 4.7_
  - [x] 6.5 Night by default (feature F21): add `data-theme="night"` to `<html>` in `index.html`, `band.html`, `styleguide.html` and `capture-harness.html`. Make the theme control in `src/ui/theme.ts` read and save `banshee-band.theme.v1` (a saved `day` or `night` wins on load; blocked storage or another value keeps Night; a failed save keeps the choice for the page only). Write `tests/ui/theme.test.ts` first (saved value wins, bad value ignored, throwing storage) and `e2e/theme.spec.ts` (each page opens in Night with a light OS setting and with JavaScript off; Day persists across a reload and to another page; blocked storage keeps the choice for the page only). Leave the `prefers-color-scheme` block of `tokens.css` as it is.
    - _Requirements: 3.3, 3.4, 5.7, 5.7a, 5.7b, 5.11_
  - [x] 6.4 Check that no hard-coded colour or size literals appear in `styleguide.css` outside `var()` (a grep check is enough, spacing values in `px` for borders and outlines excepted).
    - _Requirements: 2.13, 3.1_

- [x] 7. Write `e2e/styleguide.spec.ts`
  - Viewports 1440x900 and 390x844, themes day and night.
  - Collect console error and warning, page errors and off-origin requests, and fail on any.
  - Assert no horizontal scroll, and save screenshots as `e2e/screenshots/styleguide-<width>-<theme>.png` plus `styleguide-<width>.png` for day.
  - Add the keyboard focus test, the theme control by keyboard, the reduced-motion no-animation test and the structure test.
  - Run `bun run e2e`, then open the four screenshots and check them by eye for overlap, clipped text and unreadable contrast.
  - _Requirements: 7.1-7.9, 4.3, 4.4, 4.7, 5.1_

- [x] 8. Fix findings and final checks
  - Fix any problem found in the screenshots, keyboard test or contrast table. Keep DESIGN.md and `tokens.css` in step.
  - Update `README.md` with a short "Development" section listing the five scripts and the styleguide URL.
  - Run `bun run typecheck`, `bun run test`, `bun run build`, `bun run e2e` and confirm all pass.
  - _Requirements: 1.1-1.6, 2.13, 4.1_

## Done when

- All five scripts run and pass with bun.
- `design/DESIGN.md` covers all ten screen layouts and a passing contrast table.
- `tokens.css` and DESIGN.md match, proven by the unit test.
- `/styleguide.html` renders at 1440px and 390px in both themes with no console errors, and the screenshots are saved.
