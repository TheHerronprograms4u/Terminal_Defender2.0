/* ============================================================
   TD2 core/events.js — minimal pub/sub event bus
   ============================================================ */
window.TD2 = window.TD2 || {};
TD2.events = (() => {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => map.get(name)?.delete(fn);
    },
    off(name, fn) { map.get(name)?.delete(fn); },
    emit(name, payload) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of set) {
        try { fn(payload); }
        catch (e) { console.error(`[events] handler for "${name}" failed`, e); }
      }
    },
    clear() { map.clear(); },
  };
})();
