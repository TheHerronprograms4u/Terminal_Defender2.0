/* ============================================================
   TD2 entities/spider.js — hostile spider entity.
   Procedural two-segment animated legs, drift, breach latch,
   shield/phantom/split behaviors, staged death animation.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.spider = (() => {
  const { rand, clamp, lerp } = TD2.util;
  const C = TD2.config.colors;
  const { DEATH } = TD2.config;
  let nextId = 1;

  /**
   * @param {string} type  key in config.ENEMIES
   * @param {object} opts  { laneX(0..1), expr:{text,answer,complexity}, wave, time }
   */
  const create = (type, opts = {}) => {
    const def = TD2.config.ENEMIES[type] || TD2.config.ENEMIES.basic;
    const W = () => TD2.game.view().w;
    return {
      id: nextId++,
      kind: "spider",
      type, def,
      size: def.size,
      hp: def.hp, maxHp: def.hp,
      speed: def.speed,
      baseX: clamp(opts.laneX ?? 0.5, 0.06, 0.94),
      x: 0, y: -40,
      started: false,
      walk: rand(0, Math.PI * 2),            // gait clock (also drives drift)
      driftAmp: rand(...TD2.config.FORMATION.driftAmp),
      bornTime: opts.time ?? 0,
      expr: opts.expr || { text: "1 + 1", answer: 2, complexity: 1 },
      fakeText: null,                         // set by game.js when a deceptive roll lands
      deceptive: false,                       // painted by game.js target assist
      state: "alive",                         // alive | dying
      dieT: 0,
      hitFlash: 0,
      firstHitTime: null,
      shielded: !!def.shield,
      latched: false, latchDmgDone: false, clawT: 0,
      phantomT: rand(0, 3), alpha: 1,
      crit: !!opts.crit,                      // Critical Protocol target
      targeted: false,
      scoreVal: opts.crit ? (TD2.config.EVENTS.find(e => e.id === "critical")?.score ?? 1200) : def.score,
      color: opts.crit ? C.gold : def.color,
    };
  };

  /* ---------- update ---------- */
  const update = (sp, dt, env) => {
    const { breachY, timeScale = 1, chroma = false } = env;

    if (sp.state === "dying") { sp.dieT += dt; return; }
    sp.hitFlash = Math.max(0, sp.hitFlash - dt);
    sp.walk += dt * Math.pow(sp.speed / 26, 0.6) * timeScale;
    sp.clawT += dt;

    // phantom visibility cycle
    if (sp.def.phaseCycle) {
      sp.phantomT += dt;
      const [vis, hid] = sp.def.phaseCycle;
      const t = sp.phantomT % (vis + hid);
      sp.alpha = t < vis ? 1 : lerp(1, 0.3, Math.min(1, (t - vis) / 0.3));
    } else sp.alpha = 1;

    const W = env.w, H = env.h;
    if (!sp.started) {
      sp.x = sp.baseX * W; sp.y = -sp.size * 2;
      sp.started = true;
    }

    // lateral drift follows the walk clock
    const drift = Math.sin(sp.walk * 0.35) * sp.driftAmp * W;
    sp.x = clamp(sp.baseX * W + drift, W * 0.05, W * 0.95);

    if (sp.latched) {
      // clawing at the defense line — handled damage-wise by game
      sp.y = breachY - sp.size * 0.9 + Math.sin(sp.clawT * 18) * 1.5;
      return;
    }

    sp.y += sp.speed * timeScale * dt;

    // breach?
    if (sp.y + sp.size * 0.9 >= breachY) {
      sp.latched = true;
      sp.clawT = 0;
      return "breach";
    }
    return null;
  };

  /* ---------- drawing ---------- */
  const drawLegs = (ctx, sp, x, y, scale = 1, legLift = 0) => {
    const n = sp.def.legs, L = sp.def.legLen * scale;
    ctx.strokeStyle = sp.color;
    ctx.lineWidth = Math.max(1.2, 2.4 * scale);
    ctx.lineCap = "round";
    ctx.globalAlpha *= 0.9;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < n / 2; i++) {
        // base angle: splayed outward and upward
        const spread = (-140 + i * (100 / (n / 2 - 1))) * Math.PI / 180;
        const gait = Math.sin(sp.walk * 6 + i * 1.7 + (side > 0 ? Math.PI : 0));
        const a = spread + gait * 0.16 * sp.def.wobble;
        const hipX = x + side * sp.size * 0.45 * scale;
        const hipY = y + (i - n / 4) * 3 * scale;
        const kneeX = hipX + Math.cos(a) * L * 0.55 * side;
        const kneeY = hipY + Math.sin(a) * L * 0.55 - 4 * scale - legLift;
        const footX = kneeX + Math.cos(a + 0.5 * side) * L * 0.5 * side;
        const footY = kneeY + Math.sin(a + 0.5 * side) * L * 0.5 + gait * 3 - legLift * 0.5;
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(footX, footY);
        ctx.stroke();
        // foot claw
        ctx.beginPath();
        ctx.moveTo(footX, footY);
        ctx.lineTo(footX + side * 3 * scale, footY + 2 * scale);
        ctx.stroke();
      }
    }
    ctx.globalAlpha /= 0.9;
  };

  const drawBody = (ctx, sp, x, y, scale = 1) => {
    const s = sp.size * scale;
    // glow
    ctx.shadowColor = sp.color; ctx.shadowBlur = 14;
    ctx.fillStyle = sp.def.core || "#06121c";
    ctx.strokeStyle = sp.color;
    ctx.lineWidth = 1.6;
    // abdomen + head
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.35, s * 0.62, s * 0.72, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.45, s * 0.42, s * 0.36, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    // eyes
    ctx.fillStyle = sp.crit ? C.gold : C.white;
    for (const ex of [-0.16, 0.16]) {
      ctx.beginPath(); ctx.arc(x + ex * s, y - s * 0.52, Math.max(1.2, s * 0.06), 0, Math.PI * 2); ctx.fill();
    }
    // armored plates
    if (sp.def.plate) {
      ctx.strokeStyle = C.white; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(x, y + s * 0.35 + i * s * 0.3, s * 0.5, s * 0.1, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // shield bubble
    if (sp.shielded) {
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55 + Math.sin(sp.walk * 8) * 0.15;
      ctx.beginPath(); ctx.arc(x, y, s * 1.35, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // hp pips
    if (sp.maxHp > 1) {
      for (let i = 0; i < sp.maxHp; i++) {
        ctx.fillStyle = i < sp.hp ? sp.color : "rgba(255,255,255,0.15)";
        ctx.fillRect(x - sp.maxHp * 4 + i * 8, y + s * 1.15, 6, 2.5);
      }
    }
  };

  const drawExpr = (ctx, sp, x, y, env) => {
    const txt = sp.fakeText ?? sp.expr.text;
    ctx.font = `700 ${Math.max(13, sp.size * 0.72)}px "Cascadia Code", Consolas, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha = sp.alpha;
    const chroma = env.chroma || sp.deceptive;
    if (chroma) {
      const [c1, c2] = TD2.fx.colorblind ? [C.gold, C.blue] : [C.red, C.cyan];
      ctx.fillStyle = c1; ctx.fillText(txt, x - 2, y);
      ctx.fillStyle = c2; ctx.fillText(txt, x + 2, y);
    }
    ctx.fillStyle = sp.deceptive ? C.violet : C.white;
    ctx.shadowColor = sp.deceptive ? C.violet : C.cyan; ctx.shadowBlur = 10;
    ctx.fillText(txt, x, y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };

  const draw = (ctx, sp, env) => {
    const x = sp.x, y = sp.y;
    ctx.save();
    ctx.globalAlpha = sp.alpha;

    // target highlight
    if (sp.targeted) {
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + Math.sin(env.time * 6) * 0.3;
      ctx.beginPath(); ctx.arc(x, y, sp.size * 1.7, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = sp.alpha;
      ctx.fillStyle = C.cyan;
      ctx.font = `700 10px monospace`; ctx.textAlign = "center";
      ctx.fillText("▼ LOCKED", x, y - sp.size * 2.1);
    }
    if (sp.crit) {
      ctx.strokeStyle = C.gold; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, sp.size * 1.9, env.time * 2, env.time * 2 + Math.PI * 1.5); ctx.stroke();
      ctx.setLineDash([]);
    }

    const dyingA = sp.state === "dying" ? clamp(1 - sp.dieT / DEATH.dissolve, 0, 1) : 1;
    const flash = sp.hitFlash > 0 || (sp.state === "dying" && sp.dieT < DEATH.flash);
    if (flash) { ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 22; }

    drawLegs(ctx, sp, x, y, 1, sp.latched ? Math.abs(Math.sin(sp.clawT * 10)) * 3 : 0);
    drawBody(ctx, sp, x, y, 1);
    if (!sp.latched) drawExpr(ctx, sp, x, y - sp.size * 1.45, env);
    else {
      // latched: expression moves below body so the line stays visible
      drawExpr(ctx, sp, x, y + sp.size * 1.6, env);
    }

    if (sp.state === "dying") {
      ctx.globalAlpha = dyingA * 0.6;
      ctx.strokeStyle = C.white;
      ctx.beginPath(); ctx.arc(x, y, sp.size * (1 + (1 - dyingA) * 1.6), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  };

  return { create, update, draw, drawBody, drawLegs };
})();
