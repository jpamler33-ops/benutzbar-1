# BeatForge Producer 3.0 — Audio Learn

Mobile-first, offline-capable PWA for beat sketches and local, adaptive reference learning. No backend, registration, external APIs or uploading audio to a server.

## New: Learn from real audio references

1. Open **Lernen → Aus echten Beats lernen**.
2. Choose your current genre (in Studio), select an own or appropriately licensed WAV/MP3 audio reference; other browser-supported formats can work.
3. Confirm analysis rights. Optional: specify the correct BPM if the automatic detector is uncertain.
4. Choose **Audio-Beat analysieren**. The reference is decoded locally using Web Audio. Only a **small derived style profile** is stored in the browser, not the full audio file.
5. Generate a new beat using the same genre. The learning influence slider blends reference-derived onset groove into kick, snare and hi-hat generation. The user can disable/reweight each reference, set influence to 0, or optionally enable learned tempo matching.
6. Export or import **Trainingsdaten** to back up derived references and preferences.

### Measured properties

- Tempo estimate with conservative confidence (double/half tempo and mix ambiguity possible)
- Low/mid/high-frequency onset activity aligned to a 16-step drum grid (heuristic proxies, **not accurate drum stem separation**)
- Overall RMS level, low-frequency ratio, spectral brightness and transient activity (stored for inspection/research; not all currently used by generation)

### Constraints & privacy

- This is **not** a neural foundation model, automatic fine-tuning, a sample extractor, artist cloning system, melody transcription, genre classifier or promise of professional-grade beat quality. Current audio learning changes **drum timing and optional BPM**. MIDI inputs and user ratings still influence melodic/harmonic features separately.
- Does not copy original samples or entire loops into the new beat. Derived 16-step grooves are blended with genre defaults, noise and new melodic material.
- Maximum **28 MB and 150 seconds** per imported audio file. Some formats require Safari/browser codec support. More CPU/memory-intensive than MIDI. iOS may terminate decoding large files; shorter 8–30s references are recommended.
- The audio is analyzed in the current tab: do not close it while decoding. No recording bytes leave your browser by application code.
- Only import recordings you are permitted to analyze. Commercial use of generated outputs has independent legal and quality requirements.
- LocalStorage may be removed when clearing browser data. Back up learning data using the Export button. Limits: up to 20 audio references.

## Existing v2 features

Touch piano roll, 7-track mixer with solo/mute, 808 synthesis, tempo edits, undo/redo, project save, generation, multitrack MIDI, WAV mix, individual WAV stems, offline service worker after initial load.

## Project files

- `index.html`: core generator/HTML
- `producer.js`, `producer.css`: mobile producer features
- `audio-learning.js`, `audio-learning.css`: audio analysis + UI
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: iPhone PWA

## Testing

`test_audio_learn.py` exercises real Web Audio decoding of synthetic WAV reference files in Chromium, learned style feature persistence, generation and export. `test_pro.py` covers producer controls, audio player, MIDI/WAV exports. A synthetic WAV regression for 120 BPM verified detected BPM=120, with kick onsets around steps 4 and 12. Browser tests do not substitute for actual iPhone Safari audio/permission testing.


## WaivOps Label Model v4

- Source: WaivOps HH-TRP (CC BY 4.0), DOI: https://doi.org/10.5281/zenodo.15734094
- Generator supports `groove-model.json` **only after** verified labeled training. Training is run via `.github/workflows/train-licensed-grooves.yml` / `tools/train_grooves.py`.
- Until real dataset download, schema validation and supervised training succeed, the UI explicitly says 'not trained'; no synthetic test fixture is published as a dataset-trained model.
- The new generator learns sixteen-step kick/snare/hat hit probabilities and first-order dependencies and samples *new* rhythms. It does not train a neural audio diffusion model or learn melodic phrasing.
