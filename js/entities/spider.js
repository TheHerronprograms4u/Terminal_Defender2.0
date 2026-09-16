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
    const n = sp.def.legs;
    const numLegs = Math.floor(n / 2);
    ctx.strokeStyle = sp.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha *= 0.95;

    const s = sp.size * scale;
    const wobbleFactor = sp.def.wobble ?? 1.0;

    // Rigid chitinous exoskeleton segment lengths: Femur (L1) and Tibia (L2)
    const baseReach = Math.max(sp.def.legLen * scale * 1.32, s * 1.48);
    const L1 = baseReach * 0.47; // Upper leg (femur)
    const L2 = baseReach * 0.53; // Lower leg (tibia)

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < numLegs; i++) {
        // u: 0 = front-most leg, 1 = rear-most leg
        const u = numLegs > 1 ? i / (numLegs - 1) : 0.5;

        // 1. Coxa / Hip attachment points distributed along the cephalothorax lateral margin:
        // Cephalothorax center is at y + s * 0.18. Hips span from y + 0.32s down to y - 0.08s.
        const hipX = x + side * s * (0.40 + Math.sin(u * Math.PI) * 0.05);
        const hipY = y + s * (0.32 - u * 0.40);

        // 2. Natural Arachnid Fan Geometry:
        // Legs splay symmetrically from front (+48°) to rear (-48°)
        const fanAngle = (48 - u * 96) * (Math.PI / 180);
        const footSpan = s * (1.52 + Math.sin(u * Math.PI) * 0.18);
        const restFootX = x + side * Math.cos(fanAngle) * footSpan;
        const restFootY = y + s * 0.10 + Math.sin(fanAngle) * footSpan;

        // 3. Outward knee pole vector (defines the apex of the arachnid chevron bend):
        const kneeAngle = (34 - u * 68) * (Math.PI / 180);
        const poleSpan = s * 1.62;
        const poleX = x + side * Math.cos(kneeAngle) * poleSpan;
        const poleY = y + s * 0.12 + Math.sin(kneeAngle) * poleSpan;

        // 4. Alternating tetrapod gait (diagonal coordination pairs step in lockstep)
        const legGroup = (i + (side > 0 ? 1 : 0)) % 2;
        const phase = (sp.walk * 4.2) + (legGroup * Math.PI);
        const cycle = Math.sin(phase);
        const isSwing = cycle > 0;
        const lift = isSwing ? Math.sin(cycle * Math.PI) : 0;

        let footShiftX = 0;
        let footShiftY = 0;

        if (sp.latched) {
          // Latching strike at defense barrier: front legs attack rapidly, rear legs anchor
          if (i <= 1) {
            const strikePhase = sp.clawT * 15 + i * 2.2 + (side > 0 ? 1 : 0);
            footShiftY = Math.sin(strikePhase) * (s * 0.38);
            footShiftX = Math.cos(strikePhase) * (s * 0.12) * side;
          } else {
            footShiftY = Math.sin(sp.clawT * 5 + i) * 1.5 * scale;
            footShiftX = 0;
          }
        } else {
          // True arachnid walk cycle:
          // Stance (cycle <= 0): Foot planted firmly on grid, travels backward relative to advancing body
          // Swing (cycle > 0): Foot lifts off grid and steps forward to next foothold
          const strideLen = s * 0.24 * wobbleFactor;
          footShiftY = cycle * strideLen;
          if (isSwing) {
            footShiftX = Math.sin(cycle * Math.PI) * (strideLen * 0.20) * side;
          }
        }

        // Target foot position on grid
        let footX = restFootX + footShiftX;
        let footY = restFootY + footShiftY;

        // 5. Analytical 2-Bone Inverse Kinematics (IK) with Outward Pole Vector:
        // Guarantees rigid femur (L1) & tibia (L2) lengths with zero rubber-banding or joint distortion
        let dx = footX - hipX;
        let dy = footY - hipY;
        let dist = Math.hypot(dx, dy) || 0.001;
        const maxDist = (L1 + L2) * 0.96;
        if (dist > maxDist) {
          dist = maxDist;
          footX = hipX + (dx / dist) * maxDist;
          footY = hipY + (dy / dist) * maxDist;
          dx = footX - hipX;
          dy = footY - hipY;
        }

        const ux = dx / dist;
        const uy = dy / dist;
        const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
        const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));

        // Perpendicular normals to the hip->foot line
        const n1x = -uy, n1y = ux;
        const n2x = uy, n2y = -ux;

        // Choose the normal that points outward toward the Pole Vector
        const pdx = poleX - hipX;
        const pdy = poleY - hipY;
        const dot1 = n1x * pdx + n1y * pdy;
        const nx = dot1 >= 0 ? n1x : n2x;
        const ny = dot1 >= 0 ? n1y : n2y;

        // Exact knee joint position
        const kneeX = hipX + ux * a + nx * h;
        const kneeY = hipY + uy * a + ny * h - (lift * 2.8 * scale) - legLift;

        // 1. Draw Femur (Upper Leg segment)
        ctx.lineWidth = Math.max(1.5, 2.8 * scale);
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kneeX, kneeY);
        ctx.stroke();

        // 2. Draw Tibia (Lower Leg segment)
        ctx.lineWidth = Math.max(1.1, 1.9 * scale);
        ctx.beginPath();
        ctx.moveTo(kneeX, kneeY);
        ctx.lineTo(footX, footY);
        ctx.stroke();

        // 3. Cybernetic Knee Joint Pivot
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(kneeX, kneeY, Math.max(1.1, 1.8 * scale), 0, Math.PI * 2);
        ctx.fill();

        // 4. Articulated Tarsus Claw
        const footAngle = Math.atan2(footY - kneeY, footX - kneeX);
        const clawAngle = footAngle + (side * (u < 0.5 ? -0.25 : 0.25));
        const clawLen = Math.max(3.2, 4.8 * scale);
        const clawX = footX + Math.cos(clawAngle) * clawLen;
        const clawY = footY + Math.sin(clawAngle) * clawLen;

        ctx.lineWidth = Math.max(0.9, 1.4 * scale);
        ctx.beginPath();
        ctx.moveTo(footX, footY);
        ctx.lineTo(clawX, clawY);
        ctx.stroke();

        // 5. Tactile ground contact footprint when planted
        if (lift < 0.15 && !sp.latched) {
          ctx.save();
          const contactAlpha = (1 - lift / 0.15) * 0.75;
          ctx.globalAlpha *= contactAlpha;
          ctx.fillStyle = sp.color;
          ctx.beginPath();
          ctx.arc(clawX, clawY, Math.max(1.0, 1.5 * scale), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha /= 0.95;
  };

  const drawBody = (ctx, sp, x, y, scale = 1) => {
    const s = sp.size * scale;
    // glow
    ctx.shadowColor = sp.color; ctx.shadowBlur = 14;
    ctx.fillStyle = sp.def.core || "#06121c";
    ctx.strokeStyle = sp.color;
    ctx.lineWidth = 1.6;

    // Movement direction is DOWNWARDS (+Y toward player cannon)
    // Cephalothorax (head/chest) in front (+Y):
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.18, s * 0.48, s * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Abdomen (larger rear carapace) trailing behind (-Y):
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.38, s * 0.62, s * 0.68, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // Fangs / Pedipalps (front mandibles pointing down):
    ctx.strokeStyle = sp.color; ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * s * 0.14, y + s * 0.50);
      ctx.lineTo(x + side * s * 0.22, y + s * 0.66);
      ctx.lineTo(x + side * s * 0.08, y + s * 0.72);
      ctx.stroke();
    }

    // Glowing predator multi-eyes facing downwards at the defense line:
    ctx.fillStyle = sp.crit ? C.gold : C.white;
    for (const ex of [-0.18, -0.06, 0.06, 0.18]) {
      const ey = Math.abs(ex) > 0.1 ? y + s * 0.44 : y + s * 0.50;
      ctx.beginPath(); ctx.arc(x + ex * s, ey, Math.max(1.0, s * 0.055), 0, Math.PI * 2); ctx.fill();
    }

    // armored plates
    if (sp.def.plate) {
      ctx.strokeStyle = C.white; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(x, y - s * 0.38 + i * s * 0.24, s * 0.48, s * 0.1, 0, 0, Math.PI * 2);
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
    const dyingA = sp.state === "dying" ? clamp(1 - sp.dieT / DEATH.dissolve, 0, 1) : 1;
    ctx.globalAlpha = sp.alpha * (sp.state === "dying" ? dyingA : 1);

    // target highlight (only while alive)
    if (sp.targeted && sp.state === "alive") {
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + Math.sin(env.time * 6) * 0.3;
      ctx.beginPath(); ctx.arc(x, y, sp.size * 1.7, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = sp.alpha;
      ctx.fillStyle = C.cyan;
      ctx.font = `700 10px monospace`; ctx.textAlign = "center";
      ctx.fillText("▼ LOCKED", x, y - sp.size * 2.1);
    }
    if (sp.crit && sp.state === "alive") {
      ctx.strokeStyle = C.gold; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, sp.size * 1.9, env.time * 2, env.time * 2 + Math.PI * 1.5); ctx.stroke();
      ctx.setLineDash([]);
    }

    const flash = sp.hitFlash > 0 || (sp.state === "dying" && sp.dieT < DEATH.flash);
    if (flash) { ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 22; }

    drawLegs(ctx, sp, x, y, 1, sp.latched ? Math.abs(Math.sin(sp.clawT * 10)) * 3 : 0);
    drawBody(ctx, sp, x, y, 1);
    if (sp.state === "alive") {
      if (!sp.latched) drawExpr(ctx, sp, x, y - sp.size * 1.45, env);
      else {
        // latched: expression moves below body so the line stays visible
        drawExpr(ctx, sp, x, y + sp.size * 1.6, env);
      }
    }

    if (sp.state === "dying") {
      ctx.globalAlpha = dyingA * 0.7;
      ctx.strokeStyle = sp.color || C.white;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, sp.size * (1 + (1 - dyingA) * 1.8), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  };

  return { create, update, draw, drawBody, drawLegs };
})();
