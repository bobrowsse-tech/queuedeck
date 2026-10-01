/**
 * QueueStorage — thin wrapper around chrome.storage.local.
 * This is the ONLY place data is written or read. Everything lives on the
 * user's machine; nothing is ever sent anywhere. Loaded by the content
 * script, the popup, the options page and the background worker.
 */
var QueueStorage = (function () {
  "use strict";

  var KEYS = {
    ITEMS: "queue_items",
    SETTINGS: "queue_settings"
  };

  var DEFAULT_SETTINGS = {
    popupEnabled: true,
    popupDelaySeconds: 20,
    theme: "system", // "system" | "light" | "dark"
    listSort: "newest", // "newest" | "oldest" | "site"
    listFilter: "all" // "all" | "unwatched" | "watched"
  };

  var VALID_THEMES = { system: true, light: true, dark: true };
  var VALID_SORTS = { newest: true, oldest: true, site: true };
  var VALID_FILTERS = { all: true, unwatched: true, watched: true };

  function promisify(fn, arg) {
    return new Promise(function (resolve, reject) {
      fn(arg, function (result) {
        var err = chrome.runtime.lastError;
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  function get(keys) {
    return promisify(chrome.storage.local.get.bind(chrome.storage.local), keys);
  }

  function set(obj) {
    return promisify(chrome.storage.local.set.bind(chrome.storage.local), obj);
  }

  function generateId() {
    return "q_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  // Strip common tracking params so the same video saved twice from
  // different links (e.g. with a share ?si= token) is recognized as one item.
  var STRIP_PARAMS = [
    "si", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "feature", "fbclid", "gclid", "igshid", "spm"
  ];

  function normalizeUrl(rawUrl) {
    try {
      var u = new URL(rawUrl);
      STRIP_PARAMS.forEach(function (p) { u.searchParams.delete(p); });
      return u.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  // Brand-only / site-only titles are useless as playlist labels (esp. YouTube
  // SPA loads where og:title or tab.title is still just "YouTube").
  var WEAK_BRAND_TITLES = {
    youtube: true,
    vimeo: true,
    dailymotion: true,
    twitch: true,
    netflix: true
  };

  function stripSiteSuffix(raw) {
    if (!raw) return "";
    return String(raw)
      // YouTube puts unread notification counts in document.title: "(12) Title - YouTube"
      .replace(/^\(\d+\)\s+/, "")
      .replace(/\s+-\s+YouTube$/i, "")
      .replace(/\s+\|\s+Vimeo$/i, "")
      .trim();
  }

  function isWeakTitle(title, siteName) {
    var t = stripSiteSuffix(title || "");
    if (!t) return true;
    var lower = t.toLowerCase();
    if (WEAK_BRAND_TITLES[lower]) return true;
    if (siteName && lower === String(siteName).trim().toLowerCase()) return true;
    // Bare hostname as title (e.g. "youtube.com")
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return true;
    return false;
  }

  // First non-weak candidate wins; otherwise first non-empty cleaned string.
  function pickBestTitle(candidates, siteName) {
    var list = Array.isArray(candidates) ? candidates : [];
    var i;
    var cleaned;
    for (i = 0; i < list.length; i++) {
      cleaned = stripSiteSuffix(list[i] || "");
      if (cleaned && !isWeakTitle(cleaned, siteName)) return cleaned;
    }
    for (i = 0; i < list.length; i++) {
      cleaned = stripSiteSuffix(list[i] || "");
      if (cleaned) return cleaned;
    }
    return "Untitled";
  }

  // Like pickBestTitle, but returns "" when every usable candidate is weak or
  // still belongs to a video the viewer already left. Callers wait and try
  // again instead of labeling the new page with the previous title.
  function pickFreshTitle(candidates, siteName, staleList) {
    var rejected = {};
    var stale = Array.isArray(staleList) ? staleList : [];
    var s;
    var key;
    for (s = 0; s < stale.length; s++) {
      key = stripSiteSuffix(stale[s] || "").toLowerCase();
      if (key) rejected[key] = true;
    }
    var list = Array.isArray(candidates) ? candidates : [];
    var i;
    var cleaned;
    for (i = 0; i < list.length; i++) {
      cleaned = stripSiteSuffix(list[i] || "");
      if (!cleaned || isWeakTitle(cleaned, siteName)) continue;
      if (rejected[cleaned.toLowerCase()]) continue;
      return cleaned;
    }
    return "";
  }

  function titleKey(raw) {
    return stripSiteSuffix(raw || "").toLowerCase();
  }

  // Only the title trusted on the page being left. A heading read when
  // navigation starts may already belong to the next video, so callers
  // must not mark every string they see at that moment.
  function staleTitleKeys(committed) {
    var committedKey = titleKey(committed);
    if (!committedKey || isWeakTitle(committedKey, "")) return [];
    return [committedKey];
  }

  function isRejectedTitle(raw, staleList) {
    var key = titleKey(raw);
    if (!key) return false;
    var stale = Array.isArray(staleList) ? staleList : [];
    var i;
    for (i = 0; i < stale.length; i++) {
      if (titleKey(stale[i]) === key) return true;
    }
    return false;
  }

  // Heading and tab title win. While either of them still names the page
  // just left, a lagged og:title is not treated as the new video.
  function pickFreshWatchTitle(heading, docTitle, ogTitle, siteName, staleList) {
    var primary = pickFreshTitle([heading, docTitle], siteName, staleList);
    if (primary) return primary;
    if (isRejectedTitle(heading, staleList) || isRejectedTitle(docTitle, staleList)) return "";
    return pickFreshTitle([ogTitle], siteName, staleList);
  }

  // Fill missing fields so older saved lists stay readable after schema adds.
  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: raw.id || generateId(),
      url: raw.url || "",
      normalizedUrl: raw.normalizedUrl || normalizeUrl(raw.url || ""),
      title: (raw.title || raw.url || "Untitled").trim(),
      siteName: raw.siteName || "",
      thumbnail: raw.thumbnail || "",
      note: typeof raw.note === "string" ? raw.note : "",
      position: Number(raw.position) || 0,
      duration: Number(raw.duration) || 0,
      addedAt: Number(raw.addedAt) || Date.now(),
      watched: !!raw.watched
    };
  }

  function clampDelay(seconds) {
    var n = Math.round(Number(seconds));
    if (!isFinite(n)) n = DEFAULT_SETTINGS.popupDelaySeconds;
    return Math.min(180, Math.max(5, n));
  }

  function sanitizeSettings(partial) {
    var next = Object.assign({}, DEFAULT_SETTINGS, partial || {});
    next.popupEnabled = !!next.popupEnabled;
    next.popupDelaySeconds = clampDelay(next.popupDelaySeconds);
    if (!VALID_THEMES[next.theme]) next.theme = DEFAULT_SETTINGS.theme;
    if (!VALID_SORTS[next.listSort]) next.listSort = DEFAULT_SETTINGS.listSort;
    if (!VALID_FILTERS[next.listFilter]) next.listFilter = DEFAULT_SETTINGS.listFilter;
    return next;
  }

  function getSettings() {
    return get(KEYS.SETTINGS).then(function (res) {
      return sanitizeSettings(res[KEYS.SETTINGS] || {});
    });
  }

  function setSettings(partial) {
    return getSettings().then(function (current) {
      var next = sanitizeSettings(Object.assign({}, current, partial));
      var payload = {};
      payload[KEYS.SETTINGS] = next;
      return set(payload).then(function () { return next; });
    });
  }

  function getItems() {
    return get(KEYS.ITEMS).then(function (res) {
      var items = res[KEYS.ITEMS] || [];
      return items.map(normalizeItem).filter(Boolean);
    });
  }

  function setItems(items) {
    var payload = {};
    payload[KEYS.ITEMS] = items;
    return set(payload);
  }

  // Returns { item, alreadyExisted }
  function addItem(partialItem) {
    return getItems().then(function (items) {
      var normalized = normalizeUrl(partialItem.url);
      var existingIndex = items.findIndex(function (it) { return it.normalizedUrl === normalized; });
      if (existingIndex !== -1) {
        var existing = items[existingIndex];
        var patch = {};
        var incomingPosition = partialItem.position || 0;
        // Re-saving an already-saved video (e.g. rewatching further in) can
        // still move the resume point forward, but never regresses it.
        if (incomingPosition > (existing.position || 0)) {
          patch.position = incomingPosition;
          patch.duration = partialItem.duration || existing.duration || 0;
        }
        // Upgrade brand-only titles (and empty thumbnails) when a later capture
        // has a real video name — common after early Add/shortcut on YouTube.
        var incomingTitle = stripSiteSuffix(partialItem.title || "");
        var siteHint = partialItem.siteName || existing.siteName || "";
        if (
          incomingTitle &&
          isWeakTitle(existing.title, existing.siteName) &&
          !isWeakTitle(incomingTitle, siteHint)
        ) {
          patch.title = incomingTitle;
        }
        if (!existing.thumbnail && partialItem.thumbnail) {
          patch.thumbnail = partialItem.thumbnail;
        }
        if (
          partialItem.siteName &&
          (!existing.siteName || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(existing.siteName)) &&
          partialItem.siteName !== existing.siteName
        ) {
          patch.siteName = partialItem.siteName;
        }
        if (Object.keys(patch).length) {
          existing = Object.assign({}, existing, patch);
          items[existingIndex] = existing;
          return setItems(items).then(function () { return { item: existing, alreadyExisted: true }; });
        }
        return { item: existing, alreadyExisted: true };
      }
      var item = normalizeItem({
        id: generateId(),
        url: partialItem.url,
        normalizedUrl: normalized,
        title: stripSiteSuffix(partialItem.title || "") || partialItem.url || "Untitled",
        siteName: partialItem.siteName || "",
        thumbnail: partialItem.thumbnail || "",
        note: typeof partialItem.note === "string" ? partialItem.note : "",
        position: partialItem.position || 0,
        duration: partialItem.duration || 0,
        addedAt: Date.now(),
        watched: false
      });
      items.unshift(item);
      return setItems(items).then(function () { return { item: item, alreadyExisted: false }; });
    });
  }

  // Merge a JSON export into the current list. Skips duplicates by
  // normalizedUrl; preserves file order of newly added items.
  // Returns { added, total }.
  function importItems(incoming) {
    if (!Array.isArray(incoming)) {
      return Promise.reject(new Error("not an array"));
    }
    return getItems().then(function (existing) {
      var seen = {};
      existing.forEach(function (it) { seen[it.normalizedUrl] = true; });
      var toAdd = [];
      incoming.forEach(function (raw) {
        if (!raw || !raw.url) return;
        var normalized = normalizeUrl(raw.url);
        if (seen[normalized]) return;
        seen[normalized] = true;
        toAdd.push(normalizeItem({
          id: generateId(),
          url: raw.url,
          normalizedUrl: normalized,
          title: raw.title || raw.url,
          siteName: raw.siteName || "",
          thumbnail: raw.thumbnail || "",
          note: raw.note,
          position: raw.position,
          duration: raw.duration,
          addedAt: raw.addedAt || Date.now(),
          watched: !!raw.watched
        }));
      });
      var next = toAdd.concat(existing);
      return setItems(next).then(function () {
        return { added: toAdd.length, total: next.length };
      });
    });
  }

  // Called periodically while a saved video plays, to keep its resume point
  // current. No-ops silently if the URL isn't saved. Never moves the
  // position backwards (a brief rewind shouldn't lose progress).
  function updatePositionByUrl(rawUrl, position, duration) {
    var normalized = normalizeUrl(rawUrl);
    return getItems().then(function (items) {
      var idx = items.findIndex(function (it) { return it.normalizedUrl === normalized; });
      if (idx === -1) return null;
      var current = items[idx];
      var nextPosition = Math.max(current.position || 0, position || 0);
      var nextDuration = duration || current.duration || 0;
      if (nextPosition === (current.position || 0) && nextDuration === (current.duration || 0)) {
        return current;
      }
      items[idx] = Object.assign({}, current, { position: nextPosition, duration: nextDuration });
      return setItems(items).then(function () { return items[idx]; });
    });
  }

  function removeItem(id) {
    return getItems().then(function (items) {
      var next = items.filter(function (it) { return it.id !== id; });
      return setItems(next);
    });
  }

  function updateItem(id, patch) {
    return getItems().then(function (items) {
      var next = items.map(function (it) {
        return it.id === id ? normalizeItem(Object.assign({}, it, patch)) : it;
      });
      return setItems(next);
    });
  }

  function clearAll() {
    return setItems([]);
  }

  function hasUrl(rawUrl) {
    var normalized = normalizeUrl(rawUrl);
    return getItems().then(function (items) {
      return items.some(function (it) { return it.normalizedUrl === normalized; });
    });
  }

  return {
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getSettings: getSettings,
    setSettings: setSettings,
    getItems: getItems,
    setItems: setItems,
    addItem: addItem,
    importItems: importItems,
    updatePositionByUrl: updatePositionByUrl,
    removeItem: removeItem,
    updateItem: updateItem,
    clearAll: clearAll,
    normalizeUrl: normalizeUrl,
    hasUrl: hasUrl,
    stripSiteSuffix: stripSiteSuffix,
    isWeakTitle: isWeakTitle,
    pickBestTitle: pickBestTitle,
    pickFreshTitle: pickFreshTitle,
    staleTitleKeys: staleTitleKeys,
    pickFreshWatchTitle: pickFreshWatchTitle
  };
})();

// Service workers (background.js) load this via importScripts and don't have
// a `window`; guard the export so both environments are happy.
if (typeof self !== "undefined") {
  self.QueueStorage = QueueStorage;
}
