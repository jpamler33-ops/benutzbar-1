# BeatForge Producer 2.0

Mobile-first, local-first music composition and production prototype. Free static PWA; no backend, sign-in, AI API fees, or copyrighted sound packs.

## Working features

- 7 genre presets and adaptive rhythm/harmony generator (feedback is rule-based, NOT AI neural training)
- Touch piano roll for 3 pitched lanes, note length, transposition, scale guidance, bar navigation
- 7-track step sequencer for drums; full bar copy/paste/clear, Undo/Redo
- 7-track volume, mute, solo mixer and master gain; select melody and 808 timbres
- Tempo, song title, autosaved working session in local browser storage
- Multitrack MIDI export, stereo WAV mix export, isolated WAV stems, import/export project JSON
- Responsive touch layout, browser audio test, offline PWA after first install and caching

## iPhone install

Open the public HTTPS site in Safari > Share > Add to Home Screen. Restart from Safari if using a stale home-screen icon. Volume may depend on audio output route and Safari gesture restrictions.

## Important limitations

- Quality: synth demo instruments, no studio-grade sampled libraries / mixing/mastering engine.
- Song/session and rating storage lives in each browser origin. Clearing Safari data deletes it. Export projects regularly.
- Ratings adjust next generations through statistical feature weighting; it does not train a neural model on audio.
- MIDI references require rights; do not upload unlicensed recordings to a future training service.

## Developer notes

Static HTML, CSS, JS, no runtime dependencies. Smoke tests in test_pro.py.