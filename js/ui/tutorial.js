/* ============================================================
   TD2 ui/tutorial.js — interactive tutorial. Shows guided boxes
   while the player actually solves a practice spider in the
   live game loop (game.js PRACTICE mode).
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.tutorial = (() => {
  const { $, show, hide } = TD2.util;
  let layer, active = false, step = -1, waitingSolve = false;

  const STEPS = [
    {
      title: "INCOMING HOSTILES",
      body: "A cyber-spider is descending toward your cannon. Every spider carries a mathematical expression — that expression is its shield, and <b>your knowledge of mathematics is the weapon</b>.",
      keys: "Press ENTER to continue",
      wait: "enter",
      pos: { top: "10%", left: "6%" },
    },
    {
      title: "READ · CALCULATE · ENTER",
      body: () => `The TARGET panel at the bottom shows the expression to solve. Type its answer using the number keys.<br><br><span class="tut-demo">TARGET: ${practiceExpr()}</span>`,
      keys: "Type the answer, then press ENTER to FIRE",
      wait: "solve",
      pos: { bottom: "36%", left: "6%" },
    },
    {
      title: "DIRECT HIT",
      body: "The laser fired and destroyed the spider. Fast answers earn <b>PERFECT / FAST</b> speed bonuses, and consecutive correct answers build a <b>COMBO</b> multiplier up to ×5.",
      keys: "Press ENTER to continue",
      wait: "enter",
      pos: { top: "10%", right: "6%" },
    },
    {
      title: "THE DEFENSE LINE",
      body: "The dashed red line is your defense line. If a spider latches onto it, it drains HP every second until destroyed. Wrong answers spark a warning but never stop the battle.",
      keys: "Press ENTER to continue",
      wait: "enter",
      pos: { bottom: "30%", right: "6%" },
    },
    {
      title: "WAVES & BOSSES",
      body: "10 waves of escalating threats. Bosses assault waves <b>2 · 4 · 6 · 8 · 10</b>, each with unique mechanics. Deep rumors speak of an <b>11th wave</b> hidden in the terminal...",
      keys: "Press ENTER to begin your defense",
      wait: "enter",
      pos: { top: "34%", left: "6%" },
    },
  ];

  const practiceExpr = () => {
    tutorial._practice = TD2.math.generate("normal", -0.6);
    return tutorial._practice.text;
  };

  const start = () => {
    active = true; step = -1; waitingSolve = false;
    layer = $("#tutorial-layer");
    show(layer);
    TD2.screens.hideScreens();          // clear menu so the battlefield is visible
    TD2.hud.showHud();
    next();
    TD2.game._S.state = "TUTORIAL";     // keep state machine in TUTORIAL during boxes
    TD2.game._S.practice = null;
  };
  const showBox = () => {
    layer.innerHTML = "";
    const def = STEPS[step];
    const div = document.createElement("div");
    div.className = "tut-box";
    div.style.cssText = Object.entries(def.pos).map(([k, v]) => `${k}:${v}`).join(";");
    const body = typeof def.body === "function" ? def.body() : def.body;
    div.innerHTML = `<div class="tut-step">TUTORIAL ${step + 1}/${STEPS.length}</div>
      <div class="tut-title">${def.title}</div>
      <div class="tut-body">${body}</div>
      <div class="tut-keys">${def.keys}</div>`;
    div.onclick = () => { if (def.wait === "enter") next(); };
    layer.appendChild(div);
  };
  const next = () => {
    step++;
    waitingSolve = false;
    if (step >= STEPS.length) { end(); TD2.game.startRun(false); return; }
    TD2.audio.sfx("click");
    showBox();
    if (STEPS[step].wait === "solve") {
      waitingSolve = true;
      TD2.game.spawnPracticeSpider(tutorial._practice);
    }
  };
  /** game.js calls this when the practice spider is destroyed. */
  const notifySolved = () => {
    if (active && waitingSolve) next();
  };
  /** game.js asks whether ENTER should advance the tutorial box. */
  const wantsAdvance = () => active && !waitingSolve && step >= 0 && step < STEPS.length;
  const end = () => { active = false; waitingSolve = false; hide(layer); if (layer) layer.innerHTML = ""; };
  const isActive = () => active;

  const tutorial = { start, next, notifySolved, wantsAdvance, isActive, _practice: null };
  return tutorial;
})();
