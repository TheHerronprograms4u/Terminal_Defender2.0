/* ============================================================
   TD2 entities/cannon.js — the player's defense cannon.
   Aims at the targeted spider, charges/fires, recoils, reacts
   to wrong answers, low HP instability and boss combat mode.
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.cannon = (() => {
  const { lerp, clamp } = TD2.util;
  const C = TD2.config.colors;

  const create = () => ({
    x: 0, y: 0,               // set on resize
    angle: -Math.PI / 2,      // aim angle (rad); idle = straight up
    targetAngle: -Math.PI / 2,
    charge: 0,                // 0..1 charging animation
    recoil: 0,                // 0..1 recoil spring
    coreT: 0,                 // idle energy clock
    wrongT: 0,                // red warning pulse timer
    bossMode: false,
    instability: 0,           // low-HP shake amount
    muzzle: { x: 0, y: 0 },
  });

  const aimAt = (cn, tx, ty) => {
    cn.targetAngle = Math.atan2(ty - cn.y, tx - cn.x);
  };
  const idleAim = (cn) => { cn.targetAngle = -Math.PI / 2 + Math.sin(cn.coreT * 0.8) * 0.06; };

  const charge = (cn) => { cn.charge = 1; };
  const wrong = (cn) => { cn.wrongT = 0.5; };
  const setBossMode = (cn, on) => { cn.bossMode = on; };

  const update = (cn, dt, lowHp) => {
    cn.coreT += dt;
    // smooth aim
    let d = cn.targetAngle - cn.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cn.angle += d * Math.min(1, dt * 10);
    cn.angle = clamp(cn.angle, -Math.PI + 0.3, -0.3); // always aim upward hemisphere
    // recoil spring
    cn.recoil = Math.max(0, cn.recoil - dt * 4);
    cn.charge = Math.max(0, cn.charge - dt * 3);
    cn.wrongT = Math.max(0, cn.wrongT - dt);
    cn.instability = lerp(cn.instability, lowHp ? 1 : 0, dt * 4);
  };

  const draw = (ctx, cn, time) => {
    const { x, y } = cn;
    const jit = cn.instability * Math.sin(time * 40) * 2;
    const bx = x + jit, by = y;
    const bob = Math.sin(cn.coreT * 2) * 2;
    const rec = cn.recoil * 8;
    const a = cn.angle;

    ctx.save();
    // base platform
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
    ctx.fillStyle = "#06121c";
    ctx.beginPath(); ctx.ellipse(bx, by + 16, 46, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(bx, by + 16, 30, 7, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    // rotating turret group
    ctx.translate(bx, by + bob);
    ctx.rotate(a);

    // barrel (recoil pulls it back)
    const bcol = cn.wrongT > 0 ? C.orange : (cn.bossMode ? C.red : C.green);
    ctx.strokeStyle = bcol;
    ctx.lineWidth = 3;
    ctx.shadowColor = bcol; ctx.shadowBlur = 12;
    ctx.strokeRect(-14 - rec, -9, 46, 18);
    ctx.strokeRect(24 - rec, -5, 16, 10);   // muzzle
    ctx.beginPath(); ctx.moveTo(40 - rec, 0); ctx.lineTo(52 - rec, 0); ctx.stroke();
    // mechanical side pistons
    ctx.lineWidth = 2;
    ctx.strokeRect(-8 - rec, -15, 20, 5);
    ctx.strokeRect(-8 - rec, 10, 20, 5);
    // charging coils — brightness scales with charge
    if (cn.charge > 0) {
      ctx.strokeStyle = C.white; ctx.globalAlpha = cn.charge;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(6 - rec + i * 10, 0, 6 + cn.charge * 4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;

    // energy core
    const pulse = 0.6 + Math.sin(cn.coreT * 5) * 0.25 + cn.charge * 0.5;
    ctx.fillStyle = cn.wrongT > 0 ? C.orange : (cn.bossMode ? C.red : C.green);
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18 * pulse;
    ctx.beginPath(); ctx.arc(-18 - rec * 0.5, 0, 7 + pulse * 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // muzzle world position for firing
    cn.muzzle.x = bx + Math.cos(a) * 52;
    cn.muzzle.y = by + bob + Math.sin(a) * 52;
  };

  return { create, aimAt, idleAim, charge, wrong, setBossMode, update, draw };
})();
