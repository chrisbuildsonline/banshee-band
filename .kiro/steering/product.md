---
inclusion: always
---

# Product: Banshee Band

Kiroween 2026 entry, Frankenstein category: unrelated parts (audio ML, stereo DSP, haptics, Bluetooth hardware, spooky canvas art, an MCP server) stitched into one working aid.

## Users

Deaf and hard-of-hearing people who miss doorbells, smoke alarms, crying babies, knocks and approaching vehicles.

## Problem

Important household and street sounds go unnoticed. Existing aids are single-purpose, expensive, or give no direction.

## Core flows

1. **Listen**: capture stereo microphone audio in the browser. If there is no microphone, play recorded CC0 clips from `public/clips`.
2. **Classify**: YAMNet (TensorFlow.js) labels the sound. Labels map to the supported classes: knock, alarm, voice, vehicle, baby.
3. **Bearing**: the GCC-PHAT module estimates which side the sound came from using the stereo channels.
4. **Haptic alert**: the haptic priority engine picks a vibration pattern for the class and a stronger buzz on the matching side. Output goes to the ESP32 band over Web Bluetooth, the software band simulator, or `navigator.vibrate` as the phone fallback.
5. **Ghost**: the canvas renderer shows each sound as a ghost. Shape = sound class, position = bearing, glow = urgency.

Users choose which classes matter and the minimum loudness for each.

## Local log and MCP

Each event is written to a local sound log. The Node.js MCP server `banshee-log` exposes `recent_events`, `event_stats` and `replay_clip` over that log.

## What it is not

- Not a safety device. It is an aid and can miss or misclassify sounds. UI copy must never promise protection or imply it replaces smoke detectors with strobes or other certified devices.
- Not a cloud service. No accounts, no API keys, no uploads.
- Not a speech transcriber. Voice is detected as a class, not converted to text.
- Not a precise locator. Bearing is left/right with coarse confidence.
