# BeatForge Pocket

Mobile music-generation studio (PWA) in German. Runs locally in the browser, no account or backend.

Features: 7 genres, melodies, chords, 808 bass and drums, touch sequencer, pattern variations, MIDI import/export, WAV export, ratings-driven style feedback and generation history.

## Install on iPhone
Open the HTTPS production URL in **Safari** > Share > Add to Home Screen.

The service worker caches the core files after the first successful load; iOS may suspend audio in the background. Ratings and saved tracks are stored locally in the current browser origin. Back up project / training files before removing the app or clearing browser data. This is a rules-based/adaptive generator, not a neural network trained on copyrighted audio recordings.

## Deployment
Static web files in repository root, served by Vercel.
