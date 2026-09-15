/* ============================================================
   TD2 entities/boss.js — boss spider entity. Hovers, phases,
   exposes behavior timers (spawn/decoy/conceal) for game.js to
   consume. Reuses spider leg/body rendering at large scale.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.boss = (() => {
  const { clamp } = TD2.util;
  const C = TD2.config.colors;
  const { DEATH } = TD2.config;
  const TIMES_G = "\u00d7", DIV_G = "\u00f7", MINUS_G = "\u2212";

  const create = (bossKey, opts = {}) => {
    const def = TD2.config.BOSSES[bossKey];
    return {
      kind: "boss",
      bossKey, def,
      size: def.size,
      hp: Math.ceil(def.hp * (opts.hpMul ?? 1)),
      maxHp: Math.ceil(def.hp * (opts.hpMul ?? 1)),
      speed: def.speed,
      x: 0.5, yF: -0.15,          // lane fraction, height fraction
      walk: 0, swayPhase: Math.random() * 6.28,
      state: "entering",           // entering | hover | dying
      dieT: 0,
      bornTime: opts.time ?? 0,    // reaction-time baseline (matches spider.bornTime)
      hitFlash: 0,
      phase: 0,
      expr: opts.expr || { text: "1 + 1", answer: 2, complexity: 3 },
      concealT: 0,                 // >0 = expression hidden
      spawnT: def.spawnEvery ?? Infinity,
      decoyT: def.decoyEvery ?? Infinity,
      bonusT: def.bonusEvery ?? Infinity,
      targeted: false,
      firstHitTime: null,
      glitch: !!def.glitch,
      deceptive: false,
      alpha: 1,
    };
  };

  /* ---------- update; returns list of event strings ---------- */
  const update = (b, dt, env) => {
    const ev = [];
    if (b.state === "dying") { b.dieT += dt; return ev; }
    b.hitFlash = Math.max(0, b.hitFlash - dt);
    b.walk += dt * 1.4;

    if (b.state === "entering") {
      b.yF += dt * 0.08;
      if (b.yF >= b.def.hoverY) { b.yF = b.def.hoverY; b.state = "hover"; ev.push("arrived"); }
    } else {
      b.swayPhase += dt * 0.5;
      b.x = 0.5 + Math.sin(b.swayPhase) * 0.18;
      b.yF = b.def.hoverY + Math.sin(b.swayPhase * 1.4) * 0.015;
    }

    if (b.state === "hover") {
      // behavior timers — game.js consumes the events
      if (b.def.spawnEvery) {
        b.spawnT -= dt;
        if (b.spawnT <= 0) { b.spawnT = currentSpawnEvery(b); ev.push("spawn"); }
      }
      if (b.def.decoyEvery) {
        b.decoyT -= dt;
        if (b.decoyT <= 0) { b.decoyT = b.def.decoyEvery; ev.push("decoys"); }
      }
      if (b.def.bonusEvery) {
        b.bonusT -= dt;
        if (b.bonusT <= 0) { b.bonusT = b.def.bonusEvery; ev.push("bonus"); }
      }
      if (b.def.concealEvery) {
        if (b.concealT > 0) b.concealT -= dt;
        else {
          b._concealCd = (b._concealCd ?? b.def.concealEvery) - dt;
          if (b._concealCd <= 0) { b._concealCd = b.def.concealEvery; b.concealT = b.def.concealDur; ev.push("conceal"); }
        }
      }
    }
    return ev;
  };

  const currentPhase = (b) => {
    const frac = b.hp / b.maxHp;
    let ph = 0;
    // bosses without a phases array (e.g. The Calculator) simply stay in phase 0
    for (let i = 0; i < (b.def.phases?.length ?? 0); i++) if (frac <= b.def.phases[i].at) ph = i;
    return ph;
  };
  const currentSpawnEvery = (b) => b.def.phases?.[currentPhase(b)]?.spawnEvery ?? b.def.spawnEvery;

  /** Apply a hit. Returns "damaged" | "spark" | "dead". */
  const hit = (b, env = {}) => {
    if (b.state === "dying") return "dead";
    // Prime Devourer armor: from phase 2, every 2nd hit of a chain (hits ≤4s apart) lands
    if (b.def.armor && currentPhase(b) >= 1) {
      const now = env.time ?? 0;
      if (b._lastHit != null && now - b._lastHit <= 4) b._chain = (b._chain ?? 0) + 1;
      else b._chain = 1;
      b._lastHit = now;
      if (b._chain % 2 === 1) return "spark";
    }
    b.hp--;
    b.hitFlash = 0.15;
    const newPhase = currentPhase(b);
    if (newPhase > b.phase) { b.phase = newPhase; ev_push(b, "phase:" + newPhase); }
    if (b.hp <= 0) { b.state = "dying"; b.dieT = 0; return "dead"; }
    return "damaged";
  };

  // tiny internal queue for phase events (consumed by game.js)
  const _phaseEvents = [];
  const ev_push = (b, e) => _phaseEvents.push({ boss: b, e });
  const drainEvents = (b) => {
    const out = _phaseEvents.filter((p) => p.boss === b).map((p) => p.e);
    for (let i = _phaseEvents.length - 1; i >= 0; i--) if (_phaseEvents[i].boss === b) _phaseEvents.splice(i, 1);
    return out;
  };

  const exprBias = (b) => (b.def.exprBias ?? 0) + (b.def.phases?.[currentPhase(b)]?.exprBias ?? 0);
  const enraged = (b) => currentPhase(b) >= (b.def.phases?.length ?? 1) - 1 && (b.def.phases?.length ?? 0) > 1;

  /* ---------- draw ---------- */
  const draw = (ctx, b, env) => {
    const W = env.w, H = env.h;
    const x = b.x * W, y = b.yF * H;
    const scale = 1;
    ctx.save();

    // entering/dying alpha
    let alpha = 1;
    if (b.state === "dying") alpha = clamp(1 - b.dieT / DEATH.dissolve, 0, 1);
    ctx.globalAlpha = alpha;

    // aura
    const enragedB = enraged(b);
    const auraColor = enragedB ? C.red : b.def.color;
    const aura = ctx.createRadialGradient(x, y, 4, x, y, b.size * 2.6);
    aura.addColorStop(0, enragedB ? "rgba(255,59,92,0.25)" : "rgba(0,229,255,0.16)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(x, y, b.size * 2.6, 0, Math.PI * 2); ctx.fill();

    // orbiting glyph ring
    const glyphs = ["+", TIMES_G, DIV_G, MINUS_G, "=", "%"];
    for (let i = 0; i < 6; i++) {
      const a = b.walk * 0.7 + (i * Math.PI) / 3;
      const gx = x + Math.cos(a) * b.size * 2.1;
      const gy = y + Math.sin(a) * b.size * 1.15;
      ctx.font = `700 ${b.size * 0.35}px monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = auraColor; ctx.globalAlpha = alpha * 0.6;
      ctx.fillText(glyphs[i], gx, gy);
      ctx.globalAlpha = alpha;
    }

    // target lock
    if (b.targeted) {
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55 + Math.sin(env.time * 6) * 0.3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.arc(x, y, b.size * 1.9, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = alpha;
    }

    const flash = b.hitFlash > 0 || (b.state === "dying" && b.dieT < DEATH.flash);
    if (flash) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 30; }

    // body via spider renderer (compatible shape)
    const fake = { ...b, size: b.size, def: { legs: b.def.legs, legLen: b.def.legLen, wobble: b.def.wobble, core: b.def.core, plate: true }, color: auraColor, shielded: false, state: b.state, dieT: b.dieT, walk: b.walk, crit: false, maxHp: b.maxHp, hp: b.hp };
    TD2.spider.drawLegs(ctx, fake, x, y, scale, 0);
    TD2.spider.drawBody(ctx, fake, x, y, scale);

    // crown spikes
    ctx.strokeStyle = auraColor; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * b.size * 0.22, y - b.size * 0.75);
      ctx.lineTo(x + i * b.size * 0.3, y - b.size * 1.15);
      ctx.stroke();
    }

    // expression (concealable)
    if (b.state !== "dying") {
      const hidden = b.concealT > 0;
      const txt = hidden ? "?¿?¿?" : b.expr.text;
      ctx.font = `700 ${Math.max(18, b.size * 0.5)}px "Cascadia Code", monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (env.chroma && !hidden) {
        const [c1, c2] = TD2.fx.colorblind ? [C.gold, C.blue] : [C.red, C.cyan];
        ctx.fillStyle = c1; ctx.fillText(txt, x - 2, y - b.size * 1.7);
        ctx.fillStyle = c2; ctx.fillText(txt, x + 2, y - b.size * 1.7);
      }
      ctx.fillStyle = hidden ? C.orange : C.white;
      ctx.shadowColor = hidden ? C.orange : C.cyan; ctx.shadowBlur = 14;
      ctx.fillText(txt, x, y - b.size * 1.7);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  };

  return { create, update, draw, hit, drainEvents, exprBias };
})();
