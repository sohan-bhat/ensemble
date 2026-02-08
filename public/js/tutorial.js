// =========================================================================
// Ensemble — Tutorial Walkthrough System
// =========================================================================

const BEGINNER_STEPS = [
  {
    title: 'Welcome to Ensemble!',
    text: 'This is a shared music score where anyone can contribute notes. Let\'s learn how it works.',
    target: null,
  },
  {
    title: 'The Score',
    text: 'This is where your music appears. Each colored block is a note — the color and letter tell you which note it is.',
    target: '#score',
  },
  {
    title: 'Place a Note',
    text: 'Click anywhere on the staff to place a note. The vertical position determines the pitch (C, D, E, F, G, A, B).',
    target: '#score',
  },
  {
    title: 'Resize Notes',
    text: 'Drag the right edge of any block to make it longer or shorter. Longer blocks play for more beats.',
    target: '#score',
  },
  {
    title: 'Navigate Measures',
    text: 'Use the arrow buttons to move between measures. A measure is one section of the music.',
    target: '.transport-center',
  },
  {
    title: 'Play Your Music',
    text: 'Press the play button or hit Space to hear what you\'ve created!',
    target: '#play-btn',
  },
  {
    title: 'You\'re Ready!',
    text: 'Start placing notes and make some music. Switch to Advanced mode anytime for full notation controls.',
    target: null,
  },
];

const ADVANCED_STEPS = [
  {
    title: 'Welcome to Ensemble!',
    text: 'This is a collaborative sheet music platform. Let\'s walk through how to contribute.',
    target: null,
  },
  {
    title: 'The Score',
    text: 'Click on any measure to open the note editor. Each instrument has its own staff line.',
    target: '#score',
  },
  {
    title: 'Duration & Tools',
    text: 'In the editor, choose a note duration (whole through sixteenth), set accidentals, dynamics, or rest mode.',
    target: null,
  },
  {
    title: 'Keyboard Shortcuts',
    text: 'Keys 1-5 select duration, R toggles rest mode, Ctrl+Z undoes. E opens the editor, Esc closes it.',
    target: '#shortcut-hint-advanced',
  },
  {
    title: 'Playback',
    text: 'Press Space or the play button to hear the score. The playhead shows the current position.',
    target: '#play-btn',
  },
  {
    title: 'You\'re Ready!',
    text: 'Click a measure to start composing. Every note you add is shared with the world.',
    target: null,
  },
];

export class Tutorial {
  constructor() {
    this.overlay = document.getElementById('tutorial-overlay');
    this.titleEl = this.overlay.querySelector('.tutorial-title');
    this.textEl = this.overlay.querySelector('.tutorial-text');
    this.counterEl = this.overlay.querySelector('.tutorial-step-counter');
    this.nextBtn = document.getElementById('tutorial-next');
    this.skipBtn = document.getElementById('tutorial-skip');
    this.backdrop = this.overlay.querySelector('.tutorial-backdrop');

    this.steps = [];
    this.currentStep = 0;
    this.mode = 'beginner';

    this.nextBtn.addEventListener('click', () => this._next());
    this.skipBtn.addEventListener('click', () => this._finish());
  }

  shouldShow(mode) {
    const key = `ensemble_tutorial_seen_${mode}`;
    return !localStorage.getItem(key);
  }

  start(mode) {
    this.mode = mode;
    this.steps = mode === 'beginner' ? BEGINNER_STEPS : ADVANCED_STEPS;
    this.currentStep = 0;
    this.overlay.classList.remove('hidden');
    this._showStep();
  }

  _showStep() {
    const step = this.steps[this.currentStep];
    if (!step) { this._finish(); return; }

    this.titleEl.textContent = step.title;
    this.textEl.textContent = step.text;
    this.counterEl.textContent = `${this.currentStep + 1} of ${this.steps.length}`;
    this.nextBtn.textContent = this.currentStep === this.steps.length - 1 ? 'Get Started' : 'Next';

    // Highlight target element
    this._clearHighlight();
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        el.classList.add('tutorial-highlight');
        // Scroll into view if needed
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  _next() {
    this.currentStep++;
    if (this.currentStep >= this.steps.length) {
      this._finish();
    } else {
      this._showStep();
    }
  }

  _finish() {
    this._clearHighlight();
    this.overlay.classList.add('hidden');
    const key = `ensemble_tutorial_seen_${this.mode}`;
    localStorage.setItem(key, '1');
  }

  _clearHighlight() {
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
      el.classList.remove('tutorial-highlight');
    });
  }
}
