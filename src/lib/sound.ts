let audioCtx: AudioContext | null = null;
let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function getCtx(): AudioContext | null {
  if (!soundEnabled || typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq: number, durationMs: number, type: OscillatorType = 'sine', gainVal = 0.06, delayMs = 0) {
  const ctx = getCtx();
  if (!ctx) return;

  const start = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainVal, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.02);
}

export const soundFx = {
  move() {
    playTone(520, 75, 'triangle', 0.05);
  },
  capture() {
    playTone(640, 80, 'sine', 0.055);
    playTone(860, 100, 'sine', 0.05, 55);
  },
  win() {
    playTone(523.25, 110, 'triangle', 0.06, 0);
    playTone(659.25, 110, 'triangle', 0.06, 95);
    playTone(783.99, 180, 'triangle', 0.07, 190);
  },
  notify() {
    playTone(740, 85, 'sine', 0.045, 0);
    playTone(987, 120, 'sine', 0.045, 80);
  },
  matchFound() {
    playTone(440, 90, 'square', 0.03, 0);
    playTone(587, 90, 'square', 0.03, 95);
    playTone(880, 160, 'triangle', 0.06, 190);
  },
};
