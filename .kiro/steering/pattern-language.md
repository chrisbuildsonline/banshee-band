---
inclusion: fileMatch
fileMatchPattern: "src/haptics/**"
---

# Vibration pattern language

Rules for patterns in `src/haptics/`.

- Maximum about 6 classes with their own pattern (knock, alarm, voice, vehicle, baby, plus at most one spare). People cannot learn more by feel.
- Distinguish by rhythm, not intensity. Each class has a unique count and spacing of pulses, such as short-short, long, or triple. Intensity only encodes urgency and side.
- Minimum gap between pulses: 80 ms, so motors spin down and pulses feel separate. Minimum pulse: 40 ms. Keep these as named constants.
- Keep each pattern under about 1.5 s. Alarms may repeat, with a longer pause between repeats.
- Side encoding: the side the sound came from gets the stronger buzz. Left uses the left motor and right uses the right motor. Centre or low confidence uses both equally. The rhythm stays the same across sides.
- Priority: higher urgency preempts lower. Do not queue stale alerts. Rate-limit repeats of the same class and side.
- Patterns are data (arrays of on/off durations plus per-motor level), not code. Output must work for the band, the simulator and `navigator.vibrate`. The phone fallback has no side or intensity control, so rhythm alone must still identify the class.
- A distinctiveness test must pass. It compares every pair of patterns by rhythm (pulse count and timing distance above a threshold) and checks the minimum gap and duration limits. Adding or changing a pattern requires that test to pass, and a property test over side and urgency to show rhythm identity does not change.
