// Звуки синтезом WebAudio: без файлов. Контекст создаётся по первому жесту игрока.
let ctx = null;
let master = null;
let muted = false;
let lastGulp = 0;

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
}

export function setMuted(on) {
  muted = on;
  if (master) master.gain.value = on ? 0 : 0.6;
}

export const isMuted = () => muted;

function tone({ freq, freqEnd = freq, dur, type = 'sine', gain = 0.2, when = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur, freq, freqEnd = freq, gain }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
    data[i] = last * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  // «глоток»: чем крупнее съеденное, тем ниже и громче
  gulp: (size) => {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (size < 2 && now - lastGulp < 0.05) return;
    lastGulp = now;
    const k = Math.min(1, size / 14);
    tone({ freq: 520 - 380 * k, freqEnd: 90 - 50 * k, dur: 0.18 + 0.4 * k, gain: 0.1 + 0.25 * k });
    if (k > 0.3) noise({ dur: 0.6 + k, freq: 600, freqEnd: 50, gain: 0.2 + 0.4 * k });
  },
  unlock: () => [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.12, when: i * 0.08 })),
  tick: () => tone({ freq: 1000, dur: 0.06, type: 'square', gain: 0.05 }),
  end: (stars) => [392, 523, 659, 784].slice(0, stars + 1).forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.14, when: i * 0.14 })),
};
