/* ============================================================
   TD2 systems/fx.js — centralized pooled VFX manager
   Particles, shockwave rings, lasers, floating text, glyph
   shatter, screen shake (trauma model), glitch slices, flash.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.fx = (() => {
  const { rand, randi, pick, clamp } = TD2.util;
  const C = TD2.config.colors;

  /* ---------- particle pool ---------- */
  const MAX = 4800;
  const pool = new Array(MAX);
  for (let i = 0; i < MAX; i++) pool[i] = { on: false };
  let pCount = 0;

  const spawnP = () => {
    // linear scan is fine given churn; start search at rotating cursor
    for (let k = 0; k < MAX; k++) {
      const p = pool[cursor];
      cursor = (cursor + 1) % MAX;
      if (!p.on) { pCount++; return p; }
    }
    return null; // pool exhausted — drop effect, never crash
  };
  let cursor = 0;

  const rings = [], texts = [], lasers = [];

  /* ---------- stateful overlays ---------- */
  let trauma = 0, shakeX = 0, shakeY = 0;
  let flashT = 0, flashDur = 0, flashColor = "#fff", flashA = 0;
  let glitchT = 0, glitchDur = 0, glitchStrength = 1;
  let reducedFx = false;

  const spawn = (x, y, o = {}) => {
    const p = spawnP();
    if (!p) return null;
    p.on = true;
    p.x = x; p.y = y;
    const ang = o.dir != null ? o.dir + rand(-(o.spread ?? Math.PI), (o.spread ?? Math.PI)) : rand(0, Math.PI * 2);
    const sp = o.speed ?? rand(40, 180);
    p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
    p.life = p.maxLife = o.life ?? rand(0.3, 0.8);
    p.size = o.size ?? rand(1.5, 3.5);
    p.color = o.color ?? C.cyan;
    p.grav = o.grav ?? 0;
    p.drag = o.drag ?? 0.98;
    p.type = o.type ?? "dot";         // dot | spark | glyph | smoke
    p.glyph = o.glyph ?? "";
    p.rot = o.rot ?? rand(0, Math.PI * 2);
    p.vr = o.vr ?? rand(-4, 4);
    p.add = o.add ?? false;           // additive blending
    return p;
  };

  /* ---------- public API ---------- */
  const burst = (x, y, o = {}) => {
    if (reducedFx) o = { ...o, count: Math.ceil((o.count ?? 18) / 3) };
    const n = o.count ?? 18;
    for (let i = 0; i < n; i++) {
      spawn(x, y, {
        color: Array.isArray(o.color) ? pick(o.color) : o.color,
        speed: o.speed ?? rand(60, 240),
        size: o.size, life: o.life ?? rand(0.25, 0.7),
        grav: o.grav ?? 120, type: o.type ?? "dot", add: o.add ?? true,
      });
    }
  };
  const sparks = (x, y, n = 8, color = C.gold, dir = Math.PI / 2) => {
    if (reducedFx) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      spawn(x, y, { color, dir, spread: 0.7, speed: rand(150, 420), life: rand(0.1, 0.35), size: rand(1, 2), type: "spark", add: true, grav: 200 });
    }
  };
  const smoke = (x, y, n = 5) => {
    for (let i = 0; i < n; i++) {
      spawn(x + rand(-8, 8), y + rand(-8, 8), {
        color: "rgba(120,140,160,0.25)", speed: rand(10, 40), dir: -Math.PI / 2, spread: 0.9,
        life: rand(0.6, 1.3), size: rand(6, 14), type: "smoke", drag: 0.96, grav: -30,
      });
    }
  };
  const glyphs = (x, y, str, color = C.white, life = 0.9) => {
    const chars = [...str];
    for (let i = 0; i < chars.length; i++) {
      const p = spawn(x + (i - chars.length / 2) * 12, y, {
        color, speed: rand(60, 200), life: life * rand(0.7, 1.15),
        size: rand(10, 15), type: "glyph", glyph: chars[i], add: false, grav: 60, vr: rand(-6, 6),
      });
      if (p) { p.vx = rand(-140, 140); p.vy = rand(-180, -40); }
    }
  };
  const ring = (x, y, o = {}) => {
    if (reducedFx && Math.random() < 0.4) return;
    rings.push({ x, y, r: o.r0 ?? 4, vr: o.speed ?? 420, life: o.life ?? 0.45, maxLife: o.life ?? 0.45, color: o.color ?? C.cyan, width: o.width ?? 3 });
  };
  const laser = (x1, y1, x2, y2, o = {}) => {
    lasers.push({ x1, y1, x2, y2, life: o.dur ?? 0.22, maxLife: o.dur ?? 0.22, color: o.color ?? C.green, width: o.width ?? 5 });
    burst(x2, y2, { count: reducedFx ? 8 : 24, color: [o.color ?? C.green, C.white, C.cyan], speed: rand(120, 320) });
    ring(x2, y2, { color: o.color ?? C.green, speed: 300, life: 0.3 });
  };
  const muzzle = (x, y, angle, color = C.green) => {
    for (let i = 0; i < (reducedFx ? 4 : 10); i++) {
      spawn(x, y, { color: pick([color, C.white]), dir: angle, spread: 0.5, speed: rand(80, 260), life: rand(0.08, 0.2), size: rand(1.5, 3), type: "spark", add: true });
    }
  };
  const floatText = (x, y, text, o = {}) => {
    // damageNumbers=false hides score/damage popups; system labels always show
    if (o.gated && !TD2.save.getSetting("damageNumbers")) return;
    texts.push({ x, y, text, color: o.color ?? C.white, life: o.life ?? 0.9, maxLife: o.life ?? 0.9, size: o.size ?? 15, vy: o.vy ?? -55, align: o.align ?? "center" });
  };
  const shake = (amt = 0.4) => { if (TD2.save.getSetting("screenShake")) trauma = Math.min(1, trauma + amt); };
  const flash = (color = "#ffffff", a = 0.25, dur = 0.25) => { flashColor = color; flashA = a; flashDur = flashT = dur; };
  const glitch = (dur = 0.4, strength = 1) => { glitchDur = glitchT = dur; glitchStrength = strength; };
  const setReduced = (r) => { reducedFx = r; };
  let colorblind = false;
  const setColorblind = (v) => { colorblind = !!v; };

  /* ---------- update ---------- */
  const update = (dt) => {
    pCount = 0;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      pCount++;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += (p.grav || 0) * dt;
      if (p.drag !== 1) { const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; }
      p.rot += (p.vr || 0) * dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.life -= dt; r.r += r.vr * dt;
      if (r.life <= 0) rings.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= Math.pow(0.95, dt * 60);
      if (t.life <= 0) texts.splice(i, 1);
    }
    for (let i = lasers.length - 1; i >= 0; i--) {
      lasers[i].life -= dt;
      if (lasers[i].life <= 0) lasers.splice(i, 1);
    }
    trauma = Math.max(0, trauma - dt * 1.6);
    const sh = trauma * trauma;
    shakeX = rand(-1, 1) * sh * 22; shakeY = rand(-1, 1) * sh * 22;
    if (flashT > 0) flashT -= dt;
    if (glitchT > 0) glitchT -= dt;
  };

  /* ---------- render (world space, before HUD-ish DOM) ---------- */
  const render = (ctx) => {
    // rings
    ctx.save();
    for (const r of rings) {
      const a = r.life / r.maxLife;
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * a + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.r), 0, Math.PI * 2); ctx.stroke();
    }
    // particles
    let currentOp = "source-over";
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.on) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      const wantOp = p.add ? "lighter" : "source-over";
      if (wantOp !== currentOp) { ctx.globalCompositeOperation = wantOp; currentOp = wantOp; }
      ctx.globalAlpha = a;
      if (p.type === "glyph") {
        ctx.font = `${p.size}px "Cascadia Code", Consolas, monospace`;
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.textAlign = "center";
        ctx.fillText(p.glyph, 0, 0); ctx.restore();
      } else if (p.type === "smoke") {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        if (p.type === "spark") {
          ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, p.size * 0.6);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";
    // lasers
    for (const l of lasers) {
      const a = l.life / l.maxLife;
      ctx.globalAlpha = a;
      ctx.strokeStyle = l.color; ctx.lineWidth = l.width * (0.5 + a) + 4; ctx.lineCap = "round";
      ctx.shadowColor = l.color; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, l.width * a * 0.5);
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    }
    // floating texts
    ctx.textAlign = "center";
    for (const t of texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 ${t.size}px "Cascadia Code", Consolas, monospace`;
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color; ctx.shadowBlur = 10;
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  /* ---------- post pass (screen space: flash, glitch slices) ---------- */
  const renderPost = (ctx, canvas, w, h) => {
    if (glitchT > 0 && !reducedFx) {
      const slices = randi(1, 3);
      for (let i = 0; i < slices; i++) {
        const sy = rand(0, h * 0.8), sh = rand(4, 14);
        const shift = rand(8, 24) * glitchStrength * (Math.random() < 0.5 ? -1 : 1);
        try { ctx.drawImage(canvas, 0, sy, w, sh, shift, sy, w, sh); } catch (e) { /* ignore self-copy edge */ }
      }
    }
    if (flashT > 0) {
      ctx.globalAlpha = flashA * (flashT / flashDur);
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  };

  const getShake = () => ({ x: shakeX, y: shakeY });

  return { burst, sparks, smoke, glyphs, ring, laser, muzzle, floatText, shake, flash, glitch, setReduced, setColorblind, get colorblind() { return colorblind; }, update, render, renderPost, getShake };
})();
