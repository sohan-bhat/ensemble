const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'ensemble.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS score (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT NOT NULL DEFAULT 'Untitled No. 1',
    key_signature TEXT NOT NULL DEFAULT 'D',
    time_signature TEXT NOT NULL DEFAULT '4/4',
    tempo INTEGER NOT NULL DEFAULT 100,
    total_measures INTEGER NOT NULL DEFAULT 32
  );

  CREATE TABLE IF NOT EXISTS instruments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    clef TEXT NOT NULL,
    sort_order INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    instrument_id TEXT NOT NULL,
    pitch TEXT NOT NULL,
    measure INTEGER NOT NULL,
    beat REAL NOT NULL,
    duration TEXT NOT NULL,
    is_rest INTEGER NOT NULL DEFAULT 0,
    accidental TEXT,
    dynamic TEXT DEFAULT 'mf',
    session_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (instrument_id) REFERENCES instruments(id)
  );

  CREATE INDEX IF NOT EXISTS idx_notes_instrument ON notes(instrument_id);
  CREATE INDEX IF NOT EXISTS idx_notes_measure ON notes(measure);
  CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
`);

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
const scoreExists = db.prepare('SELECT COUNT(*) as count FROM score').get();
if (scoreExists.count === 0) {
  db.prepare(`INSERT INTO score (id, title, key_signature, time_signature, tempo, total_measures)
              VALUES (1, 'Untitled No. 1', 'D', '4/4', 100, 32)`).run();
}

const instrumentCount = db.prepare('SELECT COUNT(*) as count FROM instruments').get();
if (instrumentCount.count === 0) {
  const ins = db.prepare('INSERT INTO instruments VALUES (?, ?, ?, ?, ?)');
  ins.run('violin1',    'Violin I',      'Vln. I',  'treble', 1);
  ins.run('violin2',    'Violin II',     'Vln. II', 'treble', 2);
  ins.run('viola',      'Viola',         'Vla.',    'alto',   3);
  ins.run('cello',      'Violoncello',   'Vc.',     'bass',   4);
  ins.run('contrabass', 'Contrabass',    'Cb.',     'bass',   5);
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// Full score (metadata + instruments + all notes)
app.get('/api/score', (req, res) => {
  const score = db.prepare('SELECT * FROM score WHERE id = 1').get();
  const instruments = db.prepare('SELECT * FROM instruments ORDER BY sort_order').all();
  const notes = db.prepare('SELECT * FROM notes ORDER BY measure, beat').all();
  res.json({ score, instruments, notes });
});

// Add a note
app.post('/api/notes', (req, res) => {
  const { instrument_id, pitch, measure, beat, duration, is_rest, accidental, dynamic, session_id } = req.body;

  // Validate measure is within range
  const score = db.prepare('SELECT total_measures FROM score WHERE id = 1').get();
  if (measure < 1 || measure > score.total_measures) {
    return res.status(400).json({ error: 'Measure out of range' });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO notes (id, instrument_id, pitch, measure, beat, duration, is_rest, accidental, dynamic, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, instrument_id, pitch, measure, beat, duration, is_rest ? 1 : 0, accidental || null, dynamic || 'mf', session_id);

  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  res.json(note);
});

// Delete a note (session-scoped)
app.delete('/api/notes/:id', (req, res) => {
  const { session_id } = req.body || {};
  const result = db.prepare('DELETE FROM notes WHERE id = ? AND session_id = ?').run(req.params.id, session_id);
  if (result.changes > 0) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Note not found or not owned by this session' });
  }
});

// Update a note
app.put('/api/notes/:id', (req, res) => {
  const { pitch, beat, duration, accidental, dynamic } = req.body;
  const result = db.prepare(`
    UPDATE notes SET pitch = ?, beat = ?, duration = ?, accidental = ?, dynamic = ?
    WHERE id = ?
  `).run(pitch, beat, duration, accidental || null, dynamic || 'mf', req.params.id);
  if (result.changes > 0) {
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
    res.json(note);
  } else {
    res.status(404).json({ error: 'Note not found' });
  }
});

// Fetch notes added since a timestamp (for polling)
app.get('/api/notes/since/:timestamp', (req, res) => {
  const notes = db.prepare('SELECT * FROM notes WHERE created_at > ? ORDER BY measure, beat').all(req.params.timestamp);
  res.json({ notes });
});

// Note count
app.get('/api/notes/count', (req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM notes WHERE is_rest = 0').get();
  res.json({ count });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Ensemble running at http://localhost:${PORT}`);
});
