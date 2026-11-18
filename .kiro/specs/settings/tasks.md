# Tasks: Settings (F10)

Each task is small steps that end in a test gate. Write the test first, see it fail for the right reason (a stub that throws `not implemented`, or a missing module), then implement. Run `bun run typecheck` and `bun run test` at every gate, and `bun run e2e` at every gate that touches the UI. Requirement numbers refer to `requirements.md`. Do not add dependencies. Tests use literal numbers and strings for the values that the requirements fix. Before task 1 read `.kiro/steering/*.md`, `design/DESIGN.md` (Principles, Pills, Status pills, Theme control, Listening station, Settings), `src/haptics/settings.ts`, `src/haptics/engine.ts`, `src/station/` (station, runner, live, types, pipeline, status, format, try-sound, list, station.css), `src/band/types.ts`, `index.html`, `tests/station/boundaries.test.ts`, `tests/band/styles.test.ts`, `e2e/live.spec.ts` and `playwright.config.ts`. Do the tasks in order.

- [x] 1. The settings model and storage
  - [x] 1.1 Write `tests/station/settings.test.ts` against a throwing stub of `src/station/settings.ts`: defaults (frozen, all seven on at -50, `phone`); every field falling back alone; rounding (`-49.4` to `-49`, `-49.6` to `-50`); out-of-range (`-80.4`, `-9.9`, `-81`, `0`); wrong types (`'-30'`, `NaN`, `Infinity`, `null`, `'yes'`); unknown keys; a throwing getter and a throwing proxy; `parseSettings` of `null`, `''`, `'{'`, `'null'`, `'[]'`, `'42'`; round trip; `loadSettings` with a throwing `getItem` and with `null`; `saveSettings` with a throwing `setItem` and with `null` returns `false`, and a working storage returns `true`. Implement the constants, types, `DEFAULT_SETTINGS`, `resolveSettings`, `parseSettings`, `serializeSettings`, `loadSettings` and `saveSettings`.
    - _Requirements: 2.1-2.7, 3.1, 3.2_
  - [x] 1.2 Write `tests/station/settings.property.test.ts` (fast-check, fixed seed, at least 100 runs): `parseSettings` never throws and returns valid settings for any string, for any `JSON.stringify(fc.anything())` and for valid settings JSON with random fields corrupted; every field of every result is valid; the round trip holds for every valid settings object.
    - _Requirements: 2.3, 2.6, 2.7, 12.1_
  - [x] 1.3 Add `settings.ts` to the PURE list of `tests/station/boundaries.test.ts` and check it passes (it imports only `../events`, `../haptics` and type-only `../band`).
    - _Requirements: 1.1_
  - **Gate:** the new tests pass; `typecheck` and `test` pass.

- [x] 2. Verdict, settings engine, outputs and muted text
  - [x] 2.1 Extend `settings.test.ts` and `settings.property.test.ts` against stubs: `settingsVerdict` (equal to the level alerts, one dB below is `too-quiet`, off wins over too-quiet, all seven classes); property: monotonic in loudness. `createSettingsEngine`: a disabled class and a too-quiet sound drop with `disabled-class` and `too-quiet` without calling or changing the inner engine (a following allowed event still plays), the inner rate limit still works with the default and `rateLimitMs: 0` allows repeats, `NaN` and `Infinity` throw `RangeError` first, a later change of the passed object has no effect. `isMuted` (true for exactly two reasons). `effectiveOutput` (all nine combinations of choice and availability). `outputsFor` (simulator first, phone only for `phone`, `simulator` and `band` give the simulator alone). Implement them.
    - _Requirements: 4.1-4.4, 5.1, 5.2, 12.1_
  - [x] 2.2 Add `mutedText` and `dbText` to `format.ts` with literals in `tests/station/format.test.ts`: "Knock is switched off in Settings, so it raised no alert."; "Knock was quieter than its Settings level (−40 dB), so it raised no alert." with U+2212; "Baby" and "Other" names.
    - _Requirements: 4.6, 8.4_
  - [x] 2.3 Extend `tests/station/runner.test.ts` and `live.test.ts` with `createSettingsEngine` and fake outputs: a switched-off class and a too-quiet sound give a muted decision and no output's `play` is called; with `outputsFor('simulator', ...)` only the simulator plays; mutating `deps.engine` and `deps.outputs` between two runs (and two windows) takes effect, and the runner's event numbering continues. `runner.ts` and `live.ts` stay unchanged.
    - _Requirements: 1.3, 4.5, 5.3, 6.1, 12.2_
  - **Gate:** `settings`, `format`, `runner`, `live` and `boundaries` tests pass; `typecheck` and `test` pass.

- [x] 3. The Settings sheet and its styles
  - [x] 3.1 Write `tests/station/settings-styles.test.ts` against a missing `settings.css` (tokens only: no hex, `rgb`, `hsl`, `oklch`, `color-mix`; pixel literals 1 to 3 px only; the 720 px breakpoint; no `@keyframes`; no remote resource; the scanner catches literals), then write `src/station/settings.css` by `design.md` (Styles). Link it from `index.html` and add the "Settings" pill with the gear glyph and `aria-haspopup="dialog"` to the header meta row.
    - _Requirements: 7.1, 7.3, 11.1, 11.3_
  - [x] 3.2 Build `src/station/settings-panel.ts` (`mountSettings`, `browserStorage`): the dialog, head, seven tiles with switch and slider, the Buzz on fieldset with the disabled Wristband option and the phone-unavailable case, Reset to defaults, focus return, effective output shown as selected. Every change saves and calls `onChange`. Use `dbText` for the value text.
    - _Requirements: 3.4, 5.5, 7.2, 7.4-7.6, 8.1-8.5, 9.1-9.5, 10.1-10.3_
  - [x] 3.3 Look at the sheet: `bun run dev`, Day and Night at 1440 and 390 px. Backdrop tokens resolve in `::backdrop`, no horizontal scroll at 390 px, every target at least 44 px, focus ring visible, disabled tile and Wristband option readable, selected option marked by more than colour. Add any new colour pair to the contrast table of `design/DESIGN.md` and to `tests/ui`.
    - _Requirements: 7.3, 7.6, 11.2_
  - **Gate:** `settings-styles` test, `tests/ui`, `typecheck` and `test` pass; `bun run build` passes.

- [x] 4. Station wiring
  - [x] 4.1 Add `setFallback(active)` to `status.ts` (the base state changes, "Problem" still wins until `reset()`), with a test through the existing status checks or a small DOM-free case where the file has none.
    - _Requirements: 5.4_
  - [x] 4.2 In `station.ts`: read storage once at mount with a `try` (`browserStorage()`), `loadSettings`, and call `apply(settings)` before the first run. `apply` sets `engine` and `outputs` of both deps objects in place (live deps become a named `liveDeps` object), stops outputs no longer chosen, and calls `status.setFallback`. Mount the panel on the Settings pill. `show(result)` shows only the pipeline for a muted run and `pick` sets `mutedText` in the Try message; live shows nothing extra.
    - _Requirements: 3.3, 4.5, 4.6, 5.3, 5.4, 6.1-6.4_
  - [x] 4.3 Update the existing station and live e2e checks that list the header controls or count pills, if any, for the new Settings pill (it is a secondary pill; the primary pill count stays 1). Run `bun run e2e`.
    - _Requirements: 12.3_
  - **Gate:** `typecheck`, `test`, `bun run build` and the existing `bun run e2e` specs pass.

- [x] 5. Playwright e2e and screenshots
  - [x] 5.1 Write `e2e/settings.spec.ts` with the eight cases of `design.md` (Playwright): open from the header and change by keyboard then reload; corrupt storage (two cases); Knock off then back on; Knock at −10 dB; Screen only; the Wristband option; live with Knock off and the fake microphone; Escape and focus return; the four screenshots. Each case fails first on the missing Settings pill, then passes after tasks 3 and 4 are in.
    - _Requirements: 3.5, 4.5, 4.6, 5.3, 6.2, 7.4, 9.2, 10.1, 12.3_
  - [x] 5.2 Fix what the test finds in the page. Do not change a test to fit the code unless the test is wrong; if a requirement is wrong, change it in this spec in the same change.
  - **Gate:** `bun run e2e` passes with no console error or warning in any settings case; four screenshots exist in `e2e/screenshots/`.

- [x] 6. Docs
  - [x] 6.1 Rewrite the Settings screen section of `design/DESIGN.md` for the sheet: desktop 1440 and phone 390 sketches, the regions, the tab order, the disabled Wristband option, and the note that the old per-output switches and "Connect band" are replaced by "Buzz on" until F11. Add the Settings pill to the Listening station header region. Add one line about Settings to `README.md`. Leave `.kiro/steering/structure.md` alone.
    - _Requirements: 12.4_
  - **Gate:** `tests/ui` (which reads DESIGN.md) and `typecheck` pass.

- [x] 7. Review and final gate
  - [x] 7.1 Check the diff: `src/audio`, `src/classify`, `src/bearing`, `src/haptics`, `src/band`, `src/events` and `src/ghosts` unchanged; `runner.ts` and `live.ts` unchanged; `package.json` unchanged; the only storage key is `banshee-band.settings.v1`; no `console`, `Math.random` or `Date` in the new code; no `@keyframes` in `settings.css`; no external URL; the footer's aid sentence unchanged.
    - _Requirements: 1.1-1.5_
  - [x] 7.2 Run `bun run typecheck`, `bun run test`, `bun run build` and `bun run e2e`. All four must be green. Write the commit summary: what is built, the changed e2e checks, and the choices listed under "Choices of this design" in `design.md` that need a yes or no.
    - _Requirements: 12.5_
  - **Gate:** all four commands exit 0; the diff matches 7.1.
