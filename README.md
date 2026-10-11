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


## Human-played Groove Model v4

- Trained only if the official Google Magenta Groove MIDI Dataset (GMD v1.0.0) is fetched and SHA-256 verified. Dataset: https://magenta.tensorflow.org/datasets/groove
- Copyright Google LLC / CC BY 4.0. Citation: Gillick et al., Learning to Groove with Inverse Sequence Transformations, ICML 2019.
- Build: Python 3 + mido 1.3.3, `python tools/train_grooves.py`, or GitHub Actions `train-licensed-grooves.yml`. Only the derived ~kB JSON model is published; MIDI/audio files remain with Google.
- Model learns step-wise and first-order drum-hit probabilities from real performed MIDI, partitioned by actual performances for evaluation. It does NOT learn Trap-specific production, melodies or sample libraries.
- The GMD model is ignored unless `groove-model.json` is valid and points to the official source; no fictitious training indicator.
