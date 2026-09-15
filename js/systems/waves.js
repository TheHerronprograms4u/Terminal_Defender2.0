/* ============================================================
   TD2 systems/waves.js — data-driven wave definitions and the
   spawn director. buildWave(n) produces a timestamped spawn
   queue of V-formations; the director also schedules special
   events for longer waves.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.waves = (() => {
  const { rand, randi, pick, clamp } = TD2.util;

  /* ---------- per-wave composition ----------
     count: number of hostiles; groups: spawn pacing; pool/bias:
     expression difficulty; types: weighted spawn table          */
  const WAVES = {
    1:  { label: "FIRST CONTACT",      count: 8,  span: 40, types: { basic: 1 },                                  pool: "normal", bias: 0,    threat: 0.10, events: [] },
    2:  { label: "CALCULATOR RISES",   count: 10, span: 42, types: { basic: 3, fast: 1, split: 1 },                pool: "normal", bias: 0.1,  threat: 0.22, events: ["precision"], boss: "calculator" },
    3:  { label: "PRECEDENCE PROTOCOL", count: 13, span: 45, types: { basic: 3, fast: 2, armored: 2 },              pool: "hard",   bias: 0,    threat: 0.34, events: ["surge"] },
    4:  { label: "FRACTAL INTRUSION",  count: 14, span: 46, types: { basic: 2, fast: 2, armored: 2, phantom: 2 },              pool: "hard",   bias: 0.1,  threat: 0.44, events: ["storm"], boss: "fractal" },
    5:  { label: "SHIELDWALL",         count: 16, span: 48, types: { basic: 3, fast: 2, armored: 2, phantom: 1, shield: 2 },   pool: "hard",   bias: 0.15, threat: 0.54, events: ["surge", "precision"] },
    6:  { label: "PRIME HUNGER",       count: 16, span: 48, types: { fast: 3, armored: 3, phantom: 1, shield: 2 },              pool: "hard",   bias: 0.25, threat: 0.64, events: ["overclock"], boss: "prime" },
    7:  { label: "NEST COLLAPSE",      count: 20, span: 52, types: { basic: 2, fast: 3, armored: 3, phantom: 2, shield: 2 },   pool: "hard",   bias: 0.35, threat: 0.74, events: ["surge", "storm"] },
    8:  { label: "NULL MATRIARCH",     count: 20, span: 52, types: { fast: 3, armored: 3, phantom: 2, shield: 3 },              pool: "hard",   bias: 0.4,  threat: 0.82, events: ["freeze", "precision"], boss: "null" },
    9:  { label: "THE SWARM SPEAKS",   count: 24, span: 55, types: { fast: 3, armored: 3, phantom: 3, shield: 3 },             pool: "expert", bias: 0.1,  threat: 0.90, events: ["surge", "storm", "overclock"] },
    10: { label: "TERMINAL OVERLORD",  count: 18, span: 50, types: { fast: 2, armored: 3, phantom: 2, shield: 3, elite: 1 },   pool: "expert", bias: 0.15, threat: 1.0,  events: ["surge", "precision"], boss: "overlord" },
    // Wave 11 is the double-length finale: stage 1 waves, stage 2 wakes the Kernel.
    // It uses the hidden expression pool and the heaviest roster in the game.
    11: { label: "THE DEEP TERMINAL",  count: 40, span: 70, types: { fast: 2, armored: 3, phantom: 3, shield: 3, elite: 3 },   pool: "hidden", bias: 0.35, threat: 1.0,  events: ["surge", "storm", "overclock", "freeze"], boss: "t11", deep: true,
      stage2: { count: 12, span: 36, types: { fast: 2, armored: 3, phantom: 2, shield: 3, elite: 4 }, pool: "hidden", bias: 0.45, events: ["surge", "storm", "overclock", "freeze"] } },
  };

  /** Build a timestamped spawn queue for wave n. */
  const buildWave = (n, difficulty = {}) => {
    const def = WAVES[n] ?? WAVES[10];
    const entries = [];
    const groupCount = Math.ceil(def.count / 3);
    let t = 1.2;

    for (let g = 0; g < groupCount && entries.length < def.count; g++) {
      const remain = def.count - entries.length;
      const size = Math.min(remain, randi(2, 4));
      const laneX = rand(TD2.config.FORMATION.laneMin, TD2.config.FORMATION.laneMax);
      const type = weightedType(def.types);
      // leader
      entries.push({ t, type, laneX, pool: def.pool, bias: def.bias });
      // V followers
      const { followerDelay, followerXOffset } = TD2.config.FORMATION;
      for (let i = 1; i < size; i++) {
        const side = i % 2 === 1 ? -1 : 1;
        entries.push({
          t: t + i * followerDelay,
          type: Math.random() < 0.25 ? weightedType(def.types) : type,
          laneX: clamp(laneX + side * followerXOffset * Math.ceil(i / 2), 0.08, 0.92),
          pool: def.pool, bias: def.bias,
        });
      }
      t += rand(2.4, Math.max(3.2, (def.span * 0.9) / groupCount));
    }

    // special event schedule (surge/storm/…), skipped on wave 1
    const events = [];
    if (def.events.length && n > 1) {
      const evCount = n >= 9 ? 3 : 2;
      for (let i = 0; i < evCount; i++) {
        events.push({ t: 8 + i * (def.span / (evCount + 1)) + rand(-2, 2), eventId: pick(def.events) });
      }
    }

    return {
      wave: n,
      label: def.label,
      entries,
      events,
      bossKey: def.boss ?? null,
      bossWave: !!def.boss,
      deep: !!def.deep,
      threat: def.threat,
      duration: t + 2,
    };
  };

  /** Wave 11 stage 2 — the Kernel's honor guard, deployed alongside the boss. */
  const buildDeepStage2 = () => {
    const def = WAVES[11].stage2;
    const entries = [];
    const groupCount = Math.ceil(def.count / 3);
    const { followerDelay, followerXOffset } = TD2.config.FORMATION;
    let t = 1.0;

    for (let g = 0; g < groupCount && entries.length < def.count; g++) {
      const remain = def.count - entries.length;
      const size = Math.min(remain, randi(2, 3));
      const laneX = rand(TD2.config.FORMATION.laneMin, TD2.config.FORMATION.laneMax);
      const type = weightedType(def.types);
      entries.push({ t, type, laneX, pool: def.pool, bias: def.bias });
      for (let i = 1; i < size; i++) {
        const side = i % 2 === 1 ? -1 : 1;
        entries.push({
          t: t + i * followerDelay, type,
          laneX: clamp(laneX + side * followerXOffset * Math.ceil(i / 2), 0.08, 0.92),
          pool: def.pool, bias: def.bias,
        });
      }
      t += rand(2.2, 3.6);
    }

    // two special events punctuate the second stage
    const events = [];
    for (let i = 0; i < 2; i++) {
      events.push({ t: 6 + i * (def.span / 3) + rand(-2, 2), eventId: pick(def.events) });
    }

    return { entries, events };
  };

  const weightedType = (table) => {
    const total = Object.values(table).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [type, w] of Object.entries(table)) {
      r -= w;
      if (r <= 0) return type;
    }
    return "basic";
  };

  return { WAVES, buildWave, buildDeepStage2, weightedType };
})();
