# Requirements: Accessibility pass (F16)

## Introduction

The users are Deaf and hard-of-hearing, so accessibility is the product (`.kiro/steering/accessibility.md`). Every screen already exists and each feature spec checked its own screen by hand or by a narrow e2e check. Nothing yet runs one automated audit over all of them, in both themes, or checks the keyboard, reduced-motion and announcement rules in one place. This feature is a verification pass, not a new feature: it adds an axe audit and a small set of Playwright checks, fixes every real problem they find inside the existing files, and states the limits in the README.

The pass covers these screens and states, each in Day and Night:

- the station, empty (`index.html`);
- the station with events and ghosts, after a Try a sound chip, with the pipeline card filled;
- the Settings sheet, open;
- the first-run intro, on each of its three steps;
- `band.html`;
- `styleguide.html`.

Decisions already made by the owner (listed again in `design.md`): one spec file `e2e/a11y.spec.ts` on the shared fixture `e2e/fixtures.ts`; Night is chosen by pressing the page's own Night button; fixes stay inside existing files and design tokens, and `design/DESIGN.md`'s Contrast table follows any token colour change; `.kiro/steering/structure.md` is updated in a later separate step.

Terms:

- **Audit**: one axe run with the tags `wcag2a`, `wcag2aa` and `wcag21aa` on a screen in a state and a theme.
- **Violation**: an item in the `violations` list of an axe result. `incomplete` (needs review) items are not violations and are not counted.
- **Exclusion**: an element left out of an audit with `AxeBuilder.exclude`. Allowed only for a decorative element that has `aria-hidden="true"`, named with its reason in `e2e/a11y.spec.ts`.
- **Live region**: an element with `aria-live`, or with `role="status"` or `role="alert"`.
- **Focus ring**: a computed `outline-style` other than `none` with a non-zero `outline-width`, or a computed `box-shadow` other than `none`, on the focused element.

## Requirements

### Requirement 1: Automated audit (axe) on every screen and theme

**User story:** As a user who relies on assistive technology, I want every screen checked by a machine in both themes, so a contrast, name or role mistake never ships.

#### Acceptance criteria

1. `@axe-core/playwright` SHALL be added to `package.json` as a devDependency. No other dependency SHALL be added.
2. `e2e/a11y.spec.ts` SHALL run an audit on each screen and state of the Introduction, in the Day theme and in the Night theme, and SHALL expect zero violations. The failure message SHALL list each violation's rule id, impact and target selectors.
3. THE intro SHALL be audited on each of its three steps (welcome, microphone, output), using `test.use({ onboarded: false })` from `e2e/fixtures.ts`. All other audits use the fixture's default (intro already seen).
4. THE station-with-events audit SHALL run after a Try a sound chip has added a Latest alert, a Recent sounds row, a ghost with its "Now:" list item and the filled pipeline card.
5. NO rule SHALL be disabled globally (no `disableRules`). An exclusion SHALL be allowed only for a decorative element that has `aria-hidden="true"`, and each one SHALL be named in `e2e/a11y.spec.ts` with its reason in a comment. The canvas ghost field is NOT decorative (it has `role="img"` and a label) and SHALL NOT be excluded.
6. EVERY violation the audit finds SHALL be fixed in the source (colour contrast, accessible names, roles, focus, landmarks), inside existing files, keeping the look of `design/DESIGN.md`. A fix SHALL NOT be a weaker audit.
7. WHEN a token colour changes for contrast, THE Contrast table of `design/DESIGN.md` SHALL be updated in the same change, and `tests/ui` SHALL still pass.

### Requirement 2: Keyboard flow

**User story:** As a user who does not use a pointer, I want to reach and operate everything on the station with the keyboard and always see where I am.

#### Acceptance criteria

1. WHEN Tab is pressed from the top of the station, THE focus SHALL reach every control of the page (the theme buttons, Settings, Start listening, the sound chips, the side control, the Try a sound controls and the footer link where there is one), in the visual reading order, and SHALL reach no hidden or disabled element. The check SHALL compare the sequence of accessible names with a literal list.
2. EVERY focused control on the station, in the Settings sheet and in the intro SHALL show a Focus ring.
3. THE Settings sheet and the intro SHALL trap the focus: Tab and Shift+Tab from the last and first control stay inside the dialog. Escape SHALL close each of them, and the focus SHALL return to the control that opened it (the Settings pill for Settings; the Settings pill for the intro opened with Show intro again).
4. Start listening SHALL be reachable by Tab and SHALL start listening with Enter and with Space (a fake microphone, as `e2e/live.spec.ts`), shown by the Listen status pill reading "Listening".
5. IN the Settings sheet, Space SHALL toggle a per-class switch (its `aria-checked` flips), and the arrow keys SHALL move the loudness slider so that its value text follows (the displayed dB figure and `aria-valuenow` or the input value change together).

### Requirement 3: Reduced motion

**User story:** As a user who is sensitive to motion, I want nothing to drift, pulse or slide when I ask for reduced motion.

#### Acceptance criteria

1. WITH `page.emulateMedia({ reducedMotion: 'reduce' })`, THE ghost field, the status pills (the header pill and the Listen pill) and the open Settings sheet and intro SHALL each have, in computed style, an `animation-name` of `none` or an `animation-duration` of `0s`, and a `transition-duration` of `0s` (every comma-separated part).
2. THE check SHALL run on the station with a ghost on screen, so the ghost field is measured while it holds a ghost.
3. WHEN a check finds motion that is not off, THE fix SHALL turn the motion off or to a static change in the existing CSS (`src/ghosts/field.css`, `src/station/*.css`, `src/ui/tokens.css`), under the `prefers-reduced-motion: reduce` rule or the motion token, and SHALL NOT remove the state the motion showed (size, outline and text stay).

### Requirement 4: Announcements

**User story:** As a screen-reader user, I want each new sound announced once, in plain words, without being interrupted by routine changes.

#### Acceptance criteria

1. THE station SHALL have a live region for new events: the Latest alert in `src/station/list.ts` (`aria-live="polite"`). THE check SHALL assert that it exists before an event and that its `aria-live` value is `polite`.
2. WHEN a Try a sound chip adds an event, THE text of that live region SHALL contain the class, the side and the urgency of the event, in words (for Knock from the left: the word Knock, the word left and the urgency word shown by the Latest alert).
3. NO live region on the station SHALL be `assertive`, and none SHALL use `role="alert"`, because the code has no case that needs to interrupt. IF a later change adds one, THE check SHALL fail and the owner decides. The ghost field SHALL stay without a live region (its text equivalent is the "Now:" list, which is not announced a second time); this is already checked by `e2e/ghosts.spec.ts` and SHALL NOT be changed.
4. THE check SHALL list every live region on the station and `band.html` and assert each has a non-empty accessible purpose (the Listen status pill, the header status pill, the Try a sound message, the Latest alert, the band simulator live line, the Wristband status line), so a live region is never an unlabelled duplicate.

### Requirement 5: No colour-only alerts

**User story:** As a user who cannot tell two colours apart, I want every state to differ in more than colour.

#### Acceptance criteria

1. `bun run hooks:colour` SHALL keep passing. THE hook (`scripts/hooks/colour-alerts.ts`) and its test SHALL NOT be changed by this feature.
2. WHEN a fix of Requirement 1 changes a colour or a state's markup, THE words, glyph shapes and ghost shapes that tell the states apart SHALL stay, and `bun run hooks:colour` SHALL still pass.

### Requirement 6: README accessibility section

**User story:** As a reader of the repo, I want to know what is checked automatically and what is not, without overstated claims.

#### Acceptance criteria

1. `README.md` SHALL get a short "Accessibility" section that says what runs automatically (the axe audit with `wcag2a`, `wcag2aa` and `wcag21aa` on the screens and states of the Introduction in Day and Night, the keyboard checks, the reduced-motion checks, the announcement checks and `bun run hooks:colour`) and the command to run it (`bun run e2e`, or `bunx playwright test e2e/a11y.spec.ts`).
2. THE section SHALL state the honest limits: axe finds only part of the WCAG problems; there has been no screen-reader user testing yet and no testing with Deaf or hard-of-hearing users; the canvas ghosts rely on their DOM text equivalent (the "Now:" list and the canvas label), so the canvas itself is not audited by axe beyond its name.
3. THE section SHALL NOT claim WCAG conformance, a certification or that the app is a safety device (`.kiro/steering/product.md`).

## Out of scope

- A new feature, a new screen, new copy beyond an accessible name or a fix of a contrast pair.
- Changing the hook scripts, the Contrast table rows that already pass, or the haptic patterns.
- Screen-reader testing, user testing, WCAG 2.2 and AAA rules, and `best-practice` axe rules.
- Auditing the offline service worker page states and `capture-harness.html` (a developer harness).
- `.kiro/steering/structure.md` (updated in a separate later step).
