# Design: Settings (F10)

Requirement numbers refer to `requirements.md`.

## Overview

One pure module decides what alerts and where it buzzes. One DOM module edits it. The station applies each change to the engines and outputs that the two run paths already read.

```
header: [Settings] pill --click--> settings-panel.ts   <dialog>: Sounds (7 tiles), Buzz on, Reset
                                      | every change: new StationSettings -> saveSettings -> onChange(s)
                                      v
station.ts  onChange(s):  settings = s
   runnerDeps.engine = createSettingsEngine(s, { rateLimitMs: 0 })      Try a sound
   liveDeps.engine   = createSettingsEngine(s)                          live, default 3000 ms limit
   eff = effectiveOutput(s.output, { phone: vibrates, band: false })
   runnerDeps.outputs = liveDeps.outputs = outputsFor(eff, { simulator, phone })
   phone.stop() when eff is not 'phone';  status.setFallback(eff === 'phone')

runSound / createLive  (unchanged: read deps.engine and deps.outputs at each run or window)
   -> decision; isMuted(decision) ? pipeline.show only (+ Try message) : ghost, row, Latest alert, pipeline
```

Mount: `browserStorage()` (try/catch around `window.localStorage`, else `null`) -> `loadSettings` -> the same `onChange` path once, so the first run already uses the saved settings.

## Files

```
index.html                       + Settings pill in the header meta row, + link to settings.css (edit)
src/station/
  settings.ts        constants, types, DEFAULT_SETTINGS, resolve/parse/serialize, load/save,
                     settingsVerdict, createSettingsEngine, isMuted, effectiveOutput, outputsFor      pure
  settings-panel.ts  mountSettings, browserStorage: the dialog, tiles, radios, reset                    DOM
  settings.css       sheet, tile, switch, slider, option tile styles, tokens only
  format.ts          + mutedText(cls, verdict, minDb), dbText(db) (edit)
  status.ts          + setFallback(active) on the pill (edit)
  station.ts         load, apply on change, muted runs, Try message (edit)
design/DESIGN.md                 Settings section, Listening station header (edit)
README.md                        one line (edit)
tests/station/  settings.test.ts settings.property.test.ts settings-styles.test.ts (new)
                runner.test.ts live.test.ts format.test.ts boundaries.test.ts (edit)
e2e/settings.spec.ts             (new); existing station specs that list header controls (edit, if any)
```

## Pure module (`settings.ts`)

```ts
export const SETTINGS_STORAGE_KEY = 'banshee-band.settings.v1';
export const OUTPUT_CHOICES = ['phone', 'simulator', 'band'] as const;
export type OutputChoice = (typeof OUTPUT_CHOICES)[number];
export const MIN_DB_FLOOR = -80;
export const MIN_DB_CEILING = -10;
export interface ClassSetting { on: boolean; minDb: number }
export interface StationSettings { sounds: Record<SoundClass, ClassSetting>; output: OutputChoice }
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type Verdict = 'alert' | 'off' | 'too-quiet';

export const DEFAULT_SETTINGS: Readonly<StationSettings>;        // deep-frozen
export function resolveSettings(input: unknown): StationSettings;
export function parseSettings(text: string | null): StationSettings;
export function serializeSettings(s: StationSettings): string;
export function loadSettings(storage: SettingsStorage | null): StationSettings;
export function saveSettings(storage: SettingsStorage | null, s: StationSettings): boolean;
export function settingsVerdict(s: StationSettings, event: Pick<SoundEvent, 'class' | 'loudnessDb'>): Verdict;
export function createSettingsEngine(s: StationSettings, options?: { rateLimitMs?: number }): HapticEngine;
export function isMuted(decision: Decision): boolean;
export function effectiveOutput(choice: OutputChoice, available: { phone: boolean; band: boolean }): OutputChoice;
export function outputsFor(effective: OutputChoice, outputs: { simulator: HapticOutput; phone: HapticOutput }): HapticOutput[];
```

It follows `src/haptics/settings.ts`: a `read(obj, key)` helper in a `try` for hostile getters, an `asObject` check, one default per field.

- `resolveSettings`: for each class in `SOUND_CLASSES`, read `sounds[cls]` as an object, then `on` (boolean, else the default) and `minDb` (finite and `MIN_DB_FLOOR <= v <= MIN_DB_CEILING`, else the default; valid values go through `Math.round`). `output` must be in `OUTPUT_CHOICES`. The result is built fresh and never shares the frozen defaults. Test literals: `-49.4` gives `-49`, `-49.6` gives `-50`, `-80.4` gives `-50` (the range check comes first), `'-30'`, `NaN`, `Infinity` and `null` give `-50`.
- `serializeSettings`: `JSON.stringify` of the resolved object, keys in `SOUND_CLASSES` order, then `output`.
- `parseSettings`: `null` gives `resolveSettings(undefined)`; else `JSON.parse` in a `try`, any failure gives the defaults; the parsed value goes through `resolveSettings`.
- `loadSettings` and `saveSettings` wrap the `getItem` and `setItem` calls in a `try`. `saveSettings(null, s)` is `false`.
- `settingsVerdict`: `!on` gives `'off'`, `loudnessDb < minDb` gives `'too-quiet'`, else `'alert'`. Events are validated before they reach it, so `loudnessDb` is finite.
- `createSettingsEngine`: `inner = createHapticEngine({ enabledClasses: all six true, minLoudnessDb: lowest minDb of the seven, rateLimitMs })`. `decide` checks `nowMs` first (`RangeError`, same message form as the engine), then `settingsVerdict(s, input.event)`, then `inner.decide`. The `other` class never reaches the inner engine's loudness check: it is dropped as `disabled-class` or `too-quiet` first when it is off or quiet, else the inner engine drops it as `no-pattern`. The settings are copied at creation (`resolveSettings(s)`), so a later change of the passed object has no effect, as in `createHapticEngine`.
- `outputsFor` returns a new array each call: `[simulator]` or `[simulator, phone]`.

Types come from `../events`, `../haptics` (any value import is allowed by the boundaries test) and `../band` (type-only). No other import.

## Muted runs and the Try message

`format.ts` gains:

```ts
export function dbText(db: number): string            // '−50 dB', U+2212 for the minus sign
export function mutedText(cls: SoundClass, verdict: 'off' | 'too-quiet', minDb: number): string
// off:       'Knock is switched off in Settings, so it raised no alert.'
// too-quiet: 'Knock was quieter than its Settings level (−40 dB), so it raised no alert.'
```

`CLASS_NAMES` is already imported there. In `station.ts`, `show(result)` becomes:

```ts
if (isMuted(result.decision)) { pipeline.show(result); return 'muted'; }
// else as today: field.show, list.add, pipeline.show
```

`pick` then sets the Try message with `mutedText(result.event.class, verdict, settings.sounds[cls].minDb)`, where the verdict is `'off'` for `disabled-class` and `'too-quiet'` for `too-quiet`. Live updates call the same `show` and ignore the return value.

Two consequences, both accepted: a muted live window still starts the 3 s per-class cooldown of `live-gate.ts` (it passes the gate before the engine), and a change of settings makes a new engine, so its rate-limit memory restarts (one repeat buzz within 3 s is possible right after a change).

## Station wiring

The runner deps and live deps are two objects that the station changes in place (`deps.engine = ...`, `deps.outputs = ...`). `runSound` numbers events per deps object (a `WeakMap`), and `createLive` holds its deps, so neither object may be replaced. The runner deps are built at the first chip press as today; the live deps are built at the first Start listening as a named object (`liveDeps`) instead of the inline literal. Both are built from the current `settings`, and `apply(s)` changes them when they exist.

`outputs` for the simulator is `simulator.output`; the phone output is the existing `createPhoneOutput()`. `vibrates` is read once at load, as today.

`mountStatusPill(container, vibrates)` keeps its signature. It gains `setFallback(active: boolean)`: it changes the base state (`fallback` or `band-off`) and renders it unless the pill says "Problem"; `reset()` returns to the current base state. The station passes `effective === 'phone'` at mount and calls `setFallback` on each change.

## Settings panel (`settings-panel.ts`)

```ts
export function mountSettings(trigger: HTMLElement, options: {
  settings: StationSettings; phoneAvailable: boolean; onChange(s: StationSettings): void;
}): { open(): void; close(): void };
export function browserStorage(): SettingsStorage | null;   // try { return window.localStorage } catch { return null }
```

The panel keeps its own current copy. A change builds a new object (`{ ...s, sounds: { ...s.sounds, [cls]: { ...s.sounds[cls], on } } }`), calls `saveSettings(browserStorage(), next)` (read at each save, so a getter that starts throwing is still caught), then `onChange(next)`. The station reads storage once at mount and passes `settings` in. The selected radio is `effectiveOutput(current.output, { phone: phoneAvailable, band: false })`; choosing a radio stores that choice.

DOM (class names follow `src/ui/styleguide.css` and `status.ts`):

```
<dialog class="bb-settings" aria-labelledby="settings-title">
  <div class="bb-settings__head">
    <div><h2 class="bb-heading" id="settings-title">Settings</h2>
         <p class="bb-settings__note">Changes apply right away and stay on this device.</p></div>
    <button type="button" class="bb-pill bb-pill--secondary" data-settings="done">Done</button>
  </div>
  <section class="bb-settings__sounds" aria-labelledby="settings-sounds">
    <h3 class="bb-heading" id="settings-sounds">Sounds</h3>
    <p class="bb-settings__note">A sound alerts you when it is on ... −10 dB is very loud.</p>
    <ul class="bb-settings__tiles">
      <li class="bb-settings-tile" data-class="knock" data-on="true">
        [24px glyph] <span id="settings-name-knock">Knock</span>
        <label class="bb-switch"><input type="checkbox" role="switch" aria-labelledby="settings-name-knock" checked>
          <span class="bb-switch__track" aria-hidden="true"></span><span class="bb-switch__word" aria-hidden="true">On</span></label>
        <label for="settings-level-knock">Alerts from</label> <span>−50 dB</span>
        <input id="settings-level-knock" type="range" min="-80" max="-10" step="1" value="-50"
               aria-label="Knock: Alerts from" aria-valuetext="−50 dB">
      </li> ...
    </ul>
  </section>
  <fieldset class="bb-settings__output"><legend>Buzz on</legend>
    <label class="bb-option"><input type="radio" name="output" value="phone"> [check] <span>Phone vibration</span><small>caption</small></label> ...
  </fieldset>
  <button type="button" class="bb-pill bb-pill--secondary" data-settings="reset">Reset to defaults</button>
</dialog>
```

The dialog is appended to `document.body` and opened by the trigger's click. `showModal()` moves focus to the first focusable element, which is Done. A `close` event handler returns focus to the trigger (also after Escape). The visible "On" or "Off" word follows `checked`. Turning a class off sets `disabled` on its slider and `data-on="false"` on the tile. The value text and `aria-valuetext` update on `input`. A click on the backdrop does nothing special (Done and Escape close).

## Styles (`settings.css`)

Only tokens. The pixel literals the test allows are 1 to 3 px, so sizes are built from the space tokens: the sheet width is `calc(var(--bb-space-7) * 10)` (480 px) capped by `calc(100vw - var(--bb-space-4) * 2)`; the inset is `var(--bb-space-4)`; the phone height cap is `calc(100dvh - var(--bb-space-5))`. Rows are at least `var(--bb-target-min)`.

- Desktop (`min-width: 720px`): `position: fixed; inset: var(--bb-space-4) var(--bb-space-4) var(--bb-space-4) auto; margin: 0`. Phone: `inset: auto 0 0 0; width: 100%; border-radius: var(--bb-radius-card) var(--bb-radius-card) 0 0; overflow-y: auto`.
- `dialog::backdrop`: `background: var(--bb-color-canvas); opacity: 0.8`. The builder checks in the Night screenshot that the tokens resolve inside `::backdrop`; if they do not, the tokens are also set on `dialog.bb-settings::backdrop` by name.
- Switch: the input is visually hidden but focusable; the track is `radius-pill`, `surface-raised` with a 2 px `border` outline off, `accent` on; the thumb is `on-accent` when on and `text-muted` when off (a shape move and the word "On" or "Off" carry the state). The focus ring sits on the track through `input:focus-visible + .bb-switch__track`.
- Slider: native range with `accent-color: var(--bb-color-accent)`, at least 44 px high. Disabled slider and `data-on="false"` tile: `text-muted`, dashed `border`, no opacity.
- Option tile: `surface-raised`, `radius-control`; `input:checked` tile takes `accent-tint` and `accent-strong` and shows its check glyph; disabled takes the disabled look (dashed `border`, `text-muted`).
- Transitions use `var(--bb-motion-fast)` only. No `@keyframes`.

## Playwright (`e2e/settings.spec.ts`, dev server on 5287)

A `watch(page)` helper as in `e2e/live.spec.ts` fails the test on a console error or warning (minus the known WebGL `ReadPixels` note) and on a `pageerror`.

1. **Open, change, persist**: press the Settings pill, check the dialog is open and Done is focused. By keyboard: Space on the Knock switch (state "Off", its slider disabled), arrow keys on the Voice slider (the text shows the new value), arrow to Screen only. Escape, check focus is on the Settings pill. Reload, reopen: all three are as set.
2. **Corrupt storage**: an init script sets `'{not json'`, then (second test) JSON of wrong types. The sheet shows the defaults; no console output.
3. **Knock off**: press the Knock chip: no Recent sounds row, no ghost in the "Now:" list, no Latest alert text, the pipeline Label tile shows the run, and the message is "Knock is switched off in Settings, so it raised no alert." Turn Knock on, press again: a row appears.
4. **Knock level −10 dB**: set it with `End`, press the chip: "Knock was quieter than its Settings level (−10 dB), so it raised no alert." The knock clip's loudest window is about −24 dB.
5. **Screen only**: pick it, press Knock: the pipeline Band tile says only "Band simulator"; the header pill says "Band not connected" (Chromium headless has `navigator.vibrate`, so the default shows "Phone vibration fallback" first; the test checks both).
6. **Wristband**: the radio is disabled and its caption is exactly "Needs the wristband (coming with the Bluetooth link)".
7. **Live**: a `test.describe` with `test.use` for the fake microphone arguments of `e2e/live.spec.ts` and the knock clip. With Knock off, Start listening, wait for the pipeline Label tile to show a Knock run, and check that Recent sounds has no row. Stop.
8. **Screenshots** with the sheet open: `settings-1440-day.png`, `settings-1440-night.png`, `settings-390-day.png`, `settings-390-night.png` in `e2e/screenshots/`. At 390 px the test also checks `scrollWidth <= clientWidth` for the dialog.

## Decisions (made by the owner, not to be reopened)

- Pure logic in `src/station/settings.ts` with injected storage; `settings.ts` joins the PURE list of the boundaries test.
- The settings engine wraps `createHapticEngine` and a change of settings makes a new engine. `runner.ts` and `live.ts` do not change.
- The station mutates the deps objects in place on every change.
- The simulator always plays; the phone plays when the effective output is `phone`; `band` adds nothing until F11.
- The Wristband option is shown and disabled with its honest caption. No connect button, no copy that says a band is connected.
- A native `<dialog>` with `showModal()`: a side sheet from 720 px, a bottom sheet below. No Save button, no primary pill.
- Muted runs fill the pipeline view and nothing else; Try a sound explains in one plain sentence; live shows nothing extra.
- `DESIGN.md` is rewritten for the sheet in this feature. `structure.md` is updated in a later separate step.

Choices of this design inside those decisions: `browserStorage()` is exported from `settings-panel.ts` and used by the station and the panel; the sheet shows the effective output as selected without rewriting the saved choice; a slider applies and saves on every `input` event (the value is small, so no debounce); `dbText` is a second small `format.ts` function.

## Testing strategy

| Layer | What | Where |
|---|---|---|
| Unit | defaults (frozen, all on, -50, `phone`); every field falling back alone; rounding; range edges -80, -10, -80.4, -9.9; wrong types; unknown keys; hostile getter and proxy; `parseSettings` of `null`, `''`, `'{'`, `'null'`, `'[]'`, `'42'`; round trip; `loadSettings` with a throwing `getItem` and with `null`; `saveSettings` with a throwing `setItem` is `false`; verdict edges (equal alerts, off wins); settings engine (disabled and too-quiet drop without calling or changing the inner engine, the inner rate limit still works, `RangeError` for `NaN` and `Infinity`); `isMuted`; `effectiveOutput`; `outputsFor`; `mutedText`, `dbText` | `tests/station/settings.test.ts`, `format.test.ts` |
| Property | `parseSettings` never throws and returns valid settings for any string, any `JSON.stringify(fc.anything())` and valid JSON with corrupted fields; every result field valid; round trip for every valid object; `settingsVerdict` monotonic in loudness; fixed seed, at least 100 runs | `tests/station/settings.property.test.ts` |
| Runner and live | muted decision plays on no output; `outputsFor('simulator', ...)` plays on the simulator only; changing `deps.engine` between runs takes effect | `runner.test.ts`, `live.test.ts` |
| Boundaries | `settings.ts` is pure; nothing else imports the panel | `boundaries.test.ts` |
| Styles | `settings.css`: tokens only, no `@keyframes`, no remote resource, scanner catches literals | `tests/station/settings-styles.test.ts` |
| e2e | the eight cases above, both themes, 1440 and 390 | `e2e/settings.spec.ts` |
