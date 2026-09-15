/* ============================================================
   TD2 core/save.js — persistence: settings, stats, achievements,
   leaderboard. localStorage-backed, never throws.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.save = (() => {
  const KEY = "td2_save_v2";

  const DEFAULTS = () => ({
    settings: {
      master: 0.8, music: 0.6, sfx: 0.8,
      difficulty: "NORMAL",
      screenShake: true, particles: true, damageNumbers: true, targetAssist: true,
      fullscreen: false, textSize: "normal", highContrast: false, reducedFx: false,
      colorblind: false,
    },
    stats: {
      totalGames: 0, totalKills: 0, totalBossKills: 0, bestScore: 0, bestCombo: 0,
      bestWave: 0, accSum: 0, accRuns: 0, rtSum: 0, rtCount: 0,
      secretWaveDiscovered: false, wave11Cleared: false,
    },
    achievements: [],            // array of unlocked ids
    leaderboard: [],             // [{ score, wave, acc, combo, date }]
  });

  let data = DEFAULTS();

  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = { ...DEFAULTS(), ...parsed };
        data.settings = { ...DEFAULTS().settings, ...(parsed.settings || {}) };
        data.stats = { ...DEFAULTS().stats, ...(parsed.stats || {}) };
        if (!Array.isArray(data.achievements)) data.achievements = [];
        if (!Array.isArray(data.leaderboard)) data.leaderboard = [];
      }
    } catch (e) { console.warn("[save] load failed, using defaults", e); data = DEFAULTS(); }
    return data;
  };

  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn("[save] persist failed (private mode?)", e); }
  };

  const get = () => data;
  const update = (fn) => { fn(data); persist(); };

  const getSetting = (k, def) => (k in data.settings ? data.settings[k] : def);
  const setSetting = (k, v) => { data.settings[k] = v; persist(); };

  const pushScore = (entry) => {
    data.leaderboard.push({ id: Date.now() + "" + Math.floor(Math.random() * 999), date: new Date().toISOString().slice(0, 10), ...entry });
    data.leaderboard.sort((a, b) => b.score - a.score);
    data.leaderboard = data.leaderboard.slice(0, 10);
    persist();
  };

  const bumpStats = (map) => {
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === "number") data.stats[k] = (data.stats[k] || 0) + v;
      else data.stats[k] = v;
    }
    persist();
  };

  const unlockAch = (id) => {
    if (data.achievements.includes(id)) return "known";
    data.achievements.push(id);
    persist();
    return "new";
  };
  const isUnlocked = (id) => data.achievements.includes(id);

  const resetAll = () => { data = DEFAULTS(); persist(); };

  load();
  return { get, update, getSetting, setSetting, pushScore, bumpStats, unlockAch, isUnlocked, resetAll };
})();
