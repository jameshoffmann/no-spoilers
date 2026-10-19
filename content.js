(() => {
  const root = document.documentElement;

  // Hide timestamps before the stored setting loads, so they never flash on screen.
  root.setAttribute("data-sfs-on", "");

  // Each row runs from the biggest rewind to the biggest fast forward, so step size grows away from the center.
  // Buttons shrink as the step grows (see the sfs-size-* rules in content.css).
  const ROWS = [
    [60, 30, 5],
    [600, 180],
  ];
  const SIZE_CLASS = { 5: "sfs-size-1", 30: "sfs-size-2", 60: "sfs-size-3", 180: "sfs-size-4", 600: "sfs-size-5" };
  const KEY_STEP = 5;
  const SHIFT_KEY_STEP = 60;
  // Holding a seek key repeats it: the first repeat after HOLD_DELAY_MS, then every HOLD_REPEAT_MS.
  const HOLD_DELAY_MS = 450;
  const HOLD_REPEAT_MS = 350;
  const SHORTCUTS = [
    ["←", `Rewind ${KEY_STEP}s`],
    ["→", `Fast forward ${KEY_STEP}s`],
    ["Shft+←", `Rewind ${SHIFT_KEY_STEP / 60}m`],
    ["Shft+→", `Fast forward ${SHIFT_KEY_STEP / 60}m`],
    ["Hold", `Repeat every ${HOLD_REPEAT_MS / 1000}s`],
  ];
  const FLASH_MS = 800;

  let enabled = true;
  let overlay = null;
  let flash = null;
  let flashTotal = 0;
  let flashTimer = 0;

  const isYouTube = location.hostname.endsWith("youtube.com");

  // The element the overlay goes in, or null when the page has no VOD player.
  // YouTube keeps #movie_player alive after leaving a video (miniplayer), so it only counts on /watch.
  function findPlayer() {
    if (isYouTube) {
      return location.pathname === "/watch" ? document.querySelector("#movie_player") : null;
    }
    return document.querySelector("#player");
  }

  function findVideo() {
    if (isYouTube) return document.querySelector("#movie_player video.html5-main-video");
    return document.querySelector("#videoLayer video#video");
  }

  function formatStep(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (!m) return `${s}s`;
    return s ? `${m}m ${s}s` : `${m}m`;
  }

  // Shows how far the last seeks moved, adding up clicks or key presses that come in quick succession.
  function showFlash(moved) {
    if (!flash) return;
    flashTotal = flashTimer ? flashTotal + moved : moved;
    if (flashTotal === 0) flash.textContent = moved === 0 ? "—" : "0s";
    else flash.textContent = flashTotal < 0 ? `« ${formatStep(-flashTotal)}` : `${formatStep(flashTotal)} »`;
    flash.classList.add("sfs-visible");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash.classList.remove("sfs-visible");
      flashTimer = 0;
    }, FLASH_MS);
  }

  function seek(seconds) {
    const video = findVideo();
    if (!video || !Number.isFinite(video.duration)) return;
    const from = video.currentTime;
    const target = Math.min(Math.max(from + seconds, 0), Math.max(video.duration - 1, 0));
    video.currentTime = target;
    showFlash(Math.round(target - from));
  }

  function makeButton(seconds) {
    const btn = document.createElement("button");
    btn.type = "button";
    const step = Math.abs(seconds);
    btn.className = SIZE_CLASS[step];
    const label = formatStep(step);
    btn.textContent = seconds < 0 ? `« ${label}` : `${label} »`;
    btn.title = `${seconds < 0 ? "Rewind" : "Fast forward"} ${label}`;
    // Keep focus off the button, so Space still reaches the player instead of clicking it again.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => seek(seconds));
    return btn;
  }

  // A "?" icon; hovering it shows the keyboard shortcuts (see content.css).
  function buildHelp() {
    const help = document.createElement("span");
    help.className = "sfs-help";
    help.textContent = "?";

    const list = document.createElement("div");
    list.className = "sfs-help-list";
    for (const [key, action] of SHORTCUTS) {
      const kbd = document.createElement("kbd");
      kbd.textContent = key;
      const text = document.createElement("span");
      text.textContent = action;
      list.append(kbd, text);
    }
    help.append(list);
    return help;
  }

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "sfs-overlay";

    // Collapsed state shows only the tag; hovering swaps it for the controls (see content.css).
    const tag = document.createElement("span");
    tag.className = "sfs-tag";
    tag.textContent = "SB";

    const controls = document.createElement("div");
    controls.className = "sfs-controls";
    ROWS.forEach((steps, i) => {
      const row = document.createElement("div");
      row.className = "sfs-row";
      row.append(...steps.map((s) => makeButton(-s)));
      // The last row has a free center slot, so the shortcut help sits there.
      if (i === ROWS.length - 1) row.append(buildHelp());
      row.append(...[...steps].reverse().map((s) => makeButton(s)));
      controls.append(row);
    });

    overlay.append(tag, controls);

    // Keep clicks from reaching the player (play/pause, fullscreen).
    for (const type of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "wheel"]) {
      overlay.addEventListener(type, (e) => e.stopPropagation());
    }

    flash = document.createElement("div");
    flash.id = "sfs-flash";
  }

  // The player re-renders when switching videos, so re-attach the overlay when it gets detached.
  // Pages without a player (channel pages, search) get no overlay.
  function attachOverlay() {
    if (!enabled) return;
    const host = findPlayer();
    if (!host) {
      if (overlay) overlay.remove();
      if (flash) flash.remove();
      return;
    }
    if (!overlay) buildOverlay();
    if (overlay.parentElement !== host) host.appendChild(overlay);
    if (flash.parentElement !== host) host.appendChild(flash);
  }

  let heldKey = null;
  let holdTimer = 0;

  function stopHold() {
    clearTimeout(holdTimer);
    clearInterval(holdTimer);
    heldKey = null;
  }

  // ←/→ seeks KEY_STEP, Shift+←/→ seeks SHIFT_KEY_STEP. Captured before the page's own handlers so YouTube does not seek twice.
  // The browser's own key repeat is swallowed and replaced with a steady HOLD_REPEAT_MS repeat.
  function onKeyDown(e) {
    if (!enabled || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!findPlayer()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat && heldKey === e.key) return;

    stopHold();
    const step = (e.shiftKey ? SHIFT_KEY_STEP : KEY_STEP) * (e.key === "ArrowLeft" ? -1 : 1);
    heldKey = e.key;
    seek(step);
    holdTimer = setTimeout(() => {
      seek(step);
      holdTimer = setInterval(() => seek(step), HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  }

  function onKeyUp(e) {
    if (e.key === heldKey) stopHold();
  }

  function apply(on) {
    enabled = on;
    root.toggleAttribute("data-sfs-on", on);
    if (on) attachOverlay();
    else {
      stopHold();
      if (overlay) overlay.remove();
      if (flash) flash.remove();
    }
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  // A key released while the tab is in the background never sends keyup.
  window.addEventListener("blur", stopHold);

  chrome.storage.local.get({ enabled: true }, ({ enabled }) => apply(enabled));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) apply(changes.enabled.newValue);
  });

  setInterval(attachOverlay, 1000);
})();
