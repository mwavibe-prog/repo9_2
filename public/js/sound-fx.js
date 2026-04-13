/**
 * Sound effects using Web Audio API - no external files needed
 */

class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      this.enabled = false;
    }
  }

  // Resume context on user gesture (required by browsers)
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ── Drop: short "plop" splash ──
  playDrop() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.15);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // ── Merge: satisfying pop/ding ──
  playMerge(tier) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const baseFreq = 400 + tier * 80;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.2, t + 0.25);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.35);

    // Sparkle overlay
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(baseFreq * 2, t + 0.03);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 3, t + 0.15);
    gain2.gain.setValueAtTime(0.15, t + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc2.start(t + 0.03);
    osc2.stop(t + 0.2);
  }

  // ── Chain: escalating combo sound ──
  playChain(depth) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 500 + depth * 150;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.1);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.3);

    // Rising arpeggio
    for (let i = 1; i <= depth; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.connect(g);
      g.connect(this.ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(freq + i * 200, t + i * 0.06);
      g.gain.setValueAtTime(0.12, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.15);
    }
  }

  // ── Countdown tick (last 10 seconds) ──
  playTick() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // ── Urgent tick (last 5 seconds) ──
  playUrgentTick() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, t + i * 0.1);
      gain.gain.setValueAtTime(0.25, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.06);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.06);
    }
  }

  // ── Round start: cheerful ascending chime ──
  playRoundStart() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.12);
      gain.gain.setValueAtTime(0.25, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.3);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.3);
    });
  }

  // ── Round end / time's up: descending tone ──
  playTimeUp() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.start(t);
    osc.stop(t + 0.8);

    // Low thud
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(120, t + 0.3);
    gain2.gain.setValueAtTime(0.4, t + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc2.start(t + 0.3);
    osc2.stop(t + 0.9);
  }

  // ── Game over: sad trombone ──
  playGameOver() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [493, 466, 440, 370]; // B4 Bb4 A4 F#4
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + i * 0.25);
      osc.frequency.linearRampToValueAtTime(freq * 0.97, t + i * 0.25 + 0.22);
      gain.gain.setValueAtTime(0.2, t + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.25 + 0.3);
      osc.start(t + i * 0.25);
      osc.stop(t + i * 0.25 + 0.35);
    });
  }
}

// Global instance
const sfx = new SoundFX();
