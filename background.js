function showBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#0182ff" });
}

async function syncBadge() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  showBadge(enabled);
}

// Start on for new installs. Versions before 1.4 toggled off from the toolbar icon, which now opens
// the options popup instead, so switch those back on once rather than leaving them stuck off.
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  const olderVersion = reason === "update" && parseFloat(previousVersion) < 1.4;
  if (reason === "install" || olderVersion) await chrome.storage.local.set({ enabled: true });
  syncBadge();
});
chrome.runtime.onStartup.addListener(syncBadge);

// On/off can change from the options page or the pane's menu, so follow storage rather than the click.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) showBadge(changes.enabled.newValue);
});

// The pane's "Options" item opens the toolbar popup. Content scripts can't do that themselves, and
// openPopup can fail (older Chrome, or the window isn't focused), so fall back to the options tab.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "openOptions") return;
  chrome.action.openPopup({ windowId: sender.tab?.windowId }).catch(() => chrome.runtime.openOptionsPage());
});
