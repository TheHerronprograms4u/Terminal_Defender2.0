/* ============================================================
   TD2 main.js — bootstrap
   ============================================================ */
(function () {
  const boot = () => {
    TD2.game.init();

    // auto-pause when the tab loses visibility (§39 pause edge)
    document.addEventListener("visibilitychange", () => {
      const st = TD2.game._S.state;
      if (document.hidden && (st === "ACTIVE" || st === "BOSS" || st === "BOSS_INTRO")) {
        TD2.game.togglePause();
      }
    });

    // keep the battlefield clean of browser UI
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", () => {
      const st = TD2.game._S.state;
      if (st === "ACTIVE" || st === "BOSS") TD2.game.togglePause();
    });

    console.log("%c TERMINAL DEFENDER 2.0 %c system ready ", "background:#00ff9c;color:#02060a;font-weight:bold", "background:#04101a;color:#00e5ff");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
