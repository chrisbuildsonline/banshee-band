# Banshee Band

Sounds you cannot hear, felt on your wrist and seen as ghosts that point to where they came from.

Built for [Kiroween 2026](https://kiroween.devpost.com/). Submissions close 2026-12-04.

## What it does

Banshee Band listens through the device microphones, classifies the sound in the browser, estimates which side it came from, and tells you in two ways. On screen, each sound appears as a ghost whose shape shows the type (knock, alarm, voice, vehicle, baby), whose position shows direction, and whose glow shows urgency. On the wrist, a small Bluetooth band plays a distinct vibration pattern per sound class, with a stronger buzz on the side the sound came from. Users choose which sounds matter and how loud they must be. Without the band, the phone vibration API acts as a fallback. All audio stays on the device.

## Stack

TypeScript, Vite, Web Audio API, TensorFlow.js with YAMNet, custom GCC-PHAT DSP module, Web Bluetooth, ESP32 firmware (Arduino C++) with two vibration motors, canvas/WebGL for ghosts, Node.js MCP server, Vitest, static hosting. Open-source license (MIT) with the .kiro folder at the repo root.

## License

MIT, see LICENSE.
