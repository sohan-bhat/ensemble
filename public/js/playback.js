// =========================================================================
// Ensemble — Playback Engine (Web Audio API)
// =========================================================================

import { DUR_TO_BEATS } from './renderer.js';

// Note name → semitone offset from A4
const NOTE_SEMITONES = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

function pitchToFreq(pitch) {
  const m = pitch.match(/^([A-G])(#|b)?(\d)$/);
  if (!m) return 440;
  const [, note, acc, oct] = m;
  let semitones = NOTE_SEMITONES[note] + (parseInt(oct) - 4) * 12;
  if (acc === '#') semitones += 1;
  if (acc === 'b') semitones -= 1;
  return 440 * Math.pow(2, semitones / 12);
}

// Instrument timbre configurations
const TIMBRES = {
  violin1: {
    waveform: 'sawtooth',
    gain: 0.12,
    attack: 0.04,
    decay: 0.08,
    sustain: 0.7,
    release: 0.12,
    harmonics: [1, 0.5, 0.3],
    vibratoRate: 5.5,
    vibratoDepth: 3,
    filterFreq: 4000,
  },
  violin2: {
    waveform: 'sawtooth',
    gain: 0.1,
    attack: 0.05,
    decay: 0.08,
    sustain: 0.65,
    release: 0.12,
    harmonics: [1, 0.4, 0.25],
    vibratoRate: 5.2,
    vibratoDepth: 2.5,
    filterFreq: 3500,
  },
  viola: {
    waveform: 'sawtooth',
    gain: 0.11,
    attack: 0.06,
    decay: 0.1,
    sustain: 0.6,
    release: 0.15,
    harmonics: [1, 0.5, 0.35, 0.15],
    vibratoRate: 5.0,
    vibratoDepth: 2.5,
    filterFreq: 2800,
  },
  cello: {
    waveform: 'sawtooth',
    gain: 0.13,
    attack: 0.07,
    decay: 0.12,
    sustain: 0.6,
    release: 0.18,
    harmonics: [1, 0.6, 0.4, 0.2],
    vibratoRate: 4.5,
    vibratoDepth: 2,
    filterFreq: 2000,
  },
  contrabass: {
    waveform: 'sawtooth',
    gain: 0.14,
    attack: 0.08,
    decay: 0.15,
    sustain: 0.55,
    release: 0.2,
    harmonics: [1, 0.7, 0.4, 0.2, 0.1],
    vibratoRate: 4.0,
    vibratoDepth: 1.5,
    filterFreq: 1200,
  },
};

// ---------------------------------------------------------------------------
// PlaybackEngine
// ---------------------------------------------------------------------------
export class PlaybackEngine {
  constructor() {
    this.audioCtx = null;
    this.playing = false;
    this.startTime = 0;
    this.startMeasure = 1;
    this.scheduledNodes = [];
    this.mutedInstruments = new Set();
    this.soloInstrument = null;
    this.onMeasureChange = null; // callback(measureNum)
    this.onPlaybackTick = null;  // callback({ measure, beatFraction, stopped })
    this._animFrame = null;
  }

  _ensureContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Play the score from a given measure.
   */
  play(scoreData, fromMeasure = 1) {
    this._ensureContext();
    this.stop();

    this.playing = true;
    this.startMeasure = fromMeasure;

    const { score, notes } = scoreData;
    const tempo = score.tempo;
    const [beatsNum] = score.time_signature.split('/').map(Number);
    const secPerBeat = 60 / tempo;

    this.startTime = this.audioCtx.currentTime;

    // Schedule all notes
    for (const note of notes) {
      if (note.is_rest) continue;
      if (note.measure < fromMeasure) continue;

      // Check mute/solo
      if (this.soloInstrument && note.instrument_id !== this.soloInstrument) continue;
      if (this.mutedInstruments.has(note.instrument_id)) continue;

      const measureOffset = note.measure - fromMeasure;
      const beatOffset = measureOffset * beatsNum + (note.beat - 1);
      const noteStart = this.startTime + beatOffset * secPerBeat;
      const durBeats = DUR_TO_BEATS[note.duration] || 1;
      const noteDur = durBeats * secPerBeat;

      // Don't schedule notes too far in the future for memory
      // (schedule all for now — scores are max 32 measures)
      this._scheduleNote(note.instrument_id, note.pitch, noteStart, noteDur);
    }

    // Calculate total duration
    const lastMeasure = score.total_measures;
    const totalBeats = (lastMeasure - fromMeasure + 1) * beatsNum;
    this._totalDuration = totalBeats * secPerBeat;

    // Start animation loop for playhead
    this._animateMeasure(scoreData);
  }

  stop() {
    this.playing = false;
    // Stop all scheduled nodes
    for (const node of this.scheduledNodes) {
      try { node.stop(); } catch (_) {}
    }
    this.scheduledNodes = [];
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
    if (this.onPlaybackTick) this.onPlaybackTick({ stopped: true });
  }

  toggleMute(instrumentId) {
    if (this.mutedInstruments.has(instrumentId)) {
      this.mutedInstruments.delete(instrumentId);
    } else {
      this.mutedInstruments.add(instrumentId);
    }
  }

  toggleSolo(instrumentId) {
    if (this.soloInstrument === instrumentId) {
      this.soloInstrument = null;
    } else {
      this.soloInstrument = instrumentId;
    }
  }

  // -------------------------------------------------------------------------
  // Schedule a single note
  // -------------------------------------------------------------------------
  _scheduleNote(instrumentId, pitch, startTime, duration) {
    const timbre = TIMBRES[instrumentId] || TIMBRES.violin1;
    const freq = pitchToFreq(pitch);
    const ctx = this.audioCtx;

    // Master gain for this note
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    // Low-pass filter for warmth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = timbre.filterFreq;
    filter.Q.value = 1;
    filter.connect(masterGain);

    // Create oscillators for harmonics
    const oscs = [];
    for (let h = 0; h < timbre.harmonics.length; h++) {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = timbre.waveform;
      osc.frequency.value = freq * (h + 1);
      oscGain.gain.value = timbre.harmonics[h] * timbre.gain;
      osc.connect(oscGain);
      oscGain.connect(filter);
      oscs.push(osc);
      this.scheduledNodes.push(osc);
    }

    // Vibrato LFO
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = timbre.vibratoRate;
    lfoGain.gain.value = timbre.vibratoDepth;
    lfo.connect(lfoGain);
    for (const osc of oscs) {
      lfoGain.connect(osc.frequency);
    }

    // ADSR envelope on masterGain
    const { attack, decay, sustain, release } = timbre;
    const endTime = startTime + duration;
    masterGain.gain.setValueAtTime(0, startTime);
    masterGain.gain.linearRampToValueAtTime(1, startTime + attack);
    masterGain.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
    masterGain.gain.setValueAtTime(sustain, endTime - release);
    masterGain.gain.linearRampToValueAtTime(0, endTime);

    // Start / stop
    for (const osc of oscs) {
      osc.start(startTime);
      osc.stop(endTime + 0.05);
    }
    lfo.start(startTime);
    lfo.stop(endTime + 0.05);
    this.scheduledNodes.push(lfo);
  }

  // -------------------------------------------------------------------------
  // Animate playhead (measure indicator)
  // -------------------------------------------------------------------------
  _animateMeasure(scoreData) {
    const { score } = scoreData;
    const [beatsNum] = score.time_signature.split('/').map(Number);
    const secPerBeat = 60 / score.tempo;
    const secPerMeasure = beatsNum * secPerBeat;

    const tick = () => {
      if (!this.playing) return;

      const elapsed = this.audioCtx.currentTime - this.startTime;
      if (elapsed >= this._totalDuration) {
        this.stop();
        if (this.onMeasureChange) this.onMeasureChange(this.startMeasure);
        return;
      }

      const currentMeasure = this.startMeasure + Math.floor(elapsed / secPerMeasure);
      if (this.onMeasureChange) this.onMeasureChange(currentMeasure);

      // Beat-level position for playhead
      const elapsedInMeasure = elapsed - (currentMeasure - this.startMeasure) * secPerMeasure;
      const beatFraction = elapsedInMeasure / secPerMeasure; // 0.0 to 1.0
      if (this.onPlaybackTick) {
        this.onPlaybackTick({ measure: currentMeasure, beatFraction, stopped: false });
      }

      this._animFrame = requestAnimationFrame(tick);
    };

    this._animFrame = requestAnimationFrame(tick);
  }
}
