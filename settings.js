// Settings shared by content.js and the options page. Stored as one object under the "settings" key;
// the on/off switch stays in its own "enabled" key.
globalThis.SFS = (() => {
  const DEFAULTS = {
    showOverlay: true,
    // Each entry gets a rewind and a fast-forward button. size is a percent of the base button size.
    rows: [
      [{ seconds: 60, size: 72 }, { seconds: 30, size: 85 }, { seconds: 5, size: 100 }],
      [{ seconds: 600, size: 60 }, { seconds: 180, size: 66 }],
    ],
    rowGap: 28,
    side: "right",
    top: 50,
    offset: 12,
    idleOpacity: 50,
    keyStep: 5,
    shiftKeyStep: 60,
    holdDelay: 400,
    holdRepeat: 300,
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Fills in anything missing from stored settings, so older or partial saves still work.
  function merge(stored) {
    const s = { ...clone(DEFAULTS), ...stored };
    const rows = Array.isArray(s.rows)
      ? s.rows
          .map((row) => (Array.isArray(row) ? row.filter((b) => b && b.seconds > 0 && b.size > 0) : []))
          .filter((row) => row.length)
      : [];
    s.rows = rows.length ? rows : clone(DEFAULTS.rows);
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

  return { DEFAULTS, clone, merge, load, save, formatStep, parseStep };
})();
