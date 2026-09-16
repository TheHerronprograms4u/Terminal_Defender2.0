/* ============================================================
   TD2 ui/tutorial.js — enhanced interactive defense academy.
   Guides players through target lock, terminal input below gun,
   multi-target TAB switching, defense perimeter, speed bonuses,
   minimal score telemetry, and enemy variants.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.tutorial = (() => {
  const { $, show, hide } = TD2.util;
  let layer, active = false, step = 0, waitingSolve = false;
  let hintTimer = null;

  const STEPS = [
    {
      id: "briefing",
      title: "CYBER HOSTILE APPROACHING",
      body: () => `A hostile cyber-spider is descending toward your defense perimeter. Spiders are protected by mathematical encryption shields. <b>Your ability to calculate and type their answers is the only weapon that can destroy them.</b>`,
      keys: "Press ENTER or click NEXT to continue",
      wait: "enter",
      pos: { top: "12%", left: "4%" },
      spotlight: { top: "6%", left: "46%", width: "42%", height: "200px" },
      onEnter: () => {
        // Spawn demo spider slowly descending
        const expr = TD2.math.generate("easy", -0.8);
        TD2.game.spawnPracticeSpider(expr, 0.5, 4);
      },
    },
    {
      id: "cannon_terminal",
      title: "TURRET & TERMINAL INPUT CONSOLE",
      body: () => `Notice the <b>futuristic cannon</b> in the center of the battlefield. The cannon automatically pivots and locks onto descending threats.<br><br>Directly docked <b>below the gun</b> is your <b>TERMINAL INPUT CONSOLE</b> with real-time <b>TARGET LOCK</b> telemetry showing the hostile's expression.`,
      keys: "Press ENTER or click NEXT to continue",
      wait: "enter",
      pos: { top: "14%", right: "5%" },
      spotlight: { top: "calc(var(--cannon-y, 74%) - 45px)", left: "calc(50% - 210px)", width: "420px", height: "235px" },
    },
    {
      id: "practice_single",
      title: "TRIAL 1: CALCULATE & FIRE",
      body: () => {
        const p = TD2.tutorial._practice1 || (TD2.tutorial._practice1 = TD2.math.generate("easy", -0.7));
        return `Solve the target hostile's expression. Type its answer using the numerical keys (0–9), then press <span class="tut-key">ENTER</span> to fire the laser!<br><div class="tut-target-callout">TARGET EXPRESSION: <b>${p.text}</b></div>`;
      },
      keys: "Type answer, then press ENTER to FIRE",
      wait: "solve",
      pos: { top: "12%", left: "5%" },
      spotlight: { top: "calc(var(--cannon-y, 74%) + 30px)", left: "calc(50% - 210px)", width: "420px", height: "130px" },
      onEnter: () => {
        const p = TD2.tutorial._practice1 || (TD2.tutorial._practice1 = TD2.math.generate("easy", -0.7));
        TD2.game.spawnPracticeSpider(p, 0.5, 6);
        startHintTimer(p.answer);
      },
    },
    {
      id: "practice_multi",
      title: "MULTI-TARGET COMBAT: TAB KEY",
      body: () => `Multiple hostiles detected! When multiple enemies are descending, press <span class="tut-key">TAB</span> (or click directly on a spider) to cycle your target lock. Calculate and eliminate both practice hostiles!`,
      keys: "Press TAB to switch target · Type answer · Press ENTER",
      wait: "solve",
      pos: { top: "12%", right: "5%" },
      spotlight: null,
      onEnter: () => {
        const p1 = TD2.math.generate("easy", -0.7);
        const p2 = TD2.math.generate("easy", -0.5);
        TD2.tutorial._practiceMulti = [p1, p2];
        TD2.game.spawnPracticeMulti([
          { expr: p1, laneX: 0.32, speed: 5 },
          { expr: p2, laneX: 0.68, speed: 5 },
        ]);
        startHintTimer(`${p1.answer} & ${p2.answer}`);
      },
    },
    {
      id: "defense_line",
      title: "THE DEFENSE PERIMETER",
      body: () => `The glowing red dashed line is your <b>DEFENSE PERIMETER</b>. If hostiles breach this threshold, they latch onto your grid and continuously drain your hull HP until destroyed!<br><br>Wrong answers trigger an overheat warning, but your cannon stays online. Never panic — stay accurate.`,
      keys: "Press ENTER or click NEXT to continue",
      wait: "enter",
      pos: { top: "16%", left: "5%" },
      spotlight: { top: "calc(var(--cannon-y, 74%) - 62px)", left: "0", width: "100%", height: "28px" },
      onEnter: () => {
        // Clear remaining practice spiders
        TD2.game._S.spiders = [];
      },
    },
    {
      id: "score_combo",
      title: "SPEED BONUSES & ×5 COMBO",
      body: () => `Look at the <b>minimalist score telemetry bar</b> at the top of your screen.<br><br>Answers solved in under <b>1.0s</b> earn <span style="color:var(--gold)">PERFECT (+250)</span> bonus points; under <b>2.0s</b> earn <span style="color:var(--green)">FAST (+150)</span>.<br><br>Consecutive correct hits build an unbroken <b>COMBO chain</b> with up to <b>×5 multiplier</b>!`,
      keys: "Press ENTER or click NEXT to continue",
      wait: "enter",
      pos: { top: "18%", left: "5%" },
      spotlight: { top: "6px", left: "calc(50% - 210px)", width: "420px", height: "66px" },
    },
    {
      id: "roster",
      title: "HOSTILE THREAT INTEL",
      body: () => `The invasion matrix deploys diverse hostile variants across 10 campaign waves:
        <div class="tut-roster">
          <div class="tut-roster-item"><b style="color:var(--cyan)">🕷 BASIC / SPEED</b>Standard infantry & agile skirmishers.</div>
          <div class="tut-roster-item"><b style="color:var(--blue)">🛡 ARMORED SPIDER</b>Reinforced plating; takes 2 correct answers.</div>
          <div class="tut-roster-item"><b style="color:var(--gold)">🟡 SHIELD SPIDER</b>Deflects fire until shield matrix is broken.</div>
          <div class="tut-roster-item"><b style="color:var(--violet)">🟣 SPLIT SPIDER</b>Splits into fast spiderlings upon destruction.</div>
        </div>
        Colossal multi-phase <b>BOSSES</b> assault the terminal on waves <b>2 · 4 · 6 · 8 · 10</b>!`,
      keys: "Press ENTER or click NEXT to continue",
      wait: "enter",
      pos: { top: "10%", left: "5%" },
      spotlight: null,
    },
    {
      id: "ready",
      title: "DEFENSE READINESS COMPLETE",
      body: () => `All systems nominal. Your training is complete, Defender. 10 campaign waves of escalating mathematical threats await.<br><br>Deep terminal logs speak of a hidden <b>Wave 11</b> corrupted kernel... will you uncover it?`,
      keys: "Select an option below to proceed",
      wait: "choice",
      pos: { top: "25%", left: "50%", transform: "translateX(-50%)" },
      spotlight: null,
    },
  ];

  const startHintTimer = (hintAnswer) => {
    clearTimeout(hintTimer);
    removeHintBanner();
    hintTimer = setTimeout(() => {
      if (active && waitingSolve) {
        showHintBanner(`HINT: Target answer is ${hintAnswer}`);
      }
    }, 6000);
  };

  const showHintBanner = (txt) => {
    removeHintBanner();
    const b = document.createElement("div");
    b.id = "tut-hint-banner";
    b.className = "tut-hint-banner";
    b.textContent = txt;
    layer.appendChild(b);
  };

  const removeHintBanner = () => {
    const b = $("#tut-hint-banner");
    if (b) b.remove();
  };

  const start = () => {
    active = true;
    step = 0;
    waitingSolve = false;
    tutorial._practice1 = null;
    tutorial._practiceMulti = null;
    layer = $("#tutorial-layer");
    show(layer);
    TD2.screens.hideScreens();
    TD2.hud.showHud();
    TD2.game._S.state = "TUTORIAL";
    TD2.game._S.practice = null;
    TD2.game._S.spiders = [];
    renderStep();
  };

  const renderStep = () => {
    if (!layer) return;
    layer.innerHTML = "";
    removeHintBanner();
    clearTimeout(hintTimer);

    // Skip Tutorial button in top-right corner
    const skipBtn = document.createElement("button");
    skipBtn.className = "tut-skip-btn";
    skipBtn.textContent = "✕ SKIP TUTORIAL";
    skipBtn.onclick = (e) => {
      e.stopPropagation();
      TD2.audio.sfx("click");
      end();
      TD2.game.toMenu();
    };
    layer.appendChild(skipBtn);

    const def = STEPS[step];

    // Spotlight overlay highlighting relevant game element
    if (def.spotlight) {
      const spot = document.createElement("div");
      spot.className = "tut-spotlight";
      spot.style.cssText = Object.entries(def.spotlight).map(([k, v]) => `${k}:${v}`).join(";");
      layer.appendChild(spot);
    }

    // Main Tutorial Box
    const div = document.createElement("div");
    div.className = "tut-box";
    div.style.cssText = Object.entries(def.pos).map(([k, v]) => `${k}:${v}`).join(";");

    // Header with step number and progress dots
    const dotsHtml = STEPS.map((_, i) => `<span class="tut-dot ${i === step ? "active" : ""}"></span>`).join("");
    const bodyHtml = typeof def.body === "function" ? def.body() : def.body;

    let actionsHtml = "";
    if (def.wait === "choice") {
      actionsHtml = `
        <div class="tut-actions" style="justify-content:center; gap: 14px;">
          <button class="tut-btn primary" id="tut-start-btn">▶ START CAMPAIGN (WAVE 1)</button>
          <button class="tut-btn" id="tut-menu-btn">RETURN TO MENU</button>
        </div>`;
    } else {
      const canBack = step > 0 && !waitingSolve;
      actionsHtml = `
        <div class="tut-actions">
          <div class="tut-keys-hint">${def.keys}</div>
          <div class="tut-btn-group">
            ${canBack ? '<button class="tut-btn" id="tut-back-btn">◂ BACK</button>' : ""}
            ${def.wait === "enter" ? '<button class="tut-btn primary" id="tut-next-btn">NEXT ▸</button>' : ""}
          </div>
        </div>`;
    }

    div.innerHTML = `
      <div class="tut-header-row">
        <div class="tut-step">ACADEMY // STEP ${step + 1} OF ${STEPS.length}</div>
        <div class="tut-dots">${dotsHtml}</div>
      </div>
      <div class="tut-title">${def.title}</div>
      <div class="tut-body">${bodyHtml}</div>
      ${actionsHtml}
    `;

    layer.appendChild(div);

    // Event listeners for action buttons
    const nextBtn = $("#tut-next-btn");
    if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); next(); };

    const backBtn = $("#tut-back-btn");
    if (backBtn) backBtn.onclick = (e) => { e.stopPropagation(); prev(); };

    const startBtn = $("#tut-start-btn");
    if (startBtn) startBtn.onclick = (e) => {
      e.stopPropagation();
      TD2.audio.sfx("select");
      end();
      TD2.game.startRun(false);
    };

    const menuBtn = $("#tut-menu-btn");
    if (menuBtn) menuBtn.onclick = (e) => {
      e.stopPropagation();
      TD2.audio.sfx("click");
      end();
      TD2.game.toMenu();
    };

    waitingSolve = def.wait === "solve";
    if (typeof def.onEnter === "function") {
      def.onEnter();
    }
  };

  const next = () => {
    if (waitingSolve) return;
    step++;
    if (step >= STEPS.length) {
      end();
      TD2.game.startRun(false);
      return;
    }
    TD2.audio.sfx("click");
    renderStep();
  };

  const prev = () => {
    if (step <= 0 || waitingSolve) return;
    step--;
    TD2.audio.sfx("click");
    renderStep();
  };

  const notifySolved = () => {
    if (active && waitingSolve) {
      waitingSolve = false;
      removeHintBanner();
      clearTimeout(hintTimer);
      TD2.audio.sfx("ok");
      setTimeout(() => {
        if (active) next();
      }, 400);
    }
  };

  const wantsAdvance = () => active && !waitingSolve && step >= 0 && step < STEPS.length - 1;

  const end = () => {
    active = false;
    waitingSolve = false;
    clearTimeout(hintTimer);
    removeHintBanner();
    hide(layer);
    if (layer) layer.innerHTML = "";
    if (TD2.game._S.spiders) TD2.game._S.spiders = [];
    TD2.game._S.practice = null;
  };

  const isActive = () => active;

  const tutorial = {
    start, next, prev, notifySolved, wantsAdvance, isActive, end,
    _practice1: null, _practiceMulti: null
  };
  return tutorial;
})();
