let settings = SFS.merge({});
let saveTimer = 0;
let statusTimer = 0;

const statusEl = document.getElementById("status");
const powerEl = document.getElementById("power");
const powerLabel = document.getElementById("power-label");
const resetEl = document.getElementById("reset");
let resetTimer = 0;
const rowsEl = document.getElementById("rows");

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

// Reads a duration field; marks it invalid and returns NaN when it can't be parsed.
function readStep(input) {
  const seconds = SFS.parseStep(input.value);
  input.classList.toggle("invalid", !seconds);
  return seconds;
}

function fillForm() {
  for (const el of document.querySelectorAll("[data-key]")) {
    const value = getPath(el.dataset.key);
    if (el.type === "checkbox") el.checked = value;
    else if (el.type === "radio") el.checked = el.value === value;
    else if (el.dataset.kind === "step") {
      el.value = SFS.formatStep(value);
      el.classList.remove("invalid");
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

// Put clamped numbers and tidied durations back in the field once editing finishes.
function onFieldChange(e) {
  const el = e.target;
  if (!el.dataset.key) return;
  if (el.type === "number") el.value = getPath(el.dataset.key);
  if (el.dataset.kind === "step") {
    el.value = SFS.formatStep(getPath(el.dataset.key));
    el.classList.remove("invalid");
  }
}

function renderRows() {
  rowsEl.replaceChildren();
  settings.rows.forEach((entries, r) => {
    const rowEl = document.getElementById("row-template").content.firstElementChild.cloneNode(true);
    rowEl.querySelector(".row-title").textContent = `Row ${r + 1}`;

    const removeRow = rowEl.querySelector(".remove-row");
    removeRow.disabled = settings.rows.length === 1;
    removeRow.addEventListener("click", () => {
      settings.rows.splice(r, 1);
      renderRows();
      persist();
    });

    const entriesEl = rowEl.querySelector(".entries");
    entries.forEach((entry, i) => {
      const entryEl = document.getElementById("entry-template").content.firstElementChild.cloneNode(true);

      const amount = entryEl.querySelector(".amount");
      amount.value = SFS.formatStep(entry.seconds);
      amount.addEventListener("input", () => {
        const seconds = readStep(amount);
        if (!seconds) return;
        entry.seconds = seconds;
        persist();
      });
      amount.addEventListener("change", () => {
        amount.value = SFS.formatStep(entry.seconds);
        amount.classList.remove("invalid");
      });

      const size = entryEl.querySelector(".size");
      size.value = entry.size;
      showRangeValue(size);
      size.addEventListener("input", () => {
        entry.size = +size.value;
        showRangeValue(size);
        persist();
      });

      const remove = entryEl.querySelector(".remove-entry");
      remove.disabled = entries.length === 1;
      remove.addEventListener("click", () => {
        entries.splice(i, 1);
        renderRows();
        persist();
      });

      entriesEl.append(entryEl);
    });

    rowEl.querySelector(".add-button").addEventListener("click", () => {
      entries.push({ seconds: 10, size: 80 });
      renderRows();
      persist();
      rowsEl.children[r].querySelector(".entry:last-child .amount").select();
    });

    rowsEl.append(rowEl);
  });
}

function showPower(on) {
  powerEl.setAttribute("aria-pressed", on);
  powerLabel.textContent = on ? "On" : "Off";
  document.body.classList.toggle("off", !on);
}

document.addEventListener("input", onFieldInput);
document.addEventListener("change", onFieldChange);

document.getElementById("add-row").addEventListener("click", () => {
  settings.rows.push([{ seconds: 15, size: 80 }]);
  renderRows();
  persist();
  rowsEl.lastElementChild.querySelector(".amount").select();
});

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
