// =========================================================================
// Ensemble — Main Application
// =========================================================================

import { API } from './api.js';
import { ScoreRenderer } from './renderer.js';
import { NoteEditor } from './editor.js';
import { PlaybackEngine } from './playback.js';
import { BeginnerRenderer } from './beginner-renderer.js';
import { Tutorial } from './tutorial.js';

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
const SESSION_ID = crypto.randomUUID();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let scoreData = null;
let currentMeasure = 1;
let lastFetchTime = null;
let currentMode = localStorage.getItem('ensemble_mode') || 'beginner';

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
const advancedRenderer = new ScoreRenderer('score');
const beginnerRenderer = new BeginnerRenderer('score');
const playback = new PlaybackEngine();
const tutorial = new Tutorial();
let editor = null; // initialized after first fetch

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  try {
    scoreData = await API.fetchScore();
  } catch (err) {
    document.getElementById('score').innerHTML =
      '<p style="padding:2rem;color:#9A9590;">Could not load score. Is the server running?</p>';
    console.error(err);
    return;
  }

  // Set metadata in UI
  const { score } = scoreData;
  document.querySelector('.piece-title').textContent = score.title;
  document.getElementById('tempo-value').textContent = score.tempo;
  document.querySelector('.key-sig').textContent = formatKey(score.key_signature);
  document.querySelector('.time-sig').textContent = score.time_signature;
  document.querySelector('.tempo-display').innerHTML = `&#9833; = ${score.tempo}`;

  updateNoteCount();

  // Init advanced editor (used only in advanced mode)
  editor = new NoteEditor({
    sessionId: SESSION_ID,
    scoreData,
    onNoteAdded: (note) => {
      renderCurrentMode();
      updateNoteCount();
      currentMeasure = note.measure;
      document.getElementById('measure-indicator').textContent = `Measure ${currentMeasure}`;
    },
    onNoteDeleted: () => {
      renderCurrentMode();
      updateNoteCount();
    },
  });

  // Set up beginner renderer
  beginnerRenderer.setSession(SESSION_ID);
  beginnerRenderer.onNoteChanged = () => {
    updateNoteCount();
  };

  // Playback measure callback
  playback.onMeasureChange = (m) => {
    currentMeasure = m;
    document.getElementById('measure-indicator').textContent = `Measure ${m}`;
  };

  // Playhead line
  const playheadEl = document.createElement('div');
  playheadEl.className = 'playhead-line';
  document.getElementById('score-wrapper').appendChild(playheadEl);

  playback.onPlaybackTick = (data) => {
    if (data.stopped) {
      playheadEl.style.display = 'none';
      return;
    }
    if (currentMode === 'advanced') {
      const bounds = advancedRenderer.getSystemBoundsForMeasure(data.measure);
      if (!bounds) { playheadEl.style.display = 'none'; return; }
      const xPos = bounds.noteStartX + data.beatFraction * (bounds.noteEndX - bounds.noteStartX);
      playheadEl.style.display = 'block';
      playheadEl.style.left = `${xPos}px`;
      playheadEl.style.top = `${bounds.topY}px`;
      playheadEl.style.height = `${bounds.bottomY - bounds.topY}px`;
    } else {
      // In beginner mode, hide the advanced playhead (beginner has its own visual feedback)
      playheadEl.style.display = 'none';
    }
  };

  // Bind UI
  bindTransport();
  bindModeToggle();
  bindInstrumentBar();
  bindScoreClicks();
  bindKeyboard();
  startPolling();

  // Apply initial mode
  applyMode(currentMode);

  // Show tutorial if first visit for this mode
  if (tutorial.shouldShow(currentMode)) {
    setTimeout(() => tutorial.start(currentMode), 500);
  }
}

// ---------------------------------------------------------------------------
// Mode management
// ---------------------------------------------------------------------------
function applyMode(mode) {
  currentMode = mode;
  localStorage.setItem('ensemble_mode', mode);

  // Update toggle buttons
  document.getElementById('mode-beginner').classList.toggle('active', mode === 'beginner');
  document.getElementById('mode-advanced').classList.toggle('active', mode === 'advanced');

  // Show/hide mode-specific UI
  const advHint = document.getElementById('shortcut-hint-advanced');
  const begHint = document.getElementById('shortcut-hint-beginner');
  const addInst = document.querySelector('.add-instrument-area');
  const instLabels = document.getElementById('instrument-labels');
  const beginnerInstrumentBar = document.getElementById('beginner-instrument-bar');

  if (mode === 'beginner') {
    advHint.style.display = 'none';
    begHint.style.display = 'block';
    if (addInst) addInst.style.display = 'none';
    if (instLabels) instLabels.style.display = 'none';
    if (beginnerInstrumentBar) beginnerInstrumentBar.style.display = 'flex';
    // Close advanced editor if open
    if (editor && editor.isOpen) editor.close();
  } else {
    advHint.style.display = 'block';
    begHint.style.display = 'none';
    if (addInst) addInst.style.display = '';
    if (instLabels) instLabels.style.display = '';
    if (beginnerInstrumentBar) beginnerInstrumentBar.style.display = 'none';
  }

  renderCurrentMode();
}

function renderCurrentMode() {
  if (!scoreData) return;
  if (currentMode === 'beginner') {
    beginnerRenderer.render(scoreData, currentMeasure);
  } else {
    advancedRenderer.render(scoreData);
  }
}

function bindModeToggle() {
  document.getElementById('mode-beginner').addEventListener('click', () => {
    if (currentMode === 'beginner') return;
    applyMode('beginner');
    if (tutorial.shouldShow('beginner')) {
      setTimeout(() => tutorial.start('beginner'), 300);
    }
  });

  document.getElementById('mode-advanced').addEventListener('click', () => {
    if (currentMode === 'advanced') return;
    applyMode('advanced');
    if (tutorial.shouldShow('advanced')) {
      setTimeout(() => tutorial.start('advanced'), 300);
    }
  });
}

// ---------------------------------------------------------------------------
// Beginner instrument bar
// ---------------------------------------------------------------------------
function bindInstrumentBar() {
  document.querySelectorAll('.beginner-inst-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.beginner-inst-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      beginnerRenderer.setInstrument(btn.dataset.inst);
    });
  });
}

// ---------------------------------------------------------------------------
// Format key signature for display
// ---------------------------------------------------------------------------
function formatKey(key) {
  const names = {
    C: 'C Major', G: 'G Major', D: 'D Major', A: 'A Major',
    E: 'E Major', B: 'B Major', 'F#': 'F♯ Major', 'C#': 'C♯ Major',
    F: 'F Major', Bb: 'B♭ Major', Eb: 'E♭ Major', Ab: 'A♭ Major',
    Db: 'D♭ Major', Gb: 'G♭ Major', Cb: 'C♭ Major',
  };
  return names[key] || key + ' Major';
}

// ---------------------------------------------------------------------------
// Note count
// ---------------------------------------------------------------------------
async function updateNoteCount() {
  try {
    const { count } = await API.fetchNoteCount();
    document.getElementById('note-count-num').textContent = count;
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Transport controls
// ---------------------------------------------------------------------------
function bindTransport() {
  const playBtn = document.getElementById('play-btn');
  const stopBtn = document.getElementById('stop-btn');
  const prevBtn = document.getElementById('prev-measure');
  const nextBtn = document.getElementById('next-measure');

  playBtn.addEventListener('click', togglePlayback);
  stopBtn.addEventListener('click', () => {
    playback.stop();
    setPlayingUI(false);
  });

  prevBtn.addEventListener('click', () => {
    if (currentMeasure > 1) {
      currentMeasure--;
      document.getElementById('measure-indicator').textContent = `Measure ${currentMeasure}`;
      if (currentMode === 'beginner') beginnerRenderer.setMeasure(currentMeasure);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (scoreData && currentMeasure < scoreData.score.total_measures) {
      currentMeasure++;
      document.getElementById('measure-indicator').textContent = `Measure ${currentMeasure}`;
      if (currentMode === 'beginner') beginnerRenderer.setMeasure(currentMeasure);
    }
  });
}

function togglePlayback() {
  if (playback.playing) {
    playback.stop();
    setPlayingUI(false);
  } else {
    playback.play(scoreData, currentMeasure);
    setPlayingUI(true);

    // When playback finishes naturally, reset UI
    const checkStop = setInterval(() => {
      if (!playback.playing) {
        setPlayingUI(false);
        clearInterval(checkStop);
      }
    }, 200);
  }
}

function setPlayingUI(playing) {
  document.getElementById('play-icon').style.display = playing ? 'none' : 'block';
  document.getElementById('pause-icon').style.display = playing ? 'block' : 'none';
}

// ---------------------------------------------------------------------------
// Score click → open editor (advanced mode only)
// ---------------------------------------------------------------------------
function bindScoreClicks() {
  document.getElementById('score').addEventListener('click', (e) => {
    if (currentMode !== 'advanced') return;
    if (editor && editor.isOpen) return;
    const hit = advancedRenderer.hitTest(e.clientX, e.clientY);
    if (hit) {
      editor.updateScoreData(scoreData);
      editor.open(hit.instrumentId, hit.instrumentName, hit.clef, hit.measure);
    }
  });
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlayback();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (currentMode === 'advanced' && editor && editor.isOpen) {
          editor.prevMeasure();
        } else if (currentMeasure > 1) {
          currentMeasure--;
          document.getElementById('measure-indicator').textContent = `Measure ${currentMeasure}`;
          if (currentMode === 'beginner') beginnerRenderer.setMeasure(currentMeasure);
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (currentMode === 'advanced' && editor && editor.isOpen) {
          editor.nextMeasure();
        } else if (scoreData && currentMeasure < scoreData.score.total_measures) {
          currentMeasure++;
          document.getElementById('measure-indicator').textContent = `Measure ${currentMeasure}`;
          if (currentMode === 'beginner') beginnerRenderer.setMeasure(currentMeasure);
        }
        break;
      case 'e':
      case 'E':
        if (currentMode === 'advanced' && editor && !editor.isOpen && scoreData) {
          const inst = scoreData.instruments[0];
          editor.updateScoreData(scoreData);
          editor.open(inst.id, inst.name, inst.clef, currentMeasure);
        }
        break;
      case 'Escape':
        if (currentMode === 'advanced' && editor && editor.isOpen) editor.close();
        break;
      case '1': case '2': case '3': case '4': case '5':
        if (currentMode === 'advanced' && editor && editor.isOpen) {
          editor.selectDuration(parseInt(e.key));
        }
        break;
      case 'r':
      case 'R':
        if (currentMode === 'advanced' && editor && editor.isOpen) editor.toggleRest();
        break;
      case 'z':
        if ((e.metaKey || e.ctrlKey) && currentMode === 'advanced' && editor && editor.isOpen) {
          e.preventDefault();
          editor.undo();
        }
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// Polling for new notes from other contributors
// ---------------------------------------------------------------------------
function startPolling() {
  lastFetchTime = new Date().toISOString();

  setInterval(async () => {
    if (!lastFetchTime) return;
    try {
      const { notes: newNotes } = await API.fetchNotesSince(lastFetchTime);
      if (newNotes.length > 0) {
        // Merge new notes (avoid duplicates)
        const existingIds = new Set(scoreData.notes.map(n => n.id));
        let added = 0;
        for (const n of newNotes) {
          if (!existingIds.has(n.id)) {
            scoreData.notes.push(n);
            added++;
          }
        }
        if (added > 0) {
          renderCurrentMode();
          updateNoteCount();
        }
      }
      lastFetchTime = new Date().toISOString();
    } catch (_) {}
  }, 15000);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();
