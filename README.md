# BeatForge Producer 3.0 · Audio Learn

Mobile-first beat studio with local feature learning from owned or appropriately licensed audio references.

## Real-beat learning
Open **Lernen → Aus echten Beats lernen**. Select a WAV/MP3 file, confirm rights, optionally supply the BPM, then analyze. The browser extracts 16-step onset-derived kick/snare/hat profiles, tempo estimates, brightness, low-frequency energy and transient activity. The original recording is not stored or uploaded by this application. The extracted groove influences **new drum patterns** for the selected genre. Optional tempo matching can be enabled. We do not reconstruct melody, isolate instrument stems or train a neural network.

## Other features
Piano roll, touch sequencer, seven-channel mixer, volume/mute/solo, beats and variations, user feedback, MIDI import/export, WAV mix/stem export, autosaved projects and offline-capable PWA.

## Limits & privacy
Up to 28MB/150 seconds per audio reference, up to 20 saved derived profiles; shorter clips work best on mobile. Automatic BPM and band separation are estimates, especially unreliable for complex mastered songs. Audio stays on device; style profiles reside in browser localStorage and are included in the training-data export. Back up before deleting browser data.

Files: index.html, producer.js/css, audio-learning.js/css, sw.js, manifest.webmanifest, icons. No external runtime dependencies.
