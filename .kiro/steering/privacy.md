---
inclusion: always
---

# Privacy

- Audio never leaves the device. No uploading, streaming or remote logging of audio or derived features.
- No network calls in the audio path (`src/audio`, `src/classify`, `src/bearing`). The YAMNet model is bundled or cached locally, not fetched from a third-party service at run time. Add an e2e check that fails on unexpected requests during listening.
- No analytics, trackers or third-party scripts. No API keys or accounts.
- The sound log is stored locally. Store event metadata (time, class, bearing, urgency) and short clips only where `replay_clip` needs them. Let users clear the log.
- The `banshee-log` MCP server runs locally, binds to stdio or localhost only, and is read-only. Its tools (`recent_events`, `event_stats`, `replay_clip`) must not write, delete or send data anywhere.
- Ask for microphone permission only after a user action, and explain why. The fallback clips work without it.
- Do not log raw audio, secrets or personal data to the console.
