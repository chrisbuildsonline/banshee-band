# Tasks: Accessibility pass (F16)

Each task is small steps that end in a test gate. Write the check first, see it fail for the right reason, then fix the source. Run `bun run typecheck` and `bun run test` at every gate, and `bun run e2e` at every gate that touches the UI. Requirement numbers refer to `requirements.md`. Add only the one dependency named in task 1. Tests use literal strings for the values the requirements fix. Before task 1 read `.kiro/steering/*.md`, `design/DESIGN.md` (Principles, Contrast table, Focus, Motion), `index.html`, `band.html`, `styleguide.html`, `src/station/station.ts`, `settings-panel.ts`, `onboarding-sheet.ts`, `list.ts`, `src/ghosts/field.ts`, `field.css`, `src/ui/tokens.css`, `e2e/fixtures.ts`, `e2e/onboarding.spec.ts`, `e2e/settings.spec.ts`, `e2e/live.spec.ts`, `playwright.config.ts` and `scripts/hooks/colour-alerts.ts`. Do the tasks in order.

- [x] 1. The audit harness and the first audits
  - [x] 1.1 Add `@axe-core/playwright` to `package.json` as a devDependency with `bun add -d @axe-core/playwright`. Add nothing else.
    - _Requirements: 1.1_
  - [x] 1.2 Create `e2e/a11y.spec.ts` with the `audit(page, exclude?)` helper (tags `wcag2a`, `wcag2aa`, `wcag21aa`; no `disableRules`), the `setTheme` helper (presses the Night or Day button, waits for `html[data-theme]`) and the audits of the station empty, `band.html` and `styleguide.html`, each in Day and Night. Expect an empty list of violations, printed as rule, impact and selectors.
    - _Requirements: 1.2, 1.5_
  - **Gate:** `bunx playwright test e2e/a11y.spec.ts` runs; each failure lists real violations (the harness works); `typecheck` passes.

- [x] 2. The audits of the busy states
  - [x] 2.1 In `e2e/a11y.spec.ts` add the station with events and ghosts after the Knock chip (Latest alert, Recent sounds row, ghost, "Now:" list and the filled pipeline card), the Settings sheet open, and the intro on step 1, step 2 and step 3 with `test.use({ onboarded: false })` in its own `describe`, each in Day and Night. Wait for the dialog opacity to reach `1` before each audit.
    - _Requirements: 1.2, 1.3, 1.4_
  - **Gate:** the new audits run; failures are real violations or a wait that is too short (fix the wait); `typecheck` passes.

- [x] 3. Fix every violation
  - [x] 3.1 Go through the failures of tasks 1 and 2 one rule at a time. Fix each in the smallest existing file that owns it (CSS, token, markup, accessible name, role, focus), keeping the look of `design/DESIGN.md`. Do not disable a rule and do not exclude an element unless it is decorative and `aria-hidden`; name any exclusion and its reason in `e2e/a11y.spec.ts`.
    - _Requirements: 1.5, 1.6_
  - [x] 3.2 When a token colour changes, update its row in the Contrast table of `design/DESIGN.md` in the same change and run `tests/ui`. Check that no state loses the word, glyph or shape that tells it from another.
    - _Requirements: 1.7, 5.2_
  - [x] 3.3 Run `bun run hooks:colour`; it must pass with no change to the hook or its test `tests/scripts/hooks/colour-alerts.test.ts`.
    - _Requirements: 5.1, 5.2_
  - **Gate:** `e2e/a11y.spec.ts` audits all pass in Day and Night; `tests/ui`, `tests/scripts/hooks/colour-alerts.test.ts`, `typecheck`, `test` and `bun run build` pass; `bun run e2e` shows no regression in the other specs.

- [x] 4. Keyboard flow
  - [x] 4.1 In `e2e/a11y.spec.ts` write the Tab-order check (a literal list of `role:name`), the focus-ring check on every stop of the station, and the Settings and intro checks: the focus stays inside the open dialog with Tab and Shift+Tab, Escape closes, the focus is back on the Settings pill.
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 4.2 Add the Start listening checks with the fake-microphone launch arguments (Enter, then Stop, then Space; the Listen pill reads "Listening") and the Settings checks (Space flips a switch's `aria-checked`; ArrowRight and ArrowLeft move the slider and its value text follows).
    - _Requirements: 2.4, 2.5_
  - [x] 4.3 Fix what fails in the existing files (a missing ring, a skipped control, a focus that escapes or is lost). Do not change a check to fit the code unless the check is wrong.
    - _Requirements: 2.1-2.5_
  - **Gate:** the keyboard checks of `e2e/a11y.spec.ts` pass; `typecheck`, `test` and `bun run e2e` pass.

- [ ] 5. Reduced motion and announcements
  - [ ] 5.1 In `e2e/a11y.spec.ts` write the reduced-motion check: `emulateMedia({ reducedMotion: 'reduce' })`, a Knock chip so a ghost is on screen, then the computed `animation-name`, `animation-duration` and `transition-duration` of the ghost field, the header pill, the Listen pill, the open Settings sheet and the open intro (with its visible step). Fix any motion that is left in the existing CSS, keeping the state the motion showed as a static change.
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 5.2 Write the announcement checks: the Latest alert live region exists and is `polite`; after the Knock chip with the side Left its text holds the class, side and urgency words (read from the Recent sounds row of the same event); no `aria-live="assertive"` and no `role="alert"` on the station or `band.html`; every live region found has text or a name once in use.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - **Gate:** the reduced-motion and announcement checks of `e2e/a11y.spec.ts` pass; `bun run hooks:colour`, `typecheck`, `test` and `bun run e2e` pass.

- [ ] 6. README and final gate
  - [ ] 6.1 Add the Accessibility section to `README.md` as Requirement 6 says: what runs automatically and how to run it, and the honest limits (axe finds only part of WCAG; no screen-reader or Deaf and hard-of-hearing user testing yet; the canvas ghosts rely on the DOM text equivalent). No claim of conformance or certification. Add the README requirement (spec#6 of this spec) to `scripts/hooks/spec-gaps.json` with its reason (a documentation requirement, no test), and update the count of known gaps in the README's Kiro hooks table.
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ] 6.2 Check the diff: only `package.json`, the lock file, `e2e/a11y.spec.ts`, the fixes of task 3 to 5, the Contrast table if a token changed, `README.md` and `scripts/hooks/spec-gaps.json` changed; `scripts/hooks/colour-alerts.ts` and its test unchanged; no rule disabled and no exclusion without a named reason; `.kiro/steering/structure.md` untouched.
    - _Requirements: 1.5, 5.1, 6.3_
  - [ ] 6.3 Run `bun run typecheck`, `bun run test`, `bun run build`, `bun run e2e` and `bun run hooks:colour` and `bun run hooks:spec-tests`. All must be green. Write the commit summary: the violations found and fixed, any token change, and the choices of `design.md` that need a yes or no.
    - _Requirements: 1.2, 5.1_
  - **Gate:** all six commands exit 0 and the diff matches 6.2; `bun run hooks:spec-tests` passes for the accessibility spec.
