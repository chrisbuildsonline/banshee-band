# Tasks: Haptic outputs

Each task is small and ends in a test gate. Write the test first, see it fail for the right reason (a stub that throws `not implemented`), then implement. Run `bun run typecheck` and `bun run test` at every gate, and `bun run e2e` at every gate that touches the page. Requirement numbers refer to `requirements.md`. Do not add dependencies. Tests use literal numbers and strings for the values that the requirements fix (offsets, percents, side texts). Do not change `src/haptics/`.

- [x] 1. Contract and boundaries
  - [x] 1.1 Create `src/band/types.ts` (`HapticOutput`) and `src/band/index.ts` with the module comment of Requirement 1.5 (outputs play a command that `haptics` decided; the band is an aid and not a safety device). Remove `src/band/.gitkeep` once a real file exists. Export types only for now.
    - _Requirements: 1.1, 1.4, 1.5_
  - [x] 1.2 Write `tests/band/boundaries.test.ts`: scan `src/band/*.ts` (comments removed) for imports other than `../events`, `../haptics`, `./*` and `.css` files, and for the forbidden identifiers (`fetch`, `XMLHttpRequest`, `WebSocket`, `bluetooth`, `console`, `Math.random`, `Date`). Check that `src/haptics/*.ts` has no import of `band` (the existing haptics boundary test also covers it).
    - _Requirements: 1.2, 1.3, 1.4, 1.7_
  - **Gate:** `boundaries.test.ts` and `tests/haptics/boundaries.test.ts` pass; `typecheck` passes.

- [x] 2. Segment player
  - [x] 2.1 Create `tests/band/helpers/fake-scheduler.ts` (a manual clock: `scheduler`, `advance(ms)`, `now()`, `pending()`; timers with the same time run in creation order) and `tests/band/helpers/commands.ts` (a helper that builds a command with the real engine for a class, side, urgency and intensity, plus literal knock and alarm commands for readability).
    - _Requirements: 10.1_
  - [x] 2.2 Write `tests/band/segment-player.test.ts` with a stub `createSegmentPlayer` that throws `not implemented`, and confirm the failures. Cases: emission offsets are the cumulative `ms` with literals (knock left high: 0, 70, 170, then `{0, 0}` at 240; alarm with its repeats and pauses, ending at 3800); the first emission happens inside `play`; the final `{0, 0}` comes at `totalMs` and not before (advance to `totalMs - 1`); a second `play` cancels the first (nothing from the old command after it, no old 0/0, `pending()` equals the new command's timers only); `stop` emits `{0, 0}` once and cancels the rest; `stop` when nothing plays emits nothing; `stop` after the natural end emits nothing; two `stop` calls emit once; `play` after `stop` works; an empty `segments` list emits `{0, 0}` once and schedules nothing; a throwing `onLevels` does not stop later emissions; emitted objects are fresh and changing one does not change the command; the player uses only the injected scheduler (the global `setTimeout` is replaced by a throwing function during the test).
    - _Requirements: 2.1-2.12, 10.2_
  - [x] 2.3 Implement `src/band/segment-player.ts` (`createSegmentPlayer`, `browserScheduler`, `Scheduler`, `Levels`) as in the design. Add a test that `browserScheduler` calls the current `globalThis.setTimeout` at call time (replace it after import, then call).
    - _Requirements: 2.1-2.12_
  - [x] 2.4 Write `tests/band/properties.test.ts` (fixed seed, at least 100 runs) for Requirement 10.4: for any command the real engine can produce (generated class, urgency, bearing source, bearing, confidence, intensity including 0 and junk settings), the emissions in order reproduce the segment levels in order, the emission times are the cumulative `ms`, there is one emission per segment plus the final one, and the last is `{0, 0}` at `totalMs`.
    - _Requirements: 10.4, 2.4, 2.5_
  - **Gate:** `segment-player.test.ts` and `properties.test.ts` pass; `typecheck` and the whole `test` run pass.

- [x] 3. Phone output
  - [x] 3.1 Write `tests/band/phone-output.test.ts` with a stub that throws `not implemented`, and confirm the failures. Cases, with a stubbed `navigator.vibrate` passed as `nav`: one call with the command's `vibrate` array (literal `[70, 100, 70]` for the knock); the call has the same values in the same order; a command with every level 0 does not call `vibrate`; a command with one level above 0 does; `vibrate` missing, `nav` an empty object and `navigator` missing give `available()` false and no throw from `play` or `stop`; `stop` calls `vibrate(0)` once; `stop` with no `vibrate` calls nothing; a throwing `vibrate` does not throw out of `play` or `stop`; `available()` does not call `vibrate`; `kind` is `'phone'`; `vibrate` is called as a method of the object (the stub checks `this`); with no `nav` argument the output reads `globalThis.navigator` at call time (stub it with `vi.stubGlobal`).
    - _Requirements: 3.1-3.9, 10.3_
  - [x] 3.2 Implement `src/band/phone-output.ts` as in the design, with the intensity 0 decision and its doc comment.
    - _Requirements: 3.1-3.9_
  - [x] 3.3 Add to `tests/band/properties.test.ts` the phone property of Requirement 10.5: for any engine command, `vibrate` is called zero times when every level is 0 and once with the command's array otherwise.
    - _Requirements: 10.5, 3.3, 3.4_
  - **Gate:** `phone-output.test.ts` and `properties.test.ts` pass; `typecheck` and `test` pass.

- [x] 4. Labels
  - [x] 4.1 Write `tests/band/labels.test.ts` with stubs that throw, and confirm the failures: `sideText` for the four sides with the exact strings of Requirement 5.2; `classLabel` for the six classes; `percentOf` for 0, 0.3, 0.15, 0.5, 0.75, 1, 0.005 (rounds to 1), `NaN` (0), -0.2 (0) and 1.4 (100); `patternName` for a knock left command ("Knock, left stronger") and for an unknown side (the sentence form of the design); `pulseCount` for the knock (2), the alarm (12) and a command with all levels 0 (the segments at even index).
    - _Requirements: 5.2, 5.3, 5.6, 4.3, 10.6_
  - [x] 4.2 Implement `src/band/labels.ts`.
    - _Requirements: 4.3, 5.2, 5.3, 5.6_
  - **Gate:** `labels.test.ts` passes; `typecheck` and `test` pass.

- [ ] 5. Simulator component
  - [ ] 5.1 Write the simulator checks that can run without a browser as far as possible (the labels are already covered). For the DOM behaviour, write the e2e cases of task 8 for the simulator in a first version against a minimal page (see 6.1), and see them fail. Do not add a DOM test environment to Vitest.
    - _Requirements: 4.1-4.10, 5.1-5.11, 6.1-6.8_
  - [ ] 5.2 Create `src/band/simulator.ts` and `src/band/simulator.css`: the DOM tree of the design, `mountBandSimulator`, the player wired to the motor cards (number, `data-level`, bar width from one function), the timeline lanes (SVG, `aria-hidden`), `data-side` on the root, the glyphs, the live region (clear and set in a microtask), `destroy`. Build the tree with `createElement` and `textContent`. Use tokens only. Add `transition: none` under `prefers-reduced-motion: reduce` and no `@keyframes`. Export from `src/band/index.ts`.
    - _Requirements: 4.1-4.10, 5.1-5.11, 6.1-6.8_
  - [ ] 5.3 Check the contrast of every pair the simulator uses against the contrast table of `design/DESIGN.md` (text on card, muted unit on card, accent bar on its track and on the card, lane marks on card, dashed outline on card, in Day and Night). If a pair is missing from the table, compute it with `tests/ui/contrast.ts` and add it to the table and to `tests/ui/contrast.test.ts` in the same change.
    - _Requirements: 6.8, 9.1_
  - **Gate:** `typecheck` passes and `boundaries.test.ts` passes (the new files obey the import rules); the e2e simulator cases of task 8 pass once the page exists.

- [ ] 6. Band simulator page
  - [ ] 6.1 Create `band.html` and `src/ui/band-page.ts`, `src/ui/band-page.css`: header with the brand link, the status pill and the theme control, the title block with "Band simulator" and the sentence that this is a simulator and that no band is connected, the simulator mounted in its container, the footer with the aid sentence verbatim. Read `index.html`, `styleguide.html` and `src/ui/styleguide.ts` first. If the theme control exists only inside the styleguide script, move it into a shared module in `src/ui/` and use it from both pages. Do not copy it. Add `band.html` to `build.rolldownOptions.input` in `vite.config.ts` (key `band`).
    - _Requirements: 7.1-7.11, 9.1_
  - [ ] 6.2 Write the status pill: read `createPhoneOutput().available()` once at load, show "Phone vibration on" (triangle glyph, accent tint) or "No phone vibration here" (open-circle glyph, neutral tint). Glyphs are inline SVG, `aria-hidden`. Reuse the status pill classes of the other pages.
    - _Requirements: 7.4_
  - [ ] 6.3 Update `.kiro/steering/structure.md`: add `band.html` (and `src/ui/band-page.ts`) to the structure text and list the files of `src/band`. Keep the rules section unchanged.
    - _Requirements: 7.1_
  - **Gate:** `bun run dev` serves `/band.html` with no console error (check with a quick Playwright run of task 8.1); `typecheck` and `test` pass.

- [ ] 7. Feel a pattern card
  - [ ] 7.1 Write the first e2e cases of task 8 for the card (Knock with Left, Unknown, the vibrate stub) and see them fail.
    - _Requirements: 8.1-8.10, 10.8_
  - [ ] 7.2 Implement the card in `src/ui/band-page.ts` and `band-page.css`: heading and sentence, the side fieldset with four native radios (default Centre, check glyph on the selected option, selection by arrow keys), the six chips as secondary pills in a group, `buildDemoCommand` with the urgency and bearing tables of the design (a new engine per choice), the calls to the simulator output and, when available, the phone output, and the error text live region. Changing the side plays nothing.
    - _Requirements: 8.1-8.10_
  - **Gate:** the e2e cases of 7.1 pass; `typecheck` and `test` pass.

- [ ] 8. End-to-end tests
  - [ ] 8.1 Write `e2e/band.spec.ts` (start it in tasks 5 and 7 and finish it here): Knock plus Left gives `data-level` of the left motor greater than the right and the text "left stronger"; Unknown gives equal levels, the text "Side unknown" and `data-side="unknown"` on the simulator root and a dashed outline on both motor cards (computed `outline-style`); Centre gives equal levels and "both motors, centre"; with `page.clock` installed before `goto`, the levels are not 0 at 239 ms and are 0 after 240 ms; a second chip while the first plays replaces it (no stale 0 from the first one); an init script stubs `navigator.vibrate` and the test checks the call is `[70, 100, 70]` once per choice, and `navigator.vibrate(0)` is not called by a play; with `navigator.vibrate` removed, the pill reads "No phone vibration here" and a choice raises no error; with the stub, the pill reads "Phone vibration on"; the live region text is set once per choice and does not change while the segments run; keyboard flow (Tab order brand, theme control, side control, chips; arrow keys change the side and do not play; Enter and Space on a chip play); reduced motion (`emulateMedia`) gives computed `transition-duration` `0s` on the bar fill and numbers that still update; no console errors and no page errors; no request to another origin; no element with `tabindex` inside the simulator.
    - _Requirements: 4.4, 4.6, 5.2, 5.7, 6.1, 6.4, 7.4, 7.9, 7.11, 8.2-8.8, 10.8, 10.9_
  - [ ] 8.2 Check, with a few chips and the page clock, that the player's emissions in the browser are on the fake clock (R2.3): if the page uses its timers before `page.clock.install`, fix the order in the test. Do not change the product code to suit the test.
    - _Requirements: 2.3, 2.6_
  - **Gate:** `bun run e2e` passes for `band.spec.ts` and for the existing specs.

- [ ] 9. Design gate
  - [ ] 9.1 Have the builder take Playwright screenshots of `band.html` at 1440 px and 390 px in Day and Night after a Knock plus Left press, saved as `e2e/screenshots/band-1440-day.png`, `band-1440-night.png`, `band-390-day.png` and `band-390-night.png` (add them to the e2e spec so they are made on each run). Look at each one against `design/DESIGN.md` (soft canvas, floating white surfaces, 16-20 px radius, one accent, Night through tokens, large display numbers, tinted status pill, the unknown state's dashed outline in a second screenshot of Unknown at 390 px Night if needed). Fix every mismatch: overflow, a missing glyph, text on the wrong surface, targets under 44 px, motor cards that stack at 390 px.
    - _Requirements: 9.1-9.4, 7.10_
  - [ ] 9.2 Decide the position of the Feel a pattern card from the 390 px screenshot (design, "The page"). If it moves, update Requirement 7.5, the tab order text and the DESIGN.md text in the same change.
    - _Requirements: 7.5, 7.9, 9.4_
  - [ ] 9.3 Update the Band simulator section of `design/DESIGN.md`: the status pill ("Phone vibration on" and "No phone vibration here", with glyph and tint), the Feel a pattern card (six chips, side control, what it plays), the missing Connect band pill ("arrives with the BLE feature"), the two layouts at 1440 px and 390 px, and the tab order (brand link, theme control, side control, chips). Add the two rows to the Status pills table. If a token changed, update `src/ui/tokens.css` and `tests/ui/tokens.test.ts` in the same commit.
    - _Requirements: 9.5, 7.6_
  - **Gate:** the four screenshots exist and were checked; `tests/ui` tests pass; `typecheck` and `test` pass.

- [ ] 10. Review
  - [ ] 10.1 Check the doc comment of every export of `src/band/` and the module comment of `index.ts` (Requirement 1.5). Check that no copy says the band keeps the user safe, replaces a smoke alarm, or that a band is connected (Requirements 7.6, 11.2).
    - _Requirements: 1.5, 11.2, 11.3_
  - [ ] 10.2 Check with `git diff --stat` that `src/haptics/` is unchanged, and that the only changes outside `src/band/`, `src/ui/`, `band.html`, `tests/band/`, `e2e/`, `.kiro/specs/haptic-outputs/` are `vite.config.ts`, `.kiro/steering/structure.md` and `design/DESIGN.md` (and `tests/ui/`, `src/ui/tokens.css` if the contrast table needed a row).
    - _Requirements: 12.3, 12.4_
  - [ ] 10.3 Check privacy: no network request from the page except its own files, no `console` call in `src/band/` or `band-page.ts`, no `localStorage` use added by this feature.
    - _Requirements: 7.11, 11.1, 11.4_

- [ ] 11. Gate (last)
  - [ ] 11.1 Run `bun run typecheck`, `bun run test`, `bun run e2e` and `bun run build`. All four must be green, and `bun run build` must emit `dist/band.html` (check that the file exists).
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - **Gate:** `typecheck`, `test` and `e2e` exit 0, and `bun run build` exits 0 with `dist/band.html` present.
