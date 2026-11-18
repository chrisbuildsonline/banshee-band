# Requirements: Onboarding (F15)

## Introduction

The listening station (`index.html`) opens straight on the Listen and Try a sound cards. A first-time visitor gets no word on what Banshee Band is, no sentence that it is an aid and not a safety device before they rely on it, no explanation of the microphone before the browser asks, and no prompt to choose where alerts buzz. This feature adds a first-run intro: a short three-step sheet over the station, shown once.

1. **Welcome**: what Banshee Band is (it listens for doorbells, knocks, alarms, a baby, vehicles and voices; it shows each sound as a ghost on the side it came from, with a line of text; it buzzes a pattern on the phone or the wristband, stronger on that side) and the honest line, the exact sentence of `design/DESIGN.md` Principle 6.
2. **Microphone**: why it is needed, that the browser asks once, and that the sound is processed on this device and never recorded or sent. An **Allow microphone** pill starts listening through the station's existing Start listening path, so the real permission prompt appears after the press. The step then shows the outcome with the Listen status pill words and glyphs plus one plain sentence. When the microphone is denied, unsupported or fails, the sample clips (the zero-key path) stay usable and the sentence says so.
3. **Where should alerts buzz?**: Phone vibration, Screen only or Wristband, the same three radios as the Settings sheet's Buzz on, writing the same settings store.

The intro is skippable on every step (a **Skip intro** pill and Escape), shown once on this device, and can be opened again from the Settings sheet with a **Show intro again** secondary pill. It replaces the old Onboarding section of `design/DESIGN.md` (one card with Allow microphone and Use sample clips), which was never built.

The station stays an aid and not a safety device. The page footer keeps the exact aid sentence, and step 1 repeats it. The intro adds no way to alert and changes no default: a visitor who skips it gets the station exactly as before, with the Settings defaults.

Decisions already made by the owner (listed again in `design.md`): the flag logic is the pure `src/station/onboarding.ts` with its own storage key `banshee-band.onboarded.v1`; the Buzz on radios move into a shared `src/station/output-options.ts`; the sheet is a native `<dialog>` in `src/station/onboarding-sheet.ts`; the Allow button calls the station's one start path; a blocked store shows no intro; the e2e specs get a shared fixture that marks the intro as seen.

Terms:

- **Intro**: the three-step sheet.
- **Step**: one of `INTRO_STEPS`: `welcome`, `microphone`, `output`.
- **Flag**: the stored text `'done'` under `banshee-band.onboarded.v1`, set when the intro closes by any path.
- **Mic support**: `'ok'`, `'unsupported'` (no `getUserMedia`) or `'insecure'` (not a secure context).
- **Mic step view**: what step 2 shows for a Listen state and a mic support: pill word, glyph and tint (or none), the sentence, whether Allow can be pressed and whether Next shows.
- **Outcome**: a Listen state of `listening`, `blocked`, `problem` or `stopped`, the end of the Allow press.
- **Listen state**: the `ListenState` of `src/station/types.ts` (`idle`, `starting`, `listening`, `stopped`, `blocked`, `problem`).

## Requirements

### Requirement 1: Module boundaries and privacy

**User story:** As a developer, I want the intro rules in one tested pure module and the screen in its own files, and as a user, I want nothing stored but a flag that says I saw it.

#### Acceptance criteria

1. THE flag rules and the microphone step logic SHALL live in `src/station/onboarding.ts`, a pure file with the same ban as the other pure station files: no `document`, `window`, `navigator`, `localStorage`, `fetch`, `console`, `Math.random` or `Date`. Storage is injected. `onboarding.ts` SHALL be added to the PURE list of `tests/station/boundaries.test.ts`.
2. THE shared radios SHALL live in `src/station/output-options.ts` and the sheet in `src/station/onboarding-sheet.ts` and `src/station/onboarding.css`. Only `settings-panel.ts` and `onboarding-sheet.ts` SHALL import `output-options.ts`. Only `station.ts` SHALL import `onboarding-sheet.ts`. Only `src/main.ts` imports `src/station`.
3. THE feature SHALL NOT change `src/audio`, `src/classify`, `src/bearing`, `src/haptics`, `src/band`, `src/events`, `src/ghosts` or `src/pwa`, SHALL NOT change `runner.ts`, `live.ts`, `listen.ts`, `listen-status.ts` or `settings.ts`, and SHALL NOT add a dependency to `package.json`.
4. THE only new data the page stores SHALL be the flag: the text `done` under the key `banshee-band.onboarded.v1` in `localStorage`. This amends settings Requirement 1.4 (the settings JSON was the only stored data): the page now stores two keys, and no audio, event, label or personal data. Nothing leaves the device (`.kiro/steering/privacy.md`).
5. THE intro SHALL ask for no permission and call no `getUserMedia` until the Allow microphone pill is pressed, and SHALL make no network request.
6. THE new code SHALL contain no `console` call. EVERY exported function, constant and type of the new files SHALL have a short doc comment.

### Requirement 2: The first-run flag

**User story:** As a user, I want the intro to appear once and never come back by accident, and I want a damaged or blocked store never to trap me behind it.

#### Acceptance criteria

1. `onboarding.ts` SHALL export `ONBOARDED_STORAGE_KEY` (`'banshee-band.onboarded.v1'`), `ONBOARDED_VALUE` (`'done'`), `INTRO_STEPS` (`['welcome', 'microphone', 'output']` as a `const` tuple) and the type `IntroStep`.
2. `isOnboarded(text)` SHALL return `true` exactly when `text === 'done'`. Anything else (`null`, `''`, `'Done'`, `' done'`, `'true'`, `'"done"'`, `'{"done":true}'`, `'1'`) SHALL be `false`. It SHALL never throw.
3. `shouldShowIntro(storage)` SHALL read the flag with `getItem` and return `true` when the read works and the flag is not set. It SHALL return `false` when `storage` is `null` or `getItem` throws: a blocked store cannot remember a dismissal, so the intro would cover the station on every visit. It SHALL never throw.
4. `markOnboarded(storage)` SHALL write `ONBOARDED_VALUE` under `ONBOARDED_STORAGE_KEY` and return `true`. It SHALL return `false` when `storage` is `null` or `setItem` throws. It SHALL never throw. After a `true`, `shouldShowIntro` on the same store SHALL be `false`.
5. THE flag SHALL have its own key, so that a corrupt settings value never brings the intro back and a corrupt flag never changes the settings. `shouldShowIntro` and `markOnboarded` SHALL never read or write `banshee-band.settings.v1`, and `loadSettings` and `saveSettings` never touch the flag key.
6. A flag that is set to anything but `'done'` SHALL show the intro, and closing it SHALL write `'done'` over it.

### Requirement 3: The microphone step logic

**User story:** As a user, I want step 2 to tell me in plain words what happened to the microphone, and what still works when it did not start.

#### Acceptance criteria

1. `micSupport(env)` SHALL return `'ok'` when `env.hasGetUserMedia` and `env.isSecureContext` are both true, `'insecure'` when `env.isSecureContext` is false, and `'unsupported'` when `env.isSecureContext` is true and `env.hasGetUserMedia` is false. All four combinations SHALL be tested.
2. `micStepView(state, support)` SHALL return `{ word, glyph, tint, sentence, canAllow, showNext }`. For a Listen state other than `idle` it SHALL take `word`, `glyph` and `tint` from `LISTEN_STATES` of `listen-status.ts` (Starting, Listening, Stopped, Mic blocked, Problem), and the mic support SHALL NOT change the view. For `idle` the view follows the support: `word`, `glyph` and `tint` are `null` (no pill) in all three cases.
3. THE sentences SHALL be exactly:
   - idle, `ok`: "Banshee Band asks for the microphone only after you press Allow microphone. The sound is processed on this device and never recorded or sent."
   - starting: "Getting ready. Your browser may ask you to allow the microphone."
   - listening: "The microphone is on. Sounds will show on the station as ghosts."
   - blocked: "The microphone is blocked. That is fine: the sample clips work without it, and you can allow it later in your browser's site settings."
   - problem: "The microphone could not start. The sample clips still work."
   - idle, `unsupported`: "This browser cannot use a microphone here. The sample clips still work."
   - idle, `insecure`: "The microphone needs a secure page (https or localhost). The sample clips still work."
   - stopped: "The microphone is off. Press Start listening on the station when you want it on."
4. `canAllow` SHALL be `true` only for `idle` with `ok`. `showNext` SHALL be `true` for every Listen state except `idle` and `starting`, and for `idle` with `unsupported` or `insecure`. It SHALL be `false` for `idle` with `ok` and for `starting`.
5. THE function SHALL be pure and total: every one of the six Listen states with every one of the three supports gives a view.

### Requirement 4: Shared output options

**User story:** As a user, I want the same three buzz choices, with the same words and the same honesty, wherever I make the choice.

#### Acceptance criteria

1. `output-options.ts` SHALL hold the Buzz on option list (the three names and captions), `PHONE_OFF` ("This browser cannot vibrate."), `BAND_OFF` ("This browser has no Bluetooth. Use Chrome or Edge to connect the band."), the radio tile builder and the rule for which option shows as chosen. These SHALL be moved out of `settings-panel.ts` without a change of words or behaviour.
2. `shownOutput(choice, phoneAvailable, bandSupported)` SHALL be pure and SHALL return `'band'` when `choice` is `'band'` and `bandSupported`, else `effectiveOutput(choice, { phone: phoneAvailable, band: false })`. A saved choice that cannot be used is shown as Screen only and never rewritten.
3. `mountOutputOptions(host, { name, idPrefix, phoneAvailable, bandSupported, captions?, onPick })` SHALL append three native radios drawn as option tiles to `host`, return `{ set(output) }`, call `onPick(choice)` when a radio becomes checked by the user, and make `set(output)` check the radio that `shownOutput` gives, without calling `onPick`. The radios SHALL share the given `name`, so each group is one tab stop and the arrow keys move the choice.
4. EVERY element id SHALL start with `idPrefix`. The Settings sheet SHALL pass `name: 'output'` and `idPrefix: 'settings-output'` (the ids it has today) and the intro `name: 'intro-output'` and `idPrefix: 'intro-output'`.
5. `captions` SHALL replace the default caption of an option. A caption that says the option is unavailable (`PHONE_OFF`, `BAND_OFF`) SHALL win over `captions`, and the radio SHALL be disabled, as today.
6. THE Settings sheet SHALL look and behave exactly as before: the existing checks of `e2e/settings.spec.ts` (words, descriptions, disabled states, the tab order up to Reset to defaults, the screenshots) SHALL pass unchanged except for Requirement 5.

### Requirement 5: The Settings sheet reopens the intro

**User story:** As a user who skipped the intro, I want to read it again.

#### Acceptance criteria

1. `mountSettings` SHALL return `{ open(), close(), settings(), setOutput(choice) }` and take an optional `onShowIntro()` in its options. `settings()` SHALL return the settings in force. `setOutput(choice)` SHALL commit `{ ...current, output: choice }` through the same path as a radio change: save, redraw the sheet's controls, then `onChange`.
2. THE sheet foot SHALL hold, in this order, the "Reset to defaults" secondary pill and a "Show intro again" secondary pill (`data-settings="intro"`). THE foot SHALL wrap on a narrow sheet.
3. WHEN "Show intro again" is pressed, THE sheet SHALL close and call `onShowIntro()`. THE sheet's own close handler SHALL NOT move the focus to the Settings pill for this close, because the intro returns it there when it closes.
4. THE tab order of the sheet SHALL end with Reset to defaults and then Show intro again. THE sheet SHALL still have no primary pill and no Save button.
5. WHEN `onShowIntro` is not given, THE sheet SHALL show no such pill.

### Requirement 6: When the intro opens and closes

**User story:** As a first-time user, I want to see the intro once, before I rely on the station, and to be able to leave it at any point.

#### Acceptance criteria

1. AT mount, after the Settings sheet is mounted, THE station SHALL call `shouldShowIntro(browserStorage())` once, and open the intro when it is `true`. A page without a Settings pill has no intro.
2. THE intro SHALL close by Done, by Skip intro and by Escape (the dialog's `cancel` event). EVERY close SHALL call `markOnboarded(browserStorage())`, and a reload after any of them SHALL NOT show the intro.
3. WHEN the store is blocked (`browserStorage()` is `null`) or its `getItem` throws, THE intro SHALL NOT open on its own, the station SHALL work as before, and the footer SHALL keep the aid sentence. THE Settings sheet's Show intro again SHALL still open it. WHEN the flag cannot be written, THE close SHALL show no error and write nothing to the console.
4. WHEN the flag is corrupt (set, but not `'done'`), THE intro SHALL open, and closing it SHALL write `'done'`.
5. THE Show intro again pill SHALL open the intro at step 1 whatever the flag says.
6. CLOSING the intro SHALL NOT start or stop the microphone. A microphone started from step 2 keeps listening after Done, Skip intro or Escape, and the Listen card shows Listening and Stop.
7. ON close, THE focus SHALL return to the element given to `open` when it is still in the page (the Settings pill when opened from Settings). WHEN none was given (the first run), THE focus SHALL go to the Listen card's visible pill: Start listening, or Stop while listening.

### Requirement 7: The intro sheet

**User story:** As a user, I want one calm sheet that keeps me in place and does not trap me.

#### Acceptance criteria

1. `mountOnboarding(options)` in `onboarding-sheet.ts` SHALL return `{ open(returnFocus?: HTMLElement | null): void; close(): void; readonly isOpen: boolean }`. Its options SHALL be `phoneAvailable`, `bandSupported`, `micSupport`, `settings()`, `setOutput(choice)`, `listen` (`state()`, `start()` and `subscribe(fn)` returning an unsubscribe function) and `onClose()`.
2. THE sheet SHALL be a native `<dialog>` opened with `showModal()`: the station behind is inert and the focus is trapped. It SHALL be labelled by the `h2` of the current step (`aria-labelledby` follows each step change) and described by nothing else.
3. THE sheet's DOM SHALL be built at each `open()` and removed after it closes, so a closed intro adds no pill to the page and each open starts at step 1 with fresh state. `open()` while open SHALL do nothing. `close()` while closed SHALL do nothing.
4. THE head row SHALL hold the step indicator and the "Skip intro" secondary pill, in that order, on every step. THE indicator SHALL be the muted caption "Step 1 of 3", "Step 2 of 3" or "Step 3 of 3", with three short decorative bars beside it (`aria-hidden`); the text is the meaning.
5. EVERY step SHALL have a decorative picture in a round `accent-tint` disc (`aria-hidden`), a `title`-step `h2` with `tabindex="-1"`, its text and its actions. ONLY the current step SHALL be visible.
6. OPENING SHALL focus the step 1 `h2`. EVERY step change SHALL move the focus to the new step's `h2`.
7. AT most one primary pill SHALL show in the sheet at a time. Back, Not now and Skip intro are secondary pills.
8. THE aid sentence SHALL appear in step 1 only. THE intro SHALL promise no protection and SHALL NOT imply that it replaces a smoke alarm (`.kiro/steering/product.md`).

### Requirement 8: Step 1, Welcome

**User story:** As a first-time user, I want to know in a few lines what this does, and that it is not a safety device.

#### Acceptance criteria

1. THE step SHALL show a decorative ghost in the disc, the `h2` "Welcome to Banshee Band", the muted lede "Sounds you cannot hear, seen as ghosts and felt as a buzz.", and three rows, each a numbered accent disc (1, 2, 3) and one sentence:
   1. "It listens for doorbells, knocks, alarms, a baby, vehicles and voices."
   2. "It shows each sound as a ghost on the side it came from, with a line of text."
   3. "It buzzes a pattern on the phone or the wristband, stronger on that side."
2. BELOW the rows THE step SHALL show the aid sentence, exactly: "Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices." It SHALL sit in a `surface-raised` tile with the info glyph (`aria-hidden`).
3. THE actions SHALL be one primary pill, "Next", that goes to step 2. There SHALL be no Back.

### Requirement 9: Step 2, Microphone

**User story:** As a user, I want to decide about the microphone with the reason in front of me, and to see at once whether it worked.

#### Acceptance criteria

1. THE step SHALL show a decorative microphone glyph in the disc, the `h2` "Turn on the microphone", the muted lede "The microphone is how Banshee Band hears the sounds around you. Your browser asks once.", the sentence of `micStepView`, and the Listen-style status pill.
2. THE sentence SHALL be a polite live region. THE status pill SHALL be `role="status"`, hidden while `micStepView` gives no word, and drawn with the word, glyph and tint of `LISTEN_STATES` through `renderPill` and `GLYPHS`, so Starting, Listening, Stopped, Mic blocked and Problem look as they do in the Listen card.
3. THE actions SHALL be, in DOM order: "Back" (secondary), "Not now" (secondary, goes to step 3) and "Allow microphone" (primary). "Allow microphone" SHALL call `listen.start()`, the same function the Listen card's Start listening pill calls, so the permission prompt appears after the press and nothing is duplicated. WHILE the state is `starting`, Allow SHALL be `aria-disabled` and a second press SHALL do nothing.
4. AFTER an outcome (`showNext`), Allow microphone and Not now SHALL be replaced by "Next" (primary, goes to step 3), and THE focus SHALL move to Next when it was on one of the removed pills.
5. WITH no microphone support (`unsupported` or `insecure`), THE step SHALL show no Allow microphone and no Not now: Back and Next only, and the sentence says why.
6. WHEN the intro is opened while listening, THE step SHALL show Listening and Next at once, with no Allow microphone.
7. A DENIED permission (`getUserMedia` rejects with `NotAllowedError`), an unsupported browser and a failed start SHALL leave the sample clips usable: Next works, and a Try a sound chip pressed afterwards adds a row as usual.
8. THE step SHALL follow the Listen state live: the sheet subscribes through `listen.subscribe` while open and unsubscribes at close.

### Requirement 10: Step 3, Where should alerts buzz?

**User story:** As a user, I want to choose phone, screen or wristband before the first alert, and be told plainly what the wristband needs.

#### Acceptance criteria

1. THE step SHALL show a decorative band glyph in the disc, the `h2` "Where should alerts buzz?", the muted lede "You can change this any time in Settings.", and the shared output radios (name `intro-output`) showing the current choice.
2. A CHANGE SHALL call `setOutput(choice)` at once, so the settings store `banshee-band.settings.v1` is written through the Settings sheet's own commit path and the station applies it (the header status pill follows). There SHALL be no separate save.
3. THE radios SHALL show the current choice each time the step is entered, from `settings()`, and the same rule as the Settings sheet applies to a choice that cannot be used (Requirement 4.2).
4. THE Wristband caption SHALL read exactly "Needs the Banshee Band wristband (DIY hardware, not sold). Connect it in Settings. Until then alerts show on the screen." WITHOUT Web Bluetooth, THE Wristband radio SHALL be disabled with the caption `BAND_OFF`, and with no `navigator.vibrate`, Phone vibration SHALL be disabled with `PHONE_OFF` and Screen only shown as chosen.
5. THE intro SHALL show no connect button and no text that says a band is connected.
6. THE actions SHALL be "Back" (secondary) and "Done" (primary). Done SHALL close the intro (Requirement 6.2).

### Requirement 11: Station wiring

**User story:** As a maintainer, I want one start path and one settings path, so the intro adds no second way to do anything.

#### Acceptance criteria

1. THE station SHALL wrap the Listen card's `setState` so that it knows the current Listen state (`idle` until the first change) and tells its subscribers on every call. `startListening` SHALL stay the one start path: both the Start listening pill and Allow microphone call it.
2. THE station SHALL mount the intro after the Settings sheet, passing `phoneAvailable` (the page's `vibrates`), `bandSupported` (`band.state() !== 'unsupported'`, read at mount), `micSupport` (`micSupport({ hasGetUserMedia, isSecureContext })` read once at mount from `navigator.mediaDevices` and `window.isSecureContext`), `settings` and `setOutput` of the Settings sheet, the wrapped Listen state, and an `onClose` that calls `markOnboarded(browserStorage())`.
3. THE station SHALL pass `onShowIntro` to `mountSettings`, which opens the intro with the Settings pill as the element to return the focus to.
4. THE feature SHALL NOT change how `apply` applies settings, the runner deps, the live deps or the status pill.
5. THE station SHALL work the same, apart from the intro itself, with the intro never opened.

### Requirement 12: Layout and motion

**User story:** As a user on a phone or a desktop, I want a sheet that fits and that does not jump.

#### Acceptance criteria

1. FROM 720 px up, THE intro SHALL be a centred floating card at most 560 px wide, `surface` fill, `radius-card`, `shadow-soft`, 32 px padding. The page behind SHALL be covered by the canvas colour at 80% opacity (`::backdrop`), as the Settings sheet does. THE actions SHALL be in one row with Back on the left and the primary pill on the right.
2. BELOW 720 px THE intro SHALL be a bottom sheet, full width, with rounded top corners, at most the viewport height minus 24 px, scrolling inside. THE actions SHALL stack at full width in DOM order with the primary pill last, nearest the thumb.
3. THERE SHALL be no horizontal scroll at 390 px, and every target (the pills, the radios) SHALL be at least 44 px in both directions.
4. THE sheet and each step SHALL fade in and rise a few pixels with a transition on `--bb-motion-slow`, started by `@starting-style`. THERE SHALL be no `@keyframes`. UNDER `prefers-reduced-motion: reduce` the token is `0s`, so nothing moves and every transition duration is 0s.
5. THE step bars and the disc pictures SHALL be static.

### Requirement 13: Keyboard, focus, screen readers and no colour alone

**User story:** As a user who does not use a pointer or a screen, I want the intro to work fully with the keyboard and with a screen reader.

#### Acceptance criteria

1. THE tab order SHALL start at Skip intro and then follow the step's content: step 1 Skip intro, Next; step 2 Skip intro, Back, Not now, Allow microphone (or Skip intro, Back, Next after an outcome); step 3 Skip intro, the radios as one stop, Back, Done. Tab and Shift+Tab SHALL stay inside the sheet.
2. EVERY control SHALL show the 3 px focus ring and have an accessible name. THE arrow keys SHALL move the output choice.
3. THE state SHALL never be shown by colour alone: the step indicator has its words, the selected radio has a check mark and a tint, the microphone outcome has a word and a glyph shape in its pill, and the disabled Allow while starting keeps its label.
4. THE copy SHALL be plain words. THE intro SHALL work with no pointer, no band and no microphone.
5. THE decorative pictures, bars and glyphs SHALL be `aria-hidden`. THE text SHALL carry every meaning.

### Requirement 14: Styles and themes

**User story:** As a maintainer, I want the sheet to follow the design system in both themes.

#### Acceptance criteria

1. `src/station/onboarding.css` SHALL use design tokens only, under the literal rule of `tests/station/settings-styles.test.ts`: no hex, `rgb`, `hsl`, `oklch` or `color-mix`; the only pixel literals 1 to 3 px; the media queries only `(min-width: 720px)` and `(prefers-reduced-motion: reduce)`; no `@keyframes`; no remote resource. `index.html` SHALL link it. THE radios SHALL reuse the `.bb-option` rules of `settings.css`.
2. THE Day and Night themes SHALL come from the tokens. EVERY colour pair the sheet uses SHALL be a row of the Contrast table of `design/DESIGN.md`. No new pair is expected; the builder SHALL confirm it, or add the pair to the table and to `tests/ui` in the same change.
3. UNDER `prefers-reduced-motion`, THE sheet SHALL show state through static changes only (Requirement 13.3) and SHALL use no animation.

### Requirement 15: The e2e fixture and the existing specs

**User story:** As a maintainer, I want every existing e2e check to keep running on the station as before, with no intro in the way.

#### Acceptance criteria

1. `e2e/fixtures.ts` SHALL export `test` and `expect`. By default `test` SHALL add an init script that sets `banshee-band.onboarded.v1` to `done` in `localStorage` inside a `try`/`catch`. A `onboarded` option (`test.use({ onboarded: false })`) SHALL turn it off.
2. EVERY existing spec that opens `/` (`station`, `live`, `settings`, `latency`, `band-link`, `offline`) SHALL import `test` and `expect` from `./fixtures` instead of `@playwright/test`. NO existing check SHALL be removed or weakened.
3. THE Settings tab-order check of `e2e/settings.spec.ts` SHALL gain `button:Show intro again` at the end.
4. `e2e/ghosts.spec.ts` and `e2e/band.spec.ts` SHALL stay as they are (they do not open the station).

### Requirement 16: Tests and docs

**User story:** As a maintainer, I want every layer covered and the design doc true.

#### Acceptance criteria

1. UNIT tests SHALL cover the cases of `design.md` (Testing strategy), with the literals this spec fixes. PROPERTY tests (fast-check, fixed seed, at least 100 runs) SHALL show that `isOnboarded` is `true` only for `'done'` and that `shouldShowIntro` never throws for any stored string or a throwing store.
2. `e2e/onboarding.spec.ts` SHALL cover the flows in `design.md` (Playwright), with no console error or warning, and write five screenshots to `e2e/screenshots/`.
3. `design/DESIGN.md` SHALL rewrite the Onboarding section (desktop 1440 and phone 390 sketches, the three steps, the regions, the tab order, the focus rules and what is stored) and add Show intro again to the Settings section. `README.md` SHALL get one line about Onboarding. `.kiro/steering/structure.md` is updated in a separate later step and is not changed here.
4. `bun run typecheck`, `bun run test`, `bun run build` and `bun run e2e` SHALL pass.

## Out of scope

- A microphone permission flow that stays open after the first press, a retry button, or a way to ask again after a denial (the sentence points to the browser's site settings).
- Connecting the wristband from the intro (it is connected in Settings).
- Settings for sounds and levels in the intro (they stay in the Settings sheet).
- Onboarding on `band.html` and `styleguide.html`.
- Any analytics on the intro, a count of views, or a flag with a time or a version.
- `.kiro/steering/structure.md` (updated in a separate later step).
