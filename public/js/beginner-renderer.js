// =========================================================================
// Ensemble — Beginner Mode Renderer (Duolingo-style colored blocks)
// =========================================================================

import { API } from './api.js';

// Note colors (consistent per letter)
const NOTE_COLORS = {
  C: '#B07CC6', // purple
  D: '#E8943A', // orange
  E: '#5CB85C', // green
  F: '#D94A7A', // pink
  G: '#5B9BD5', // blue
  A: '#E8C94A', // yellow
  B: '#CF5C5C', // red
};

// Duration → beat width multiplier
const DUR_BEATS = {
  whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25,
};

// Pitches available in beginner mode (one octave, treble clef friendly)
const BEGINNER_PITCHES = ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'];

// Staff line positions (line 0 = top, line 4 = bottom)
// In treble clef: line 0 = F5, space = E5, line 1 = D5, space = C5, line 2 = B4, space = A4, line 3 = G4, space = F4, line 4 = E4
// For beginner, we show pitches C4-C5 mapped to visual positions
function pitchToY(pitch, topY, lineSpacing) {
  const map = {
    'C5': -1, 'B4': -0.5, 'A4': 0, 'G4': 0.5,
    'F4': 1, 'E4': 1.5, 'D4': 2, 'C4': 2.5,
  };
  const pos = map[pitch] ?? 1;
  return topY + pos * lineSpacing * 2;
}

function yToPitch(y, topY, lineSpacing) {
  const pos = (y - topY) / (lineSpacing * 2);
  // Snap to nearest pitch
  let best = BEGINNER_PITCHES[0];
  let bestDist = Infinity;
  for (const p of BEGINNER_PITCHES) {
    const py = pitchToY(p, topY, lineSpacing);
    const d = Math.abs(py - y);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

// =========================================================================
// BeginnerRenderer — renders colored blocks on a simplified staff
// =========================================================================
export class BeginnerRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.sessionId = null;
    this.scoreData = null;
    this.currentInstrument = 'violin1';
    this.currentMeasure = 1;
    this.onNoteChanged = null; // callback when notes change

    // Interaction state
    this._dragging = null; // { noteId, startX, originalDur }
    this._hoverBeat = null;
    this._hoverPitch = null;

    this._bindEvents();
  }

  setSession(sessionId) { this.sessionId = sessionId; }

  render(data, measure) {
    this.scoreData = data;
    this.currentMeasure = measure || this.currentMeasure;
    this._draw();
  }

  setMeasure(m) {
    this.currentMeasure = m;
    if (this.scoreData) this._draw();
  }

  setInstrument(id) {
    this.currentInstrument = id;
    if (this.scoreData) this._draw();
  }

  // -----------------------------------------------------------------------
  // Drawing
  // -----------------------------------------------------------------------
  _draw() {
    this.container.innerHTML = '';
    const { score } = this.scoreData;
    const [beatsNum] = score.time_signature.split('/').map(Number);

    const width = Math.max(this.container.clientWidth, 600);
    const height = 220;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.display = 'block';
    this.container.appendChild(svg);

    const leftMargin = 60;
    const rightMargin = 20;
    const musicWidth = width - leftMargin - rightMargin;
    const topY = 40;
    const lineSpacing = 16;
    const beatWidth = musicWidth / beatsNum;

    this._layout = { leftMargin, musicWidth, topY, lineSpacing, beatWidth, beatsNum, svg, width, height };

    // Draw staff lines
    for (let i = 0; i < 5; i++) {
      const y = topY + i * lineSpacing * 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', leftMargin);
      line.setAttribute('y1', y);
      line.setAttribute('x2', width - rightMargin);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', '#CCC8C3');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }

    // Draw pitch labels on the left
    for (const pitch of BEGINNER_PITCHES) {
      const y = pitchToY(pitch, topY, lineSpacing);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', leftMargin - 10);
      label.setAttribute('y', y + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('fill', NOTE_COLORS[pitch[0]] || '#666');
      label.setAttribute('font-size', '12');
      label.setAttribute('font-family', 'DM Sans, sans-serif');
      label.setAttribute('font-weight', '600');
      label.textContent = pitch[0];
      svg.appendChild(label);
    }

    // Draw beat grid lines
    for (let b = 0; b <= beatsNum; b++) {
      const x = leftMargin + b * beatWidth;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', topY - 10);
      line.setAttribute('x2', x);
      line.setAttribute('y2', topY + 4 * lineSpacing * 2 + 10);
      line.setAttribute('stroke', b === 0 || b === beatsNum ? '#AAA5A0' : '#DDD5CC');
      line.setAttribute('stroke-width', b === 0 || b === beatsNum ? '1.5' : '0.5');
      line.setAttribute('stroke-dasharray', b === 0 || b === beatsNum ? 'none' : '3,3');
      svg.appendChild(line);

      // Beat number
      if (b < beatsNum) {
        const num = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        num.setAttribute('x', leftMargin + (b + 0.5) * beatWidth);
        num.setAttribute('y', topY - 18);
        num.setAttribute('text-anchor', 'middle');
        num.setAttribute('fill', '#9A9590');
        num.setAttribute('font-size', '11');
        num.setAttribute('font-family', 'DM Sans, sans-serif');
        num.textContent = b + 1;
        svg.appendChild(num);
      }
    }

    // Draw measure label
    const measLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    measLabel.setAttribute('x', width / 2);
    measLabel.setAttribute('y', height - 8);
    measLabel.setAttribute('text-anchor', 'middle');
    measLabel.setAttribute('fill', '#9A9590');
    measLabel.setAttribute('font-size', '11');
    measLabel.setAttribute('font-family', 'DM Sans, sans-serif');
    measLabel.textContent = `Measure ${this.currentMeasure}`;
    svg.appendChild(measLabel);

    // Draw note blocks
    const notes = this.scoreData.notes.filter(
      n => n.instrument_id === this.currentInstrument && n.measure === this.currentMeasure && !n.is_rest
    );

    for (const note of notes) {
      this._drawBlock(svg, note);
    }

    // Hover indicator
    this._hoverGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this._hoverGroup.style.display = 'none';
    svg.appendChild(this._hoverGroup);
  }

  _drawBlock(svg, note) {
    const { leftMargin, beatWidth, topY, lineSpacing } = this._layout;
    const dur = DUR_BEATS[note.duration] || 1;
    const x = leftMargin + (note.beat - 1) * beatWidth + 2;
    const w = dur * beatWidth - 4;
    const y = pitchToY(note.pitch, topY, lineSpacing) - 10;
    const h = 20;
    const color = NOTE_COLORS[note.pitch[0]] || '#888';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-note-id', note.id);
    g.style.cursor = 'pointer';

    // Block rect
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', color);
    rect.setAttribute('opacity', '0.85');
    g.appendChild(rect);

    // Letter label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x + w / 2);
    label.setAttribute('y', y + h / 2 + 4);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', 'white');
    label.setAttribute('font-size', '11');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', 'DM Sans, sans-serif');
    label.setAttribute('pointer-events', 'none');
    label.textContent = note.pitch[0];
    g.appendChild(label);

    // Drag handle (right edge)
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    handle.setAttribute('x', x + w - 8);
    handle.setAttribute('y', y);
    handle.setAttribute('width', 8);
    handle.setAttribute('height', h);
    handle.setAttribute('fill', 'transparent');
    handle.style.cursor = 'ew-resize';
    handle.setAttribute('data-drag-handle', note.id);
    g.appendChild(handle);

    svg.appendChild(g);
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------
  _bindEvents() {
    this.container.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.container.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.container.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.container.addEventListener('mouseleave', () => {
      this._dragging = null;
      if (this._hoverGroup) this._hoverGroup.style.display = 'none';
    });
    this.container.addEventListener('click', (e) => this._onClick(e));
  }

  _getPos(e) {
    if (!this._layout) return null;
    const rect = this.container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { leftMargin, musicWidth, topY, lineSpacing, beatWidth, beatsNum } = this._layout;

    const relX = mx - leftMargin;
    const beat = Math.max(1, Math.min(beatsNum, Math.floor(relX / beatWidth) + 1));
    const pitch = yToPitch(my, topY, lineSpacing);
    return { mx, my, beat, pitch };
  }

  _onMouseDown(e) {
    const handle = e.target.getAttribute?.('data-drag-handle');
    if (handle) {
      e.preventDefault();
      const note = this.scoreData.notes.find(n => n.id === handle);
      if (note) {
        this._dragging = { noteId: handle, startX: e.clientX, originalDur: note.duration };
      }
    }
  }

  _onMouseMove(e) {
    if (this._dragging) {
      // Update block width visually during drag
      const dx = e.clientX - this._dragging.startX;
      const { beatWidth } = this._layout;
      const origBeats = DUR_BEATS[this._dragging.originalDur] || 1;
      const beatDelta = Math.round(dx / beatWidth);
      const newBeats = Math.max(0.25, origBeats + beatDelta);
      // Find closest valid duration
      const durName = this._beatsToDuration(newBeats);
      // Visual feedback: resize the block
      const g = this._layout.svg.querySelector(`[data-note-id="${this._dragging.noteId}"]`);
      if (g) {
        const rect = g.querySelector('rect');
        const currentX = parseFloat(rect.getAttribute('x'));
        rect.setAttribute('width', Math.max(10, DUR_BEATS[durName] * beatWidth - 4));
      }
      this._dragging._newDur = durName;
      return;
    }

    // Hover preview
    const pos = this._getPos(e);
    if (!pos || !this._hoverGroup || !this._layout) return;

    const { leftMargin, beatWidth, topY, lineSpacing } = this._layout;
    const color = NOTE_COLORS[pos.pitch[0]] || '#888';
    const y = pitchToY(pos.pitch, topY, lineSpacing);
    const x = leftMargin + (pos.beat - 1) * beatWidth + 2;

    this._hoverGroup.innerHTML = '';
    this._hoverGroup.style.display = 'block';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y - 10);
    rect.setAttribute('width', beatWidth - 4);
    rect.setAttribute('height', 20);
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', color);
    rect.setAttribute('opacity', '0.25');
    rect.setAttribute('pointer-events', 'none');
    this._hoverGroup.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x + (beatWidth - 4) / 2);
    label.setAttribute('y', y + 4);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', color);
    label.setAttribute('font-size', '10');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', 'DM Sans, sans-serif');
    label.setAttribute('pointer-events', 'none');
    label.textContent = pos.pitch[0];
    this._hoverGroup.appendChild(label);
  }

  async _onMouseUp(e) {
    if (this._dragging && this._dragging._newDur) {
      const note = this.scoreData.notes.find(n => n.id === this._dragging.noteId);
      if (note && note.duration !== this._dragging._newDur) {
        try {
          const updated = await API.updateNote(note.id, {
            pitch: note.pitch, beat: note.beat,
            duration: this._dragging._newDur,
            accidental: note.accidental, dynamic: note.dynamic,
          });
          Object.assign(note, updated);
          this._draw();
          if (this.onNoteChanged) this.onNoteChanged();
        } catch (_) {}
      }
      this._dragging = null;
      return;
    }
    this._dragging = null;
  }

  async _onClick(e) {
    if (this._dragging) return;
    // Check if clicking an existing block
    const noteGroup = e.target.closest('[data-note-id]');
    if (noteGroup && !e.target.getAttribute('data-drag-handle')) {
      const noteId = noteGroup.getAttribute('data-note-id');
      await this._deleteNote(noteId);
      return;
    }

    // Place a new note
    const pos = this._getPos(e);
    if (!pos) return;

    // Check capacity
    const [beatsNum] = this.scoreData.score.time_signature.split('/').map(Number);
    const existing = this.scoreData.notes.filter(
      n => n.instrument_id === this.currentInstrument && n.measure === this.currentMeasure
    );
    const usedBeats = existing.reduce((sum, n) => sum + (DUR_BEATS[n.duration] || 0), 0);
    if (usedBeats + 1 > beatsNum) return; // 1 beat = quarter note default

    // Check if beat slot is already taken
    const occupied = existing.find(n => Math.abs(n.beat - pos.beat) < 0.01);
    if (occupied) return;

    try {
      const saved = await API.addNote({
        instrument_id: this.currentInstrument,
        pitch: pos.pitch,
        measure: this.currentMeasure,
        beat: pos.beat,
        duration: 'quarter',
        is_rest: false,
        accidental: null,
        dynamic: 'mf',
        session_id: this.sessionId,
      });
      this.scoreData.notes.push(saved);
      this._draw();
      if (this.onNoteChanged) this.onNoteChanged();
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  }

  async _deleteNote(noteId) {
    const note = this.scoreData.notes.find(n => n.id === noteId);
    if (!note) return;
    try {
      await API.deleteNote(noteId, this.sessionId);
    } catch (_) {}
    const idx = this.scoreData.notes.findIndex(n => n.id === noteId);
    if (idx !== -1) this.scoreData.notes.splice(idx, 1);
    this._draw();
    if (this.onNoteChanged) this.onNoteChanged();
  }

  _beatsToDuration(beats) {
    if (beats >= 3) return 'whole';
    if (beats >= 1.5) return 'half';
    if (beats >= 0.75) return 'quarter';
    if (beats >= 0.375) return 'eighth';
    return 'sixteenth';
  }
}
