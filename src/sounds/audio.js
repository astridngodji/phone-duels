// Web Audio API sound engine — no files needed

let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, type, duration, volume = 0.4, delay = 0) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  } catch (e) {}
}

function playNoise(duration, volume = 0.3, delay = 0) {
  try {
    const ctx = getCtx();
    const bufSize = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buf;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(volume, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    source.start(ctx.currentTime + delay);
    source.stop(ctx.currentTime + delay + duration + 0.05);
  } catch (e) {}
}

export const sounds = {
  countdown(step) {
    if (step === 3 || step === 2 || step === 1) {
      playTone(step === 1 ? 880 : 660, 'square', 0.15, 0.5);
      playNoise(0.05, 0.1);
    } else if (step === 0) {
      // FIGHT!
      playTone(220, 'sawtooth', 0.05, 0.6);
      playTone(440, 'sawtooth', 0.05, 0.5, 0.06);
      playTone(880, 'square', 0.3, 0.7, 0.12);
      playNoise(0.2, 0.3, 0.12);
      playTone(1760, 'square', 0.4, 0.5, 0.2);
    }
  },

  attack() {
    playTone(180, 'sawtooth', 0.08, 0.5);
    playNoise(0.1, 0.4);
    playTone(80, 'sine', 0.15, 0.6);
  },

  hit() {
    playTone(120, 'sawtooth', 0.05, 0.7);
    playNoise(0.12, 0.6);
    playTone(60, 'sine', 0.2, 0.5);
    // Crunch
    playTone(200, 'square', 0.03, 0.4, 0.04);
  },

  block() {
    playTone(800, 'sine', 0.08, 0.4);
    playTone(1200, 'sine', 0.06, 0.3, 0.05);
    playNoise(0.05, 0.2);
  },

  clash() {
    // Dramatic clash
    playNoise(0.3, 0.8);
    playTone(100, 'sawtooth', 0.3, 0.7);
    playTone(200, 'sawtooth', 0.25, 0.6, 0.05);
    playTone(400, 'square', 0.2, 0.5, 0.1);
    playTone(800, 'square', 0.15, 0.4, 0.15);
  },

  winner() {
    // Fanfare
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      playTone(freq, 'square', 0.3, 0.5, i * 0.15);
    });
    playTone(1047, 'sine', 0.8, 0.4, 0.7);
    playNoise(0.1, 0.2, 0.7);
  },

  ambient() {
    // Low drone
    const droneDuration = 2;
    try {
      const ctx = getCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.type = 'sine';
      osc1.frequency.value = 55;
      osc2.type = 'sine';
      osc2.frequency.value = 57.5;

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + droneDuration);
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + droneDuration);
      osc2.stop(ctx.currentTime + droneDuration);
    } catch (e) {}
  },

  playerJoin() {
    playTone(440, 'sine', 0.1, 0.4);
    playTone(660, 'sine', 0.15, 0.4, 0.1);
  },

  swing() {
    playTone(300, 'sawtooth', 0.06, 0.3);
    playNoise(0.06, 0.2);
  },
};

export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
