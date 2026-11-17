# Design: Haptic outputs

Requirement numbers refer to `requirements.md`.

## Overview

`src/haptics` returns a `HapticCommand`. `src/band` plays it.

```
HapticCommand
   |
   +--> HapticOutput (simulator)  --> segment player --> motor cards, timeline, live region
   |
   +--> HapticOutput (phone)      --> navigator.vibrate(command.vibrate)
   |
   +--> HapticOutput (BLE band)   later feature, same interface, not stubbed here
```

`haptics` never imports `band` (the existing boundary test of `src/haptics` enforces it). `band` imports types and pure functions from `haptics` and `events`. The band page (`src/ui/band-page.ts`) is the only place that knows both outputs, and it sits in `ui`, the top of the dependency chain (`audio -> classify and bearing -> haptics -> band and ghosts -> ui`).

## Files

```
src/band/
  types.ts           HapticOutput
  segment-player.ts  createSegmentPlayer, browserScheduler, Scheduler, Levels
  phone-output.ts    createPhoneOutput
  labels.ts          classLabel, sideText, percentOf (pure)
  simulator.ts       mountBandSimulator
  simulator.css      styles of the simulator, tokens only
  index.ts           public exports and the module comment
src/ui/
  band-page.ts       page script: status pill, Feel a pattern card, wiring
  band-page.css      page layout
band.html            page shell, loads band-page.ts
vite.config.ts       band.html added to build inputs
tests/band/
  boundaries.test.ts  segment-player.test.ts  phone-output.test.ts  labels.test.ts  properties.test.ts
  helpers/            fake scheduler, command builder with the real engine
e2e/
  band.spec.ts
```

`src/band/.gitkeep` is removed when the first file lands. `structure.md` gets one line for `band.html` and the new files of `src/band` (task 6). The tests mirror the source paths, as `structure.md` asks. `tests/band/helpers/` follows `tests/haptics/helpers/`.

## Interface (R1)

```ts
import type { HapticCommand } from '../haptics';

export interface HapticOutput {
  kind: 'simulator' | 'phone';
  available(): boolean;
  play(command: HapticCommand): void;
  stop(): void;
}
```

`kind` has two values now. The BLE feature adds `'band'`. Nothing in this feature switches on `kind` except the page, which uses it to name an output in text.

## Segment player (R2)

```ts
export interface Levels { left: number; right: number }
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export const browserScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as number),
};

export function createSegmentPlayer(onLevels: (l: Levels) => void, s: Scheduler) {
  let handles: unknown[] = [];
  let playing = false;

  function cancel() { for (const h of handles) s.clearTimeout(h); handles = []; }
  function emit(l: Levels) { try { onLevels({ left: l.left, right: l.right }); } catch { /* keep going */ } }

  return {
    play(cmd: HapticCommand) {
      cancel();                       // the old command's 0/0 is never emitted (R2.7)
      playing = true;
      if (cmd.segments.length === 0) { playing = false; emit({ left: 0, right: 0 }); return; }
      let offset = 0;
      cmd.segments.forEach((seg, i) => {
        if (i === 0) emit(seg);                                   // offset 0, inside play (R2.4)
        else handles.push(s.setTimeout(() => emit(seg), offset));  // all scheduled now, from the same origin
        offset += seg.ms;
      });
      handles.push(s.setTimeout(() => { playing = false; emit({ left: 0, right: 0 }); }, cmd.totalMs));
    },
    stop() {
      if (!playing) return;
      cancel(); playing = false; emit({ left: 0, right: 0 });
    },
  };
}
```

Notes:

- All timers are scheduled in `play`, each with its own cumulative offset, and not chained from the previous timer's callback. A late timer then delays only itself. This is the cheapest way to meet "within 50 ms" in a browser without a clock source, and it makes the fake-clock contract exact (`advance(offset)` fires exactly that emission).
- The global lookup in `browserScheduler` happens per call, so Playwright's `page.clock.install()` (which replaces `setTimeout` on the page) controls the player even when the module loaded first. `install` before `goto` is still the safe order for the e2e test.
- `emit` copies the levels, so a caller that keeps an emitted object cannot change a segment of the command (R2.12), and a segment object is never handed out.
- The end timer uses `cmd.totalMs`. For every command the engine builds, `totalMs` equals the sum of the `ms` values (haptics R7.4). The property test checks this through the end emission.
- A timer for the last segment's start and the end timer have different offsets (the last segment has `ms` at least 40), so there is no tie between a level emission and the 0/0.
- The player does not use `Date` or `performance`. It never needs to know the time.
- `onLevels` can throw (a UI bug). The player catches it so one failed emission cannot freeze the 0/0 at the end. The error is swallowed and not logged (R1.4, R11). The simulator's `onLevels` only sets text, so this is a safety net.

## Phone output (R3)

```ts
export function createPhoneOutput(nav?: { vibrate?: unknown }): HapticOutput {
  const get = () => nav ?? (globalThis as { navigator?: { vibrate?: unknown } }).navigator;
  const vibrateFn = () => { const n = get(); return n && typeof n.vibrate === 'function' ? n : null; };
  return {
    kind: 'phone',
    available: () => vibrateFn() !== null,
    play(cmd) {
      const n = vibrateFn(); if (!n) return;
      if (cmd.segments.every((s) => s.left === 0 && s.right === 0)) return;   // intensity 0
      try { (n.vibrate as (p: number[]) => unknown).call(n, cmd.vibrate); } catch { /* ignore */ }
    },
    stop() {
      const n = vibrateFn(); if (!n) return;
      try { (n.vibrate as (p: number) => unknown).call(n, 0); } catch { /* ignore */ }
    },
  };
}
```

The code is a sketch. Two points matter: `vibrate` is called as a method of `navigator` (a detached `navigator.vibrate` throws "Illegal invocation" in browsers), and the lookup is lazy, so a test that stubs `navigator.vibrate` after the module loads works.

**Decision: intensity 0 does not vibrate the phone.** The engine builds a command with the full rhythm when `intensity` is 0 (haptics design, "Command building", open point). Every level is then 0, and the band or simulator shows no motion. The phone cannot set a strength, so it would buzz at full strength. The user turned strength to zero, so the phone output treats a command with every level 0 as "off" and does not call `vibrate`. The check is on the levels and not on a setting, because the output only sees the command. A side effect: a command whose levels are all 0 for another reason would also be silent. No such command exists.

**The phone cannot show side or strength.** It plays `command.vibrate`, the rhythm. The class is identified by rhythm alone (pattern language). The simulator and the text are where side is shown. The phone is one of three forms of an alert and not the only one.

`navigator.vibrate` needs a user gesture in Chromium (sticky activation) and exists on desktop Chromium where it does nothing. The status pill therefore says "Phone vibration on" for "the API exists", and the page does not promise that a motor moves. The Feel a pattern chips are clicks, so the gesture rule is met.

## Labels (R5)

`labels.ts` holds pure helpers, so they are tested without a DOM:

```ts
classLabel(c: HapticClass): string        // 'knock' -> 'Knock'
sideText(s: Side): string                 // 'left' -> 'left stronger', 'right' -> 'right stronger',
                                          // 'centre' -> 'both motors, centre', 'unknown' -> 'Side unknown, both motors equal'
percentOf(level: number): number          // Math.round(level * 100), clamped to 0..100 and NaN to 0
patternName(cmd): string                  // `${classLabel}, ${sideText}`  e.g. 'Knock, left stronger'
pulseCount(segments): number              // R5.6
```

`percentOf` clamps and maps `NaN` to 0 as a display guard only. The engine already guarantees levels in [0, 1]. The player does not clamp (R2.11), so the display is the one place with a guard.

`sideText` has a capital first letter in "Side unknown, both motors equal" and lower case in the others, as the requirement gives them. In the live region the full text reads "Knock, left stronger" or "Knock, Side unknown, both motors equal". The second reads oddly, so `patternName` joins them as `Knock. Side unknown, both motors equal` for the unknown side only. The sentence form is tested with literals.

## Simulator component (R4, R5, R6)

DOM, built with `createElement` and `textContent` (no `innerHTML` with data):

```
<section class="bb-sim" data-side="left|right|centre|unknown">      (data-side absent before the first play)
  <div class="bb-sim__motors">
    <section class="bb-card bb-motor" data-motor="left" data-level="0">
      <h2 class="bb-motor__title">Left motor</h2>
      <p class="bb-motor__value"><span class="bb-motor__num">0</span><span class="bb-motor__unit">%</span></p>
      <div class="bb-motor__bar" aria-hidden="true"><div class="bb-motor__fill" style="width:0%"></div></div>
    </section>
    <section ... data-motor="right" ...>
  </div>
  <section class="bb-card bb-timeline">
    <h2>Pattern</h2>
    <p class="bb-timeline__name"><svg aria-hidden="true">glyph</svg><span>No pattern yet</span></p>
    <svg class="bb-timeline__lanes" aria-hidden="true">  L lane, R lane  </svg>
    <p class="bb-timeline__scale"><span>0 ms</span><span>240 ms</span></p>
    <p class="bb-timeline__count">3 pulses, 240 ms</p>
  </section>
  <p class="bb-sim__live" aria-live="polite"></p>      (visually hidden)
</section>
```

Mount creates this tree once. After that, only text, `data-` attributes, one `style.width` per bar and the lane `<rect>` children change.

- **Levels.** The segment player's `onLevels` sets each card's number text, `data-level` and the fill width from `percentOf`. One function writes all three, so the number and `data-level` cannot differ (R4.4).
- **Fill width via inline style.** A width in percent is data and not a design value, so it is the one inline style. Everything else is in `simulator.css`.
- **Timeline.** On `play`, the lanes are cleared and redrawn from the segments: for each segment with a level above 0, one `<rect>` in the lane of that motor with `x = start/totalMs`, `width = ms/totalMs`, and `height = level` of the lane height (a motor at 30% has a mark 30% as tall, bottom aligned). The viewBox is `0 0 1000 120` with `preserveAspectRatio="none"`, so offsets and widths are in thousandths. Marks have a 1-unit minimum width so a 70 ms pulse of a 3800 ms alarm stays visible. A zero-level mark is not drawn, so an intensity-0 command shows empty lanes and "3 pulses" does not lie: `pulseCount` for an all-zero command counts the segments at even index (R5.6), which are the pulses by the alternation rule.
- **Side states.** `data-side` on the root drives CSS. For `unknown` both motor cards get `outline: 2px dashed var(--bb-color-border)` (offset inside the card edge, so the card radius and shadow stay), and the glyph is a question mark. For `centre` there is a solid centre mark. For `left` and `right` there is an arrow. The words differ for all four. The unknown state therefore differs by its dashed outline, its glyph and its own words, and not by colour (R5.7).
- **Live region.** `play` builds the pattern name and sets the text once. To make a repeated identical announcement read again, it sets `textContent = ''` and then sets the text in a microtask (`queueMicrotask`, which the Playwright clock does not fake). Segment changes never write to it, and neither do the end of the command or `stop` (R6.1).
- **Reduced motion.** `simulator.css` sets `.bb-motor__fill { transition: width var(--bb-motion-fast) linear; }` and the reduce block sets `transition: none`. The tokens already resolve to `0s` under reduce, but `transition: none` is written out so a token change cannot reintroduce motion, and so a test can read the computed style (R6.4). There is no `@keyframes`.
- **Short pulses and the bar transition.** A knock pulse is 70 ms and the bar transition is 150 ms, so with motion allowed the bar never reaches full width. The number is the value and the bar is decoration (R4.5), so this is accepted: the bar still moves in step with the rhythm. A shorter transition for the bars is a polish option and is not needed.
- **No focusable element.** The simulator has no link, button or `tabindex`. (R6.7)
- **Mount and destroy.** `mountBandSimulator(container)` builds the tree, creates a player with `browserScheduler`, and returns `{ output, destroy }`. `output.play(cmd)` updates the timeline, the live region and `data-side`, then calls `player.play(cmd)` (the first emission sets the first levels inside the call). `output.stop()` calls `player.stop()`. `destroy()` sets a `destroyed` flag, stops the player with the emission going to a detached tree (no live-region write), removes the root, and makes `play` and `stop` no-ops.
- **Tokens.** Cards use the card recipe of DESIGN.md (surface fill, `--bb-radius-card`, `--bb-shadow-soft`, padding 24 px, 16 px on phone). The numbers use the `display` tokens and `font-variant-numeric: tabular-nums`. The `%` unit is `caption` and `text-muted`. Bars and marks use `--bb-color-accent` on a `--bb-color-surface-raised` track (3:1 pairs: accent on card 6.72 Day and 7.73 Night, in the contrast table). The track itself is decoration, so it has no contrast requirement beyond not hiding the fill. The dashed outline uses `--bb-color-border` (3.85 Day on card, 3.55 Night).

## The page (R7, R8)

`band.html` is a shell like `styleguide.html`: the `<head>` with the title "Band simulator - Banshee Band", the theme bootstrapping that the other pages use, `<main>` with containers, and a module script `src/ui/band-page.ts`. The builder reads `styleguide.html`, `src/ui/styleguide.ts` and `index.html` first and reuses the header and theme control code or markup. If the theme control lives inside `styleguide.ts` only, the task that builds the page moves the control into a small shared module in `src/ui/` (tested by the existing e2e) and does not copy it. That is the one allowed change to existing UI code, and it is listed in task 6.

Layout, desktop (1440 px):

```
+--------------------------------------------------------------------------------+
| Banshee Band           [▲ Phone vibration on]              [☀ Day | ☾ Night]   |
| Band simulator                                                                  |
| A simulator of the wrist band. No band is connected.                            |
| +----------------------------------------------------------------------------+ |
| | Feel a pattern                                                             | |
| | Choose a sound to feel its pattern here and, if your phone can, on it.     | |
| | Side  ( Left | Centre | Right | Unknown )                                  | |
| | [Knock] [Doorbell] [Alarm] [Baby] [Vehicle] [Voice]                        | |
| +----------------------------------------------------------------------------+ |
| +-------------------------------------+ +------------------------------------+ |
| | Left motor                          | | Right motor                        | |
| | 100 %                               | | 30 %                               | |
| | [==========        ]                | | [===               ]               | |
| +-------------------------------------+ +------------------------------------+ |
| +----------------------------------------------------------------------------+ |
| | Pattern                                                                    | |
| | ◀ Knock, left stronger                                                     | |
| | L ▮ ▮                                                                      | |
| | R ▯ ▯                                0 ms ............................ 240 ms | |
| | 2 pulses, 240 ms                                                           | |
| +----------------------------------------------------------------------------+ |
| Banshee Band is an aid, not a safety device. It can miss or misread ...       |
+--------------------------------------------------------------------------------+
```

Phone (390 px): one column. Title block, Feel card (side control full width, chips wrap three per row), the two motor cards side by side, the timeline card full width, footer. Chips and side options are at least 44 px high and wide.

Why the Feel card sits above the motor cards: the page's job is to learn the language, and the result is directly below the control. On a 390 px screen, the motor cards then come into view without scrolling far. The screenshots (task 9) check this. If the motor cards fall below the fold on a phone after a chip press, the builder may move the Feel card below the timeline, and the DESIGN.md text and the tab order of Requirement 7.5 and 7.9 are updated in the same change.

The DESIGN.md Band simulator section had Connect band in the title block. This page has none. DESIGN.md is updated (task 9) to say that the Connect band pill arrives with `band-ble-protocol`, and describes the status pill and the Feel a pattern card.

### Status pill

| State | Label | Glyph | Tint |
|---|---|---|---|
| `phone.available()` true | Phone vibration on | ▲ triangle | accent |
| `phone.available()` false | No phone vibration here | ○ open circle | neutral |

These two rows go into the Status pills table of DESIGN.md. The triangle is the existing "Fallback active" glyph and the open circle is the existing "Band not connected" glyph, so no new shape is drawn. The labels differ from those states because this page does not claim a fallback is active or a band is missing: it says what the device can do.

The page reads `phone.available()` once at load.

### Feel a pattern

```ts
const URGENCY: Record<HapticClass, Urgency> = {
  alarm: 'high', baby: 'high', vehicle: 'medium', doorbell: 'medium', knock: 'medium', voice: 'low',
};
const BEARING: Record<Side, { deg: number | null; source: 'gcc-phat' | 'none'; confidence: number }> = {
  left:    { deg: -45, source: 'gcc-phat', confidence: 0.9 },
  centre:  { deg: 0,   source: 'gcc-phat', confidence: 0.9 },
  right:   { deg: 45,  source: 'gcc-phat', confidence: 0.9 },
  unknown: { deg: 0,   source: 'gcc-phat', confidence: 0.5 },
};

function buildDemoCommand(cls: HapticClass, side: Side): HapticCommand | null {
  const b = BEARING[side];
  const event: SoundEvent = {
    id: `demo-${cls}-${side}`, t: 0, class: cls, label: classLabel(cls), confidence: 1,
    bearingDeg: b.deg, bearingSource: b.source, loudnessDb: -20, urgency: URGENCY[cls],
  };
  const d = createHapticEngine().decide({ event, bearingConfidence: b.confidence }, 0);
  return d.action === 'play' ? d.command : null;
}
```

The chip calls `buildDemoCommand`, then `simulator.output.play(cmd)` and, if `phone.available()`, `phone.play(cmd)`. A new engine per call (R8.6) means that the rate limit (3000 ms per class and side) and the preemption of an earlier alarm cannot drop a second press. The engine's `decide` is called with `nowMs` 0 every time, which is fine for a fresh engine.

`buildDemoCommand` lives in `src/ui/band-page.ts`, because it needs `haptics` and picks demo values that belong to the page, not to an output. It is exported so a unit test can call it (tests/ui would be new; the e2e tests cover it, so no unit test file is added, and R10 does not require one). The Unknown row has `deg: 0` with a `gcc-phat` source and confidence 0.5: `sideOf` returns `'unknown'` because 0.5 is below 0.8 (haptics R5.3), which is the path the real pipeline takes for a weak bearing. A `'none'` source would also give `'unknown'`, but then `bearingDeg` must be null (events contract), and the confidence route is the one that matches "Unknown side means bearing confidence 0.5".

The `-20` dBFS loudness is above the default threshold of -50 (haptics R9.2), and the default settings have intensity 1, so the levels are the base levels: 100% for `high`, 75% for `medium`, 50% for `low` on the stronger motor, and 30% of that on the other motor for a known side. This is what a user with default settings feels. A knock on the left: left 75, right 23 (0.225 rounds to 23). The Playwright test compares the two numbers and does not depend on a literal beyond "greater".

### Side control

Native radio inputs inside a `<fieldset>` with `<legend>Side</legend>`, styled as a segmented control with the same track and selection recipe as the theme control (floating `surface` track with `shadow-soft`, selected option `accent-tint` fill and `accent-strong` label). The selected option also shows a check glyph, so selection is not colour alone. Arrow keys move the selection natively. The default is Centre. A `change` event stores the side and plays nothing.

### Chips

`<button type="button" class="bb-pill bb-pill--secondary">Knock</button>` (names follow the existing pill classes in `tokens.css` or `styleguide.css`; the builder reuses them). Six buttons in a `<div role="group" aria-label="Sound">`. Click runs the flow above. Native `button` gives Enter and Space.

### Messages

Under the chips there is a polite live region used only for the error text of R8.6 ("This pattern could not be played"). The simulator has its own live region for the normal announcement, so the page never writes two announcements for one press.

## Error handling

- A broken command (negative `ms`, `NaN` level) is a coding error in `haptics`. The player does not validate. The simulator guards the display (`percentOf`). The phone passes `vibrate` as it is, and the browser rejects bad values by returning `false`.
- A throwing `navigator.vibrate` is caught and ignored (R3.7). A missing one makes `available()` false.
- The page catches nothing else. A thrown error would show in the console, and the e2e test fails on console errors.

## Testing strategy (R10)

Unit tests use a fake scheduler written for the tests:

```ts
function createFakeScheduler() {
  let now = 0, nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void; order: number }>();
  return {
    scheduler: { setTimeout(fn, ms) { const id = nextId++; timers.set(id, { at: now + ms, fn, order: id }); return id; },
                 clearTimeout(h) { timers.delete(h as number); } },
    advance(ms) { /* run due timers in (at, order) order, setting now to each timer's at */ },
    now: () => now, pending: () => timers.size,
  };
}
```

Timers with the same `at` run in creation order. The test records `{ at: now, levels }` for every emission, so it can compare offsets with literals. Expected values in the unit tests are literal (a knock left high: emissions at 0, 70, 170 and 240 with levels `{1, 0.3}`, `{0, 0}`, `{1, 0.3}`, `{0, 0}`).

The property test uses the real engine and `buildCommand` through `createHapticEngine().decide`, generating classes, urgency, bearing source, bearing, confidence and intensity (including 0), plays the command, advances to `totalMs`, and checks the four properties of R10.4. A second property covers R10.5 for the phone. Seeds are fixed and each property runs at least 100 times, as in `tests/haptics/properties.test.ts`.

The segment emissions at offset 0 and at later offsets are separate in the test, because the first is synchronous in `play` and the others come from the clock.

Playwright (`e2e/band.spec.ts`):

- `page.clock.install()` before `goto`, so the player's timers are fake. After a chip click, the test reads `[data-motor=left]` `data-level` and `[data-motor=right]`, then `page.clock.runFor(239)` shows levels not yet 0 (the last pulse is on until 240), and `runFor(1)` makes both `0`. Exact values depend on the knock pattern, 70/100/70, so the literal total of 240 is used and the test comment points to the pattern table of the haptics design.
- An init script (`page.addInitScript`) sets `navigator.vibrate = (p) => { window.__vibrateCalls.push(p); return true; }` and the test reads `__vibrateCalls`. A second test with `navigator.vibrate = undefined` through the init script checks the pill text and that a chip press does not raise a page error.
- Keyboard: `page.keyboard.press('Tab')` is repeated and the focused element names are checked in order. Arrow keys on the radio group change the side. Enter and Space on a focused chip play.
- Reduced motion: `page.emulateMedia({ reducedMotion: 'reduce' })`, then `getComputedStyle(fill).transitionDuration` is `0s`, and the number updates after the chip press.
- Network: `page.on('request')` collects the URLs. All must have the origin of the page (the dev server, or `data:` and `blob:` for inline assets).
- Console: `page.on('console')` for type `error` and `page.on('pageerror')` must stay empty.
- Screenshots: `e2e/screenshots/band-{1440,390}-{day,night}.png` after a Knock plus Left press, so the cards show real levels.

## Risks and open points

- **Flash rate of the bars.** A baby pattern has four pulses in 640 ms (about 6 per second) and the knock two in 240 ms. `halloween-style.md` says to avoid flashing faster than 3 per second, which is about large flashing areas. Here only the width of a small bar and a number change, and the user starts it with a click, but under reduced motion the bar jumps at the pulse rate. The simulator shows the pattern as the band plays it. This is a deliberate choice and a judgement call: if review wants a stricter reading, the bar could be hidden under reduced motion while the number stays.
- **Desktop vibrate.** Desktop Chromium has `navigator.vibrate` and does nothing, so the pill says "Phone vibration on" on a desktop. The label is about the API. A user agent check would be fragile and is not added.
- **Feel card position.** See "The page". The screenshots decide.
- **Timer jitter.** Browsers clamp nested and background-tab timers (1 s in a hidden tab). A hidden simulator is not seen, and a pattern is at most 3.8 s. The 50 ms rule is for a visible page.
- **Intensity 0 on the phone.** Decided in "Phone output". The settings UI is a later feature, so this path is reachable today only through tests.
- **Segment player under preemption.** `play` cancels the old schedule without a 0/0 emission, and the first emission of the new command sets the levels at once. The motor cards never show a 0 between two commands.
