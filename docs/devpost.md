# Banshee Band: Devpost write-up

The text for the Devpost submission form. Every number comes from the README's [Measured numbers](../README.md#measured-numbers) and [Latency](../README.md#latency) sections, which name the script or test that produced it. `tests/writeup.test.ts` fails if a placeholder is left here or the numbers drift from the README.

## Inspiration

A smoke alarm is a sound, and so is a baby crying, a knock at the door, or a car horn outside. For people who are Deaf or hard of hearing, the world announces its most urgent events in the one channel they cannot use. Existing alerts are single-purpose boxes that flash a light for one sound. We wanted one listener that hears many sounds, decides what matters, and says it through touch and sight. Halloween gave us the visual language: unseen things made visible, with a banshee as the classic herald of a sound that warns you before something happens.

## What it does

Banshee Band is a listening station in the browser. It listens through the device microphones, names the sound with Google's YAMNet model, estimates which side it came from, and tells you two ways. On screen, each sound appears as a ghost: its shape shows the class (knock, doorbell, alarm, baby, vehicle, voice or other), its place shows the side and its glow shows the urgency, and a "Recent:" list and a Latest alert say the same in words. It opens in a Night theme, and ghosts linger: the latest stays until a newer sound arrives and older ones fade to dimmer steps for 30 seconds, so a sound you missed is still there when you look. On the wrist, each class has its own vibration rhythm, stronger on the side the sound came from; it plays on phone vibration, on the on-screen band simulator, or on a DIY two-motor ESP32 wristband over Web Bluetooth. You choose which sounds alert and how loud they must be. All audio stays on the device. Without a microphone, Try a sound plays six sample clips through the same pipeline from the left, the centre or the right. It installs as an offline web app, and `docker run -p 4173:4173 banshee-band` serves it with no key.

Banshee Band is an aid, not a safety device: it can miss a sound or name it wrongly.

## How we built it

The browser captures stereo audio with Web Audio and an AudioWorklet (echo cancellation, noise suppression and auto gain off), resamples it to 16 kHz mono windows, and runs YAMNet through TensorFlow.js. Rules map its 521 AudioSet labels to our seven classes by exact name. A GCC-PHAT time-difference routine we wrote ourselves (own FFT, no DSP library) gives a left-to-right bearing from the two channels, with the level difference as a fallback and "unknown" when both channels carry the same signal. A haptic engine turns class, side and loudness into a vibration pattern, with priorities and a 3 s rate limit per class. The ghosts are drawn on a 2D canvas. Patterns go to the phone's vibration motor, the band simulator, or a wristband over Web Bluetooth using a small byte protocol with a CRC-8. A service worker makes it work offline after one visit. A small MCP server (`banshee-log`) lets Kiro read a local sound log and replay clips through the real pipeline.

We built it with Kiro through `kiro-cli`: 16 specs under `.kiro/specs/` (one per feature, each with requirements in WHEN/SHALL form, a design and a task list naming the test that proves each task), 7 steering files (accessibility, privacy, the pattern language, the Halloween style rules and more), 4 agent hooks that run checks on save, and the MCP server registered in `.kiro/settings/mcp.json`. We used `kiro-cli` in a terminal, not the IDE: the hooks and the MCP connection have not been tried inside the Kiro IDE, though the scripts behind them are tested on their own.

## Challenges

The hard part was stitching together pieces that were never designed to meet: a model that wants clean 16 kHz mono windows, a direction algorithm that needs two aligned channels, a Bluetooth link with its own timing, and a graphics layer that must stay readable rather than just spooky. Many laptops and phones give the same signal on both microphone channels, so the app has to say "side unknown" honestly instead of guessing; two microphones also tell left from right, not front from back. Haptic patterns had to stay learnable, so a distinctiveness check (a unit test, and a Kiro hook on the pattern file) fails when two of the six patterns feel too alike. And we had no ESP32: the wristband firmware was written but never compiled or flashed, and the browser side is tested against a mocked `navigator.bluetooth`.

Measured on the development PC: all 6 of 6 sample clips get their class, with a mean frame accuracy of 0.7778 over 70 windows (six clips are a regression check, not an accuracy figure). The direction finder passes 244 seeded synthetic cases, with a mean error of 0.23° on white noise at 20 dB SNR; these are synthetic signals, not real rooms.

## Accomplishments

One pipeline from microphone to wrist with every stage visible on screen: a pipeline card shows the waveform, the label, the bearing dial, the pattern and the output, each with its time, so you can watch a knock become a ghost on the left and a left-stronger buzz. The measured onset-to-output median is 814 ms for Try a sound on the 6.3 s knock clip (the whole clip is processed) and 70 ms for listening on a fake microphone, in headless Chromium; it counts up to the moment the pattern is handed to the outputs, not the motor spinning up. The ghosts carry real information, not decoration, and no state is told apart by colour alone (a hook checks it). It works with the band, with the phone alone, or fully offline. It is covered by 1303 unit and property tests and 138 Playwright end-to-end tests, including axe audits of every screen in Day and Night, keyboard and reduced-motion checks.

## What we learned

Accessibility work punishes guessing, so we wrote the requirements as specs first and kept them honest as the code taught us things: the measured YAMNet threshold, the latency arithmetic, the risks list of the classifier design were all fed back to Kiro and the specs rewritten. Touch is a limited language: a handful of distinct rhythms is learnable, many are not. Hooks pay off most for repetitive checks, like rerunning the pattern distinctiveness test whenever the pattern file changes, and an MCP server makes an agent far more useful when it can read real events rather than our descriptions of them.

## What's next

Testing with Deaf and hard-of-hearing users, which we have not done, and letting them design their own pattern vocabulary. Building the wristband for real: compiling and flashing the ESP32 firmware and measuring the radio and motor delay. Measuring direction on real devices in real rooms, and adding more classifier clips. A trainer so a household can teach the app its own doorbell or kettle, and a smartwatch companion so no custom hardware is needed.
