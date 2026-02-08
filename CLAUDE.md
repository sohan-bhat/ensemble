# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ensemble is a collaborative sheet music platform where multiple users contribute notes to an orchestral score in real-time via a web browser. Think "shared Google Doc for sheet music."

## Commands

```bash
npm install          # Install dependencies
npm start            # Start server at http://localhost:3000
npm run dev          # Start with auto-reload (node --watch)
```

There is no build step, test suite, or linter configured. Frontend files are served as static assets.

## Architecture

**Backend**: `server.js` — Single-file Express server with SQLite (better-sqlite3).

**Frontend**: Vanilla ES6 modules in `public/js/`, no bundler. Loaded via `<script type="module">` in `public/index.html`.

### Backend (`server.js`)

- Express serves static files from `public/` and exposes a REST API
- SQLite database stored at `data/ensemble.db` (WAL mode, foreign keys enabled)
- Database auto-initializes tables and seeds default data on first run
- Three tables: `score` (single-row composition metadata), `instruments` (string quintet), `notes` (user-contributed notes)
- Session-scoped deletions: notes can only be deleted by the session that created them

### API Endpoints

- `GET /api/score` — Full score (metadata + instruments + all notes)
- `POST /api/notes` — Add a note (validated server-side)
- `DELETE /api/notes/:id` — Delete a note (requires matching session_id)
- `GET /api/notes/since/:timestamp` — Poll for new notes since ISO timestamp
- `GET /api/notes/count` — Total note count

### Frontend Modules (`public/js/`)

- **app.js** — Main controller. Bootstraps all modules, manages state (`scoreData`, `currentMeasure`, `lastFetchTime`), handles keyboard shortcuts, runs 15-second polling loop for collaborative sync
- **renderer.js** — Renders the full orchestral score as SVG using VexFlow (loaded from CDN). Handles multi-system layout (4 measures/system), key signature accidentals, auto-resting, and hit-testing for click interactions
- **editor.js** — Floating overlay for adding/editing notes in a measure. Supports pitch selection via visual staff, duration (1-5 keys), accidentals, rests (R key), dynamics, undo (Ctrl+Z), and ghost note preview
- **playback.js** — Web Audio API synthesizer. Each instrument has configured timbre (waveform, ADSR envelope, harmonics, vibrato, filter). Converts pitch strings to frequencies and schedules note playback
- **api.js** — Thin fetch wrapper around all backend endpoints

### Key Design Decisions

- No authentication — users are identified by a random session UUID (`crypto.randomUUID`)
- Real-time sync uses polling (not WebSockets)
- VexFlow 4.2.3 is loaded from CDN, not bundled
- Score is fixed at D Major, 4/4 time, 32 measures, 5 string instruments
- Database seeds a 4-measure harmonic progression (D→A→Bm→G) on empty init
