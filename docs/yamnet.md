# YAMNet classification: measured values

Findings for `.kiro/specs/yamnet-classification`. They belong in the "Measured values" section of its `design.md`.

## Model

| Item | Value |
|---|---|
| Model source | YAMNet TF.js graph model, Google, Kaggle Models `google/yamnet/tfJs/tfjs/1` (https://www.kaggle.com/models/google/yamnet/tfJs/tfjs/1). `https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1` redirects to the same Kaggle files. |
| Class map source | `tensorflow/models`, `research/audioset/yamnet/yamnet_class_map.csv` (master branch) |
| Retrieval date | 2026-11-14 |
| Files | `model.json` (100759 B), `group1-shard1of4.bin` to `group1-shard3of4.bin` (4194304 B each), `group1-shard4of4.bin` (3455404 B), `yamnet_class_map.csv` (14096 B, CRLF line endings). Total with `LICENSE.txt` and `SHA256SUMS`: about 16.2 MB. |
| Licences | Model: Apache 2.0 (Kaggle listing). Class map file: Apache 2.0 (`tensorflow/models`). AudioSet ontology names and ids: CC BY-SA 4.0, as stated on research.google.com/audioset and in the `audioset/ontology` README. |
| Format | `graph-model`, converted by TensorFlow.js Converter v2.1.0. Ops: no FFT op; the spectrogram uses `MatMul`, so every op runs on the TF.js `cpu` backend. |
| Input | `waveform`, float32, shape `[-1]` (1-D, no batch dimension). As in the design. |
| Outputs, in order | `Identity` scores `[1, 521]`, `Identity_1` embeddings `[1, 1024]`, `Identity_2` log-mel spectrogram `[96, 64]`, for a 15600-sample input. |
| TF.js | `@tensorflow/tfjs` 4.22.0, `cpu` backend in Node (bun and Vitest). |
| Node `cpu` load time | about 30 ms for `loadGraphModel` from local files through `fetchFunc` (no network) |
| Node `cpu` time per Frame | about 150 to 170 ms |
| Spike check | zeros: top index 494 (`Silence`) at 1.0. First Frame of `doorbell-01.wav`: index 349 (`Doorbell`) 0.92, 350 (`Ding-dong`) 0.88. |

## Final Rule lists

Set from the real class map by the meaning of each name, before any clip was run. Source: `src/classify/rules.ts`. Every other Index is `other` (521 Indexes in total).

| Class | Members (exact AudioSet display names, separated by semicolons) |
|---|---|
| knock | Knock; Tap |
| doorbell | Doorbell; Ding-dong |
| alarm | Alarm; Car alarm; Alarm clock; Siren; Civil defense siren; Buzzer; Smoke detector, smoke alarm; Fire alarm; Beep, bleep |
| baby | Baby laughter; Crying, sobbing; Baby cry, infant cry; Whimper; Babbling |
| vehicle | Vehicle; Motor vehicle (road); Car; Vehicle horn, car horn, honking; Toot; Skidding; Tire squeal; Car passing by; Race car, auto racing; Truck; Air brake; Air horn, truck horn; Reversing beeps; Ice cream truck, ice cream van; Bus; Emergency vehicle; Police car (siren); Ambulance (siren); Fire engine, fire truck (siren); Motorcycle; Traffic noise, roadway noise; Bicycle; Accelerating, revving, vroom |
| voice | Speech; Child speech, kid speaking; Conversation; Narration, monologue; Speech synthesizer; Shout; Bellow; Whoop; Yell; Children shouting; Screaming; Whispering; Chatter; Hubbub, speech noise, speech babble |

Placement of overlapping names:

- Sirens: `Siren` and `Civil defense siren` are warnings heard at home, so alarm. `Police car (siren)`, `Ambulance (siren)`, `Fire engine, fire truck (siren)` and `Emergency vehicle` name a vehicle on the road, so vehicle.
- `Beep, bleep` is alarm (as the requirements list it). `Reversing beeps` names a vehicle, so vehicle. `Car alarm` is an alarm, not traffic, so alarm.
- `Child speech, kid speaking` is speech, so voice. `Babbling` (an infant's pre-speech sounds) and `Baby laughter` are baby.
- `Door` (any door sound, also opening and closing), `Slam` and `Thump, thud` do not mean a knock, so they stay other. `Tap` (a light knock; in the AudioSet ontology it sits under `Door` next to `Knock`) is knock.
- `Engine`, `Idling` and `Engine starting` can be any machine (generator, mower), so other. Rail, air and water vehicles are not road vehicles, so other.

Names from the requirements and design that are not in the real class map: `Male speech, man speaking` and `Female speech, woman speaking` (YAMNet's 521 classes do not include them). No replacement is needed; `Speech` covers them. Every other name in Requirement 3.8 and 8.6 exists as written. `Music` and `Silence` both exist and are other.

## Threshold

Final `DEFAULT_THRESHOLD`: **0.15** (one global value for all classes; it was 0.3 at first).

Why. The first run at 0.3 passed 5 of 6 clips; `knock-01` failed (4 knock Frames, 7 other). A per-Frame look at all six clips (level, raw top-5 AudioSet labels, Aggregate per class) showed:

- Frames that carry their target sound, judged by their own top AudioSet labels, but fell under 0.3: `knock-01` Frame 1 (top labels Door 0.267, Tap 0.208, Knock 0.128; knock Aggregate 0.208), `knock-01` Frame 3 (top label Knock 0.282), `doorbell-01` Frame 1 (Doorbell 0.299 in its top 5, after Mallet percussion and Glockenspiel). 0.3 cut through real target Frames.
- The highest specific Aggregate on any Frame whose top labels name none of our classes is 0.074 (knock, on an `alarm-smoke-01` Frame topped by Sliding door, Door, Glass) and then 0.053 (voice, on a Frame topped by Wood).

0.15 sits between 0.074 and 0.208, with a margin of about 0.06 to 0.08 on each side. It is chosen from the Aggregates of all 70 Frames, not set per clip, and no Rule, clip, manifest entry or Expected class was changed. The aggregation method (max) is unchanged.

A threshold only moves a Frame between `other` and its best specific class, so the change affected these Frames: the three listed above (now knock, knock, doorbell, all correct). No Frame changed to a wrong class.

## Clip results (tests/classify/clip-results.json)

Node, `@tensorflow/tfjs` 4.22.0, `cpu` backend, threshold 0.15. 6 of 6 clips pass; mean frame accuracy 0.7778.

| Clip | Expected | Got | Frames | Frame accuracy | Class counts | Mean confidence | Top label |
|---|---|---|---|---|---|---|---|
| doorbell-01 | doorbell | doorbell | 6 | 1.0 | doorbell 6 | 0.795 | Doorbell |
| knock-01 | knock | knock | 11 | 0.5455 | knock 6, other 5 | 0.6698 | Knock |
| alarm-smoke-01 | alarm | alarm | 11 | 0.4545 | alarm 5, voice 4, other 2 | 0.8708 | Smoke detector, smoke alarm |
| baby-cry-01 | baby | baby | 18 | 1.0 | baby 18 | 0.7988 | Crying, sobbing |
| vehicle-horn-01 | vehicle | vehicle | 6 | 0.6667 | vehicle 4, voice 1, other 1 | 0.8775 | Vehicle horn, car horn, honking |
| voice-speech-01 | voice | voice | 18 | 1.0 | voice 18 | 0.9977 | Speech |

What the model hears in each clip (raw top AudioSet labels):

- doorbell-01: Doorbell and Ding-dong (0.7 to 0.96) in 5 Frames; one Frame is topped by Mallet percussion and Glockenspiel, with Doorbell 0.299.
- knock-01: Knock 0.66 to 0.98 (with Door and Tap) in 4 Frames, plus two weaker knock tails. The other 5 Frames are gaps between knocks (RMS -42 to -66 dBFS) that the model calls Silence at 1.0, which is correct. The clip passes 6 to 5, a narrow margin.
- alarm-smoke-01: Smoke detector, smoke alarm, Alarm, Fire alarm (0.59 to 0.97) for the first 2.4 s. After the alarm stops the recording holds quiet speech in a room (about -46 dBFS; Speech 0.38 to 0.92), so 4 Frames are voice, which is what they are. The clip passes 5 to 4.
- baby-cry-01: Crying, sobbing in most Frames, Whimper and Baby laughter in a few; all 18 are baby.
- vehicle-horn-01: Vehicle horn, car horn, honking (0.79 to 0.96) in 4 Frames; one Frame between honks is topped by Speech 0.58 (voice), and the last Frame is Silence.
- voice-speech-01: Speech 0.99 or more in all 18 Frames.

No clip was re-cut. `voice-speech-01` and `baby-cry-01` reach frame accuracy 1.0, so their cuts are fine.

The Results file is a regression check on these six clips, and not a measure of how well the classifier works on other recordings.

## Timing

Node (bun and Vitest), `cpu` backend, on the development machine: model load about 30 ms from local files (no network); `classify` about 105 to 170 ms per Frame (the integration test prints about 150 ms per clip). Browser (WebGL) speed is not measured here.
