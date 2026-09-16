/* ============================================================
   TD2 ui/screens.js — full-screen screens: boot, menu, settings,
   leaderboard, achievements, credits, wave intro, countdown,
   pause, wave clear, game over, victory, secret wave sequence.
   All transitions via TD2.game state machine callbacks.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.screens = (() => {
  const { $, $$, show, hide, fmt } = TD2.util;

  const screens = {
    boot: "#screen-boot", menu: "#screen-menu", settings: "#screen-settings",
    leaderboard: "#screen-leaderboard", achievements: "#screen-achievements",
    credits: "#screen-credits", tutorial: "#screen-tutorial",
    countdown: "#screen-countdown", waveintro: "#screen-waveintro",
    pause: "#screen-pause", waveclear: "#screen-waveclear",
    gameover: "#screen-gameover", victory: "#screen-victory",
    secret: "#screen-secret", achievement: "#screen-achievement",
  };
  let current = null;

  const showScreen = (name, ghost = false) => {
    $$(".screen").forEach((s) => s.classList.add("hidden"));
    if (!name) return;
    const el = $(screens[name]);
    if (!el) return;
    el.classList.toggle("ghost", ghost);
    show(el);
    current = name;
  };
  const hideScreens = () => showScreen(null);

  /* ---------- boot sequence typer ---------- */
  const BOOT_LINES = [
    "TERMINAL DEFENDER SYSTEM",
    "VERSION 2.0.0",
    "",
    "INITIALIZING CORE........... OK",
    "LOADING DEFENSE GRID........ OK",
    "CALCULATING THREAT MODEL.... OK",
    "LASER SYSTEM................ OK",
    "MATHEMATICAL ENGINE......... OK",
    "SPIDER DATABASE............. OK",
    "",
    "SYSTEM READY",
  ];
  const boot = (onDone) => {
    const el = $("#boot-text");
    el.innerHTML = "";
    let li = 0;
    const nextLine = () => {
      if (li >= BOOT_LINES.length) {
        el.innerHTML += '<span class="cursor">>_</span>';
        if (onDone) setTimeout(onDone, 900);
        return;
      }
      const line = BOOT_LINES[li++];
      const div = document.createElement("div");
      el.appendChild(div);
      if (!line) { div.innerHTML = "&nbsp;"; setTimeout(nextLine, 60); return; }
      // type the line fast with per-char ticks
      let ci = 0;
      const isOk = line.endsWith("OK");
      const chunk = isOk ? line.slice(0, -2) : line;
      const tick = () => {
        ci += 3;
        div.textContent = chunk.slice(0, ci);
        if (ci % 9 === 0) TD2.audio.sfx("key");
        if (ci < chunk.length) setTimeout(tick, 12);
        else {
          if (isOk) { div.innerHTML = chunk + '<span class="ok">OK</span>'; TD2.audio.sfx("ok"); }
          setTimeout(nextLine, line === "SYSTEM READY" ? 400 : 90);
        }
      };
      tick();
    };
    nextLine();
  };

  /* ---------- main menu ---------- */
  let menuSel = 0;
  const MENU_ITEMS = () => {
    const items = [
      { act: "start", label: "START GAME" },
      { act: "tutorial", label: "TUTORIAL" },
      { act: "settings", label: "SETTINGS" },
      { act: "leaderboard", label: "LEADERBOARD" },
      { act: "achievements", label: "ACHIEVEMENTS" },
      { act: "credits", label: "CREDITS" },
    ];
    if (TD2.save.get().stats.secretWaveDiscovered) {
      items.splice(1, 0, { act: "deep", label: "▶ DEEP TERMINAL", secret: true });
    }
    return items;
  };
  const menu = () => {
    const nav = $("#menu-nav");
    const items = MENU_ITEMS();
    nav.innerHTML = items.map((it, i) =>
      `<button data-act="${it.act}" ${it.secret ? 'style="color:var(--red);border-color:var(--red)"' : ""}>${it.label}</button>`).join("");
    menuSel = Math.min(menuSel, items.length - 1);
    renderMenuSel();
    const s = TD2.save.get().stats;
    $("#menu-stats").textContent =
      `GAMES ${s.totalGames} · KILLS ${s.totalKills} · BEST ${fmt(s.bestScore)} · WAVE ${s.bestWave}/10${s.secretWaveDiscovered ? " · ▓11▓ DISCOVERED" : ""}`;
    showScreen("menu");
    TD2.audio.setMode("menu", { intensity: 0.3 });
  };
  const renderMenuSel = () => {
    const btns = $$("#menu-nav button");
    btns.forEach((b, i) => b.classList.toggle("sel", i === menuSel));
  };
  const menuMove = (d) => {
    const n = $$("#menu-nav button").length;
    menuSel = (menuSel + d + n) % n;
    renderMenuSel();
    TD2.audio.sfx("key");
  };
  const menuActivate = () => {
    const btns = $$("#menu-nav button");
    const b = btns[menuSel];
    if (b) { TD2.audio.sfx("select"); b.click(); }
  };

  /* ---------- settings ---------- */
  const SETTINGS_DEFS = [
    { key: "master",       label: "MASTER VOLUME",  type: "range", max: 1 },
    { key: "music",        label: "MUSIC VOLUME",   type: "range", max: 1 },
    { key: "sfx",          label: "SFX VOLUME",     type: "range", max: 1 },
    { key: "difficulty",   label: "DIFFICULTY",     type: "enum", opts: ["EASY", "NORMAL", "HARD", "TERMINAL"] },
    { key: "screenShake",  label: "SCREEN SHAKE",   type: "bool" },
    { key: "particles",    label: "PARTICLE EFFECTS", type: "bool" },
    { key: "damageNumbers", label: "DAMAGE NUMBERS", type: "bool" },
    { key: "targetAssist", label: "TARGET ASSIST",  type: "bool" },
    { key: "textSize",     label: "TEXT SIZE",      type: "enum", opts: ["normal", "large"] },
    { key: "highContrast", label: "HIGH CONTRAST",  type: "bool" },
    { key: "reducedFx",    label: "REDUCED EFFECTS", type: "bool" },
    { key: "colorblind",   label: "COLORBLIND MODE", type: "bool" },
    { key: "fullscreen",   label: "FULLSCREEN",     type: "bool" },
  ];
  const applyAccessibility = () => {
    const s = TD2.save.get().settings;
    document.body.classList.toggle("big-text", s.textSize === "large");
    document.body.classList.toggle("hi-contrast", !!s.highContrast);
    document.body.classList.toggle("reduced-fx", !!s.reducedFx);
    TD2.fx.setReduced(!!s.reducedFx || !s.particles);
    TD2.fx.setColorblind(!!s.colorblind);
  };
  const settings = () => {
    const panel = $("#settings-panel");
    const s = TD2.save.get().settings;
    let html = "<h2>// SETTINGS</h2>";
    for (const d of SETTINGS_DEFS) {
      const v = s[d.key];
      html += `<div class="set-row"><label>${d.label}</label><div class="set-ctrl">`;
      if (d.type === "range") {
        html += `<button data-set="${d.key}" data-d="-1">−</button><span class="set-val" id="sv-${d.key}">${Math.round(v * 100)}%</span><button data-set="${d.key}" data-d="1">+</button>`;
      } else if (d.type === "enum") {
        html += `<button data-set="${d.key}" data-d="-1">◂</button><span class="set-val" id="sv-${d.key}">${String(v).toUpperCase()}</span><button data-set="${d.key}" data-d="1">▸</button>`;
      } else {
        html += `<span class="set-val tgl-${v ? "on" : "off"}" id="sv-${d.key}">${v ? "ON" : "OFF"}</span><button data-set="${d.key}" data-d="1">TOGGLE</button>`;
      }
      html += "</div></div>";
    }
    html += `<div class="panel-actions"><button data-act="back">BACK</button></div>`;
    panel.innerHTML = html;
    panel.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      TD2.audio.sfx("click");
      const key = b.dataset.set;
      if (b.dataset.act === "back") { if (TD2.game.settingsBack) TD2.game.settingsBack(); return; }
      const def = SETTINGS_DEFS.find((d) => d.key === key);
      if (!def) return;
      const dir = parseInt(b.dataset.d, 10);
      const cur = TD2.save.get().settings[key];
      if (def.type === "range") TD2.save.setSetting(key, Math.max(0, Math.min(1, cur + dir * 0.1)));
      else if (def.type === "enum") {
        const i = def.opts.indexOf(cur);
        TD2.save.setSetting(key, def.opts[(i + dir + def.opts.length) % def.opts.length]);
      } else if (key === "fullscreen") {
        toggleFullscreen(!document.fullscreenElement);
      } else TD2.save.setSetting(key, !cur);
      applyAccessibility();
      TD2.audio.applyVolumes();
      if (key === "colorblind") TD2.fx.setColorblind(TD2.save.getSetting("colorblind"));
      settings(); // re-render values
    };
    showScreen("settings");
  };
  const toggleFullscreen = (on) => {
    try {
      if (on) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } catch (e) { /* unsupported */ }
  };

  /* ---------- leaderboard ---------- */
  const leaderboard = () => {
    const rows = TD2.save.get().leaderboard;
    let html = "<h2>// LEADERBOARD</h2>";
    if (!rows.length) html += `<div class="sub" style="padding:20px 0">NO DEFENSE RECORDS YET.<br>THE TERMINAL AWAITS ITS FIRST HERO.</div>`;
    rows.forEach((r, i) => {
      html += `<div class="lb-row"><span class="rank">#${i + 1}</span><span>${fmt(r.score)} <span class="meta">W${r.wave} · ${r.acc}% ACC · ×${r.combo} COMBO · ${r.date}</span></span></div>`;
    });
    html += `<div class="panel-actions"><button data-act="back">BACK</button></div>`;
    const panel = $("#leaderboard-panel");
    panel.innerHTML = html;
    panel.onclick = (e) => { if (e.target.closest("button")) { TD2.audio.sfx("click"); showScreen("menu"); } };
    showScreen("leaderboard");
  };

  /* ---------- achievements ---------- */
  const achievements = () => {
    const unlocked = TD2.save.get().achievements;
    let html = `<h2>// ACHIEVEMENTS ${unlocked.length}/${TD2.config.ACHIEVEMENTS.length}</h2>`;
    for (const a of TD2.config.ACHIEVEMENTS) {
      const got = unlocked.includes(a.id);
      const name = got ? (a.id === "the_signal" ? "THE SIGNAL" : a.id === "deep_terminal" ? "DEEP TERMINAL" : a.name) : a.name;
      html += `<div class="ach-row ${got ? "" : "locked"}"><span class="ach-ico" style="color:${got ? "var(--gold)" : "var(--cyan)"}">${a.icon}</span><div><div class="ach-name">${name}</div><div class="ach-desc">${a.desc}</div></div></div>`;
    }
    html += `<div class="panel-actions"><button data-act="back">BACK</button></div>`;
    const panel = $("#achievements-panel");
    panel.innerHTML = html;
    panel.onclick = (e) => { if (e.target.closest("button")) { TD2.audio.sfx("click"); showScreen("menu"); } };
    showScreen("achievements");
  };

  /* ---------- credits ---------- */
  const credits = () => {
    $("#credits-panel").innerHTML = `
      <h2>// CREDITS</h2>
      <div class="credits-body">
        <b>TERMINAL DEFENDER 2.0</b><br>
        <span class="dim">MATHEMATICAL DEFENSE PROTOCOL</span><br><br>
        DESIGN · CODE · PROCEDURAL ART ..... <b>Harron Noah A. Melgar</b><br>
        AUDIO SYNTHESIS .................... <b>WEBAUDIO OSCILLATOR BANK</b><br>
        MATHEMATICS ....................... <b>YOU, DEFENDING THE TERMINAL</b><br><br>
        <span class="dim">The mathematics is the weapon. Built with vanilla JS + Canvas,
        zero external assets, zero dependencies.</span>
      </div>
      <div class="panel-actions"><button data-act="back">BACK</button></div>`;
    const panel = $("#credits-panel");
    panel.onclick = (e) => { if (e.target.closest("button")) { TD2.audio.sfx("click"); showScreen("menu"); } };
    showScreen("credits");
  };

  /* ---------- countdown ---------- */
  const countdown = (n, onDone) => {
    showScreen("countdown");
    const el = $("#countdown-text");
    el.textContent = n > 0 ? n : "ENGAGE";
    TD2.audio.sfx(n > 0 ? "count" : "go");
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  };

  /* ---------- wave intro ---------- */
  const waveIntro = (wave, label, threat, isBoss, isDeep) => {
    showScreen("waveintro");
    $("#wi-pre").textContent = "INITIALIZING DEFENSE SYSTEM...";
    $("#wi-wave").textContent = isDeep ? "WAVE 11 // STAGE 1 OF 2" : (isBoss ? `WAVE ${String(wave).padStart(2, "0")} // BOSS` : `WAVE ${String(wave).padStart(2, "0")}`);
    $("#wi-name").textContent = label;
    $("#wi-post").textContent = isDeep ? "⚠ CLEAR THE FIELD TO WAKE THE KERNEL" : isBoss ? "⚠ MAJOR HOSTILE DETECTED" : "INCOMING HOSTILES";
    const sec = $("#screen-waveintro");
    sec.classList.toggle("boss", isBoss || isDeep);
    const bar = $("#wi-threat i");
    bar.style.width = "0";
    setTimeout(() => { bar.style.width = `${Math.round(threat * 100)}%`; }, 120);
  };

  /* ---------- pause ---------- */
  const pause = () => showScreen("pause", true);
  const resume = () => hideScreens();

  /* ---------- wave clear ---------- */
  const waveClear = (stats, onDone) => {
    showScreen("waveclear");
    const el = $("#waveclear-stats");
    el.innerHTML = [
      ["WAVE BONUS", `+${fmt(stats.waveBonus)}`],
      ["ACCURACY", `${stats.acc}%`],
      ["BEST COMBO", `×${stats.bestCombo}`],
      ["PERFECT WAVE", stats.perfect ? "+1,000 ✓" : "—"],
      ["REACTION AVG", `${stats.rtAvg}s`],
    ].map(([k, v]) => `<div class="wc-row"><span>${k}</span><b>${v}</b></div>`).join("");
    $("#waveclear-next").textContent = stats.next;
    TD2.audio.sfx("waveclear");
  };

  /* ---------- game over / victory (animated counters) ---------- */
  const statScreen = (id, stats, animated = true) => {
    showScreen(id);
    const el = $(`#${id}-stats`);
    const rows = [
      ["WAVE_REACHED", "WAVE REACHED", String(stats.wave).padStart(2, "0")],
      ["SCORE", "SCORE", fmt(stats.score)],
      ["ACCURACY", "ACCURACY", `${stats.acc}%`],
      ["BEST_COMBO", "BEST COMBO", `×${stats.bestCombo}`],
      ["ENEMIES_DESTROYED", "ENEMIES DESTROYED", String(stats.kills)],
      ["AVG_REACTION", "AVERAGE REACTION", `${stats.rtAvg}s`],
    ];
    el.innerHTML = rows.map(([key, label]) => `<div class="wc-row"><span>${label}</span><b data-v="${key}">0</b></div>`).join("");
    $(`#screen-${id} .go-new`)?.classList.add("hidden");
    if (stats.newRecord && id === "gameover") $("#gameover-newrecord")?.classList.remove("hidden");
    if (!animated) {
      rows.forEach(([key, , v]) => { el.querySelector(`[data-v="${key}"]`).textContent = v; });
    } else {
      // animated score counting
      const t0 = performance.now();
      const dur = 1100;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        rows.forEach(([key, , v]) => {
          const cell = el.querySelector(`[data-v="${key}"]`);
          if (key === "SCORE") cell.textContent = fmt(stats.score * e);
          else if (t === 1) cell.textContent = v;
          else cell.textContent = v.replace(/^[×]?[\d,.]+/, (m) => m.replace(/[\d,.]+/, (n) => fmt((parseFloat(n.replace(",", "")) || 0) * e)));
        });
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  };
  const gameover = (stats) => { statScreen("gameover", stats); TD2.audio.sfx("gameover"); TD2.audio.setMode(null); };
  const victory = (stats) => {
    statScreen("victory", stats);
    const vf = $("#victory-final");
    if (vf) vf.textContent = `FINAL SCORE: ${fmt(stats.score)}`;
    TD2.audio.sfx("waveclear");
  };

  /* ---------- secret wave discovery sequence ---------- */
  const SECRET_LINES = [
    ["SYSTEM STATUS: COMPLETE", "sys"],
    ["ALL DEFENSE PROTOCOLS NOMINAL", "sys"],
    ["", "dim"],
    ["SHUTTING DOWN.............. OK", "sys"],
    ["SHUTTING DOWN.............. OK", "sys"],
    ["", "dim"],
    ["ERROR", "err"],
    ["UNREGISTERED PROCESS FOUND", "err"],
    ["", "dim"],
    ["PROTOCOL: T-11", ""],
    ["STATUS: ACTIVE", ""],
    ["", "dim"],
    ["ACCESSING HIDDEN PROTOCOL...", ""],
    ["████████████", ""],
    ["", "dim"],
    ["SECRET WAVE UNLOCKED", "ok"],
    ["THE DEEP TERMINAL", "ok"],
  ];
  const secretSeq = (onDone) => {
    showScreen("secret");
    const el = $("#secret-text");
    el.innerHTML = "";
    let li = 0;
    TD2.audio.sfx("secret");
    const next = () => {
      if (li >= SECRET_LINES.length) {
        el.innerHTML += '<br><span style="color:var(--cyan)">▸ PRESS ENTER TO ENGAGE</span>';
        if (onDone) onDone();
        return;
      }
      const [line, cls] = SECRET_LINES[li++];
      const div = document.createElement("div");
      if (cls) div.className = cls;
      el.appendChild(div);
      let ci = 0;
      const type = () => {
        ci += 2;
        div.textContent = line.slice(0, ci);
        if (ci % 6 === 0 && line) TD2.audio.sfx("key");
        if (ci < line.length) setTimeout(type, 16);
        else {
          if (line.includes("ERROR") || line.includes("UNREGISTERED")) TD2.audio.sfx("err");
          else if (line === "SECRET WAVE UNLOCKED" || line === "THE DEEP TERMINAL") TD2.audio.sfx("achievement");
          setTimeout(next, line === "████████████" ? 500 : 240);
        }
      };
      if (!line) setTimeout(next, 200);
      else type();
    };
    next();
  };

  /* ---------- achievement popup ---------- */
  const achievementPop = (name, desc) => {
    showScreen("achievement");
    $("#ach-name").textContent = name;
    $("#ach-desc").textContent = desc;
    TD2.audio.sfx("achievement");
    clearTimeout(achievementPop._t);
    achievementPop._t = setTimeout(() => hideScreensIfAch(), 3400);
  };
  const hideScreensIfAch = () => {
    if (current === "achievement") hideScreens();
  };

  return {
    showScreen, hideScreens,
    boot, menu, menuMove, menuActivate, settings, applyAccessibility, leaderboard, achievements, credits,
    countdown, waveIntro, pause, resume, waveClear, gameover, victory, secretSeq, achievementPop,
  };
})();
