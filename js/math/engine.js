/* ============================================================
   TD2 math/engine.js — procedural expression generator
   Always produces integer answers. Tiers map to wave difficulty:
     1 easy   2 normal   3 hard   4 expert   5 hidden
   bias: -0.35 (EASY) .. +0.6 (TERMINAL / boss exprBias)
   Returns { text, answer, complexity }
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.math = (() => {
  const { randi, clamp } = TD2.util;
  const TIMES = "\u00d7", DIV = "\u00f7", MINUS = "\u2212", SQ = "\u00b2", RAD = "\u221a";

  const tier = (pool, bias) => {
    const base = TD2.config.EXPR_POOLS[pool] ?? 2;
    return clamp(base + bias, 0.5, 5.6);
  };

  /* ---------- primitive builders ---------- */
  const addSub = (min, max) => {
    const a = randi(min, max), b = randi(min, max);
    if (Math.random() < 0.5 && a - b >= 0) return { a, b, op: MINUS, ans: a - b, txt: `${a} ${MINUS} ${b}` };
    return { a, b, op: "+", ans: a + b, txt: `${a} + ${b}` };
  };
  const mul = (aMax, bMax) => {
    const a = randi(2, aMax), b = randi(2, bMax);
    return { a, b, op: TIMES, ans: a * b, txt: `${a} ${TIMES} ${b}` };
  };
  const div = (dMax, qMax) => {
    const q = randi(2, qMax), d = randi(2, dMax);
    return { a: d * q, b: d, op: DIV, ans: q, txt: `${d * q} ${DIV} ${d}` };
  };
  const square = (max) => {
    const a = randi(4, max);
    return { a, ans: a * a, txt: `${a}${SQ}` };
  };
  const root = (max) => {
    const r = randi(4, max);
    return { a: r * r, ans: r, txt: `${RAD}${r * r}` };
  };
  const wrap = (txt) => `( ${txt} )`;

  /* ---------- tier generators: each returns { txt, ans, cx } ---------- */
  const G = {
    // tier 1 — single small operations
    1: () => {
      const k = randi(1, 4);
      if (k <= 2) { const r = addSub(1, 12); return { txt: r.txt, ans: r.ans, cx: 1 }; }
      if (k === 3) { const r = mul(6, 6); return { txt: r.txt, ans: r.ans, cx: 2 }; }
      const r = div(6, 6); return { txt: r.txt, ans: r.ans, cx: 2 };
    },
    // tier 2 — larger values, mixed operators
    2: () => {
      const k = randi(1, 4);
      if (k === 1) { const r = addSub(10, 60); return { txt: r.txt, ans: r.ans, cx: 1 }; }
      if (k === 2) { const r = div(9, 9); return { txt: r.txt, ans: r.ans, cx: 2 }; }
      if (k === 3) { // a × b − c  (keep result ≥ 1)
        const m = mul(12, 9); const c = randi(3, Math.max(3, m.ans - 1));
        return { txt: `${m.txt} ${MINUS} ${c}`, ans: m.ans - c, cx: 3 };
      }
      const m = mul(9, 9); const c = randi(3, 40);
      return { txt: `${m.txt} + ${c}`, ans: m.ans + c, cx: 3 };
    },
    // tier 3 — operator precedence, parentheses, squares, roots
    3: () => {
      const k = randi(1, 5);
      if (k === 1) { // a + b × c
        const m = mul(9, 9); const a = randi(2, 30);
        return { txt: `${a} + ${m.txt}`, ans: a + m.ans, cx: 3 };
      }
      if (k === 2) { // a − b ÷ c
        const d = div(8, 8); const a = randi(d.ans + 1, d.ans + 40);
        return { txt: `${a} ${MINUS} ${d.txt}`, ans: a - d.ans, cx: 3 };
      }
      if (k === 3) { // (a + b) × c
        const a = randi(2, 15), b = randi(2, 15), c = randi(2, 9);
        return { txt: `${wrap(`${a} + ${b}`)} ${TIMES} ${c}`, ans: (a + b) * c, cx: 4 };
      }
      if (k === 4) { // a² − b  or  √a + b
        if (Math.random() < 0.5) { const s = square(15); const b = randi(5, 60); return { txt: `${s.txt} ${MINUS} ${b}`, ans: s.ans - b, cx: 3 }; }
        const r = root(15); const b = randi(2, 40);
        return { txt: `${r.txt} + ${b}`, ans: r.ans + b, cx: 3 };
      }
      // a ÷ (b + c) — the numerator must be (b + c) × q so the real answer is q
      const b = randi(2, 9), c = randi(2, 9), q = randi(2, 9);
      return { txt: `${(b + c) * q} ${DIV} ${wrap(`${b} + ${c}`)}`, ans: q, cx: 4 };
    },
    // tier 4 — expert: multi-step, nested precedence
    4: () => {
      const k = randi(1, 5);
      if (k === 1) { // (a + b) × c − d  (keep result ≥ 1)
        const a = randi(5, 20), b = randi(5, 20), c = randi(3, 9);
        const prod = (a + b) * c; const d = randi(5, Math.max(5, prod - 1));
        return { txt: `${wrap(`${a} + ${b}`)} ${TIMES} ${c} ${MINUS} ${d}`, ans: prod - d, cx: 5 };
      }
      if (k === 2) { // a ÷ b + c × d
        const dv = div(9, 9); const c = randi(2, 9), d = randi(2, 9);
        return { txt: `${dv.txt} + ${c} ${TIMES} ${d}`, ans: dv.ans + c * d, cx: 5 };
      }
      if (k === 3) { // (a − b) × (c + d)
        const a = randi(12, 30), b = randi(2, 10), c = randi(2, 12), d = randi(2, 12);
        return { txt: `${wrap(`${a} ${MINUS} ${b}`)} ${TIMES} ${wrap(`${c} + ${d}`)}`, ans: (a - b) * (c + d), cx: 6 };
      }
      if (k === 4) { // a² + b²
        const a = randi(3, 12), b = randi(3, 12);
        return { txt: `${a}${SQ} + ${b}${SQ}`, ans: a * a + b * b, cx: 5 };
      }
      // (a × b) − (c ÷ d)  (keep result ≥ 1)
      const c = randi(2, 9), d = randi(2, 9); const m = mul(12, 8);
      const sub = randi(2, Math.max(2, m.ans - 1));
      return { txt: `${m.txt} ${MINUS} ${wrap(`${sub * d} ${DIV} ${d}`)}`, ans: m.ans - sub, cx: 5 };
    },
    // tier 5 — hidden wave: several operations, squares/roots composed
    5: () => {
      const k = randi(1, 4);
      if (k === 1) { // (a² − b²) ÷ c — always divisible via b = a − c
        const a = randi(8, 18);
        const c = randi(2, 4);
        const b = a - c;
        return { txt: `${wrap(`${a}${SQ} ${MINUS} ${b}${SQ}`)} ${DIV} ${c}`, ans: (a * a - b * b) / c, cx: 7 };
      }
      if (k === 2) { // √a + b × (c − d)
        const r = root(18); const b = randi(3, 9); const c = randi(6, 15), d = randi(2, 5);
        return { txt: `${r.txt} + ${b} ${TIMES} ${wrap(`${c} ${MINUS} ${d}`)}`, ans: r.ans + b * (c - d), cx: 7 };
      }
      if (k === 3) { // (a ÷ b)² − c  (keep result ≥ 1)
        const b = randi(3, 9), q = randi(3, 8); const c = randi(2, q * q - 1);
        return { txt: `${wrap(`${b * q} ${DIV} ${b}`)}${SQ} ${MINUS} ${c}`, ans: q * q - c, cx: 7 };
      }
      // (a + b) × c − d ÷ e
      const dv = div(8, 6); const a = randi(4, 14), b = randi(4, 14), c = randi(3, 7);
      return { txt: `${wrap(`${a} + ${b}`)} ${TIMES} ${c} ${MINUS} ${dv.txt}`, ans: (a + b) * c - dv.ans, cx: 8 };
    },
  };

  // small-answer variants used for spiderlings / mini enemies
  const G_EASY = () => {
    const k = randi(1, 2);
    if (k === 1) { const a = randi(1, 9), b = randi(1, 9); return { txt: `${a} + ${b}`, ans: a + b, cx: 1 }; }
    const a = randi(5, 15), b = randi(1, 4);
    return { txt: `${a} ${MINUS} ${b}`, ans: a - b, cx: 1 };
  };

  /* Generators build with short internal keys (txt/ans/cx); the public
     contract every consumer reads is { text, answer, complexity }. */
  const toPublic = (r) => ({ text: r.txt, answer: r.ans, complexity: r.cx });

  /**
   * Generate an expression.
   * @param {string} pool   easy|normal|hard|expert|hidden
   * @param {number} bias   difficulty shift (difficulty.exprBias + enemy/boss exprBias)
   */
  const generate = (pool = "normal", bias = 0) => {
    const t = tier(pool, bias);
    const f = Math.floor(t);
    const frac = t - f;
    // blend between floor and ceil tier by fractional difficulty
    const fn = (frac > 0 && Math.random() < frac && G[f + 1]) ? G[f + 1] : (G[f] || G[2]);
    // safety net: answers must be non-negative integers (input is digits-only)
    for (let i = 0; i < 6; i++) {
      const r = fn();
      if (Number.isInteger(r.ans) && r.ans >= 0) return toPublic(r);
    }
    const a = randi(6, 30), b = randi(6, 30);
    return { text: `${a} + ${b}`, answer: a + b, complexity: 1 };
  };

  const easy = () => toPublic(G_EASY());

  /**
   * A deceptive variant: visually similar expression with a DIFFERENT answer.
   * The real one is returned too so the HUD can show the truth.
   */
  const deceptive = (pool, bias) => {
    const real = generate(pool, bias);
    let fake = generate(pool, bias);
    // ensure the fake answer differs, else retry a few times
    let guard = 8;
    while (fake.answer === real.answer && guard-- > 0) fake = generate(pool, bias);
    return { real, fake };
  };

  return { generate, easy, deceptive };
})();
