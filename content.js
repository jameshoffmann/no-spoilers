(() => {
  const root = document.documentElement;

  // Hide timestamps before the stored setting loads, so they never flash on screen.
  root.setAttribute("data-sfs-on", "");

  // A previous copy of this script (from before an extension reload or update) may have left its pane behind.
  for (const el of document.querySelectorAll("#sfs-overlay, #sfs-flash")) el.remove();

  const FLASH_MS = 800;
  // Middle of the collapsed tag, measured from the pane's top edge (6px padding + half the 16px tag).
  const TAG_CENTER = 14;
  const EDGE_MARGIN = 4;
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

  // SOOP's player saves the volume when it starts one of its own seeks and puts that saved volume back
  // when a seek finishes. Setting currentTime directly skips the save, so SOOP would restore a stale
  // volume (from page load or its last own seek) while its slider still shows the real one. Remember
  // the volume before our seeks and undo SOOP's reset for a few seconds afterwards.
  const VOLUME_GUARD_MS = 3000;
  let guardedVideo = null;
  let wantedVolume = 1;
  let volumeGuardTimer = 0;

  function restoreVolume() {
    if (guardedVideo.volume !== wantedVolume) guardedVideo.volume = wantedVolume;
  }

  function endVolumeGuard() {
    clearTimeout(volumeGuardTimer);
    guardedVideo?.removeEventListener("volumechange", restoreVolume);
    guardedVideo = null;
  }

  function guardVolume(video) {
    if (isYouTube) return;
    if (guardedVideo !== video) {
      endVolumeGuard();
      guardedVideo = video;
      wantedVolume = video.volume;
      video.addEventListener("volumechange", restoreVolume);
    }
    clearTimeout(volumeGuardTimer);
    volumeGuardTimer = setTimeout(endVolumeGuard, VOLUME_GUARD_MS);
  }

  // The viewer reaching for SOOP's volume control or keys ends the guard, so their change sticks.
  function onUserVolume(e) {
    if (e.type === "keydown" ? /^(ArrowUp|ArrowDown|m|M)$/.test(e.key) : e.target.closest?.("#player .volume")) {
      endVolumeGuard();
    }
  }

  function seek(seconds) {
    const video = findVideo();
    if (!video || !Number.isFinite(video.duration)) return;
    guardVolume(video);
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

    // One row per jump, shortest at the top: « rewind on the left, fast forward » on the right.
    const homeIndex = settings.steps.indexOf(settings.home);
    const rows = document.createElement("div");
    rows.className = "sfs-rows";
    settings.steps.forEach((seconds, i) => {
      const scale = SFS.rowScale(i, homeIndex);
      const row = document.createElement("div");
      row.className = i === homeIndex ? "sfs-row sfs-home" : "sfs-row";
      row.append(makeSeekButton(-seconds, scale * 100), makeSeekButton(seconds, scale * 100));
      rows.append(row);
    });

    // How far the open pane moves up so the home row's middle lands where the collapsed tag's middle was.
    // Mirrors content.css: 6px padding, the 16px ⋯ strip plus a row gap, then each row (38px * scale) plus a gap.
    const gap = settings.rowGap;
    let homeCenter = 6 + 16 + gap;
    for (let i = 0; i < homeIndex; i++) homeCenter += 38 * SFS.rowScale(i, homeIndex) + gap;
    homeCenter += (38 * SFS.rowScale(homeIndex, homeIndex)) / 2;
    overlay.style.setProperty("--sfs-home-shift", `${homeCenter - TAG_CENTER}px`);

    // The ⋯ button sits in its own strip at the top right, one row gap above the first row.
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
    overlay.addEventListener("mouseenter", keepInsidePlayer);
    overlay.addEventListener("mouseleave", () => {
      overlay.classList.remove("sfs-menu-open");
      overlay.style.setProperty("--sfs-nudge", "0px");
    });

    // Keep clicks from reaching the player (play/pause, fullscreen).
    for (const type of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "wheel"]) {
      overlay.addEventListener(type, (e) => e.stopPropagation());
    }
  }

  // Rows above the home row can push the open pane past the player's top or bottom edge. Nudge it back
  // inside; the home row then sits off the cursor, but the cursor stays on the pane so it doesn't collapse.
  function keepInsidePlayer() {
    requestAnimationFrame(() => {
      const host = overlay.parentElement;
      if (!host) return;
      const pane = overlay.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      let nudge = 0;
      if (pane.bottom > bounds.bottom - EDGE_MARGIN) nudge = bounds.bottom - EDGE_MARGIN - pane.bottom;
      if (pane.top + nudge < bounds.top + EDGE_MARGIN) nudge = bounds.top + EDGE_MARGIN - pane.top;
      overlay.style.setProperty("--sfs-nudge", `${nudge}px`);
    });
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
    if (isOrphaned()) return teardown();
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

  // After the extension is reloaded or updated, this copy keeps running in already-open tabs but can no
  // longer hear about setting changes, so its pane would go stale. It removes itself instead; the
  // background script injects a fresh copy.
  function isOrphaned() {
    return !chrome.runtime?.id;
  }

  let tick = 0;

  function teardown() {
    clearInterval(tick);
    stopHold();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", stopHold);
    for (const type of ["pointerdown", "wheel", "keydown"]) document.removeEventListener(type, onUserVolume, true);
    endVolumeGuard();
    removeOverlay();
    overlay = null;
    flash = null;
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  if (!isYouTube) {
    for (const type of ["pointerdown", "wheel", "keydown"]) document.addEventListener(type, onUserVolume, true);
  }
  // A key released while the tab is in the background never sends keyup.
  window.addEventListener("blur", stopHold);

  SFS.load(applySettings);
  chrome.storage.local.get({ enabled: true }, ({ enabled }) => apply(enabled));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) applySettings(SFS.merge(changes.settings.newValue));
    if (changes.enabled) apply(changes.enabled.newValue);
  });

  tick = setInterval(() => (isOrphaned() ? teardown() : attachOverlay()), 1000);
})();
