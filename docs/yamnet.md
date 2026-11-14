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
