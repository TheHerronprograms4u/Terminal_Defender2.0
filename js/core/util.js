/* ============================================================
   TD2 core/util.js — math & DOM helpers
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.util = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1)); // inclusive
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");

  const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // fire-and-forget DOM class animation helper
  const flash = (el, cls, ms = 400) => {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // reflow to restart animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  };

  return { rand, randi, pick, clamp, lerp, $, $$, show, hide, fmt, flash };
})();
