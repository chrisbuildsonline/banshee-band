# Design: Accessibility pass (F16)

Requirement numbers refer to `requirements.md`.

## Overview

One new Playwright spec audits every screen, drives the keyboard, checks reduced motion and checks the announcements. Whatever it finds is fixed in the existing source. There is no new module and no new runtime code.

```
e2e/a11y.spec.ts   (fixture: e2e/fixtures.ts, dev server on 5287)
  audit(page)        AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()  -> expect(violations).toEqual([])
  screens x themes   station empty | station with events | Settings open | intro 1, 2, 3 | band.html | styleguide.html   x   Day, Night
  keyboard           Tab order, focus ring, dialog trap, Escape and focus return, Enter and Space, switch and slider
  reduced motion     emulateMedia({ reducedMotion: 'reduce' }) -> computed animation and transition on ghost field, pills, sheets
  announcements      live region list, polite, no assertive, a new event's words in the Latest alert

findings --> fixes in existing CSS, tokens and markup --> design/DESIGN.md Contrast table (only when a token colour changes)
```

## Files

```
package.json                  + devDependency @axe-core/playwright (edit)
e2e/a11y.spec.ts              the audit, keyboard, reduced-motion and announcement checks (new)
src/**, index.html, band.html, styleguide.html, *.css   fixes for real violations only (edit, as found)
src/ui/tokens.css             a token colour, only if a contrast violation needs it (edit, as found)
design/DESIGN.md              Contrast table row, only if a token colour changes (edit, as found)
README.md                     Accessibility section (edit)
scripts/hooks/spec-gaps.json  the README requirement (a documentation requirement with no test) as a known gap (edit)
```

The files marked "as found" are not known in advance. A fix touches the smallest existing file that owns the problem.

## The spec file (`e2e/a11y.spec.ts`)

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];
const THEMES = ['day', 'night'] as const;

async function audit(page: Page, exclude: string[] = []): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}
```

- Each audit is `expect(await audit(page)).toEqual([])`, so a failure prints the rule, impact and selectors.
- A `setTheme(page, theme)` helper presses the page's Night or Day button (below), then waits for `html[data-theme]` to equal the theme, so axe sees the final colours and not a half-applied state.
- A `describe` per screen, a test per theme, so a failure names the screen and the theme.
- Exclusions: none are planned. The helper accepts a list so a real decorative `aria-hidden` element can be named with its reason in a comment next to the call. The canvas is not excluded.
- Dialogs: axe runs while the dialog is open (`showModal`), so it audits the dialog content and the inert page behind it.
- Animations: before each audit the test waits for the sheet's open transition to end (the dialog `opacity` computed as `1`), because axe computes contrast from the rendered colours and a half-faded sheet gives a false result.

## Decisions (made by the owner, not to be reopened)

- One spec file, `e2e/a11y.spec.ts`, on the shared fixture `e2e/fixtures.ts`. `test.use({ onboarded: false })` is used only for the intro tests, in their own `describe`.
- Theme switching uses what the other specs use: the page's own control, `page.getByRole('button', { name: 'Night', exact: true }).click()` (the button of `src/ui/theme.ts`, which sets `data-theme` on `<html>`), as in `e2e/settings.spec.ts`, `e2e/station.spec.ts` and `e2e/styleguide.spec.ts`. Day is the default for the test browser, so the Day tests press nothing, or press Day to be explicit. No `colorScheme` emulation, so the test and a user go through the same code.
- Fixes stay inside existing files and design tokens. If a token colour changes for contrast, the Contrast table of `design/DESIGN.md` is updated to match, and `tests/ui` (which reads that table) must pass.
- No rule is disabled globally. An exclusion is only for a decorative `aria-hidden` element, with the reason in the spec file.
- `.kiro/steering/structure.md` is updated by a later separate step, not in these tasks.

Choices of this design inside those decisions (each needs a yes or no from the owner):

- Only `violations` fail a test. `incomplete` results (axe could not decide, usually colour contrast over a gradient or an image) are logged with `test.info().annotations` and are not failures. The canvas ghosts fall in this class, and the README says so.
- Announcements are checked on the Latest alert, the only `aria-live` region the code uses for a new event. The code has no `assertive` region and no `role="alert"`, so the check asserts there is none rather than testing an urgent path that does not exist.
- The README requirement has no test file by nature. It is listed as a known gap in `scripts/hooks/spec-gaps.json`, with its reason, in the README task, and the README's count of known gaps is updated in the same change.
- The Tab-order check compares to a literal list written from the page as it is today. A later change to the page order changes that list on purpose.

## Checks in detail

### Audits (Requirement 1)

| Screen and state | How the test gets there |
|---|---|
| Station, empty | open `/`, wait for the Listen and Try a sound cards |
| Station with events and ghosts, pipeline card | press the Knock chip, wait for the Latest alert, the Recent sounds row and the pipeline tiles to hold their values (the model load takes a few seconds, as in `e2e/station.spec.ts`) |
| Settings open | press the Settings pill, wait for the dialog `open` and opacity `1` |
| Intro, step 1, 2, 3 | `onboarded: false`, open `/` (the intro opens by itself), Next, Next, wait for each `h2` focus |
| `band.html` | open `/band.html` |
| `styleguide.html` | open `/styleguide.html` |

Fixes expected from experience, not promised: contrast of muted text on tints, a missing accessible name on an icon-only control, `aria-labelledby` pointing at a hidden element, a `role="img"` canvas without a name, a heading order jump, a landmark missing (`region`) on a fragment. Each is fixed where it is found.

### Keyboard (Requirement 2)

- **Order**: start with focus on `body`, press Tab and record `role:name` of `document.activeElement` until it leaves the page or returns to the start. Expect the literal list of the page (the pattern of the existing tab-order checks in `e2e/station.spec.ts` and `e2e/settings.spec.ts`, which record `button:Night`).
- **Focus ring**: at each stop, `getComputedStyle(el)` is read; the test passes when `outlineStyle !== 'none' && parseFloat(outlineWidth) > 0` or `boxShadow !== 'none'`. The design's ring is the 3 px `focus` token.
- **Dialogs**: open Settings, Tab sixteen-plus times with a bounded loop and assert `document.activeElement` stays inside `dialog[open]`; the same with Shift+Tab; Escape closes; `document.activeElement` is the Settings pill. The same for the intro opened through Show intro again.
- **Start listening**: the fake-microphone launch arguments of `e2e/live.spec.ts` (`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`). Focus Start listening by Tab, press Enter, expect "Listening" in the Listen pill; stop; do it again with Space.
- **Settings controls**: focus a class switch, press Space, expect `aria-checked` to flip; focus the loudness slider, press ArrowRight and ArrowLeft, expect the value text and the input value to change together and by the step the slider has.

### Reduced motion (Requirement 3)

`await page.emulateMedia({ reducedMotion: 'reduce' })` before `goto`. After a Knock chip (so a ghost is on screen), `page.evaluate` reads `getComputedStyle` for the ghost field element, the header pill, the Listen pill, and (after opening them) the Settings dialog and the intro dialog and its visible step. Every comma-separated `transition-duration` must be `0s`; `animation-name` must be `none` or every `animation-duration` `0s`. The canvas drawing loop is not CSS: `src/ghosts/field.ts` already stops its drift under the media query (`e2e/ghosts.spec.ts` checks it), so this spec checks CSS and does not repeat the canvas motion check.

### Announcements (Requirement 4)

- `page.locator('[data-card="latest"] [aria-live]')` (the selector is confirmed against `src/station/list.ts` when the task is done) must exist and be `polite`.
- After the Knock chip with the side set to Left, its text must match the class word, the side word and the urgency word that `alertText` of `src/station/format.ts` produces; the test reads the expected words from the page's Recent sounds row for the same event, so the check does not copy the copy.
- `page.locator('[aria-live="assertive"], [role="alert"]')` has count 0 on the station and on `band.html`.
- Each live region found (`[aria-live], [role="status"]`) must have text or an accessible label once the page is in use, listed in the failure message by selector.

## Testing strategy

| Layer | What | Where |
|---|---|---|
| e2e | axe, zero violations: seven screens and states, two themes | `e2e/a11y.spec.ts` |
| e2e | Tab order, focus ring, dialog trap, Escape and focus return, Enter and Space on Start listening, switch by Space, slider by arrows | `e2e/a11y.spec.ts` |
| e2e | reduced motion on the ghost field, pills and sheets | `e2e/a11y.spec.ts` |
| e2e | live region exists, polite, no assertive, a new event's class, side and urgency appear | `e2e/a11y.spec.ts` |
| Hook | no colour-only alert, unchanged | `tests/scripts/hooks/colour-alerts.test.ts` and `bun run hooks:colour` |
| Unit | Contrast table and tokens agree, when a token changes | `tests/ui` |
| Regression | the existing specs, `bun run typecheck`, `bun run test`, `bun run build` | existing |
