importScripts("storage.js");

function refreshBadge() {
  QueueStorage.getItems().then(function (items) {
    var count = items.length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#F2A93B" });
    chrome.action.setBadgeTextColor && chrome.action.setBadgeTextColor({ color: "#14171C" });
  });
}

chrome.runtime.onInstalled.addListener(function () {
  QueueStorage.getSettings(); // ensures defaults are written on first read/save
  refreshBadge();
});

chrome.runtime.onStartup.addListener(refreshBadge);

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === "local" && changes[QueueStorage.KEYS.ITEMS]) {
    refreshBadge();
  }
});

chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
});

// --- Keyboard shortcut: save the active tab's video without opening the popup ---

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

function flashBadge(symbol, color) {
  chrome.action.setBadgeText({ text: symbol });
  chrome.action.setBadgeBackgroundColor({ color: color });
  setTimeout(refreshBadge, 1400);
}

function quickAddActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
      flashBadge("!", "#E85D5D");
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_INFO" }, function (videoMeta) {
      if (chrome.runtime.lastError) {
        flashBadge("!", "#E85D5D");
        return;
      }
      var meta = videoMeta || {
        url: tab.url,
        title: QueueStorage.pickBestTitle([tab.title], hostnameOf(tab.url)),
        thumbnail: "",
        siteName: hostnameOf(tab.url)
      };
      QueueStorage.addItem(meta).then(function (result) {
        flashBadge(result.alreadyExisted ? "\u2022" : "\u2713", "#F2A93B");
      });
    });
  });
}

chrome.commands.onCommand.addListener(function (command) {
  if (command === "quick-add") quickAddActiveTab();
});

refreshBadge();
