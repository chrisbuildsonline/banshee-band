# Requirements: Settings (F10)

## Introduction

The listening station (`index.html`) alerts for every sound class at one fixed loudness, and buzzes the phone when it can. This feature lets the user decide, and makes each choice take effect in both Try a sound and live listening:

1. **Sounds**: an on/off switch for each of the seven sound classes (knock, doorbell, alarm, baby, vehicle, voice, other).
2. **Loudness levels**: one level per class, in dBFS, as a slider. A sound quieter than its class level raises no alert.
3. **Buzz on**: one choice of Phone vibration, Screen only (the band simulator) or Wristband.

The settings are saved in the browser on this device and apply at once, in Try a sound and in live listening, with no Save button and no reload. They replace the fixed defaults of `.kiro/specs/listening-live/` (its "Settings are out of scope" assumption) and the fixed engines of `.kiro/specs/listening-station/`.

The station stays an aid and not a safety device. The page footer keeps the exact sentence of `design/DESIGN.md` Principle 6: "Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices." The Settings sheet does not repeat it. The defaults alert for every class at -50 dB, which is today's behaviour. Settings can only make alerts fewer or move them between outputs.

Decisions already made by the owner (listed again in `design.md`): the pure logic is `src/station/settings.ts`; the Wristband option is shown but disabled until the Bluetooth link (F11); the sheet is a native `<dialog>`; there is no Save button and no primary pill.

Terms:

- **Settings**: a `StationSettings` value: `sounds` (a `ClassSetting { on, minDb }` for each of the seven classes) and `output` (`'phone'`, `'simulator'` or `'band'`).
- **Level**: `minDb`, the quietest loudness (dBFS) at which a class alerts.
- **Verdict**: `'alert'`, `'off'` or `'too-quiet'`, from the settings and one event.
- **Muted run**: a run whose decision is a drop with reason `disabled-class` or `too-quiet`.
- **Effective output**: the choice after availability is applied: the chosen output, or Screen only when it cannot be used.

## Requirements

### Requirement 1: Module boundaries and privacy

**User story:** As a developer, I want the settings rules in one tested pure module, and as a user, I want nothing but my choices stored.

#### Acceptance criteria

1. THE rules SHALL live in `src/station/settings.ts`, a pure file with the same ban as the other pure station files: no `document`, `window`, `navigator`, `localStorage`, `fetch`, `console`, `Math.random` or `Date`. Storage is injected. `settings.ts` SHALL be added to the PURE list of `tests/station/boundaries.test.ts`.
2. THE sheet SHALL live in `src/station/settings-panel.ts` and `src/station/settings.css`. Only `src/station/station.ts` SHALL import the panel, and only `src/main.ts` imports `src/station`.
3. THE feature SHALL NOT change `src/audio`, `src/classify`, `src/bearing`, `src/haptics`, `src/band`, `src/events` or `src/ghosts`, SHALL NOT change `runner.ts` or `live.ts` (they already read `deps.engine` and `deps.outputs` at each run or window), and SHALL NOT add a dependency to `package.json`.
4. THE only data the page stores SHALL be the settings JSON under the key `banshee-band.settings.v1` in `localStorage`. No audio, window, score, event or label is stored. This amends listening-live Requirement 1.5, which allowed no storage call in `src/station/`. Nothing leaves the device (`.kiro/steering/privacy.md`).
5. THE new code SHALL contain no `console` call and no network request. EVERY exported function, constant and type of the new files SHALL have a short doc comment.

### Requirement 2: The settings model

**User story:** As a user, I want a damaged or old saved value to never break the page, so that the station always opens.

#### Acceptance criteria

1. `settings.ts` SHALL export `SETTINGS_STORAGE_KEY` (`'banshee-band.settings.v1'`), `OUTPUT_CHOICES` (`'phone'`, `'simulator'`, `'band'`) with the type `OutputChoice`, `MIN_DB_FLOOR` (-80), `MIN_DB_CEILING` (-10), the types `ClassSetting` and `StationSettings`, and `DEFAULT_SETTINGS`.
2. `DEFAULT_SETTINGS` SHALL be frozen, deeply: every class `on` at -50 (`DEFAULT_MIN_LOUDNESS_DB`) and `output` `'phone'`.
3. `resolveSettings(input)` SHALL return a new, complete, valid object for any input, and SHALL never throw. A field that is missing or invalid takes its default alone and does not change its neighbours.
4. A valid `minDb` SHALL be a finite number from -80 to -10, checked before rounding, and SHALL be rounded to a whole dB. A valid `on` SHALL be a boolean. A valid `output` SHALL be one of `OUTPUT_CHOICES`. Unknown keys SHALL be ignored.
5. A getter or proxy that throws SHALL read as missing.
6. `parseSettings(text)` SHALL give the defaults, per field, for `null`, text that is not JSON, and JSON of the wrong shape. It SHALL never throw.
7. `serializeSettings(s)` SHALL give JSON text, and `parseSettings(serializeSettings(s))` SHALL deep-equal `s` for every valid `s` (every `minDb` a whole dB from -80 to -10).

### Requirement 3: Saved settings

**User story:** As a user, I want my choices to stay after I reload, and I want the page to work when the browser blocks storage.

#### Acceptance criteria

1. `SettingsStorage` SHALL be `Pick<Storage, 'getItem' | 'setItem'>`. `loadSettings(storage)` SHALL read the key and parse it; `saveSettings(storage, s)` SHALL write `serializeSettings(s)` and return `true`.
2. WHEN `storage` is `null`, or `getItem` throws, THE load SHALL give the defaults. WHEN `storage` is `null`, or `setItem` throws (private mode, quota), THE save SHALL return `false`. Neither SHALL throw.
3. AT mount THE station SHALL read `window.localStorage` once inside a `try`. A blocked or throwing getter SHALL give `null` storage, so the page works with the defaults and saving fails silently. THE page SHALL show no error for it and write nothing to the console.
4. EVERY change in the sheet SHALL build a new settings object, save it and call `onChange`. A failed save SHALL NOT stop `onChange`, so the change still applies for this visit.
5. A page opened with the key missing, corrupt (`'{not json'`) or of the wrong types SHALL open with the defaults, field by field, and with no console error or warning.

### Requirement 4: What raises an alert

**User story:** As a user, I want a switched-off or too-quiet sound to be fully silent, so that I get only the alerts I chose.

#### Acceptance criteria

1. `settingsVerdict(s, event)` SHALL return `'off'` when the class is off, else `'too-quiet'` when `event.loudnessDb` is below the class `minDb`, else `'alert'`. `'off'` wins over `'too-quiet'`. A loudness equal to the level alerts.
2. `createSettingsEngine(s, options?)` SHALL return a `HapticEngine` that wraps `createHapticEngine`. Its `decide` SHALL first throw `RangeError` for a non-finite `nowMs`, as the engine does. It SHALL then return `drop` with `disabled-class` for `'off'` and `drop` with `too-quiet` for `'too-quiet'`, without calling the inner engine, so the inner state does not change. Otherwise it SHALL return the inner decision.
3. THE inner engine SHALL get all six pattern classes on, `minLoudnessDb` equal to the lowest class level, and the given `rateLimitMs` (Try a sound passes 0, live passes nothing and keeps the default 3000). The engine reads its settings once, so a change of settings SHALL make a new engine.
4. `isMuted(decision)` SHALL be `true` exactly for a drop with reason `disabled-class` or `too-quiet`.
5. A muted run SHALL show no ghost, no Recent sounds row, no Latest alert text and no haptic on any output. It SHALL still fill the pipeline view, whose Pattern tile already says "This sound is switched off" or "Too quiet to buzz".
6. WHEN a Try a sound run is muted, THE card's polite message line SHALL say, with `mutedText(cls, verdict, minDb)` from `format.ts`: "Knock is switched off in Settings, so it raised no alert." or "Knock was quieter than its Settings level (−40 dB), so it raised no alert." The number uses a real minus sign (U+2212). A muted live window SHALL show nothing extra.

### Requirement 5: Where the buzz goes

**User story:** As a user, I want to choose whether the phone buzzes, so that I can use the screen alone.

#### Acceptance criteria

1. `effectiveOutput(choice, available)` SHALL return the choice when `available[choice]` is true (`simulator` always is), else `'simulator'`. The station SHALL pass `{ phone: <navigator.vibrate exists>, band: false }`.
2. `outputsFor(effective, outputs)` SHALL return the simulator first, always, and the phone after it when `effective` is `'phone'`. `'band'` adds nothing until the Bluetooth link (F11) exists. The simulator is first because it mirrors the pattern, so the screen always shows what buzzed.
3. THE choice SHALL route the haptic to those outputs only. Outputs that are no longer chosen SHALL be stopped at the moment of the change.
4. THE header status pill SHALL follow the effective output: "Phone vibration fallback" when it is `'phone'`, else "Band not connected". WHEN the pill says "Problem", it keeps saying it until it is reset.
5. THE saved choice SHALL NOT be rewritten when it is unavailable. WHEN the saved choice is `'phone'` and the browser cannot vibrate, or the saved choice is `'band'`, THE sheet SHALL show Screen only as the selected option and the page SHALL behave as Screen only.

### Requirement 6: Settings take effect everywhere, at once

**User story:** As a user, I want a change to work on the next sound, even while the microphone is on.

#### Acceptance criteria

1. ON every change, THE station SHALL set `engine` of the Try a sound deps to `createSettingsEngine(s, { rateLimitMs: 0 })`, `engine` of the live deps to `createSettingsEngine(s)`, and `outputs` of both to `outputsFor(...)`. It SHALL change these objects in place and not replace them, so the runner's event numbering and the live loop keep working.
2. WHILE listening, a change SHALL apply to the next window without stopping the microphone. A window already being classified SHALL use the settings in force when it finishes.
3. THE sheet SHALL have no Save button. A slider SHALL apply on its `input` event, a switch and a radio on `change`.
4. THE station SHALL work the same with the sheet never opened: the defaults, or the saved settings.

### Requirement 7: The Settings sheet

**User story:** As a user, I want one calm place for my choices that does not take me off the page.

#### Acceptance criteria

1. THE header meta row SHALL have a "Settings" secondary pill with a small gear glyph, next to the Band simulator link, with `aria-haspopup="dialog"`. It SHALL open a native `<dialog>` with `showModal()` (focus trap and Escape come with it), labelled by its `h2` "Settings".
2. `mountSettings(trigger, { settings, phoneAvailable, onChange })` in `settings-panel.ts` SHALL return `{ open(), close() }`.
3. FROM 720 px up, THE sheet SHALL be a side sheet at the right edge, 16 px in from the viewport edges, up to 480 px wide. BELOW 720 px it SHALL be a bottom sheet, full width, with rounded top corners, scrolling inside, at most the viewport height minus 24 px. The fill is `surface`, the radius `radius-card`, the shadow `shadow-soft`. The backdrop is the canvas colour at partial opacity.
4. THE head SHALL hold the `h2` "Settings", the muted caption "Changes apply right away and stay on this device.", and a "Done" secondary pill that closes the sheet. WHEN the sheet closes by Done or Escape, THE focus SHALL return to the Settings pill. THE sheet SHALL have no primary pill.
5. AT the end THE sheet SHALL have a "Reset to defaults" secondary pill that sets every field to its default, redraws the controls, saves, and calls `onChange`.
6. THERE SHALL be no horizontal scroll at 390 px, and every target SHALL be at least 44 px in both directions.

### Requirement 8: The Sounds section

**User story:** As a user, I want each sound class to have its own switch and level.

#### Acceptance criteria

1. THE section SHALL have an `h3` "Sounds" and the muted caption "A sound alerts you when it is on and at least as loud as its level. −80 dB is very quiet, −10 dB is very loud."
2. THERE SHALL be one `surface-raised` tile per class, in the order Knock, Doorbell, Alarm, Baby, Vehicle, Voice, Other. Each tile SHALL hold the class's 24 px ghost glyph (`createGlyph(cls, 'low')`, decorative), the class name, a switch, and below them the level slider.
3. THE switch SHALL be a real `<input type="checkbox" role="switch">` named by the class name, drawn as a track and a thumb, with a visible word "On" or "Off". Checked takes the accent. The state SHALL never be shown by colour alone.
4. THE slider SHALL be a real `<input type="range" min="-80" max="-10" step="1">` with a visible label "Alerts from", an accessible name that contains the class name and "Alerts from", the value as visible text ("−50 dB") and `aria-valuetext` of the same text.
5. WHEN a class is off, ITS slider SHALL be `disabled` and its tile SHALL look muted: muted text, dashed outline and no drop in text contrast below 4.5:1, not colour or opacity alone.

### Requirement 9: The Buzz on section

**User story:** As a user, I want to see what each output does, and to be told plainly what is not available.

#### Acceptance criteria

1. THE section SHALL be a `<fieldset>` with the legend "Buzz on" and three native radios named `output`, drawn as option tiles: "Phone vibration" (caption "The phone buzzes the pattern. The screen shows it too."), "Screen only" (caption "The pattern plays on the band simulator on this screen.") and "Wristband".
2. THE Wristband radio SHALL be disabled, with the caption exactly "Needs the wristband (coming with the Bluetooth link)". THE page SHALL have no connect button and no text that says a band is connected.
3. WHEN `navigator.vibrate` is missing, THE Phone vibration radio SHALL be disabled with the caption "This browser cannot vibrate.", and the effective output is Screen only.
4. THE selected tile SHALL take `accent-tint`, an `accent-strong` label and a check glyph, so selection is more than colour. A disabled tile SHALL use the disabled look of `design/DESIGN.md` (Pills): `surface-raised`, dashed outline, muted text.
5. THE arrow keys SHALL move the choice. THE radios SHALL be one tab stop.

### Requirement 10: Keyboard, focus and screen readers

**User story:** As a user who does not use a pointer, I want the sheet to be fully usable by keyboard.

#### Acceptance criteria

1. THE tab order SHALL be: the Settings pill; in the sheet, Done, then for each class the switch and then the slider (a disabled slider is skipped), then the radios as one stop, then Reset to defaults. Escape SHALL close the sheet.
2. EVERY control SHALL show the 3 px focus ring (`.kiro/steering/accessibility.md`).
3. EVERY control SHALL have an accessible name, and the sheet SHALL work with no pointer and no band.
4. THE copy SHALL be plain words and SHALL imply no protection.

### Requirement 11: Styles and themes

**User story:** As a maintainer, I want the sheet to follow the design system in both themes.

#### Acceptance criteria

1. `src/station/settings.css` SHALL use design tokens only, under the literal rule of `tests/band/styles.test.ts`: no hex, `rgb`, `hsl`, `oklch` or `color-mix`; the only pixel literals 1 to 3 px; the one 720 px breakpoint; no `@keyframes`; no remote resource. `index.html` SHALL link it.
2. THE Day and Night themes SHALL come from the tokens. Every colour pair the sheet uses SHALL be in the contrast table of `design/DESIGN.md` and checked by `tests/ui`, or be added to both in the same change.
3. UNDER `prefers-reduced-motion`, THE sheet SHALL show state through static changes only (Requirement 8.5 and 9.4), and SHALL use no animation.

### Requirement 12: Tests and docs

**User story:** As a maintainer, I want every layer covered and the design doc true.

#### Acceptance criteria

1. UNIT tests SHALL cover the cases listed in `design.md` (Testing strategy), with the literals this spec fixes. PROPERTY tests (fast-check, fixed seed, at least 100 runs) SHALL show that `parseSettings` never throws and always returns valid settings for any string, any `JSON.stringify(fc.anything())` and valid JSON with random fields corrupted, that the round trip holds, and that `settingsVerdict` is monotonic in loudness.
2. THE runner and live tests SHALL show that a muted run plays on no output, that `outputsFor('simulator', ...)` plays on the simulator only, and that changing `deps.engine` between runs takes effect.
3. `e2e/settings.spec.ts` SHALL cover the flows in `design.md` (Playwright), with no console error or warning, and write four screenshots to `e2e/screenshots/`.
4. `design/DESIGN.md` SHALL describe the sheet in place of the old Settings screen section, add the Settings pill to the Listening station header, and say that the old per-output switches and "Connect band" are replaced by "Buzz on" until F11. `README.md` SHALL get one line about Settings.
5. `bun run typecheck`, `bun run test`, `bun run build` and `bun run e2e` SHALL pass.

## Out of scope

- The Bluetooth link, a connect flow and a working Wristband option (F11).
- Per-output switches, haptic strength (`intensity`), the rate limit and the pattern choice.
- A saved sound log, a clear-log button, export or import of settings, syncing between devices.
- Settings on `band.html` and `styleguide.html`.
- `.kiro/steering/structure.md` (updated in a separate later step).
