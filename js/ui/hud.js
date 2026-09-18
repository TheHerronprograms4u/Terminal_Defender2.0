/* ============================================================
   TD2 ui/hud.js — in-game HUD controller (DOM over canvas)
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.hud = (() => {
  const { $, show, hide, fmt } = TD2.util;
  const C = TD2.config.colors;
  let el = {};
  let dispScore = 0;          // animated score display
  let numpadOn = false;

  const init = () => {
    el = {
      root: $("#hud"),
      wave: $("#wave-val"), threat: $("#threat-bar i"),
      scoreBox: $("#hud-score"),
      score: $("#score-val"), acc: $("#acc-val"), rt: $("#rt-val"),
      high: $("#high-val"), status: $("#hud-status"), statusText: $("#hud-status-text"),
      hpFill: $("#hp-fill"), hpGhost: $("#hp-ghost"), hpVal: $("#hp-val"), hpBar: $("#hp-bar"),
      input: $("#input-val"),
      combo: $("#combo-val"), comboMult: $("#combo-mult"),
      bossbar: $("#bossbar"), bossName: $("#boss-name"), bossHp: $("#boss-hp-fill"),
      targetExpr: $("#target-expr"), targetHint: $("#target-hint"),
      banner: $("#event-banner"), bannerText: $("#event-banner-text"),
      timers: $("#event-timers"),
      toasts: $("#toasts"),
      numpad: $("#numpad"),
      lowhp: $("#lowhp-overlay"),
      dmgFlash: $("#damage-flash"),
    };
    // numpad (touch & mobile devices)
    const handleKey = (k) => {
      if (!k) return;
      TD2.audio.unlock();
      TD2.audio.sfx("key");
      if (k === "BS") TD2.game.pressKey("Backspace");
      else if (k === "C") TD2.game.clearInput();
      else if (k === "EN") TD2.game.pressKey("Enter");
      else if (k === "TAB") TD2.game.cycleTarget();
      else TD2.game.pressKey(k);
    };

    // Use pointerdown for zero-latency instant input on touchscreens
    // Fallback to touchstart/mousedown for browsers without PointerEvent support
    const press = (target, prevent) => {
      const b = (target && target.closest) ? target.closest("button") : null;
      if (!b) return;
      if (prevent) prevent();
      handleKey(b.dataset.k);
    };
    if (window.PointerEvent) {
      el.numpad.addEventListener("pointerdown", (e) => press(e.target, () => e.preventDefault()));
    } else {
      el.numpad.addEventListener("touchstart", (e) => {
        const t = e.changedTouches[0];
        press(t ? t.target : null, () => e.preventDefault());
      }, { passive: false });
      el.numpad.addEventListener("mousedown", (e) => press(e.target, () => e.preventDefault()));
    }

    // Mobile pause button wiring
    const pauseBtn = $("#btn-pause-mobile");
    if (pauseBtn) {
      pauseBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        TD2.audio.unlock();
        TD2.audio.sfx("click");
        TD2.game.togglePause();
      });
      pauseBtn.addEventListener("click", (e) => e.preventDefault());
    }

    const checkMobile = () => (
      ("ontouchstart" in window) ||
      (navigator.maxTouchPoints > 0) ||
      (window.innerWidth <= 768) ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
    );
    if (checkMobile()) toggleNumpad(true);
    window.addEventListener("resize", () => {
      if (checkMobile()) toggleNumpad(true);
    });

    dispScore = 0;
  };

  const showHud = () => {
    show(el.root);
    if (("ontouchstart" in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 768)) {
      toggleNumpad(true);
    }
  };
  const hideHud = () => { hide(el.root); };

  const toggleNumpad = (force) => {
    numpadOn = force != null ? force : !numpadOn;
    el.numpad.classList.toggle("hidden", !numpadOn);
  };

  const setBoss = (b) => {
    if (!b) { hide(el.bossbar); return; }
    show(el.bossbar);
    el.bossName.textContent = b.name;
  };

  const update = (s) => {
    // score animation (ease toward target)
    if (dispScore !== s.score) {
      const prev = dispScore;
      dispScore += (s.score - dispScore) * 0.22;
      if (Math.abs(s.score - dispScore) < 1) dispScore = s.score;
      el.score.textContent = fmt(dispScore);
      if (s.score > prev && el.scoreBox) {
        el.scoreBox.classList.add("score-pulse");
        clearTimeout(el.scoreBox._t);
        el.scoreBox._t = setTimeout(() => el.scoreBox.classList.remove("score-pulse"), 250);
      }
    }
    el.wave.textContent = s.waveText;
    el.threat.style.width = `${Math.round(s.threat * 100)}%`;
    el.high.textContent = fmt(s.high);
    el.acc.textContent = `ACC ${s.acc}%`;
    el.rt.textContent = `RT ${s.rt}s`;

    // status line
    if (el.statusText) el.statusText.textContent = s.status;
    else el.status.textContent = s.status;
    el.status.classList.toggle("danger", s.danger);

    // HP
    const frac = Math.max(0, s.hp / s.maxHp);
    el.hpFill.style.width = `${frac * 100}%`;
    el.hpGhost.style.width = `${frac * 100}%`;
    el.hpVal.textContent = `${Math.max(0, Math.ceil(s.hp))}/${s.maxHp}`;
    el.hpBar.classList.toggle("low", frac <= 0.5 && frac > 0.25);
    el.hpBar.classList.toggle("crit", frac <= 0.25);
    el.lowhp.classList.toggle("on", frac <= 0.25);

    // input echo
    if (el.input.textContent !== s.input) {
      el.input.textContent = s.input || ">_";
      if (s.input.length) { el.input.classList.remove("pop"); void el.input.offsetWidth; el.input.classList.add("pop"); }
    }

    // combo
    el.combo.textContent = `×${s.combo}`;
    el.combo.classList.toggle("hot", s.combo >= 10);
    el.comboMult.textContent = `MULT ×${s.mult}`;

    // boss bar
    if (s.boss) el.bossHp.style.width = `${(s.boss.hp / s.boss.maxHp) * 100}%`;

    // target panel
    el.targetExpr.textContent = s.targetExpr || "STANDBY";
    el.targetHint.textContent = s.targetHint || "";
  };

  const banner = (text, ms = 2200) => {
    el.bannerText.textContent = text;
    show(el.banner);
    clearTimeout(banner._t);
    banner._t = setTimeout(() => hide(el.banner), ms);
  };

  const updateTimers = (events) => {
    if (!events.length) { el.timers.innerHTML = ""; return; }
    el.timers.innerHTML = events
      .map((ev) => `<div class="ev-timer">${ev.name} <b>${ev.tLeft.toFixed(0)}s</b></div>`)
      .join("");
  };

  const toast = (msg, warn = false, lines = null) => {
    const d = document.createElement("div");
    d.className = "toast" + (warn ? " warn" : "");
    d.innerHTML = lines ? lines.map((l) => `${l}<br>`).join("") : msg;
    el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 3000);
    while (el.toasts.children.length > 5) el.toasts.firstChild.remove();
  };

  const incorrect = (expected, entered) => {
    toast("INCORRECT", true, [`Expected: ${expected}`, `Entered: ${entered}`]);
    TD2.util.flash(el.dmgFlash, "hit", 300);
  };

  return { init, showHud, hideHud, update, setBoss, banner, updateTimers, toast, incorrect, toggleNumpad };
})();
