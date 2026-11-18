# Design: Onboarding (F15)

Requirement numbers refer to `requirements.md`.

## Overview

One pure module decides whether the intro shows and what the microphone step says. One DOM module draws the three steps. The station connects the intro to the two paths it already has: the one start path of Listening and the Settings sheet's commit path.

```
mountStation (end of mount)
  settingsPanel = mountSettings(trigger, { ..., onShowIntro: () => intro.open(trigger) })
  intro = mountOnboarding({ phoneAvailable, bandSupported, micSupport,
                            settings: settingsPanel.settings, setOutput: settingsPanel.setOutput,
                            listen: { state, start: startListening, subscribe }, onClose })
  if (shouldShowIntro(browserStorage())) intro.open(null)          first run only

onboarding-sheet.ts   <dialog class="bb-intro">   head: "Step n of 3" + [Skip intro]
   step 1 welcome   --Next-->  step 2 microphone  --Allow / Not now / Next-->  step 3 output  --Done-->
        |                          | Allow: listen.start()  (= Start listening, one path)
        |                          | micStepView(state, support): word, glyph, tint, sentence, canAllow, showNext
        |                          v
        |                    listen.subscribe(state => redraw step 2)       Listen card setState (wrapped)
        |                                                                   |
        |            step 3: mountOutputOptions('intro-output') --pick--> settingsPanel.setOutput(choice)
        |                                                                   |  save banshee-band.settings.v1, redraw sheet, apply()
   Done | Skip intro | Escape (cancel)  --> dialog close --> onClose(): markOnboarded(browserStorage())  -> 'done'
                                                             focus back to the opener, else the Listen pill
```

The flag is a second key (`banshee-band.onboarded.v1`) read once at mount. The intro touches no other storage and no network. The microphone is asked for only inside the Allow press, through `startListening`.

## Files

```
index.html                       + link to onboarding.css (edit)
src/station/
  onboarding.ts          flag key and value, isOnboarded, shouldShowIntro, markOnboarded, INTRO_STEPS,
                         micSupport, micStepView                                                  pure
  output-options.ts      option list, PHONE_OFF, BAND_OFF, shownOutput, mountOutputOptions          DOM (moved out of settings-panel.ts)
  onboarding-sheet.ts    mountOnboarding: the dialog, the three steps, the focus rules              DOM
  onboarding.css         sheet, steps, rows, disc, step bars, actions; tokens only
  settings-panel.ts      uses output-options; + settings(), setOutput(), onShowIntro, Show intro again pill (edit)
  settings.css           foot wraps (edit); .bb-option rules stay here and are reused
  station.ts             wrapped Listen state, mount order, shouldShowIntro, onClose, onShowIntro (edit)
design/DESIGN.md                 Onboarding section rewritten, Show intro again in Settings (edit)
README.md                        one line (edit)
tests/station/  onboarding.test.ts onboarding.property.test.ts onboarding-styles.test.ts output-options.test.ts (new)
                boundaries.test.ts (edit)
e2e/            fixtures.ts onboarding.spec.ts (new)
                station.spec.ts live.spec.ts settings.spec.ts latency.spec.ts band-link.spec.ts offline.spec.ts (import edit)
```

## Pure module (`onboarding.ts`)

```ts
export const ONBOARDED_STORAGE_KEY = 'banshee-band.onboarded.v1';
export const ONBOARDED_VALUE = 'done';
export const INTRO_STEPS = ['welcome', 'microphone', 'output'] as const;
export type IntroStep = (typeof INTRO_STEPS)[number];
export type MicSupport = 'ok' | 'unsupported' | 'insecure';

export function isOnboarded(text: string | null): boolean;                       // text === 'done'
export function shouldShowIntro(storage: SettingsStorage | null): boolean;
export function markOnboarded(storage: SettingsStorage | null): boolean;
export function micSupport(env: { hasGetUserMedia: boolean; isSecureContext: boolean }): MicSupport;
export interface MicStepView { word: string | null; glyph: ListenGlyph | null; tint: 'neutral' | 'accent' | 'strong' | null;
                               sentence: string; canAllow: boolean; showNext: boolean }
export function micStepView(state: ListenState, support: MicSupport): MicStepView;
```

- `isOnboarded` is one strict comparison. It does not parse: `'"done"'`, `'true'`, `' done'` and JSON are all `false`, so a damaged value shows the intro once and the close writes `'done'` over it.
- `shouldShowIntro`: `storage === null` gives `false`; else `try { return !isOnboarded(storage.getItem(KEY)) } catch { return false }`. A store that throws on read is treated as blocked.
- `markOnboarded`: `null` gives `false`; else `try { storage.setItem(KEY, 'done'); return true } catch { return false }`.
- `micSupport`: `!isSecureContext` gives `'insecure'`; else `hasGetUserMedia ? 'ok' : 'unsupported'`. This matches `toCaptureError` in `src/audio/errors.ts`, which says `insecure-context` for a missing API on an insecure page.
- `micStepView(state, support)`:

| State | Support | word, glyph, tint | sentence | canAllow | showNext |
|---|---|---|---|---|---|
| idle | ok | none | idle | true | false |
| idle | unsupported | none | unsupported | false | true |
| idle | insecure | none | insecure | false | true |
| starting | any | Starting, circle, neutral | starting | false | false |
| listening | any | Listening, dot, accent | listening | false | true |
| stopped | any | Stopped, square, neutral | stopped | false | true |
| blocked | any | Mic blocked, cross, strong | blocked | false | true |
| problem | any | Problem, cross, strong | problem | false | true |

Word, glyph and tint are read from `LISTEN_STATES`, never retyped. A Listen state other than `idle` ignores the support: the state is what happened.

Imports: `./settings` (type `SettingsStorage`), `./types` (type `ListenState`) and `./listen-status` (value `LISTEN_STATES`, type `ListenGlyph`). All three are `./x` relative imports, which the boundaries test allows for pure files.

The sentences are constants of the file (`MIC_SENTENCES`, one per case), so the unit test can compare them to the literals of Requirement 3.3.

## Shared output options (`output-options.ts`)

Moved from `settings-panel.ts` without a change of words: the `OPTIONS` list, `PHONE_OFF`, `BAND_OFF`, `checkGlyph`, and the loop that builds each `label.bb-option`.

```ts
export const PHONE_OFF = 'This browser cannot vibrate.';
export const BAND_OFF = 'This browser has no Bluetooth. Use Chrome or Edge to connect the band.';
export function shownOutput(choice: OutputChoice, phoneAvailable: boolean, bandSupported: boolean): OutputChoice;
export function mountOutputOptions(host: HTMLElement, options: {
  name: string; idPrefix: string; phoneAvailable: boolean; bandSupported: boolean;
  captions?: Partial<Record<OutputChoice, string>>; onPick(choice: OutputChoice): void;
}): { set(output: OutputChoice): void };
```

- `shownOutput` is the rule of today's `render()` in the panel: `choice === 'band' && bandSupported ? 'band' : effectiveOutput(choice, { phone: phoneAvailable, band: false })`. It is pure and the file has no top-level DOM use, so a unit test imports it.
- `mountOutputOptions` appends `div.bb-settings__options` to `host`, with one `label.bb-option[data-output]` per option: the radio, the check glyph, the name and the caption. Ids are `${idPrefix}-${value}` (caption) and `${idPrefix}-name-${value}` (name), which are the ids the Settings sheet has today (`settings-output-phone`, `settings-output-name-phone`). The radio keeps `aria-labelledby` the name and `aria-describedby` the caption.
- The caption of an option is, in order of priority: `PHONE_OFF` for Phone when it is not available, `BAND_OFF` for Wristband when Bluetooth is missing, `captions[value]`, the default. Those two options are `disabled` in the same cases.
- `set(output)` checks the radio of `shownOutput(output, ...)`. `onPick` runs on the radio `change` event only when it becomes checked, so `set` never calls it.
- The group has no `fieldset` of its own: the Settings sheet wraps it in its existing `fieldset` with the legend "Buzz on" (and its connect row), and the intro wraps it in a `div role="radiogroup"` labelled by the step's `h2`.

## Settings panel changes (`settings-panel.ts`)

```ts
export interface SettingsOptions { /* as today */ onShowIntro?(): void }
export interface SettingsPanel { open(): void; close(): void; settings(): StationSettings; setOutput(choice: OutputChoice): void }
```

- The three-radio loop is replaced by `mountOutputOptions(optionsHost, { name: 'output', idPrefix: 'settings-output', ..., onPick: (c) => commit({ ...current, output: c }) })`. `render()` calls `optionList.set(current.output)`. Everything else (the connect row, the switches, Reset) is untouched.
- `settings()` returns `current`. `setOutput(choice)` is `commit({ ...current, output: choice })`: save, render, `onChange`. It is the path the intro uses, so the station's `apply` runs and the header pill follows.
- The foot becomes `[Reset to defaults] [Show intro again]` (`data-settings="reset"` and `data-settings="intro"`), both secondary, and wraps (`flex-wrap`, `gap: var(--bb-space-2)` in `settings.css`). The second pill exists only when `onShowIntro` is given.
- Show intro again: `skipFocusReturn = true; dialog.close(); options.onShowIntro?.()`. The `close` handler does `if (skipFocusReturn) skipFocusReturn = false; else trigger.focus()`. Without the flag the handler, which runs as a queued task after the intro has opened, would try to focus the Settings pill while the modal intro makes it inert; the flag keeps the order simple and the intro returns the focus itself when it closes.

## The intro sheet (`onboarding-sheet.ts`)

```ts
export interface OnboardingOptions {
  phoneAvailable: boolean; bandSupported: boolean; micSupport: MicSupport;
  settings(): StationSettings; setOutput(choice: OutputChoice): void;
  listen: { state(): ListenState; start(): void; subscribe(fn: (state: ListenState) => void): () => void };
  onClose(): void;
}
export interface Onboarding { open(returnFocus?: HTMLElement | null): void; close(): void; readonly isOpen: boolean }
export function mountOnboarding(options: OnboardingOptions): Onboarding;
```

DOM, built at `open()` and removed after the `close` event (so a closed intro has no primary pill in the page and a new open starts at step 1):

```
<dialog class="bb-intro" aria-labelledby="intro-title-welcome">
  <div class="bb-intro__head">
    <div class="bb-intro__progress"><span class="bb-intro__count">Step 1 of 3</span>
         <span class="bb-intro__bars" aria-hidden="true"><i data-on="true"></i><i></i><i></i></span></div>
    <button type="button" class="bb-pill bb-pill--secondary" data-intro="skip">Skip intro</button>
  </div>
  <section class="bb-intro__step" data-step="welcome">
    <span class="bb-intro__disc" aria-hidden="true">[ghost]</span>
    <h2 class="bb-title" id="intro-title-welcome" tabindex="-1">Welcome to Banshee Band</h2>
    <p class="bb-intro__lede">Sounds you cannot hear, seen as ghosts and felt as a buzz.</p>
    <ol class="bb-intro__rows"><li><span class="bb-intro__num" aria-hidden="true">1</span><span>It listens for ...</span></li> ...</ol>
    <p class="bb-intro__aid"><svg class="bb-note__glyph" aria-hidden="true">...</svg><span>Banshee Band is an aid, ...</span></p>
    <div class="bb-intro__actions"><button class="bb-pill bb-pill--primary" data-intro="next">Next</button></div>
  </section>
  <section class="bb-intro__step" data-step="microphone" hidden> ... </section>
  <section class="bb-intro__step" data-step="output" hidden> ... </section>
</dialog>
```

Each step is a section with `hidden` except the current one. `open()` builds the dialog, appends it to `document.body`, calls `showModal()`, then `h2.focus()` of step 1 (the browser would otherwise focus Skip intro). `isOpen` is `dialog?.open ?? false`.

**Step change** `go(step)`: sets `hidden`, updates the count text and the bars, sets `aria-labelledby` to the new h2's id and focuses that h2. The step 3 radios get `set(options.settings().output)` on entry. The current step is a local variable.

**Step 2** has the status pill (`span.bb-status[role=status]`), the polite sentence and three action pills, all inside the step. `drawMic()` runs on entry and on every `listen.subscribe` call:

```
view = micStepView(options.listen.state(), options.micSupport)
sentence.textContent = view.sentence
pill.hidden = view.word === null;  if shown: renderPill(pill, { text: view.word, tint: view.tint, glyph: view.glyph, ...GLYPHS[view.glyph] })
const choosing = !view.showNext && options.micSupport === 'ok'      // Allow and Not now
allow.hidden = notNow.hidden = !choosing;  next.hidden = !view.showNext
allow.toggleAttribute('aria-disabled', !view.canAllow)  (as attribute 'true'/removed, like the Listen card)
if (step is 'microphone' and next just appeared and focus is on allow or notNow) next.focus()
```

`allow` click: `if (view.canAllow) options.listen.start()`. A press while starting does nothing. With no support the step is Back and Next only, and the pill is hidden. The focus rule moves to Next only when the focus was on a removed pill (the activeElement check), and not on entry, where the h2 rule applies.

**Step 3** mounts `mountOutputOptions(radioHost, { name: 'intro-output', idPrefix: 'intro-output', phoneAvailable, bandSupported, captions: { band: INTRO_BAND_CAPTION }, onPick: (c) => { options.setOutput(c); radios.set(options.settings().output) } })`. The `radiogroup` is labelled by the step's h2. `INTRO_BAND_CAPTION` is "Needs the Banshee Band wristband (DIY hardware, not sold). Connect it in Settings. Until then alerts show on the screen." Picking Wristband stores `band`; the station's effective output stays Screen only until the band connects, and the header pill says so, as in the Settings sheet.

**Close.** One handler on the dialog `close` event serves Done, Skip intro and Escape (Escape is the native `cancel`, which closes the dialog with no `preventDefault`), and the programmatic `close()`:

```
unsubscribe(); dialog.remove(); 
if (returnFocus?.isConnected) returnFocus.focus();
options.onClose();
```

`onClose` in the station calls `markOnboarded(browserStorage())` and, when the intro was opened with no element (`openedFrom === null`), focuses the Listen card's visible pill. The sheet itself touches no storage.

## Station wiring (`station.ts`)

```ts
// The Listen card, wrapped: the station knows the state and tells the intro.
const listenCard = mountListenCard(listenCardEl, { onStart: () => void startListening(), onStop: () => void live?.stop() });
let listenState: ListenState = 'idle';
const listenSubscribers = new Set<(s: ListenState) => void>();
const listen = {
  setState(state, message = null) { listenState = state; listenCard.setState(state, message); for (const fn of [...listenSubscribers]) fn(state); },
  setMessage: (text) => listenCard.setMessage(text),
};
```

`startListening`, which calls `listen.setState(...)` (it is declared before `listen`, as today), is unchanged apart from the wrapper's name being the same, so no call site changes. Subscribers run after the card has drawn the state.

```ts
const settingsTrigger = document.getElementById('settings-open');
if (settingsTrigger) {
  let intro: Onboarding | null = null;
  let openedFrom: HTMLElement | null = null;
  const panel = mountSettings(settingsTrigger, { settings, phoneAvailable: vibrates, band, onChange: apply,
    onShowIntro: () => { openedFrom = settingsTrigger; intro?.open(settingsTrigger); } });
  intro = mountOnboarding({
    phoneAvailable: vibrates, bandSupported: band.state() !== 'unsupported',
    micSupport: micSupport({ hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function', isSecureContext: window.isSecureContext }),
    settings: panel.settings, setOutput: panel.setOutput,
    listen: { state: () => listenState, start: () => void startListening(), subscribe: (fn) => { listenSubscribers.add(fn); return () => void listenSubscribers.delete(fn) } },
    onClose: () => { markOnboarded(browserStorage()); if (!openedFrom) focusListenPill(); openedFrom = null; },
  });
  if (shouldShowIntro(browserStorage())) { openedFrom = null; intro.open(null); }
}
```

`focusListenPill()` focuses `[data-listen="stop"]` when it is visible, else `[data-listen="start"]`, inside the Listen card. `listen.ts`'s own `setState` focus moves (`stop.focus()` when listening begins) do nothing while the modal intro makes the card inert, and the pill the user needs when the intro closes is the one the rule above picks. `navigator.mediaDevices?.getUserMedia` is read once at mount.

`mountSettings` keeps being called exactly where it is today (only its return value is kept), so the Settings sheet's mount order does not change. `mountOnboarding` runs after it and before `loadManifest`.

## Styles (`onboarding.css`)

Only tokens; pixel literals 1 to 3 px only. The sizes come from the space tokens, as in `settings.css`.

- **Sheet, phone first.** `.bb-intro`: `position: fixed; inset: auto 0 0 0; width: 100%; max-width: none; max-height: calc(100dvh - var(--bb-space-5)); margin: 0; padding: var(--bb-space-4) ...; border: 0; border-radius: var(--bb-radius-card) var(--bb-radius-card) 0 0; background: var(--bb-color-surface); box-shadow: var(--bb-shadow-soft); overflow-y: auto; overflow-x: hidden`. `.bb-intro[open] { display: grid; gap: var(--bb-space-5); align-content: start }`. `::backdrop`: `var(--bb-color-canvas)` at `opacity: 0.8`, as `settings.css`.
- **Desktop** (`min-width: 720px`): `inset: 0; margin: auto; height: fit-content; width: min(calc(var(--bb-space-8) * 8 + var(--bb-space-5) * 2), calc(100vw - var(--bb-space-4) * 2)); padding: var(--bb-space-6); border-radius: var(--bb-radius-card)`. That is 560 px and a floating centred card. The content scrolls inside when the viewport is short (`max-height` as above).
- **Head**: flex row, count caption (`caption` step, `text-muted`) with three bars (`var(--bb-space-5)` wide, `var(--bb-space-1)` high, `radius-pill`; `data-on="true"` bars take `accent`, the others `border`), and the Skip intro pill on the right.
- **Disc**: `var(--bb-space-8)` round, `accent-tint`, centred picture. The ghost and the microphone and band glyphs are `accent-strong` or the ghost fill tokens on the tint (rows 3.14 to 11.25 of the Contrast table: "Ghost fill on field ring", "Ghost outline on field ring", "Accent text on tint").
- **Title and lede**: `h2` uses the `title` type step (`--bb-type-title-*`), `text`; the lede is `body`, `text-muted`.
- **Rows** (step 1): flex rows with a `var(--bb-space-6)` round `accent` disc and the number in `on-accent` ("Text on accent fill"), then the sentence in `text`.
- **Aid tile**: `surface-raised`, `radius-control`, `var(--bb-space-4)` padding, the info glyph (as the `.bb-note__glyph` of the footer) and the sentence in `text`; no border.
- **Step 2 status**: the pill is the shared `.bb-status` look from `styleguide.css` and `station.css`. Hidden while idle by the `hidden` attribute.
- **Actions**: phone, `display: grid; gap: var(--bb-space-2)` with every pill `width: 100%` in DOM order (Back, Not now, Allow), so the primary pill is last and nearest the thumb. Desktop: `display: flex; justify-content: flex-end; gap: var(--bb-space-2)` and the Back pill `margin-inline-end: auto`.
- **Disabled Allow** (`aria-disabled="true"`): the disabled look of Pills (`surface-raised`, dashed `border`, `text-muted`), the label unchanged.
- **Motion**: `.bb-intro` and `.bb-intro__step` have `transition-property: opacity, transform; transition-duration: var(--bb-motion-slow)`; a top-level `@starting-style { .bb-intro[open], .bb-intro__step { opacity: 0; transform: translateY(var(--bb-space-2)) } }` gives the fade and rise on open and on each step (a `hidden` step shown again starts from the same style). No `@keyframes`. The reduced-motion query sets `transition: none` on both as a second guard; the token is already `0s`.
- The radios are the `.bb-option` tiles of `settings.css`; the intro only lays them out (`.bb-intro__options { display: grid; gap: var(--bb-space-2) }`).

The Contrast table needs no new row. The pairs used: text and muted text on card and on tile; `accent-strong` on `accent-tint` (disc glyph, selected radio); `on-accent` on `accent` (the number discs); `accent` and `border` on card (the step bars, UI marks); the status pill pairs; the primary pill on card and its Night outline; the secondary pill boundary on card; the focus ring on card. The builder checks each against `design/DESIGN.md` and adds a row to the table and to `tests/ui` only if one is missing.

## Playwright (`e2e/onboarding.spec.ts`, dev server on 5287)

`test.use({ onboarded: false })` for the file, with the fake-microphone launch arguments of `e2e/live.spec.ts`. A `watch(page)` helper as in `live.spec.ts` fails a test on a console error or warning (minus the known WebGL `ReadPixels` note) and on a `pageerror`. Locators scope to `dialog.bb-intro`.

1. **First run at 1440 Day**: the intro is open, the focus is on the step 1 `h2`, the count says "Step 1 of 3", the aid sentence is there, one primary pill shows (Next). Next, Allow microphone with the fake microphone: the step shows the pill "Listening" and "Next" replaces Allow and Not now, with the focus on Next. Next, pick Screen only, the header pill says "Band not connected", Done. Both keys are saved (`'done'` and the settings with `output: 'simulator'`). The Listen card shows Listening. A reload shows no intro. The screenshot `onboarding-1440-day.png` is taken at step 1.
2. **1440 Night**: step 2 idle, Night theme, `onboarding-1440-night.png`.
3. **Phone 390 Night first run**: no horizontal scroll (`scrollWidth <= clientWidth` of the dialog), the sheet is full width and touches the bottom, every pill and radio is at least 44 px, the actions stack with the primary last (its box is below the others). Screenshots `onboarding-390-day.png` (step 1, Day), `onboarding-390-night.png` (step 2, Night) and `onboarding-output-390-night.png` (step 3). Skip intro closes it with the focus on Start listening, and a reload does not show it again.
4. **Escape** closes the intro and marks it; the focus is on Start listening; a reload shows nothing.
5. **Denied**: `getUserMedia` rejects with `NotAllowedError` (the init script of `live.spec.ts`). Allow shows "Mic blocked" and the blocked sentence, Next works, and after Done a Try a sound chip still adds a Recent sounds row.
6. **No `navigator.mediaDevices`**: the step shows no Allow microphone and no Not now, the unsupported sentence, Back and Next.
7. **Corrupt flag** (`'yes'` set by an init script): the intro shows. Closing writes `'done'`.
8. **Blocked `localStorage`** (a throwing getter): no intro, the station works, a Try a sound chip works, and the footer keeps the aid sentence.
9. **Show intro again**: Settings, "Show intro again" opens step 1 and the Settings sheet is closed. Done closes it and the focus is on the Settings pill.
10. **Keyboard**: Tab and Shift+Tab stay in the sheet and reach, in order, Skip intro, Next (step 1); Skip intro, Back, Not now, Allow microphone (step 2); Skip intro, the radio group, Back, Done (step 3). Arrow keys move the radios.
11. **Reduced motion**: with `emulateMedia({ reducedMotion: 'reduce' })` the computed `transition-duration` of the dialog and of the visible step is `0s` in every part.
12. **Already listening**: start listening from the Listen card, then open the intro from Settings and go to step 2: it shows Listening and Next and no Allow microphone.
13. **Wristband caption**: step 3 shows the literal caption of Requirement 10.4; without Web Bluetooth (the init script of `e2e/settings.spec.ts`) the Wristband radio is disabled with `BAND_OFF`.

Every case ends with `expect(problems).toEqual([])`.

## Decisions (made by the owner, not to be reopened)

- Pure flag logic in `src/station/onboarding.ts` with injected storage, in its own key `banshee-band.onboarded.v1` (`'done'`), so a corrupt settings value never brings the intro back and a corrupt flag never touches the settings. `onboarding.ts` joins the PURE list of the boundaries test.
- A blocked or throwing store shows no intro: it cannot remember a dismissal, so the intro would cover the station on every visit. The footer keeps the aid sentence and Settings can still open it.
- The Buzz on option list, the radio tile builder and the shown-as-chosen rule move to `output-options.ts` and serve both the Settings sheet and the intro. The Settings sheet looks and behaves as before.
- `mountSettings` returns `settings()` and `setOutput(choice)` (the same commit path) and takes `onShowIntro`; the Settings foot gets "Show intro again".
- The intro is a native `<dialog>` with `showModal()` in `onboarding-sheet.ts`: three steps, Skip intro on every step, Escape closes, Done, Skip and Escape all mark it seen. The step's `h2` labels it. Each step change focuses the new `h2`.
- Allow microphone calls the station's one start path (`startListening`), and the step shows the Listen status pill words and glyphs plus a plain sentence. A denied, unsupported or failed microphone leaves the sample clips usable.
- The Wristband option is honest about hardware: DIY, not sold, connected in Settings, the screen is used until then.
- Layout: a centred 560 px card from 720 px, a bottom sheet below, 44 px targets, stacked actions with the primary last on a phone. Motion is a `--bb-motion-slow` transition with `@starting-style`, no `@keyframes`.
- The e2e specs get `e2e/fixtures.ts` that marks the intro as seen unless `onboarded: false`.
- `DESIGN.md` is rewritten for the intro in this feature. `structure.md` is updated in a later separate step.

Choices of this design inside those decisions (each needs a yes or no from the owner):

- The DOM of the intro is built at each `open()` and removed after `close`, so the closed page has no extra primary pill (the existing `live.spec.ts` counts one) and each open starts at step 1.
- `micSupport` says `'insecure'` whenever the page is not a secure context, even if `getUserMedia` exists, to match `toCaptureError`.
- A `stopped` Listen state (the intro opened after the user pressed Stop) shows the Stopped pill, the sentence "The microphone is off. Press Start listening on the station when you want it on." and Next. The owner's sentence list had no `stopped` case.
- Step 2 has a muted lede, "The microphone is how Banshee Band hears the sounds around you. Your browser asks once.", for the "why it is needed" and "asked once" parts of the brief; the idle sentence says the rest.
- While starting, Not now stays pressable; it goes to step 3 and the start continues in the background.
- The literal Wristband caption of Requirement 10.4.
- Two extra boundary checks (only `station.ts` imports `onboarding-sheet.ts`; only `settings-panel.ts` and `onboarding-sheet.ts` import `output-options.ts`), alongside the PURE entry.
- Closing the intro never stops or starts the microphone.

## Testing strategy

| Layer | What | Where |
|---|---|---|
| Unit | `isOnboarded` for `'done'`, `null`, `''`, `'Done'`, `' done'`, `'true'`, `'"done"'`, `'{"done":true}'`, `'1'`; `shouldShowIntro` with an empty store, a set flag, a corrupt flag, a throwing `getItem` and `null`; `markOnboarded` with a working store (then `shouldShowIntro` is `false`), a throwing `setItem` and `null`; the settings key is never read or written (a recording store); `INTRO_STEPS`; `micSupport` for all four combinations; `micStepView` for every Listen state and each support (the sentences as literals, `canAllow` only for idle and `ok`, `showNext` after an outcome or without support, word, glyph and tint equal to `LISTEN_STATES`) | `tests/station/onboarding.test.ts` |
| Unit | `shownOutput` for every choice with every combination of phone and Bluetooth availability, including the saved-choice-not-rewritten case | `tests/station/output-options.test.ts` |
| Property | `isOnboarded` is `true` only for `'done'`; `shouldShowIntro` never throws for any stored string or a throwing store; `markOnboarded` never throws; fixed seed, at least 100 runs | `tests/station/onboarding.property.test.ts` |
| Boundaries | `onboarding.ts` is pure; only `station.ts` imports `onboarding-sheet.ts`; only `settings-panel.ts` and `onboarding-sheet.ts` import `output-options.ts` | `tests/station/boundaries.test.ts` |
| Styles | `onboarding.css`: tokens only, no `@keyframes`, no remote resource, only the two media queries, linked from `index.html`, the scanner catches literals | `tests/station/onboarding-styles.test.ts` |
| e2e | the thirteen cases above, both themes, 1440 and 390; the Settings tab order with Show intro again | `e2e/onboarding.spec.ts`, `e2e/settings.spec.ts` |
| Regression | the existing specs run through the fixture with the intro marked as seen | `e2e/station.spec.ts`, `live.spec.ts`, `settings.spec.ts`, `latency.spec.ts`, `band-link.spec.ts`, `offline.spec.ts` |
