/* ============================================================
   TD2 systems/audio.js — WebAudio: synthesized SFX + dynamic
   music sequencer (menu / wave / boss / deep modes + danger
   layer). No external assets. Volume routing from save.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.audio = (() => {
  const { SCALES } = TD2.config;
  let ctx = null, master, musicGain, sfxGain, uiGain, dangerGain;
  let ready = false, muted = false;

  /* ---------- init ---------- */
  const init = () => {
    if (ready) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.connect(master);
      dangerGain = ctx.createGain(); dangerGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.connect(master);
      uiGain = ctx.createGain(); uiGain.connect(master);
      applyVolumes();
      ready = true;
    } catch (e) { console.warn("[audio] init failed", e); }
  };
  const unlock = () => { init(); if (ctx && ctx.state === "suspended") ctx.resume(); };

  const applyVolumes = () => {
    if (!master) return;
    const s = TD2.save.get().settings;
    master.gain.value = muted ? 0 : s.master;
    musicGain.gain.value = s.music; sfxGain.gain.value = s.sfx; uiGain.gain.value = s.sfx * 0.9;
    dangerGain.gain.value = s.music * 0.9;
  };
  const setMuted = (m) => { muted = m; applyVolumes(); };
  const isMuted = () => muted;

  /* ---------- synth primitives ---------- */
  const osc = (type, f0, f1, t0, dur, gain, dest, curve = "exp") => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && curve === "exp") o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    else if (f1) o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  };
  let noiseBuf = null;
  const noise = (t0, dur, gain, { f0 = 3000, f1 = 300, q = 1, type = "lowpass", dest } = {}) => {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(dest || sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  };

  /* ---------- SFX bank ---------- */
  const sfx = (name, opt = {}) => {
    if (!ready || muted) return;
    const t = ctx.currentTime;
    switch (name) {
      case "key": osc("square", 1400 + Math.random() * 500, 0, t, 0.045, 0.06, uiGain); break;
      case "back": osc("square", 700, 400, t, 0.06, 0.06, uiGain); break;
      case "ok": osc("sine", 660, 0, t, 0.08, 0.12, uiGain); osc("sine", 990, 0, t + 0.07, 0.12, 0.10, uiGain); break;
      case "err": osc("square", 180, 140, t, 0.24, 0.16, uiGain); osc("square", 92, 70, t + 0.02, 0.24, 0.10, uiGain); break;
      case "click": osc("triangle", 500, 900, t, 0.07, 0.10, uiGain); break;
      case "select": osc("sine", 520, 1040, t, 0.10, 0.12, uiGain); break;
      case "charge": osc("sawtooth", 180, 1400, t, 0.22, 0.10); break;
      case "laser": {
        const n = opt.combo || 0;
        osc("sawtooth", 980 + n * 40, 110, t, 0.22, 0.22);
        osc("sine", 1960, 220, t, 0.16, 0.10);
        noise(t, 0.14, 0.12, { f0: 6000, f1: 800 });
        break;
      }
      case "boom": {
        noise(t, 0.5, 0.30, { f0: 3000, f1: 180 });
        osc("sine", 120, 38, t, 0.4, 0.30);
        if (opt.big) { noise(t + 0.05, 0.9, 0.30, { f0: 1600, f1: 60 }); osc("sine", 80, 28, t, 0.9, 0.34); }
        break;
      }
      case "shield": osc("triangle", 1200, 2400, t, 0.12, 0.14); noise(t, 0.1, 0.08, { f0: 8000, f1: 3000, type: "highpass" }); break;
      case "shieldPop": noise(t, 0.3, 0.2, { f0: 5000, f1: 500 }); osc("sine", 300, 60, t, 0.3, 0.2); break;
      case "breach": osc("sawtooth", 140, 60, t, 0.5, 0.28); noise(t, 0.45, 0.24, { f0: 900, f1: 100 }); break;
      case "alarm": for (let i = 0; i < 3; i++) osc("square", 880, 620, t + i * 0.26, 0.2, 0.14, uiGain); break;
      case "wave": osc("sine", 392, 0, t, 0.3, 0.14, uiGain); osc("sine", 523, 0, t + 0.12, 0.3, 0.14, uiGain); osc("sine", 784, 0, t + 0.24, 0.4, 0.16, uiGain); break;
      case "waveclear": [523, 659, 784, 1046].forEach((f, i) => osc("sine", f, 0, t + i * 0.1, 0.3, 0.14, uiGain)); break;
      case "achievement": [659, 830, 988, 1318].forEach((f, i) => osc("triangle", f, 0, t + i * 0.09, 0.35, 0.13, uiGain)); break;
      case "bossroar": {
        osc("sawtooth", 65, 30, t, 1.4, 0.34); osc("sawtooth", 66.5, 31, t, 1.4, 0.28);
        noise(t, 1.2, 0.20, { f0: 500, f1: 60 }); osc("square", 130, 40, t + 0.1, 1.0, 0.14);
        break;
      }
      case "bossdie": {
        noise(t, 1.6, 0.36, { f0: 2500, f1: 40 });
        osc("sawtooth", 200, 20, t, 1.5, 0.3);
        for (let i = 0; i < 5; i++) noise(t + i * 0.18, 0.25, 0.2, { f0: 1200 - i * 150, f1: 90 });
        break;
      }
      case "glitch": for (let i = 0; i < 4; i++) osc("square", 100 + Math.random() * 1800, 80, t + i * 0.05, 0.05, 0.07); break;
      case "event": osc("triangle", 440, 880, t, 0.25, 0.13, uiGain); osc("triangle", 660, 1320, t + 0.1, 0.25, 0.1, uiGain); break;
      case "count": osc("sine", 440, 0, t, 0.12, 0.12, uiGain); break;
      case "go": osc("sine", 880, 0, t, 0.3, 0.16, uiGain); osc("sine", 1760, 0, t, 0.2, 0.08, uiGain); break;
      case "gameover": [392, 330, 262, 196].forEach((f, i) => osc("sawtooth", f, f * 0.97, t + i * 0.35, 0.5, 0.16)); break;
      case "secret": {
        osc("sine", 110, 220, t, 1.2, 0.2); osc("sine", 164.8, 329.6, t + 0.3, 1.0, 0.16);
        noise(t, 1.4, 0.06, { f0: 200, f1: 4000, type: "bandpass", q: 8 });
        break;
      }
      case "tick": osc("square", 2000, 0, t, 0.03, 0.05, uiGain); break;
    }
  };

  /* ---------- music sequencer ---------- */
  const MUSIC = {
    menu:  { bpm: 72,  scale: "minor",         root: 45, arp: [0, 2, 4, 2], bassEvery: 8, drums: false },
    wave:  { bpm: 96,  scale: "minor",         root: 45, arp: [0, 4, 2, 5], bassEvery: 4, drums: true },
    boss:  { bpm: 132, scale: "harmonicMinor", root: 43, arp: [0, 3, 5, 3], bassEvery: 2, drums: true },
    deep:  { bpm: 60,  scale: "phrygian",      root: 41, arp: [0, 5, 3, 7], bassEvery: 8, drums: false },
  };
  let mode = null, intensity = 0.4, step = 0, nextTime = 0, timer = null, drumsOn = true;

  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const scheduleStep = (when) => {
    const M = MUSIC[mode]; if (!M) return;
    const scale = SCALES[M.scale];
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const root = M.root + 12 * Math.floor(bar / 4);
    // bass
    if (s16 % M.bassEvery === 0) {
      osc("triangle", midiHz(root), 0, when, 0.4, 0.16, musicGain, "lin");
      osc("sine", midiHz(root - 12), 0, when, 0.4, 0.12, musicGain, "lin");
    }
    // arp lead — density scales with intensity
    if (Math.random() < 0.35 + intensity * 0.5) {
      const deg = scale[(M.arp[s16 % M.arp.length] + bar) % scale.length];
      const oct = 12 * (1 + (s16 % 4 === 0 ? 1 : 0));
      osc("square", midiHz(root + deg + oct), 0, when, 0.18, 0.05 + intensity * 0.05, musicGain, "lin");
    }
    // pad every bar
    if (s16 === 0) {
      osc("sawtooth", midiHz(root + scale[0]), 0, when, 1.6, 0.035, musicGain, "lin");
      osc("sawtooth", midiHz(root + scale[2]), 0, when, 1.6, 0.03, musicGain, "lin");
    }
    // drums
    if (M.drums && drumsOn) {
      if (s16 % 4 === 0) { osc("sine", 110, 40, when, 0.15, 0.24, musicGain); noise(when, 0.06, 0.05, { f0: 200, f1: 80, dest: musicGain }); }
      if (s16 % 8 === 4) noise(when, 0.12, 0.10, { f0: 5000, f1: 1000, type: "highpass", dest: musicGain });
      if (intensity > 0.6 && s16 % 2 === 1) noise(when, 0.03, 0.03 + (intensity - 0.6) * 0.1, { f0: 8000, f1: 6000, type: "highpass", dest: musicGain });
    }
  };

  const tick = () => {
    if (!ready || !mode) return;
    const bpm = MUSIC[mode].bpm * (mode === "wave" ? 1 + intensity * 0.25 : 1);
    const stepDur = 60 / bpm / 4; // 16th notes
    while (nextTime < ctx.currentTime + 0.15) {
      scheduleStep(nextTime);
      nextTime += stepDur;
      step++;
    }
  };

  const setMode = (m, opts = {}) => {
    init(); if (!ready) return;
    if (opts.intensity != null) intensity = opts.intensity;
    if (m === mode) return;
    mode = m; step = 0;
    nextTime = ctx.currentTime + 0.05;
    if (!timer) timer = setInterval(tick, 30);
  };
  /* low-HP pulsing danger layer */
  let dangerOn = false, dangerTimer = null;
  const setDanger = (on) => {
    if (!ready || on === dangerOn) return;
    dangerOn = on;
    if (on) {
      const pulse = () => {
        if (!dangerOn) return;
        const t = ctx.currentTime;
        osc("sine", 55, 0, t, 0.5, 0.3, dangerGain, "lin");
        osc("square", 220, 0, t, 0.1, 0.05, dangerGain, "lin");
        dangerTimer = setTimeout(pulse, 600);
      };
      pulse();
    } else if (dangerTimer) { clearTimeout(dangerTimer); dangerTimer = null; }
  };

  return { init, unlock, sfx, setMode, setDanger, setMuted, isMuted, applyVolumes };
})();
