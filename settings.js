// Settings shared by content.js and the options page. Stored as one object under the "settings" key;
// the on/off switch stays in its own "enabled" key.
globalThis.SFS = (() => {
  const DEFAULTS = {
    showOverlay: true,
    // One row per jump amount (seconds), each with a rewind and a fast-forward button, shortest at the top.
    steps: [30, 60, 180],
    // The home row is the one that lands under the mouse when the pane opens.
    home: 60,
    rowGap: 14,
    side: "right",
    top: 50,
    offset: 12,
    idleOpacity: 50,
    keyStep: 5,
    shiftKeyStep: 60,
    holdDelay: 400,
    holdRepeat: 300,
  };

  const MAX_ROWS = 7;

  // Button size for a row, relative to the home row: shrinks slowly going up, faster going down.
  function rowScale(index, homeIndex) {
    const d = index - homeIndex;
    if (d < 0) return Math.max(0.6, 0.9 ** -d);
    return Math.max(0.55, 0.8 ** d);
  }

  // Positive whole seconds, no duplicates, shortest first, at most MAX_ROWS.
  function normalizeSteps(steps) {
    if (!Array.isArray(steps)) return [];
    const clean = steps.map(Math.round).filter((n) => Number.isFinite(n) && n > 0);
    return [...new Set(clean)].sort((a, b) => a - b).slice(0, MAX_ROWS);
  }

  // The home row must be one of the steps; otherwise use the closest one.
  function closestStep(steps, target) {
    return steps.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), steps[0]);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Fills in anything missing from stored settings, so older or partial saves still work.
  function merge(stored) {
    const s = { ...clone(DEFAULTS), ...stored };
    delete s.rows; // the old grouped-rows layout
    s.steps = normalizeSteps(s.steps);
    if (!s.steps.length) s.steps = clone(DEFAULTS.steps);
    if (!s.steps.includes(s.home)) s.home = closestStep(s.steps, +s.home || DEFAULTS.home);
    return s;
  }

  function load(callback) {
    chrome.storage.local.get({ settings: {} }, ({ settings }) => callback(merge(settings)));
  }

  function save(settings) {
    return chrome.storage.local.set({ settings });
  }

  function formatStep(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (s || !parts.length) parts.push(`${s}s`);
    return parts.join(" ");
  }

  // Accepts "5", "5s", "1m", "1m30s", "1h 2m". A bare number is seconds. Returns NaN when invalid.
  function parseStep(text) {
    const match = String(text)
      .trim()
      .toLowerCase()
      .match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s?)?$/);
    if (!match || !match.slice(1).some(Boolean)) return NaN;
    const [, h = 0, m = 0, s = 0] = match;
    const total = Math.round(+h * 3600 + +m * 60 + +s);
    return total > 0 ? total : NaN;
  }

  return { DEFAULTS, MAX_ROWS, rowScale, normalizeSteps, closestStep, clone, merge, load, save, formatStep, parseStep };
})();
