let settings = SFS.merge({});
let saveTimer = 0;
let statusTimer = 0;

const statusEl = document.getElementById("status");
const powerEl = document.getElementById("power");
const powerLabel = document.getElementById("power-label");
const resetEl = document.getElementById("reset");
let resetTimer = 0;
const rowsEl = document.getElementById("rows");
const addAmount = document.getElementById("add-amount");
const addButton = document.getElementById("add-row");

function getPath(path) {
  return path.split(".").reduce((obj, key) => obj[key], settings);
}

function setPath(path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((obj, key) => obj[key], settings)[last] = value;
}

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove("visible"), 1200);
}

// Sliders send a stream of input events, so save once they settle.
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await SFS.save(settings);
    showStatus("Saved");
  }, 150);
}

function showRangeValue(input) {
  const output = input.parentElement.querySelector("output");
  if (output) output.textContent = `${input.value}${output.dataset.unit || ""}`;
}

function clampNumber(input) {
  const n = +input.value;
  if (input.value === "" || !Number.isFinite(n)) return NaN;
  const min = input.min === "" ? -Infinity : +input.min;
  const max = input.max === "" ? Infinity : +input.max;
  return Math.min(Math.max(n, min), max);
}

const FORMAT_ERROR = "Enter a valid format, e.g. 20s, 3m, 1h";
const DUPLICATE_ERROR = "Another row already has this jump";

// Shows (or clears, with an empty message) an error label under a field. In the rows list it goes
// below the row; elsewhere under the field's label.
function setFieldError(input, message) {
  const host = input.closest(".step-row") || input.closest(".row").firstElementChild;
  let label = host.querySelector(".field-error");
  input.classList.toggle("invalid", !!message);
  input.toggleAttribute("aria-invalid", !!message);
  if (!message) return label?.remove();
  if (!label) {
    label = document.createElement("small");
    label.className = "field-error";
    label.setAttribute("role", "alert");
    host.append(label);
  }
  label.textContent = message;
}

// Reads a duration field; shows the format error and returns NaN when it can't be parsed.
function readStep(input) {
  const seconds = SFS.parseStep(input.value);
  setFieldError(input, seconds ? "" : FORMAT_ERROR);
  return seconds;
}

function fillForm() {
  for (const el of document.querySelectorAll("[data-key]")) {
    const value = getPath(el.dataset.key);
    if (el.type === "checkbox") el.checked = value;
    else if (el.type === "radio") el.checked = el.value === value;
    else if (el.dataset.kind === "step") {
      el.value = SFS.formatStep(value);
      setFieldError(el, "");
    } else el.value = value;
    if (el.type === "range") showRangeValue(el);
  }
  renderRows();
}

function onFieldInput(e) {
  const el = e.target;
  if (!el.dataset.key) return;
  let value;
  if (el.type === "checkbox") value = el.checked;
  else if (el.type === "radio") {
    if (!el.checked) return;
    value = el.value;
  } else if (el.dataset.kind === "step") {
    value = readStep(el);
    if (!value) return;
  } else if (el.type === "range" || el.type === "number") {
    value = clampNumber(el);
    if (Number.isNaN(value)) return;
    if (el.type === "range") showRangeValue(el);
  } else value = el.value;
  setPath(el.dataset.key, value);
  persist();
}

// Put clamped numbers and tidied durations back in the field once editing finishes. An invalid
// duration stays as typed, with its error, until it's fixed; the last valid value stays saved.
function onFieldChange(e) {
  const el = e.target;
  if (!el.dataset.key) return;
  if (el.type === "number") el.value = getPath(el.dataset.key);
  if (el.dataset.kind === "step" && !el.classList.contains("invalid")) {
    el.value = SFS.formatStep(getPath(el.dataset.key));
  }
}

// Rows are kept sorted; an edited jump re-sorts when the field loses focus, so rows don't jump around mid-typing.
// highlight: a jump that was just added, briefly marked so you can see where it sorted to.
function renderRows(highlight) {
  rowsEl.replaceChildren();
  const homeIndex = settings.steps.indexOf(settings.home);
  settings.steps.forEach((seconds, i) => {
    const rowEl = document.getElementById("step-template").content.firstElementChild.cloneNode(true);
    rowEl.classList.toggle("is-home", i === homeIndex);

    const home = rowEl.querySelector(".home");
    home.checked = i === homeIndex;
    home.addEventListener("change", () => {
      settings.home = settings.steps[i];
      renderRows();
      persist();
    });

    rowEl.querySelector(".size-readout").textContent = `${Math.round(SFS.rowScale(i, homeIndex) * 100)}%`;

    const amount = rowEl.querySelector(".amount");
    amount.value = SFS.formatStep(seconds);
    amount.addEventListener("input", () => {
      const value = SFS.parseStep(amount.value);
      const duplicate = settings.steps.some((n, k) => k !== i && n === value);
      setFieldError(amount, !value ? FORMAT_ERROR : duplicate ? DUPLICATE_ERROR : "");
      if (!value || duplicate) return;
      if (settings.home === settings.steps[i]) settings.home = value;
      settings.steps[i] = value;
      persist();
    });
    amount.addEventListener("change", () => {
      if (amount.classList.contains("invalid")) return;
      const value = settings.steps[i];
      settings.steps = SFS.normalizeSteps(settings.steps);
      renderRows();
      persist();
      // Typing then tabbing away re-renders the list; keep the edited row visible.
      rowsEl.children[settings.steps.indexOf(value)]?.scrollIntoView({ block: "nearest" });
    });

    const remove = rowEl.querySelector(".remove-step");
    remove.disabled = settings.steps.length === 1;
    remove.addEventListener("click", () => {
      const removed = settings.steps.splice(i, 1)[0];
      if (removed === settings.home) settings.home = SFS.closestStep(settings.steps, removed);
      renderRows();
      persist();
    });

    rowsEl.append(rowEl);
  });

  const full = settings.steps.length >= SFS.MAX_ROWS;
  addAmount.disabled = full;
  addButton.disabled = full;
  addAmount.placeholder = full ? `Up to ${SFS.MAX_ROWS} rows` : "e.g. 10s";

  const added = rowsEl.children[settings.steps.indexOf(highlight)];
  if (added) {
    added.classList.add("just-added");
    added.scrollIntoView({ block: "nearest" });
  }
}

function showPower(on) {
  powerEl.setAttribute("aria-pressed", on);
  powerLabel.textContent = on ? "On" : "Off";
  document.body.classList.toggle("off", !on);
}

document.addEventListener("input", onFieldInput);
document.addEventListener("change", onFieldChange);

// Type a jump and add it; it drops into its sorted place in the list.
document.getElementById("add-step").addEventListener("submit", (e) => {
  e.preventDefault();
  if (settings.steps.length >= SFS.MAX_ROWS) return;
  const seconds = SFS.parseStep(addAmount.value);
  const error = !seconds ? FORMAT_ERROR : settings.steps.includes(seconds) ? DUPLICATE_ERROR : "";
  setFieldError(addAmount, error);
  if (error) return;
  settings.steps = SFS.normalizeSteps([...settings.steps, seconds]);
  addAmount.value = "";
  renderRows(seconds);
  persist();
  if (!addAmount.disabled) addAmount.focus();
});

// Errors here show on submit; typing again clears them.
addAmount.addEventListener("input", () => setFieldError(addAmount, ""));

// Two clicks instead of confirm(), which is unreliable in extension popups.
resetEl.addEventListener("click", async () => {
  if (!resetEl.classList.contains("confirming")) {
    resetEl.classList.add("confirming");
    resetEl.textContent = "Click again to reset";
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetEl.classList.remove("confirming");
      resetEl.textContent = "Reset";
    }, 3000);
    return;
  }
  clearTimeout(resetTimer);
  resetEl.classList.remove("confirming");
  resetEl.textContent = "Reset";
  settings = SFS.clone(SFS.DEFAULTS);
  fillForm();
  clearTimeout(saveTimer);
  await SFS.save(settings);
  showStatus("Reset to defaults");
});

powerEl.addEventListener("click", () =>
  chrome.storage.local.set({ enabled: powerEl.getAttribute("aria-pressed") !== "true" }),
);

// The pane's menu can turn the extension off while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) showPower(changes.enabled.newValue);
});

chrome.storage.local.get({ enabled: true }, ({ enabled }) => showPower(enabled));
SFS.load((loaded) => {
  settings = loaded;
  fillForm();
});
