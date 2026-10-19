(() => {
  const root = document.documentElement;

  // Hide timestamps before the stored setting loads, so they never flash on screen.
  root.setAttribute("data-sfs-on", "");

  const FLASH_MS = 800;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Feather icons (MIT). Built with createElementNS because YouTube enforces Trusted Types, which blocks innerHTML.
  const ICONS = {
    more: [
      ["circle", { cx: 5, cy: 12, r: 1.5, fill: "currentColor" }],
      ["circle", { cx: 12, cy: 12, r: 1.5, fill: "currentColor" }],
      ["circle", { cx: 19, cy: 12, r: 1.5, fill: "currentColor" }],
    ],
    settings: [
      ["circle", { cx: 12, cy: 12, r: 3 }],
      ["path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }],
    ],
    power: [["path", { d: "M18.36 6.64a9 9 0 1 1-12.73 0" }], ["line", { x1: 12, y1: 2, x2: 12, y2: 12 }]],
    help: [
      ["circle", { cx: 12, cy: 12, r: 10 }],
      ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }],
      ["line", { x1: 12, y1: 17, x2: 12.01, y2: 17 }],
    ],
  };

  let enabled = true;
  let settings = SFS.merge({});
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

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [k, v] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })) {
      svg.setAttribute(k, v);
    }
    for (const [tag, attrs] of ICONS[name]) {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.append(el);
    }
    return svg;
  }

  // Shows how far the last seeks moved, adding up clicks or key presses that come in quick succession.
  function showFlash(moved) {
    if (!flash) return;
    flashTotal = flashTimer ? flashTotal + moved : moved;
    if (flashTotal === 0) flash.textContent = moved === 0 ? "—" : "0s";
    else flash.textContent = flashTotal < 0 ? `« ${SFS.formatStep(-flashTotal)}` : `${SFS.formatStep(flashTotal)} »`;
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

  // Keep focus off pane buttons, so Space still reaches the player instead of clicking them again.
  function makeButton(className) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    return btn;
  }

  function makeSeekButton(seconds, size) {
    const btn = makeButton("sfs-seek");
    btn.style.setProperty("--sfs-s", size / 100);
    const label = SFS.formatStep(Math.abs(seconds));
    btn.textContent = seconds < 0 ? `« ${label}` : `${label} »`;
    btn.title = `${seconds < 0 ? "Rewind" : "Fast forward"} ${label}`;
    btn.addEventListener("click", () => seek(seconds));
    return btn;
  }

  function shortcuts() {
    const step = SFS.formatStep(settings.keyStep);
    const shiftStep = SFS.formatStep(settings.shiftKeyStep);
    return [
      ["←", `Rewind ${step}`],
      ["→", `Fast forward ${step}`],
      ["Shft+←", `Rewind ${shiftStep}`],
      ["Shft+→", `Fast forward ${shiftStep}`],
      ["Hold", `Repeat every ${settings.holdRepeat / 1000}s`],
    ];
  }

  function menuItem(iconName, text) {
    const item = makeButton("sfs-menu-item");
    const label = document.createElement("span");
    label.textContent = text;
    item.append(icon(iconName), label);
    return item;
  }

  // The ⋯ menu: options, power, and the keyboard shortcuts (shown beside the menu on hover).
  function buildMenu() {
    const menu = document.createElement("div");
    menu.className = "sfs-menu";
    const box = document.createElement("div");
    box.className = "sfs-menu-box";

    const optionsItem = menuItem("settings", "Options");
    optionsItem.addEventListener("click", () => {
      overlay.classList.remove("sfs-menu-open");
      chrome.runtime.sendMessage({ type: "openOptions" });
    });

    const powerItem = menuItem("power", "Turn off");
    powerItem.title = "Turn the extension off. Turn it back on from the toolbar icon.";
    powerItem.addEventListener("click", () => chrome.storage.local.set({ enabled: false }));

    const helpItem = menuItem("help", "Shortcuts");
    helpItem.classList.add("sfs-help-item");
    const list = document.createElement("div");
    list.className = "sfs-help-list";
    for (const [key, action] of shortcuts()) {
      const kbd = document.createElement("kbd");
      kbd.textContent = key;
      const text = document.createElement("span");
      text.textContent = action;
      list.append(kbd, text);
    }
    helpItem.append(list);

    box.append(optionsItem, powerItem, helpItem);
    menu.append(box);
    return menu;
  }

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "sfs-overlay";
    overlay.dataset.side = settings.side;
    for (const [name, value] of Object.entries({
      "--sfs-idle-opacity": settings.idleOpacity / 100,
      "--sfs-row-gap": `${settings.rowGap}px`,
      "--sfs-top": `${settings.top}%`,
      "--sfs-offset": `${settings.offset}px`,
    })) {
      overlay.style.setProperty(name, value);
    }

    // Collapsed state shows only the tag; hovering swaps it for the controls (see content.css).
    const tag = document.createElement("span");
    tag.className = "sfs-tag";
    tag.textContent = "SB";

    // Each row runs from the biggest rewind to the biggest fast forward, so step size grows away from the center.
    const rows = document.createElement("div");
    rows.className = "sfs-rows";
    for (const entries of settings.rows) {
      const sorted = [...entries].sort((a, b) => b.seconds - a.seconds);
      const row = document.createElement("div");
      row.className = "sfs-row";
      row.append(...sorted.map((b) => makeSeekButton(-b.seconds, b.size)));
      row.append(...[...sorted].reverse().map((b) => makeSeekButton(b.seconds, b.size)));
      rows.append(row);
    }

    // The ⋯ button sits in its own strip at the top right, spaced from the first row like the rows are from each other.
    const more = makeButton("sfs-more");
    more.title = "Menu";
    more.append(icon("more"));
    more.addEventListener("click", () => overlay.classList.toggle("sfs-menu-open"));
    const top = document.createElement("div");
    top.className = "sfs-top";
    top.append(more);

    const controls = document.createElement("div");
    controls.className = "sfs-controls";
    controls.append(top, rows);

    overlay.append(tag, controls, buildMenu());
    overlay.addEventListener("mouseleave", () => overlay.classList.remove("sfs-menu-open"));

    // Keep clicks from reaching the player (play/pause, fullscreen).
    for (const type of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "wheel"]) {
      overlay.addEventListener(type, (e) => e.stopPropagation());
    }
  }

  function removeOverlay() {
    if (overlay) overlay.remove();
    if (flash) flash.remove();
  }

  // The player re-renders when switching videos, so re-attach the overlay when it gets detached.
  // Pages without a player (channel pages, search) get no overlay.
  function attachOverlay() {
    if (!enabled) return;
    const host = findPlayer();
    if (!host) return removeOverlay();
    if (!flash) {
      flash = document.createElement("div");
      flash.id = "sfs-flash";
    }
    if (flash.parentElement !== host) host.appendChild(flash);
    if (!settings.showOverlay) {
      if (overlay) overlay.remove();
      return;
    }
    if (!overlay) buildOverlay();
    if (overlay.parentElement !== host) host.appendChild(overlay);
  }

  let heldKey = null;
  let holdTimer = 0;

  function stopHold() {
    clearTimeout(holdTimer);
    clearInterval(holdTimer);
    heldKey = null;
  }

  // ←/→ seeks keyStep, Shift+←/→ seeks shiftKeyStep. Captured before the page's own handlers so YouTube does not seek twice.
  // The browser's own key repeat is swallowed and replaced with a steady holdRepeat repeat.
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
    const step = (e.shiftKey ? settings.shiftKeyStep : settings.keyStep) * (e.key === "ArrowLeft" ? -1 : 1);
    heldKey = e.key;
    seek(step);
    holdTimer = setTimeout(() => {
      seek(step);
      holdTimer = setInterval(() => seek(step), settings.holdRepeat);
    }, settings.holdDelay);
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
      removeOverlay();
    }
  }

  // Rebuild the pane from scratch so every setting takes effect immediately.
  function applySettings(next) {
    settings = next;
    if (overlay) overlay.remove();
    overlay = null;
    attachOverlay();
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  // A key released while the tab is in the background never sends keyup.
  window.addEventListener("blur", stopHold);

  SFS.load(applySettings);
  chrome.storage.local.get({ enabled: true }, ({ enabled }) => apply(enabled));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) applySettings(SFS.merge(changes.settings.newValue));
    if (changes.enabled) apply(changes.enabled.newValue);
  });

  setInterval(attachOverlay, 1000);
})();
