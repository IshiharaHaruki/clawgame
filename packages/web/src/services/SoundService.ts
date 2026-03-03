const THROTTLE_MS = 200;

class SoundServiceImpl {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private lastPlayAt = 0;

  enable(): void {
    this.enabled = true;
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Short click sound for tool calls (800Hz square 30ms) */
  playKeyclick(): void {
    this.play((ctx, t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.03);
    });
  }

  /** Error alert (200Hz sawtooth 200ms) */
  playError(): void {
    this.play((ctx, t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 200;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  /** Notification chime (C5-E5-G5 ascending sine) */
  playNotification(): void {
    this.play((ctx, t) => {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      for (let i = 0; i < notes.length; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = notes[i];
        const start = t + i * 0.08;
        gain.gain.setValueAtTime(0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.15);
      }
    });
  }

  /** Cron trigger (440Hz triangle 100ms) */
  playCronTrigger(): void {
    this.play((ctx, t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    });
  }

  private play(fn: (ctx: AudioContext, time: number) => void): void {
    if (!this.enabled || !this.ctx) return;
    const now = Date.now();
    if (now - this.lastPlayAt < THROTTLE_MS) return;
    this.lastPlayAt = now;
    fn(this.ctx, this.ctx.currentTime);
  }
}

export const SoundService = new SoundServiceImpl();
