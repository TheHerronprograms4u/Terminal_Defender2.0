/* ============================================================
   TD2 core/game.js — central orchestrator.
   State machine, main loop, canvas field rendering, targeting,
   scoring, boss orchestration, input. Consumes all modules.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.game = (() => {
  const { rand, pick, clamp, fmt } = TD2.util;
  const C = TD2.config.colors;

  /* ---------- canvas ---------- */
  let canvas, ctx, W = 0, H = 0, dpr = 1;
  let menuFx = null, menuFxOn = false;

  /* ---------- runtime state ---------- */
  const S = {
    state: "BOOT", paused: false,
    time: 0, raf: null, last: 0,
    wave: 1, wave11Stage: 1,
    queue: [], waveEvents: [], queueIdx: 0, waveTime: 0,
    spiders: [], boss: null,
    input: "",
    hp: 100, maxHp: 100,
    score: 0, clearing: false,
    combo: 0, bestCombo: 0, comboMult: 1,
    kills: 0, bossKills: 0,
    shots: 0, hits: 0,
    rtSum: 0, rtCount: 0, speedDemons: 0,
    waveHpLost: 0, waveShots: 0, waveHits: 0,
    activeEvents: [],
    target: null,              // targeted entity (spider or boss)
    practice: null,
    waveDef: null,
    bossPending: false,
    gameMode: "run",           // run | practice
  };

  /* ---------- difficulty helpers ---------- */
  const diff = () => TD2.config.DIFFICULTIES[TD2.save.getSetting("difficulty", "NORMAL")] ?? TD2.config.DIFFICULTIES.NORMAL;
  const speedMul = () => diff().speedMul;
  // wave 11 is the fastest wave in the game; stage 2 pours on more pressure
  const waveSpeedRamp = () => S.wave === 11 ? 1.6 + (S.wave11Stage - 1) * 0.2 : 1 + (S.wave - 1) * 0.06;
  const breachY = () => {
    if (TD2.cannonEnt) return TD2.cannonEnt.y - 52;
    return H * (W < 768 && H > W ? 0.38 : TD2.config.LAYOUT.breach);
  };
  const chroma = () => S.wave === 11 || (S.boss && S.boss.def.id === "overlord" && S.boss.phase >= 1);

  /* ============================================================
     VIEW / RESIZE
     ============================================================ */
  const view = () => ({ w: W, h: H });
  const layoutCannon = () => {
    TD2.cannonEnt.x = W / 2;
    // Calculate cannon.y so the terminal input console docks cleanly underneath
    const isPortraitMobile = W < 768 && H > W;
    let targetY;
    if (isPortraitMobile) {
      // In portrait mobile: leave top ~40% for spider combat, dock cannon in the upper-mid
      // so the horizontal terminal strip (~70px) and bottom numpad (~225px) fit cleanly
      targetY = Math.round(Math.min(H * 0.44, H - 350));
      targetY = Math.max(180, targetY);
    } else if (H <= 520) {
      // Landscape mobile
      targetY = Math.round(H * 0.62);
    } else {
      targetY = Math.max(H * 0.60, Math.min(H * 0.74, H - 160));
    }
    TD2.cannonEnt.y = targetY;
    document.documentElement.style.setProperty("--cannon-y", `${targetY}px`);
    document.documentElement.style.setProperty("--cannon-x", `${W / 2}px`);
  };
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (menuFx) { menuFx.width = W; menuFx.height = H; }
  };

  /* ============================================================
     STATE MACHINE
     ============================================================ */
  const setState = (st) => {
    S.state = st;
    TD2.events.emit("state", st);
  };

  /* ============================================================
     RUN LIFECYCLE
     ============================================================ */
  const startRun = (fromMenu = true, noAutoWave = false) => {
    TD2.screens.hideScreens();
    const d = diff();
    S.maxHp = d.hp; S.hp = d.hp;
    S.score = 0; S.combo = 0; S.bestCombo = 0; S.comboMult = 1;
    S.kills = 0; S.bossKills = 0; S.shots = 0; S.hits = 0;
    S.rtSum = 0; S.rtCount = 0; S.speedDemons = 0;
    S.gameMode = "run";
    S.totalHpLost = 0; S._newRecord = false;
    S.spiders = []; S.boss = null; S.target = null;
    S.wave = 0;
    S.activeEvents = []; S.waveEvents = [];
    TD2.save.update((d2) => { d2.stats.totalGames++; });
    TD2.hud.showHud();
    TD2.audio.setMode("wave", { intensity: 0.2 });
    if (!noAutoWave) nextWave();
  };

  const startDeepRun = () => {
    startRun(false, true);
    S.wave = 11; S.wave11Stage = 1;
    beginWaveIntro();
  };

  const nextWave = () => {
    S.wave++;
    if (S.wave > 10 && !S.waveDef?.deep) {
      // beyond 10 without deep flag shouldn't happen; guard
      S.wave = 10;
    }
    S.wave11Stage = 1;
    beginWaveIntro();
  };

  const beginWaveIntro = () => {
    const def = TD2.waves.WAVES[S.wave] ?? TD2.waves.WAVES[10];
    S.waveDef = def;
    const isBoss = !!def.boss;
    setState("WAVE_INTRO");
    TD2.screens.waveIntro(S.wave, def.label, def.threat, isBoss, def.deep);
    TD2.audio.sfx("wave");
    TD2.audio.setMode(def.deep ? "deep" : "wave", { intensity: def.threat });
    if (isBoss) TD2.audio.sfx("bossroar");
    setTimeout(() => {
      if (S.state !== "WAVE_INTRO") return;   // user may have restarted
      setState("COUNTDOWN");
      let n = 3;
      const tick = () => {
        if (S.state !== "COUNTDOWN") return;
        TD2.screens.countdown(n, null);
        if (n === 0) {
          setTimeout(() => { if (S.state === "COUNTDOWN") startWave(); }, 700);
        } else { n--; setTimeout(tick, 800); }
      };
      tick();
    }, 2600);
  };

  const startWave = () => {
    TD2.screens.hideScreens();
    const built = TD2.waves.buildWave(S.wave, diff());
    S.queue = built.entries.map((e) => ({ ...e, exprWave: S.wave }));
    S.waveEvents = built.events.map((e) => ({ ...e, fired: false }));
    S.queueIdx = 0; S.waveTime = 0;
    S.spiders = []; S.boss = null;
    // wave 11 holds its boss back for stage 2 — stage 1 must be cleared outright
    S.bossPending = !!built.bossWave && !built.deep;
    S.clearing = false;
    S.waveHpLost = 0; S.waveShots = 0; S.waveHits = 0;
    setState("ACTIVE");
    TD2.hud.setBoss(null);
    TD2.cannon.setBossMode(TD2.cannonEnt, false);
    if (S.wave === 10) TD2.save.recordBest({ bestWave: 10 });
    if (S.wave === 10) unlockAch("math_monster");
  };

  const clearWave = () => {
    if (S.clearing || S.gameMode === "practice") return;
    S.clearing = true;
    // wave complete
    if (S.gameMode === "run") {
      const acc = S.waveShots > 0 ? Math.round((S.waveHits / S.waveShots) * 100) : 100;
      const perfect = S.waveHpLost === 0;
      const waveBonus = S.wave * 500 + (perfect ? 1000 : 0);
      S.score += waveBonus;
      if (perfect) unlockAch("perfect_wave");
      if (acc >= 95 && S.waveHits >= 8) unlockAch("sharpshooter");
      if (S.wave === 10 && S.bossKills && S.boss?.def?.final) {
        // handled in boss death flow
      }
      TD2.screens.waveClear({
        waveBonus, acc, bestCombo: S.bestCombo, perfect, rtAvg: avgRt(),
        next: S.wave >= 10 ? "" : `NEXT: WAVE ${String(S.wave + 1).padStart(2, "0")} — ${TD2.waves.WAVES[S.wave + 1]?.label ?? ""}`,
      });
      setState("WAVE_CLEAR");
      setTimeout(() => {
        if (S.state !== "WAVE_CLEAR") return;
        if (S.wave >= 10) { S.clearing = false; victorySequence(); }
        else { S.clearing = false; nextWave(); }
      }, 3200);
    } else {
      // practice mode (tutorial) — no wave-clear screen
      TD2.tutorial.notifySolved();
    }
  };

  const victorySequence = () => {
    setState("VICTORY");
    if (!S.totalHpLost) unlockAch("untouchable");
    commitRunStats();
    TD2.screens.victory(runStats());
    TD2.audio.setMode("menu", { intensity: 0.4 });
    // deliberate delay, then the secret sequence
    setTimeout(() => {
      if (S.state !== "VICTORY") return;
      TD2.screens.secretSeq(() => {
        // after typing finishes, wait for ENTER (handled in key handler)
        S.awaitSecretEnter = true;
      });
    }, 4200);
  };

  const launchDeepWave = () => {
    S.wave = 11; S.wave11Stage = 1;
    S.awaitSecretEnter = false;
    S.maxHp = diff().hp; S.hp = diff().hp;
    TD2.save.update((d) => { d.stats.secretWaveDiscovered = true; });
    unlockAch("the_signal", true);
    beginWaveIntro();
  };

  /* ============================================================
     SPAWNING
     ============================================================ */
  const spawnFromQueue = () => {
    while (S.queueIdx < S.queue.length && S.queue[S.queueIdx].t <= S.waveTime) {
      const e = S.queue[S.queueIdx++];
      spawnEnemy(e.type, e.laneX, e.pool, e.bias ?? 0);
    }
  };

  const spawnEnemy = (type, laneX, pool, bias, opts = {}) => {
    const exprPool = pool ?? "normal";
    const totalBias = bias + diff().exprBias;
    let expr, fakeText = null;
    const decChance = opts.deceptiveChance ?? 0;
    if (Math.random() < decChance) {
      const d = TD2.math.deceptive(exprPool, totalBias);
      expr = d.real; fakeText = d.fake.text;
    } else {
      expr = type === "mini" ? TD2.math.easy() : TD2.math.generate(exprPool, totalBias);
    }
    const sp = TD2.spider.create(type, { laneX, expr, time: S.time });
    sp._deceptiveReal = !!fakeText;         // raw roll — assist paints the tell
    sp.fakeText = fakeText;                 // null unless assist is ON
    if (opts.crit) sp.crit = true;
    S.spiders.push(sp);
    TD2.fx.burst(sp.x || sp.baseX * W, 0, { count: 8, color: [C.cyan, C.green], speed: 60, life: 0.4 });
  };

  const spawnPracticeSpider = (expr, laneX = 0.5, speed = 8) => {
    S.gameMode = "practice";
    S.spiders = [];
    const sp = TD2.spider.create("basic", { laneX, expr, time: S.time });
    sp.speed = speed;
    S.spiders = [sp];
    S.practice = sp;
    S.target = sp;
    S.state = "TUTORIAL";
  };

  const spawnPracticeMulti = (items) => {
    S.gameMode = "practice";
    S.spiders = [];
    const created = items.map((it, idx) => {
      const lane = it.laneX ?? (idx === 0 ? 0.35 : 0.65);
      const sp = TD2.spider.create(it.type || "basic", { laneX: lane, expr: it.expr, time: S.time });
      sp.speed = it.speed ?? 7;
      return sp;
    });
    S.spiders = created;
    S.practice = created[0];
    S.target = created[0];
    S.state = "TUTORIAL";
  };

  /* ============================================================
     TARGETING
     ============================================================ */
  const aliveSpiders = () => S.spiders.filter((s) => s.state === "alive");
  const pickAutoTarget = () => {
    // priority: closest to bottom, then highest threat, boss, oldest
    const list = aliveSpiders();
    if (!list.length) return S.boss && S.boss.state !== "dying" ? S.boss : null;
    list.sort((a, b) => b.y - a.y);
    return list[0];
  };
  const cycleTarget = () => {
    const list = aliveSpiders().sort((a, b) => b.y - a.y);
    if (S.boss && S.boss.state !== "dying") list.push(S.boss);
    if (!list.length) return;
    const i = list.indexOf(S.target);
    S.target = list[(i + 1) % list.length] ?? list[0];
    TD2.audio.sfx("key");
  };

  const updateTargets = () => {
    const t = pickAutoTarget();
    if (!S.target || S.target.state === "dying" || (S.target.kind === "spider" && S.target.state !== "alive")) {
      S.target = t;
    }
    // aim cannon
    const tgt = S.target;
    if (tgt) {
      const tx = tgt.kind === "boss" ? tgt.x * W : tgt.x;
      const ty = tgt.kind === "boss" ? tgt.yF * H : tgt.y;
      TD2.cannon.aimAt(TD2.cannonEnt, tx, ty);
    } else TD2.cannon.idleAim(TD2.cannonEnt);
    // highlight flags
    for (const s of S.spiders) s.targeted = s === S.target;
    if (S.boss) S.boss.targeted = S.target === S.boss;
    // target assist: paint deceptive tells
    const assist = TD2.save.getSetting("targetAssist");
    for (const s of S.spiders) s.deceptive = s._deceptiveReal && assist;
  };

  const targetExprDisplay = () => {
    const t = S.target;
    if (!t) return { expr: "STANDBY", hint: "" };
    if (t.kind === "boss") {
      const hidden = t.concealT > 0;
      return { expr: hidden ? "?¿?¿?" : t.expr.text, hint: hidden ? "EXPRESSION CONCEALED — TAB TO SWITCH" : "BOSS TARGET" };
    }
    return { expr: t.expr.text, hint: t.deceptive ? "⚠ LABEL UNTRUSTED — PANEL SHOWS TRUTH" : "" };
  };

  /* ============================================================
     INPUT
     ============================================================ */
  const pressKey = (key) => {
    if (S.state === "TUTORIAL") {
      if (TD2.tutorial.wantsAdvance()) {
        if (key === "Enter") TD2.tutorial.next();
        return;
      }
    }
    if (S.state === "ACTIVE" || S.state === "BOSS" || (S.state === "TUTORIAL" && (S.practice || S.spiders.length > 0))) {
      if (key === "Enter") submitAnswer();
      else if (key === "Backspace") S.input = S.input.slice(0, -1);
      else if (key === "Tab") cycleTarget();
      else if (/^[0-9]$/.test(key)) { S.input = (S.input + key).slice(0, 6); TD2.audio.sfx("key"); }
    }
  };
  const clearInput = () => { S.input = ""; };

  const submitAnswer = () => {
    if (!S.input.length) return;
    const entered = parseInt(S.input, 10);
    const target = S.target;
    S.input = "";
    if (!target) { TD2.audio.sfx("err"); return; }
    S.shots++; S.waveShots++;
    const correct = target.expr.answer === entered;
    if (correct) {
      S.hits++; S.waveHits++;
      registerHit(target, entered);
    } else {
      handleWrong(target, entered);
    }
  };

  const registerHit = (target, entered) => {
    // reaction window opens at first sighting; bosses fall back to their spawn time
    const startedAt = target.firstHitTime ?? target.bornTime ?? S.time;
    const rt = Math.max(0, S.time - startedAt);
    if (target.firstHitTime == null) target.firstHitTime = S.time;
    S.rtSum += rt; S.rtCount++;
    const bands = TD2.config.REACTION;
    const band = bands.find((r) => rt <= r.max) ?? bands[bands.length - 1];
    const speedBonus = band.bonus;
    S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo);
    S.comboMult = TD2.config.comboMult(S.combo);
    if (rt < 2) S.speedDemons++;
    if (S.speedDemons >= 10) unlockAch("speed_demon");
    if (S.combo >= 50) unlockAch("combo_50");

    const isBoss = target.kind === "boss";
    // events multipliers
    const eventMult = hasEvent("precision") ? 2 : 1;
    if (S.score > 900000) unlockAch("over_9000");
    const base = isBoss ? 1000 : target.scoreVal;
    const exprFactor = 1 + 0.15 * (target.expr.complexity ?? 1);
    let points = Math.round(base * exprFactor * S.comboMult * eventMult);
    if (hasEvent("overclock")) points = Math.round(points * 1.25);

    if (isBoss) {
      const res = TD2.boss.hit(target, { time: S.time });
      if (res === "spark") {
        // armor absorbed
        S.combo--; // chain rule: spark doesn't extend combo
        TD2.fx.sparks(target.x * W, target.yF * H, 14, C.blue);
        TD2.fx.floatText(target.x * W, target.yF * H - 40, "ARMOR SPARK", { color: C.blue });
        TD2.audio.sfx("shield");
        return;
      }
      fireLaser(target, points, band, true);
      if (res === "dead") killBoss();
      else {
        TD2.audio.sfx("boom");
        TD2.fx.floatText(target.x * W, target.yF * H - 60, `-${fmt(points)}`, { color: C.gold });
        target.expr = TD2.math.generate(target.def.exprPool, TD2.boss.exprBias(target) + diff().exprBias);
      }
    } else {
      if (target.shielded) {
        target.shielded = false;
        TD2.fx.sparks(target.x, target.y, 12, C.gold);
        TD2.fx.floatText(target.x, target.y - 30, "SHIELD DOWN", { color: C.gold });
        TD2.audio.sfx("shieldPop");
        S.score += Math.round(50 * S.comboMult);
        // shield popped while latched → breach damage applies now
        if (target.latched && !target.latchDmgDone) {
          target.latchDmgDone = true;
          damage(Math.round(target.def.dmg * diff().dmgMul), target.x, target.y);
        }
        return;
      }
      target.hp--;
      fireLaser(target, points, band, false);
      if (target.hp <= 0) killSpider(target);
      else {
        TD2.audio.sfx("boom");
        TD2.fx.floatText(target.x, target.y - 34, "ARMOR HIT", { color: C.blue });
      }
    }
  };

  const fireLaser = (target, points, band, isBoss) => {
    const tx = isBoss ? target.x * W : target.x;
    const ty = isBoss ? target.yF * H : target.y;
    TD2.cannon.charge(TD2.cannonEnt);
    TD2.cannonEnt.recoil = 1;
    TD2.fx.laser(TD2.cannonEnt.muzzle.x, TD2.cannonEnt.muzzle.y, tx, ty, { color: isBoss ? C.red : C.green, width: isBoss ? 8 : 5 });
    TD2.fx.muzzle(TD2.cannonEnt.muzzle.x, TD2.cannonEnt.muzzle.y, Math.atan2(ty - TD2.cannonEnt.y, tx - TD2.cannonEnt.x));
    TD2.fx.shake(isBoss ? 0.5 : 0.22);
    TD2.audio.sfx("laser", { combo: Math.min(10, S.combo) });
    TD2.fx.floatText(tx, ty - 40, `+${fmt(points)}`, { color: C.gold, gated: true });
    S.score += points;
    const bandLabel = band.label;
    if (band.bonus > 0) {
      S.score += band.bonus;
      TD2.fx.floatText(tx, ty - 62, `${bandLabel} +${band.bonus}`, { color: band.color });
    } else {
      TD2.fx.floatText(tx, ty - 62, bandLabel, { color: band.color });
    }
  };

  const handleWrong = (target, entered) => {
    TD2.audio.sfx("err");
    TD2.cannon.wrong(TD2.cannonEnt);
    TD2.hud.incorrect(target.expr.answer, entered);
    TD2.fx.shake(0.15);
    if (diff().comboReset === "reset") S.combo = 0;
    else S.combo = Math.floor(S.combo / 2);
    S.comboMult = TD2.config.comboMult(S.combo);
  };

  /* ============================================================
     KILLS
     ============================================================ */
  const killSpider = (sp) => {
    sp.state = "dying";
    sp.dieT = 0;
    if (S.target === sp) S.target = null;

    if (S.gameMode === "practice") {
      const remaining = S.spiders.filter((s) => s !== sp && s.state === "alive");
      const big = sp.def.size >= 27;
      TD2.fx.burst(sp.x, sp.y, { count: big ? 30 : 18, color: [sp.color, C.white, sp.color], speed: 260 });
      TD2.fx.glyphs(sp.x, sp.y, sp.fakeText ?? sp.expr.text, C.white);
      if (remaining.length === 0) {
        S.practice = null;
        TD2.tutorial.notifySolved();
      } else {
        S.target = remaining[0];
        S.practice = remaining[0];
      }
      return;
    }
    S.kills++;
    TD2.save.bumpStats({ totalKills: 1 });
    unlockAch("first_blood");
    // score
    S.score += sp._pendingPoints ?? 0;
    // vfx
    const big = sp.def.size >= 27;
    TD2.fx.burst(sp.x, sp.y, { count: big ? 30 : 18, color: [sp.color, C.white, sp.color], speed: 260 });
    TD2.fx.glyphs(sp.x, sp.y, sp.fakeText ?? sp.expr.text, sp.deceptive ? C.violet : C.white);
    if (big) TD2.fx.ring(sp.x, sp.y, { color: sp.color, speed: 500, life: 0.4 });
    TD2.fx.smoke(sp.x, sp.y, 4);
    TD2.audio.sfx("boom", { big });
    if (sp.crit) {
      S.score += 1200;
      TD2.fx.floatText(sp.x, sp.y - 50, "CRITICAL PROTOCOL +1200", { color: C.gold });
    }
    if (sp.type === "split" && !sp.isChild) {
      for (let i = 0; i < sp.def.splitsInto; i++) {
        const child = TD2.spider.create("mini", {
          laneX: (sp.x / W) + (i === 0 ? -0.03 : 0.03),
          expr: TD2.math.easy(), time: S.time,
        });
        child.isChild = true;
        child.y = sp.y; child.x = sp.x; child.started = true;
        child.speed = sp.def.speed * 1.2;
        S.spiders.push(child);
      }
      TD2.fx.floatText(sp.x, sp.y - 40, "SPLIT!", { color: C.violet });
    }
  };

  const killBoss = () => {
    const b = S.boss;
    if (!b || S.clearing) return;
    S.clearing = true;
    S.bossKills++;
    TD2.save.bumpStats({ totalBossKills: 1 });
    unlockAch("boss_breaker");
    const bonus = 5000 + S.wave * 500;
    S.score += bonus;
    TD2.fx.floatText(b.x * W, b.yF * H, `+${fmt(bonus)}`, { color: C.gold, size: 22 });
    TD2.fx.ring(b.x * W, b.yF * H, { color: C.red, speed: 700, life: 0.8 });
    TD2.fx.shake(1);
    TD2.fx.flash("#ffffff", 0.5, 0.4);
    TD2.audio.sfx("bossdie");
    // flush queue + chain-dissolve minions (§39 edge cases)
    S.queue = []; S.queueIdx = 0;
    S.spiders.forEach((sp, i) => setTimeout(() => {
      if (sp.state === "alive") { sp.state = "dying"; sp.dieT = 0; S.kills++; }
    }, i * 100));
    TD2.hud.setBoss(null);
    S.boss = null;
    S.target = null;
    if (b.def.final) {
      if (b.def.secret) {
        finishDeep();
      } else {
        unlockAch("terminal_master");
        setTimeout(() => { S.clearing = false; if (S.state === "ACTIVE" || S.state === "BOSS") clearWave(); }, 1800);
      }
    } else {
      setTimeout(() => { S.clearing = false; if (S.state === "ACTIVE" || S.state === "BOSS") clearWave(); }, 1800);
    }
  };

  const finishDeep = () => {
    TD2.save.update((d) => { d.stats.wave11Cleared = true; });
    setState("SECRET_END");
    TD2.screens.showScreen("secret");
    document.getElementById("secret-text").innerHTML = `
      <div style="color:var(--green)">SYSTEM CLEAN</div>
      <div style="color:var(--cyan)">THE DEEP TERMINAL SEALED</div>
      <div style="color:var(--green)">DEFENSE PROTOCOL 2.0 — FULL SPECTRUM COMPLETE</div>
      <br>
      <div>FINAL SCORE: ${fmt(S.score)}</div>
      <br>
      <div class="sub">▸ PRESS ENTER FOR MAIN TERMINAL</div>`;
    S.awaitSecretEnter = true;
    S.secretEndStats = true;
  };

  /* ============================================================
     DAMAGE / BREACH
     ============================================================ */
  const damage = (amt, x, y) => {
    S.hp -= amt;
    S.waveHpLost += amt;
    S.totalHpLost = (S.totalHpLost ?? 0) + amt;
    S.combo = 0; S.comboMult = 1;
    TD2.fx.shake(0.6);
    TD2.util.flash(document.getElementById("damage-flash"), "hit", 450);
    TD2.audio.sfx("breach");
    TD2.fx.floatText(x, y - 20, `-${amt} HP`, { color: C.red, size: 18 });
    TD2.audio.setDanger(S.hp / S.maxHp <= 0.25);
    if (S.hp <= 0) gameOver();
  };

  const gameOver = () => {
    if (S.state === "GAMEOVER") return;
    setState("GAMEOVER");
    S.hp = 0;
    TD2.audio.sfx("alarm");
    TD2.fx.shake(1);
    TD2.fx.flash("#ff2040", 0.6, 0.8);
    TD2.audio.setMode(null);
    TD2.audio.setDanger(false);
    commitRunStats();
    setTimeout(() => TD2.screens.gameover(runStats()), 900);
  };

  const commitRunStats = () => {
    const st = TD2.save.get().stats;
    S._newRecord = S.score > st.bestScore && S.score > 0;
    const acc = S.shots ? Math.round((S.hits / S.shots) * 100) : 100;
    TD2.save.recordBest({
      bestScore: S.score,
      bestCombo: S.bestCombo,
      bestWave: S.wave > 10 ? 10 : S.wave,
    });
    TD2.save.bumpStats({
      accSum: acc, accRuns: 1,
      rtSum: avgRtRaw(), rtCount: 1,
    });
    TD2.save.pushScore({ score: S.score, wave: Math.min(S.wave, 10), acc, combo: S.bestCombo });
  };

  const runStats = () => ({
    wave: S.wave, score: S.score, acc: S.shots ? Math.round((S.hits / S.shots) * 100) : 100,
    bestCombo: S.bestCombo, kills: S.kills, rtAvg: avgRt(),
    newRecord: !!S._newRecord,
  });
  const avgRt = () => S.rtCount ? (S.rtSum / S.rtCount).toFixed(2) : "--";
  const avgRtRaw = () => S.rtCount ? S.rtSum / S.rtCount : 0;

  /* ============================================================
     SPECIAL EVENTS
     ============================================================ */
  const hasEvent = (id) => S.activeEvents.some((e) => e.id === id);
  const eventSpeedMul = () => hasEvent("surge") ? 1.6 : hasEvent("freeze") ? 0.25 : 1;

  const updateEvents = (dt) => {
    // scheduled events fire by waveTime
    for (const ev of S.waveEvents) {
      if (!ev.fired && S.waveTime >= ev.t) {
        ev.fired = true;
        triggerEvent(ev.eventId);
      }
    }
    // tick durations
    for (let i = S.activeEvents.length - 1; i >= 0; i--) {
      const ev = S.activeEvents[i];
      ev.tLeft -= dt;
      if (ev.tLeft <= 0) {
        S.activeEvents.splice(i, 1);
        TD2.hud.toast(`${ev.name} ENDED`);
      }
    }
    // random Critical Protocol on high waves
    if (S.wave >= 5 && S.state === "ACTIVE" && Math.random() < dt * 0.015) {
      triggerEvent("critical");
    }
  };

  const triggerEvent = (id) => {
    const def = TD2.config.EVENTS.find((e) => e.id === id);
    if (!def) return;
    if (def.spawn === "elite") {
      spawnEnemy("elite", rand(0.2, 0.8), "expert", 0.2, { crit: true });
      TD2.hud.banner("CRITICAL PROTOCOL", 2400);
      TD2.audio.sfx("event");
      return;
    }
    S.activeEvents.push({ id, name: def.name, tLeft: def.dur });
    TD2.hud.banner(`${def.name} — ${def.desc}`, 2600);
    TD2.audio.sfx("event");
    if (id === "storm") TD2.fx.glitch(0.8, 1);
  };

  /* ============================================================
     MAIN UPDATE
     ============================================================ */
  const update = (dt) => {
    S.time += dt;
    TD2.fx.update(dt);
    TD2.cannon.update(TD2.cannonEnt, dt, S.hp / S.maxHp <= 0.25);

    if (S.state === "ACTIVE" || S.state === "BOSS") {
      if (!S.paused) {
        S.waveTime += dt;
        spawnFromQueue();
        updateEvents(dt);
        updateSpiders(dt);
        updateBoss(dt);
        checkBossSpawn();
        checkWaveClear();
      }
    } else if (S.state === "BOSS_INTRO" && !S.paused) {
      updateBoss(dt);   // boss must fly in during its intro
    } else if (S.state === "TUTORIAL" && S.spiders.length > 0 && !S.paused) {
      const env = { breachY: breachY(), timeScale: 1, w: W, h: H, time: S.time, chroma: false };
      for (const sp of S.spiders) {
        const res = TD2.spider.update(sp, dt, env);
        if (res === "breach") { sp.y = -sp.size * 2; sp.latched = false; }
        if (sp.state === "dying" && sp.dieT >= TD2.config.DEATH.dissolve) sp.dead = true;
      }
      S.spiders = S.spiders.filter((s) => !s.dead);
    }
    updateTargets();
  };

  const updateSpiders = (dt) => {
    const env = { breachY: breachY(), timeScale: speedMul() * waveSpeedRamp() * eventSpeedMul(), w: W, h: H, time: S.time, chroma: chroma() };
    for (const sp of S.spiders) {
      const res = TD2.spider.update(sp, dt, env);
      if (res === "breach" && S.gameMode === "practice") { sp.y = -sp.size * 2; sp.latched = false; continue; }
      if (res === "breach" && !sp.latchDmgDone) {
        sp.latchDmgDone = true;
        const shielded = sp.shielded;
        if (!shielded) {
          damage(Math.round(sp.def.dmg * diff().dmgMul), sp.x, sp.y);
          TD2.hud.toast(`${sp.def.name} BREACHED`, true);
        } else {
          TD2.fx.sparks(sp.x, breachY(), 10, C.gold);
        }
      }
      // claw DoT while latched
      if (sp.latched && sp.state === "alive") {
        if (!sp.shielded) {
          sp._clawT = (sp._clawT ?? 0) + dt;
          if (sp._clawT >= 1) { sp._clawT -= 1; damage(diff().clawDps, sp.x, sp.y); }
        } else {
          if (Math.random() < dt * 2) TD2.fx.sparks(sp.x, breachY(), 3, C.gold);
        }
      }
      if (sp.state === "dying" && sp.dieT >= TD2.config.DEATH.dissolve) sp.dead = true;
    }
    S.spiders = S.spiders.filter((s) => !s.dead);
  };

  const updateBoss = (dt) => {
    const b = S.boss;
    if (!b) return;
    const env = { w: W, h: H, time: S.time, chroma: chroma() };
    const evs = TD2.boss.update(b, dt, env);
    for (const e of evs) handleBossEvent(b, e);
    for (const e of TD2.boss.drainEvents(b)) handleBossEvent(b, e);
    if (b.def.glitch && Math.random() < dt * 0.8) TD2.fx.glitch(0.15, 0.6);
    if (b.state === "dying" && b.dieT >= TD2.config.DEATH.dissolve) { /* handled in killBoss */ }
  };

  const handleBossEvent = (b, e) => {
    if (e.startsWith("phase:")) {
      const ph = TD2.config.BOSSES[b.bossKey].phases?.[parseInt(e.slice(6), 10)];
      if (ph?.note) {
        TD2.hud.banner(ph.note, 2600);
        TD2.audio.sfx("bossroar");
        TD2.fx.flash("#ffffff", 0.25, 0.3);
      }
      return;
    }
    switch (e) {
      case "arrived":
        setState("BOSS");
        TD2.hud.setBoss({ name: b.def.name, hp: b.hp, maxHp: b.maxHp });
        break;
      case "spawn": {
        const n = b.def.spawnCount ?? 1;
        for (let i = 0; i < n; i++) {
          spawnEnemy(b.def.spawnType, clamp(0.5 + (i - (n - 1) / 2) * 0.14, 0.1, 0.9), b.def.spawnExprPool, 0, { deceptiveChance: b.def.deceptiveChance });
        }
        break;
      }
      case "decoys": {
        for (let i = 0; i < 3; i++) spawnEnemy(b.def.decoyType ?? "phantom", rand(0.15, 0.85), b.def.spawnExprPool ?? "normal", 0);
        TD2.hud.toast("DECOYS DEPLOYED", true);
        break;
      }
      case "bonus":
        spawnEnemy(b.def.bonusType, rand(0.2, 0.8), b.def.bonusExprPool, 0, { crit: true });
        break;
      case "conceal":
        TD2.hud.toast("EXPRESSION CONCEALED", true);
        TD2.audio.sfx("glitch");
        break;
    }
  };

  const checkBossSpawn = () => {
    if (!S.bossPending || S.boss) return;
    const drained = S.queueIdx >= S.queue.length;
    const fieldSmall = aliveSpiders().length <= 2;
    if (drained && fieldSmall && S.waveTime > 4) {
      S.bossPending = false;
      spawnBoss();
    }
  };

  const spawnBoss = () => {
    const key = S.wave === 11 ? "t11" : (TD2.waves.WAVES[S.wave]?.boss ?? "calculator");
    const def = TD2.config.BOSSES[key];
    const b = TD2.boss.create(key, {
      hpMul: diff().bossHpMul,
      time: S.time,
      expr: TD2.math.generate(def.exprPool, (def.exprBias ?? 0) + diff().exprBias),
    });
    S.boss = b;
    setState("BOSS_INTRO");
    TD2.hud.banner(b.def.name, 3000);
    TD2.hud.setBoss(b.def);
    TD2.cannon.setBossMode(TD2.cannonEnt, true);
    TD2.audio.sfx("bossroar");
    TD2.audio.setMode("boss", { intensity: 0.9 });
    TD2.fx.shake(0.5);
  };

  const checkWaveClear = () => {
    if (S.clearing || S.gameMode === "practice") return;
    if (S.boss || S.bossPending) return;
    if (S.queueIdx < S.queue.length) return;
    if (S.spiders.some((s) => s.state === "alive")) return;
    // wave 11 stage 1 → stage 2: the Kernel wakes with its honor guard
    if (S.wave === 11 && S.wave11Stage === 1) {
      S.wave11Stage = 2;
      unlockAch("deep_terminal");
      TD2.hud.banner("STAGE 2 — THE KERNEL WAKES", 3000);
      const guard = TD2.waves.buildDeepStage2();
      S.queue = guard.entries.map((e) => ({ ...e, exprWave: 11 }));
      S.waveEvents = guard.events.map((e) => ({ ...e, fired: false }));
      S.queueIdx = 0; S.waveTime = 0;
      spawnBoss();
      return;
    }
    clearWave();
  };

  /* ============================================================
     RENDER
     ============================================================ */
  const render = () => {
    const { x: sx, y: sy } = TD2.fx.getShake();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // background
    const deep = S.wave === 11;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (deep) {
      g.addColorStop(0, "#0a0208"); g.addColorStop(0.5, "#05030a"); g.addColorStop(1, "#02060a");
    } else {
      g.addColorStop(0, "#04101a"); g.addColorStop(0.55, "#02060a"); g.addColorStop(1, "#010308");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(sx, sy);

    drawGrid(deep);
    drawScanline();
    drawParticlesBg();
    drawDefenseLine();
    drawCircuitry();

    // entities
    const env = { w: W, h: H, time: S.time, chroma: chroma() };
    for (const sp of S.spiders) TD2.spider.draw(ctx, sp, env);
    if (S.boss) TD2.boss.draw(ctx, S.boss, env);

    TD2.fx.render(ctx);
    TD2.cannon.draw(ctx, TD2.cannonEnt, S.time);
    ctx.restore();

    TD2.fx.renderPost(ctx, canvas, W, H);
    drawCrtOverlay();
  };

  const drawGrid = (deep) => {
    const t = S.time;
    ctx.strokeStyle = deep ? "rgba(255,59,92,0.06)" : TD2.config.colors.grid;
    ctx.lineWidth = 1;
    const step = 44;
    const off = (t * 12) % step;
    ctx.beginPath();
    for (let x = -step + (off % step); x < W + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = off; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // horizon glow at defense line
    const by = breachY();
    const lg = ctx.createLinearGradient(0, by - 60, 0, by + 40);
    lg.addColorStop(0, "rgba(0,229,255,0)");
    lg.addColorStop(1, deep ? "rgba(255,59,92,0.08)" : "rgba(0,229,255,0.08)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, by - 60, W, 100);
  };

  const drawScanline = () => {
    const y = (S.time * 40) % (H + 80) - 40;
    const lg = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    lg.addColorStop(0, "rgba(0,229,255,0)");
    lg.addColorStop(0.5, "rgba(0,229,255,0.05)");
    lg.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, y - 30, W, 60);
  };

  const bgParts = [];
  const drawParticlesBg = () => {
    // floating ambient particles (pooled small array, respawn at top)
    while (bgParts.length < 40) bgParts.push({ x: Math.random() * W, y: Math.random() * H, v: 8 + Math.random() * 20, s: Math.random() * 1.6 + 0.4 });
    ctx.fillStyle = "rgba(0,229,255,0.18)";
    for (const p of bgParts) {
      p.y += p.v * 0.016;
      if (p.y > H) { p.y = -4; p.x = Math.random() * W; }
      ctx.fillRect(p.x, p.y, p.s, p.s);
    }
  };

  const drawDefenseLine = () => {
    const by = breachY();
    ctx.strokeStyle = "rgba(255,59,92,0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([14, 10]);
    ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke();
    ctx.setLineDash([]);
    // pulsing glow
    ctx.globalAlpha = 0.25 + Math.sin(S.time * 3) * 0.12;
    ctx.strokeStyle = C.red;
    ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke();
    ctx.globalAlpha = 1;
    // label
    ctx.fillStyle = "rgba(255,59,92,0.7)";
    ctx.font = "9px monospace"; ctx.textAlign = "left";
    ctx.fillText("DEFENSE PERIMETER", 10, by - 6);
  };

  const drawCircuitry = () => {
    // static circuit-like corner traces
    ctx.strokeStyle = "rgba(0,255,156,0.10)";
    ctx.lineWidth = 1;
    const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    seg(0, H * 0.1, W * 0.08, H * 0.1); seg(W * 0.08, H * 0.1, W * 0.08, H * 0.2);
    seg(W, H * 0.15, W * 0.92, H * 0.15); seg(W * 0.92, H * 0.15, W * 0.92, H * 0.3);
    seg(0, H * 0.75, W * 0.05, H * 0.75); seg(W * 0.05, H * 0.75, W * 0.05, H * 0.85);
  };

  const drawCrtOverlay = () => {
    // subtle scanlines + vignette handled by CSS; here: faint moving noise lines
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = "#8ff";
    for (let y = (S.time * 30) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;
  };

  /* ============================================================
     MENU BACKGROUND FX
     ============================================================ */
  const renderMenuFx = (t) => {
    if (!menuFx) return;
    const c = menuFx.getContext("2d");
    const w = menuFx.width, h = menuFx.height;
    c.fillStyle = "rgba(2,6,10,0.25)";
    c.fillRect(0, 0, w, h);
    // drifting glyphs
    if (!renderMenuFx.parts) {
      renderMenuFx.parts = Array.from({ length: 50 }, () => ({
        x: Math.random() * w, y: Math.random() * h, v: 12 + Math.random() * 30,
        ch: pick(["0", "1", "+", "×", "÷", "−", "√", "²", "7"]),
      }));
    }
    c.font = "12px monospace";
    for (const p of renderMenuFx.parts) {
      p.y += p.v * 0.016;
      if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
      c.fillStyle = Math.random() < 0.1 ? "rgba(0,255,156,0.5)" : "rgba(0,229,255,0.22)";
      c.fillText(p.ch, p.x, p.y);
    }
    // distant spider silhouette
    c.save();
    c.translate(w * 0.82, h * 0.24);
    const pulse = 1 + Math.sin(t * 0.001) * 0.05;
    c.scale(pulse, pulse);
    c.strokeStyle = "rgba(178,107,255,0.16)";
    c.lineWidth = 2;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const a = (-140 + i * 34) * Math.PI / 180;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a) * 60 * side, Math.sin(a) * 50);
        c.lineTo(Math.cos(a + 0.4) * 90 * side, Math.sin(a + 0.4) * 80);
        c.stroke();
      }
    }
    c.beginPath(); c.ellipse(0, 10, 26, 30, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(0, -22, 16, 14, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
  };

  /* ============================================================
     HUD SYNC
     ============================================================ */
  const syncHud = () => {
    if (S.state !== "ACTIVE" && S.state !== "BOSS" && S.state !== "PAUSE" && S.state !== "TUTORIAL") return;
    const t = S.target;
    const tex = targetExprDisplay();
    TD2.hud.update({
      score: S.score, high: Math.max(TD2.save.get().stats.bestScore, S.score),
      threat: S.waveDef?.threat ?? 0.5,
      acc: S.shots ? Math.round((S.hits / S.shots) * 100) : 100,
      rt: avgRt(),
      hp: S.hp, maxHp: S.maxHp,
      input: S.input,
      combo: S.combo, mult: S.comboMult,
      boss: S.boss ? { hp: S.boss.hp, maxHp: S.boss.maxHp } : null,
      targetExpr: tex.expr, targetHint: tex.hint,
      status: statusLine(),
      danger: S.hp / S.maxHp <= 0.25,
      waveText: `${S.wave === 11 ? "11/11" : String(S.wave).padStart(2, "0")}/10`,
    });
    TD2.hud.updateTimers(S.activeEvents.map((e) => ({ name: e.name, tLeft: e.tLeft })));
  };

  const statusLine = () => {
    if (S.hp / S.maxHp <= 0.25) return "◤ CRITICAL ◢";
    if (S.boss) return "BOSS ENGAGED";
    if (hasEvent("surge")) return "THREAT SURGE";
    return "SYSTEM NOMINAL";
  };

  /* ============================================================
     LOOP
     ============================================================ */
  const loop = (now) => {
    S.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - S.last) / 1000 || 0.016);
    S.last = now;
    update(dt);
    if (S.state === "MENU" || S.state === "SETTINGS" || S.state === "LEADERBOARD" || S.state === "ACHIEVEMENTS" || S.state === "CREDITS") {
      renderMenuFx(now);
    } else {
      render();
    }
    syncHud();
  };

  /* ============================================================
     KEYBOARD / MENU WIRING
     ============================================================ */
  const onKey = (e) => {
    TD2.audio.unlock();
    const k = e.key;
    if (["ArrowUp", "ArrowDown", "Enter", " ", "Tab", "Backspace"].includes(k)) e.preventDefault();
    if (k === "Escape") {
      if (S.state === "ACTIVE" || S.state === "BOSS") { togglePause(); return; }
      if (S.state === "PAUSE") { togglePause(); return; }
      if (S.state === "SETTINGS") { TD2.game.settingsBack(); return; }
      if (["LEADERBOARD", "ACHIEVEMENTS", "CREDITS"].includes(S.state)) { toMenu(); return; }
    }
    if (S.state === "MENU") {
      if (k === "ArrowUp") TD2.screens.menuMove(-1);
      else if (k === "ArrowDown") TD2.screens.menuMove(1);
      else if (k === "Enter") TD2.screens.menuActivate();
      return;
    }
    if (S.awaitSecretEnter) {
      if (k === "Enter") {
        S.awaitSecretEnter = false;
        if (S.secretEndStats) { S.secretEndStats = false; toMenu(); }
        else launchDeepWave();
      }
      return;
    }
    if (S.state === "TUTORIAL" && TD2.tutorial.isActive()) {
      pressKey(k);
      return;
    }
    if (S.state === "GAMEOVER" || S.state === "VICTORY") {
      if (k === "Enter") { TD2.screens.hideScreens(); startRun(); }
      else if (k === "Escape") toMenu();
      return;
    }
    if (S.state === "WAVE_CLEAR") {
      if (k === "Enter") { /* auto-advance; Enter skips wait */ }
      return;
    }
    if (S.state === "SETTINGS") {
      return;
    }
    if (["LEADERBOARD", "ACHIEVEMENTS", "CREDITS"].includes(S.state)) {
      if (k === "Enter" || k === "Escape") { toMenu(); }
      return;
    }
    if ((S.state === "ACTIVE" || S.state === "BOSS") && !TD2.tutorial.isActive()) {
      if (k === "Enter") pressKey("Enter");
      else if (k === "Backspace") pressKey("Backspace");
      else if (k === "Tab") pressKey("Tab");
      else if (/^[0-9]$/.test(k)) pressKey(k);
      else if (k === "M") { TD2.audio.setMuted(!TD2.audio.isMuted()); TD2.hud.toast(TD2.audio.isMuted() ? "AUDIO MUTED" : "AUDIO ON"); }
      return;
    }
    if (S.state === "PAUSE") {
      if (k === "Enter") togglePause();
      return;
    }
  };

  const togglePause = () => {
    if (S.state === "ACTIVE" || S.state === "BOSS") {
      S.paused = true;
      setState("PAUSE");
      TD2.screens.pause();
      TD2.audio.setMode("menu", { intensity: 0.2 });
    } else if (S.state === "PAUSE") {
      S.paused = false;
      TD2.screens.resume();
      setState(S.boss ? "BOSS" : "ACTIVE");
      TD2.audio.setMode(S.wave === 11 ? "deep" : S.boss ? "boss" : "wave", { intensity: S.waveDef?.threat ?? 0.5 });
    }
  };

  const toMenu = () => {
    S.paused = false;
    S.spiders = []; S.boss = null; S.target = null;
    TD2.hud.hideHud();
    TD2.hud.setBoss(null);
    TD2.audio.setDanger(false);
    TD2.audio.setMode("menu", { intensity: 0.3 });
    TD2.screens.menu();
    setState("MENU");
  };

  const wireMenus = () => {
    document.querySelectorAll("#menu-nav").forEach((nav) => {
      nav.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        TD2.audio.unlock();
        TD2.audio.sfx("select");
        const act = b.dataset.act;
        if (act === "start") startRun();
        else if (act === "deep") startDeepRun();
        else if (act === "tutorial") { setState("TUTORIAL"); S.settingsFrom = "menu"; TD2.tutorial.start(); }
        else if (act === "settings") { S.settingsFrom = "menu"; setState("SETTINGS"); TD2.screens.settings(); }
        else if (act === "leaderboard") { setState("LEADERBOARD"); TD2.screens.leaderboard(); }
        else if (act === "achievements") { setState("ACHIEVEMENTS"); TD2.screens.achievements(); }
        else if (act === "credits") { setState("CREDITS"); TD2.screens.credits(); }
      });
    });
    document.querySelectorAll("#screen-pause").forEach((p) => {
      p.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        TD2.audio.sfx("click");
        const act = b.dataset.act;
        if (act === "resume") togglePause();
        else if (act === "restart") { S.paused = false; TD2.screens.resume(); restartWave(); }
        else if (act === "settings-pause") { S.settingsFrom = "pause"; setState("SETTINGS"); TD2.screens.settings(); }
        else if (act === "quit") toMenu();
      });
    });
    document.querySelectorAll("#screen-gameover, #screen-victory").forEach((p) => {
      p.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        TD2.audio.sfx("click");
        if (b.dataset.act === "retry") { TD2.screens.hideScreens(); startRun(); }
        else if (b.dataset.act === "menu") toMenu();
      });
    });
  };

  const restartWave = () => {
    // kill all enemies without damage (§39 pause/restart edge)
    for (const sp of S.spiders) if (sp.state === "alive") { sp.state = "dying"; sp.dieT = 0; }
    S.queue = []; S.boss = null; S.bossPending = false;
    S.waveTime = 0; S.queueIdx = 0;
    const built = TD2.waves.buildWave(S.wave, diff());
    S.queue = built.entries.map((e) => ({ ...e, exprWave: S.wave }));
    S.waveEvents = built.events.map((e) => ({ ...e, fired: false }));
    S.activeEvents = [];
    // a restart rewinds wave 11 to stage 1 (stage 2 is only entered by clearing stage 1)
    S.wave11Stage = 1;
    S.bossPending = !!built.bossWave && !built.deep;
    S.clearing = false;
    setState("ACTIVE");
    TD2.hud.setBoss(null);
    TD2.cannon.setBossMode(TD2.cannonEnt, false);
    TD2.audio.setMode(S.wave === 11 ? "deep" : "wave", { intensity: S.waveDef?.threat ?? 0.5 });
  };

  /* ============================================================
     ACHIEVEMENTS
     ============================================================ */
  const unlockAch = (id, quiet = false) => {
    const res = TD2.save.unlockAch(id);
    if (res === "new" && !quiet) {
      const def = TD2.config.ACHIEVEMENTS.find((a) => a.id === id);
      if (def) {
        const name = id === "the_signal" ? "THE SIGNAL" : def.name;
        TD2.screens.achievementPop(name, def.desc);
      }
    }
  };

  /* ============================================================
     INIT
     ============================================================ */
  const init = () => {
    canvas = document.getElementById("game");
    ctx = canvas.getContext("2d");
    menuFx = document.getElementById("menu-fx");
    TD2.cannonEnt = TD2.cannon.create();
    resize();
    layoutCannon();
    window.addEventListener("resize", () => { resize(); layoutCannon(); });
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", (e) => {
      if (S.state !== "ACTIVE" && S.state !== "BOSS" && S.state !== "TUTORIAL") return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const alive = aliveSpiders();
      for (const sp of alive) {
        if (Math.hypot(sp.x - mx, sp.y - my) <= sp.size * 2.8) {
          S.target = sp;
          TD2.audio.sfx("key");
          return;
        }
      }
      if (S.boss && Math.hypot(S.boss.x * W - mx, S.boss.yF * H - my) <= S.boss.size * 2.4) {
        S.target = S.boss;
        TD2.audio.sfx("key");
      }
    });
    wireMenus();
    TD2.hud.init();
    TD2.screens.applyAccessibility();
    setState("BOOT");
    TD2.screens.boot(() => {
      if (S.state !== "BOOT") return;
      toMenu();
    });
    S.last = performance.now();
    S.raf = requestAnimationFrame(loop);
  };

  return {
    init, startRun, startDeepRun, pressKey, clearInput, cycleTarget, spawnPracticeSpider, spawnPracticeMulti,
    view, toMenu, togglePause, restartWave,
    settingsBack: () => {
      if (S.settingsFrom === "pause") { TD2.screens.pause(); setState("PAUSE"); }
      else toMenu();
    },
    _S: S, // debug handle
  };
})();
