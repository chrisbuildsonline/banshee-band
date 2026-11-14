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
