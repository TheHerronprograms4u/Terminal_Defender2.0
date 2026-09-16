/* ============================================================
   TD2 core/config.js — all tuning data & data-driven definitions
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.config = (() => {
  /* ---------- palette ---------- */
  const colors = {
    bg: "#02060a",
    bgDeep: "#010308",
    grid: "rgba(0,229,255,0.07)",
    gridMajor: "rgba(0,229,255,0.14)",
    green: "#00ff9c",
    cyan: "#00e5ff",
    blue: "#3f8cff",
    violet: "#b26bff",
    red: "#ff3b5c",
    orange: "#ff9d3b",
    gold: "#ffd166",
    white: "#eaffff",
    gray: "#7c93a6",
  };

  /* ---------- difficulty modes ---------- */
  // speedMul multiplies spider speed; exprBias shifts expression complexity; hp = starting HP
  const DIFFICULTIES = {
    EASY:     { label: "EASY",     speedMul: 0.72, exprBias: -0.35, hp: 150, dmgMul: 0.70, comboReset: "reduce", bossHpMul: 0.5, clawDps: 1 },
    NORMAL:   { label: "NORMAL",   speedMul: 1.00, exprBias: 0,     hp: 100, dmgMul: 1.00, comboReset: "reset",  bossHpMul: 1.0, clawDps: 2 },
    HARD:     { label: "HARD",     speedMul: 1.25, exprBias: +0.30, hp: 90,  dmgMul: 1.15, comboReset: "reset",  bossHpMul: 1.0, clawDps: 3 },
    TERMINAL: { label: "TERMINAL", speedMul: 1.55, exprBias: +0.60, hp: 80,  dmgMul: 1.35, comboReset: "reset",  bossHpMul: 1.1, clawDps: 4 },
  };

  /* ---------- enemy types (data-driven) ---------- */
  // hp = correct answers to kill; dmg = HP lost on breach; exprPool drives generator difficulty
  const ENEMIES = {
    basic:   { id: "basic",   name: "BASIC SPIDER",   size: 22, hp: 1, speed: 26, dmg: 10, score: 100, color: colors.cyan,   legs: 8, legLen: 20, wobble: 1.0, exprPool: "normal", fromW: 1 },
    fast:    { id: "fast",    name: "SPEED SPIDER",   size: 17, hp: 1, speed: 52, dmg: 8,  score: 150, color: colors.green,  legs: 8, legLen: 16, wobble: 1.6, exprPool: "normal", fromW: 2 },
    armored: { id: "armored", name: "ARMORED SPIDER", size: 27, hp: 2, speed: 17, dmg: 15, score: 300, color: colors.blue,   legs: 8, legLen: 24, wobble: 0.7, exprPool: "hard",   fromW: 3, exprBias: +0.5, plate: true },
    split:   { id: "split",   name: "SPLIT SPIDER",   size: 24, hp: 1, speed: 22, dmg: 12, score: 200, color: colors.violet, legs: 8, legLen: 21, wobble: 1.1, exprPool: "normal", fromW: 2, splitsInto: 2 },
    mini:    { id: "mini",    name: "SPIDERLING",     size: 12, hp: 1, speed: 58, dmg: 4,  score: 50,  color: colors.violet, legs: 6, legLen: 10, wobble: 2.0, exprPool: "easy" },
    shield:  { id: "shield",  name: "SHIELD SPIDER",  size: 25, hp: 2, speed: 18, dmg: 15, score: 350, color: colors.gold,   legs: 8, legLen: 22, wobble: 0.6, exprPool: "hard",   fromW: 5, shield: true },
    phantom: { id: "phantom", name: "PHANTOM SPIDER", size: 23, hp: 1, speed: 30, dmg: 12, score: 250, color: colors.violet, legs: 8, legLen: 21, wobble: 0.9, exprPool: "normal", fromW: 4, phaseCycle: [2.2, 1.4] },
    elite:   { id: "elite",   name: "ELITE SPIDER",   size: 30, hp: 3, speed: 30, dmg: 20, score: 500, color: colors.red,    legs: 8, legLen: 26, wobble: 0.8, exprPool: "expert", fromW: 9, plate: true },
  };

  /* ---------- boss definitions ---------- */
  // hp = correct answers to defeat (scaled by bossHpMul); mechanics interpreted in waves.js/game.js
  const BOSSES = {
    calculator: {
      id: "calculator", wave: 2, name: "THE CALCULATOR", size: 52, hp: 6, speed: 12, dmg: 30, score: 1500,
      color: colors.green, core: "#0a3d28", legs: 8, legLen: 42, wobble: 0.5, exprPool: "hard",
      hoverY: 0.22, desc: "Spawns worker spiders while advancing", spawnEvery: 7, spawnType: "basic", spawnExprPool: "normal",
    },
    fractal: {
      id: "fractal", wave: 4, name: "THE FRACTAL WEAVER", size: 56, hp: 7, speed: 10, dmg: 30, score: 2000,
      color: colors.cyan, core: "#0d3a4a", legs: 8, legLen: 46, wobble: 0.9, exprPool: "hard", exprBias: +0.4,
      hoverY: 0.24, desc: "Conceals its expression · dispatches decoys", decoyEvery: 8, decoyType: "phantom", concealEvery: 11, concealDur: 2.6,
    },
    prime: {
      id: "prime", wave: 6, name: "THE PRIME DEVOURER", size: 62, hp: 10, speed: 9, dmg: 35, score: 3000,
      color: colors.blue, core: "#122c52", legs: 8, legLen: 50, wobble: 0.4, exprPool: "hard", exprBias: +0.6,
      hoverY: 0.22, desc: "Heavy armor · feeds the swarm", spawnEvery: 9, spawnType: "fast", spawnExprPool: "normal",
      phases: [ { at: 1.00, speedMul: 1.00, note: "" }, { at: 0.66, speedMul: 1.30, note: "ARMOR CHARGED" }, { at: 0.33, speedMul: 1.60, note: "ENRAGED" } ],
      armor: true, // phase 2+: odd hits within-chain spark, every 2nd lands; chain resets after 4s
      bonusEvery: 12, bonusType: "shield", bonusExprPool: "hard", // high-value bonus targets
    },
    null: {
      id: "null", wave: 8, name: "THE NULL MOTHER", size: 66, hp: 11, speed: 8, dmg: 40, score: 4000,
      color: colors.violet, core: "#2a1240", legs: 12, legLen: 52, wobble: 0.7, exprPool: "hard", exprBias: +0.6,
      hoverY: 0.20, desc: "Deceptive targets · swarm production", spawnEvery: 8, spawnCount: 3, spawnType: "basic", spawnExprPool: "hard",
      deceptiveChance: 0.25, // while alive: spawns may carry a fake label; real expr on target panel
      phases: [ { at: 1.00, speedMul: 1.00, note: "" }, { at: 0.50, speedMul: 1.30, note: "BROOD FRENZY", spawnEvery: 6 } ],
    },
    overlord: {
      id: "overlord", wave: 10, name: "TERMINAL OVERLORD", size: 78, hp: 12, speed: 7, dmg: 50, score: 6000,
      color: colors.red, core: "#3a0a14", legs: 12, legLen: 62, wobble: 1.2, exprPool: "expert",
      hoverY: 0.26, desc: "Distorts the battlefield · commands elites",
      spawnEvery: 10, spawnType: "elite", spawnExprPool: "hard", deceptiveChance: 0.15,
      phases: [
        { at: 1.00, speedMul: 1.00, note: "" },
        { at: 0.66, speedMul: 1.25, note: "BATTLEFIELD DISTORTION", glitch: true },
        { at: 0.33, speedMul: 1.50, note: "FINAL PROTOCOL", glitch: true, exprBias: +0.5 },
      ],
      final: true,
    },
    // Wave 11's final boss — the hardest fight in the game: 3 phases, hidden-pool
    // expressions, and an elite honor guard spawn every 6s (every 4s when panicking).
    t11: {
      id: "t11", wave: 11, name: "T-11 ▓ CORRUPTED KERNEL", size: 74, hp: 18, speed: 9, dmg: 50, score: 8000,
      color: colors.red, core: "#2a0010", legs: 12, legLen: 58, wobble: 1.5, exprPool: "hidden",
      hoverY: 0.24, desc: "The Deep Terminal fights back", glitch: true,
      spawnEvery: 6, spawnCount: 2, spawnType: "elite", spawnExprPool: "expert", deceptiveChance: 0.3,
      phases: [
        { at: 1.00, speedMul: 1.00, note: "" },
        { at: 0.66, speedMul: 1.25, note: "REALITY UNSTABLE", glitch: true, spawnEvery: 5 },
        { at: 0.33, speedMul: 1.50, note: "KERNEL PANIC", glitch: true, exprBias: +0.5, spawnEvery: 4 },
      ],
      final: true, secret: true,
    },
  };
  BOSSES.calculator.spawnCount = 2;

  /* ---------- special events ---------- */
  const EVENTS = [
    { id: "surge",     name: "MATH SURGE",       desc: "HOSTILES ACCELERATING",   dur: 8  },
    { id: "precision", name: "PRECISION MODE",   desc: "SCORE ×2",                dur: 12 },
    { id: "overclock", name: "OVERCLOCK",        desc: "INSTANT-FIRE PROTOCOL",   dur: 7  },
    { id: "freeze",    name: "TIME FREEZE",      desc: "HOSTILES SLOWED",         dur: 6  },
    { id: "storm",     name: "DATA STORM",       desc: "SIGNAL DISTORTED",        dur: 6  },
    { id: "critical",  name: "CRITICAL PROTOCOL", desc: "HIGH-VALUE HOSTILE",     dur: 0, spawn: "elite", score: 1200 },
  ];

  /* ---------- scoring ---------- */
  // reaction time bands (seconds) — punitive only for the clock, never gameplay
  const REACTION = [
    { max: 1,   label: "PERFECT",  bonus: 250, color: colors.gold },
    { max: 2,   label: "FAST",     bonus: 150, color: colors.green },
    { max: 4,   label: "GOOD",     bonus: 0,   color: colors.cyan },
    { max: 6,   label: "SLOW",     bonus: 0,   color: colors.gray },
    { max: 1e9, label: "CRITICAL", bonus: 0,   color: colors.orange },
  ];
  // combo → multiplier thresholds [minCombo, mult]
  const COMBO_TIERS = [
    [16, 5], [10, 3], [6, 2], [3, 1.5], [0, 1],
  ];
  const comboMult = (combo) => {
    for (const [min, mult] of COMBO_TIERS) if (combo >= min) return mult;
    return 1;
  };

  /* ---------- battlefield layout (fractions of canvas height) ---------- */
  const LAYOUT = {
    breach: 0.70,   // defense line — crossing it = HP loss
    cannon: 0.77,   // cannon baseline — sits clearly above the bottom terminal
    bossHover: 0.20,
    spawnTop: -0.06,
  };

  /* ---------- formation / animation constants ---------- */
  const FORMATION = {
    followerDelay: 0.9,   // s between V-group members
    followerXOffset: 0.06, // lane fraction per follower step
    laneMin: 0.15, laneMax: 0.85,
    driftAmp: [0.02, 0.05], // lane fraction
  };
  const DEATH = { flash: 0.12, dissolve: 0.5 };

  /* ---------- expression pools by tier (engine maps these) ---------- */
  const EXPR_POOLS = { easy: 1, normal: 2, hard: 3, expert: 4, hidden: 5 };

  /* ---------- music ---------- */
  const SCALES = {
    minor:         [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    phrygian:      [0, 1, 3, 5, 7, 8, 10],
  };

  /* ---------- achievements ---------- */
  const ACHIEVEMENTS = [
    { id: "first_blood",   name: "FIRST BLOOD",          desc: "Destroy your first spider.", icon: "🕷" },
    { id: "sharpshooter",  name: "SHARPSHOOTER",         desc: "Achieve 95% accuracy in one wave.", icon: "◎" },
    { id: "speed_demon",   name: "SPEED DEMON",          desc: "Solve 10 expressions in under 2 seconds each.", icon: "⚡" },
    { id: "boss_breaker",  name: "BOSS BREAKER",         desc: "Defeat your first boss.", icon: "☠" },
    { id: "perfect_wave",  name: "PERFECT WAVE",         desc: "Finish a wave without losing HP.", icon: "✓" },
    { id: "math_monster",  name: "MATHEMATICAL MONSTER", desc: "Reach Wave 10.", icon: "∑" },
    { id: "terminal_master", name: "TERMINAL MASTER",    desc: "Defeat the Terminal Overlord.", icon: "★" },
    { id: "the_signal",    name: "???", lockedName: "???", desc: "Discover Wave 11.", icon: "?", secret: true },
    { id: "deep_terminal", name: "???", lockedName: "???", desc: "Survive the first stage of Wave 11.", icon: "?", secret: true },
    { id: "combo_50",      name: "UNBROKEN CHAIN",       desc: "Reach a ×50 combo.", icon: "∞", secret: true },
    { id: "over_9000",     name: "OVER NINE THOUSAND",   desc: "Score over 900,000 points.", icon: "▲", secret: true },
    { id: "untouchable",   name: "UNTOUCHABLE",          desc: "Clear all 10 waves without losing a single HP point.", icon: "◈", secret: true },
  ];

  return { colors, DIFFICULTIES, ENEMIES, BOSSES, EVENTS, REACTION, COMBO_TIERS, comboMult, LAYOUT, FORMATION, DEATH, EXPR_POOLS, SCALES, ACHIEVEMENTS };
})();
