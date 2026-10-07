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

  var DEFAULT_LIST_NAME = "Watch later";

  var DEFAULT_SETTINGS = {
    popupEnabled: true,
    popupDelaySeconds: 20,
    theme: "system", // "system" | "light" | "dark"
    listSort: "newest", // "newest" | "oldest" | "site" | "manual"
    listFilter: "all", // "all" | "unwatched" | "watched"
    activeListId: "",
    saveListId: "",
    lockCredentialId: ""
  };

  var SESSION_KEYS = {
    GRANTS: "queue_grants"
  };

  var VALID_THEMES = { system: true, light: true, dark: true };
  var VALID_SORTS = { newest: true, oldest: true, site: true, manual: true };
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

  function generateListId() {
    return "l_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function cleanListName(name, fallback) {
    var trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return fallback;
    if (trimmed.length > 80) return trimmed.slice(0, 80);
    return trimmed;
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
    var item = {
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
    if (isFinite(Number(raw.manualOrder))) item.manualOrder = Number(raw.manualOrder);
    return item;
  }

  function clampDelay(seconds) {
    var n = Math.round(Number(seconds));
    if (!isFinite(n)) n = DEFAULT_SETTINGS.popupDelaySeconds;
    return Math.min(180, Math.max(5, n));
  }

  function sanitizeSettings(partial, listIds) {
    var next = Object.assign({}, DEFAULT_SETTINGS, partial || {});
    next.popupEnabled = !!next.popupEnabled;
    next.popupDelaySeconds = clampDelay(next.popupDelaySeconds);
    if (!VALID_THEMES[next.theme]) next.theme = DEFAULT_SETTINGS.theme;
    if (!VALID_SORTS[next.listSort]) next.listSort = DEFAULT_SETTINGS.listSort;
    if (!VALID_FILTERS[next.listFilter]) next.listFilter = DEFAULT_SETTINGS.listFilter;
    next.activeListId = typeof next.activeListId === "string" ? next.activeListId : "";
    next.saveListId = typeof next.saveListId === "string" ? next.saveListId : "";
    next.lockCredentialId = typeof next.lockCredentialId === "string" ? next.lockCredentialId : "";
    if (listIds && listIds.length) {
      if (listIds.indexOf(next.activeListId) === -1) next.activeListId = listIds[0];
      if (listIds.indexOf(next.saveListId) === -1) next.saveListId = listIds[0];
    }
    return next;
  }

  function blankList(name) {
    return {
      id: generateListId(),
      name: cleanListName(name, DEFAULT_LIST_NAME),
      locked: false,
      items: []
    };
  }

  function normalizeList(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var items = Array.isArray(raw.items) ? raw.items.map(function (entry, index) {
      var item = normalizeItem(entry);
      if (!item) return null;
      if (!isFinite(Number(entry && entry.manualOrder))) item.manualOrder = index;
      return item;
    }).filter(Boolean) : [];
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : generateListId(),
      name: cleanListName(raw.name, DEFAULT_LIST_NAME),
      locked: !!raw.locked,
      items: items
    };
  }

  function listIdsOf(lib) {
    return lib.lists.map(function (list) { return list.id; });
  }

  function findList(lib, id) {
    var i;
    for (i = 0; i < lib.lists.length; i++) {
      if (lib.lists[i].id === id) return lib.lists[i];
    }
    return null;
  }

  function storedCredentialId(stored) {
    if (!stored || typeof stored.lockCredentialId !== "string") return "";
    return stored.lockCredentialId;
  }

  // A lock flag cannot stick unless this device has enrolled a credential.
  function enforceLocks(lib, credentialId) {
    var changed = false;
    lib.lists.forEach(function (list) {
      var next = !!list.locked && !!credentialId;
      if (list.locked !== next) {
        list.locked = next;
        changed = true;
      }
    });
    return changed;
  }

  function writeLibrary(lib) {
    return get(KEYS.SETTINGS).then(function (res) {
      enforceLocks(lib, storedCredentialId(res[KEYS.SETTINGS]));
      var payload = {};
      payload[KEYS.ITEMS] = { lists: lib.lists };
      return set(payload).then(function () { return lib; });
    });
  }

  function finishLibrary(lib, needsWrite) {
    return get(KEYS.SETTINGS).then(function (res) {
      var changed = enforceLocks(lib, storedCredentialId(res[KEYS.SETTINGS]));
      if (needsWrite || changed) return writeLibrary(lib);
      return lib;
    });
  }

  function writeSettings(next) {
    var payload = {};
    payload[KEYS.SETTINGS] = next;
    return set(payload).then(function () { return next; });
  }

  // A flat QueueItem[] (every install before named lists) is written back
  // once as a library so the generated list id stays stable.
  function loadLibrary() {
    return get(KEYS.ITEMS).then(function (res) {
      var raw = res[KEYS.ITEMS];
      if (raw == null) {
        return finishLibrary({ lists: [blankList(DEFAULT_LIST_NAME)] }, true);
      }
      if (Array.isArray(raw)) {
        var migrated = blankList(DEFAULT_LIST_NAME);
        migrated.items = raw.map(normalizeItem).filter(Boolean);
        return finishLibrary({ lists: [migrated] }, true);
      }
      if (raw && typeof raw === "object" && Array.isArray(raw.lists)) {
        var lists = raw.lists.map(normalizeList).filter(Boolean);
        if (!lists.length) return finishLibrary({ lists: [blankList(DEFAULT_LIST_NAME)] }, true);
        var needsWrite = lists.length !== raw.lists.length;
        var i;
        for (i = 0; i < raw.lists.length && !needsWrite; i++) {
          var src = raw.lists[i];
          if (!src || typeof src.id !== "string" || !src.id) needsWrite = true;
        }
        return finishLibrary({ lists: lists }, needsWrite);
      }
      return finishLibrary({ lists: [blankList(DEFAULT_LIST_NAME)] }, true);
    });
  }

  function getSettings() {
    return loadLibrary().then(function (lib) {
      return get(KEYS.SETTINGS).then(function (res) {
        var stored = res[KEYS.SETTINGS];
        var next = sanitizeSettings(stored || {}, listIdsOf(lib));
        if (
          !stored ||
          stored.activeListId !== next.activeListId ||
          stored.saveListId !== next.saveListId ||
          stored.lockCredentialId !== next.lockCredentialId
        ) {
          return writeSettings(next);
        }
        return next;
      });
    });
  }

  function setSettings(partial) {
    return loadLibrary().then(function (lib) {
      return get(KEYS.SETTINGS).then(function (res) {
        var current = sanitizeSettings(res[KEYS.SETTINGS] || {}, listIdsOf(lib));
        var next = sanitizeSettings(Object.assign({}, current, partial || {}), listIdsOf(lib));
        return writeSettings(next).then(function () {
          if (enforceLocks(lib, next.lockCredentialId)) {
            return writeLibrary(lib).then(function () { return next; });
          }
          return next;
        });
      });
    });
  }

  function flattenItems(lib) {
    var all = [];
    lib.lists.forEach(function (list) {
      list.items.forEach(function (item) { all.push(item); });
    });
    return all;
  }

  function getItems() {
    return loadLibrary().then(flattenItems);
  }

  function saveTarget(lib, settings) {
    return findList(lib, settings.saveListId) || lib.lists[0];
  }

  // A flat array replaces the silent-save list only. It cannot wipe the others.
  function setItems(items) {
    return loadLibrary().then(function (lib) {
      return getSettings().then(function (settings) {
        var list = saveTarget(lib, settings);
        list.items = (Array.isArray(items) ? items : []).map(normalizeItem).filter(Boolean);
        return writeLibrary(lib);
      });
    });
  }

  function itemFromPartial(partialItem, normalized) {
    return normalizeItem({
      id: generateId(),
      url: partialItem.url,
      normalizedUrl: normalized,
      title: stripSiteSuffix(partialItem.title || "") || partialItem.url || "Untitled",
      siteName: partialItem.siteName || "",
      thumbnail: partialItem.thumbnail || "",
      note: typeof partialItem.note === "string" ? partialItem.note : "",
      position: partialItem.position || 0,
      duration: partialItem.duration || 0,
      addedAt: partialItem.addedAt || Date.now(),
      watched: !!partialItem.watched
    });
  }

  function patchExistingItem(existing, partialItem) {
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
    if (!Object.keys(patch).length) return existing;
    return Object.assign({}, existing, patch);
  }

  function mergeIntoList(list, rawItems) {
    var seen = {};
    list.items.forEach(function (it) { seen[it.normalizedUrl] = true; });
    var toAdd = [];
    (rawItems || []).forEach(function (raw) {
      if (!raw || !raw.url) return;
      var normalized = normalizeUrl(raw.url);
      if (seen[normalized]) return;
      seen[normalized] = true;
      toAdd.push(itemFromPartial(raw, normalized));
    });
    var order = frontOrder(list.items);
    var n;
    for (n = toAdd.length - 1; n >= 0; n--) {
      toAdd[n].manualOrder = order;
      order -= 1;
    }
    list.items = toAdd.concat(list.items);
    return toAdd.length;
  }

  // listId omitted: write to saveListId and leave it unchanged.
  // listId set: write to that list, then remember it as the silent-save target.
  // Returns { item, alreadyExisted }
  function addItem(partialItem, listId) {
    return loadLibrary().then(function (lib) {
      return getSettings().then(function (settings) {
        var explicit = typeof listId === "string" && !!findList(lib, listId);
        var list = explicit ? findList(lib, listId) : saveTarget(lib, settings);
        var normalized = normalizeUrl(partialItem.url);
        var existingIndex = list.items.findIndex(function (it) { return it.normalizedUrl === normalized; });
        function finish(result) {
          if (!explicit || settings.saveListId === list.id) return result;
          return setSettings({ saveListId: list.id }).then(function () { return result; });
        }
        if (existingIndex !== -1) {
          var existing = list.items[existingIndex];
          var patched = patchExistingItem(existing, partialItem);
          if (patched !== existing) {
            list.items[existingIndex] = patched;
            return writeLibrary(lib).then(function () {
              return finish({ item: patched, alreadyExisted: true });
            });
          }
          return finish({ item: existing, alreadyExisted: true });
        }
        var item = itemFromPartial(Object.assign({}, partialItem, { watched: false, addedAt: Date.now() }), normalized);
        item.manualOrder = frontOrder(list.items);
        list.items.unshift(item);
        return writeLibrary(lib).then(function () {
          return finish({ item: item, alreadyExisted: false });
        });
      });
    });
  }

  function importBareArray(incoming) {
    return loadLibrary().then(function (lib) {
      return getSettings().then(function (settings) {
        var list = saveTarget(lib, settings);
        var added = mergeIntoList(list, incoming);
        return writeLibrary(lib).then(function () {
          return { added: added, total: list.items.length };
        });
      });
    });
  }

  function importLibraryFile(incomingLists) {
    return loadLibrary().then(function (lib) {
    var added = 0;
    var lockIds = [];
    incomingLists.forEach(function (rawList) {
        if (!rawList || typeof rawList !== "object" || Array.isArray(rawList)) return;
        var dest = null;
        if (typeof rawList.id === "string" && rawList.id) dest = findList(lib, rawList.id);
        var incomingName = cleanListName(rawList.name, "");
        if (!dest && incomingName) {
          var i;
          for (i = 0; i < lib.lists.length; i++) {
            if (lib.lists[i].name === incomingName) { dest = lib.lists[i]; break; }
          }
        }
        if (!dest) {
          dest = blankList(incomingName || DEFAULT_LIST_NAME);
          if (typeof rawList.id === "string" && rawList.id) dest.id = rawList.id;
          lib.lists.push(dest);
        }
        if (rawList.locked) {
          dest.locked = true;
          lockIds.push(dest.id);
        }
        added += mergeIntoList(dest, Array.isArray(rawList.items) ? rawList.items : []);
      });
      return writeLibrary(lib).then(function () {
        var chain = Promise.resolve();
        lockIds.forEach(function (id) {
          var list = findList(lib, id);
          if (!list || !list.locked) return;
          chain = chain.then(function () { return revokeList(id); });
        });
        return chain.then(function () {
          return { added: added, total: flattenItems(lib).length };
        });
      });
    });
  }

  // Bare QueueItem[] merges into the silent-save list. A version-2 file
  // matches lists by id, then by name, and otherwise creates them.
  // Returns { added, total }.
  function importItems(incoming) {
    if (Array.isArray(incoming)) return importBareArray(incoming);
    if (incoming && incoming.version === 2 && Array.isArray(incoming.lists)) {
      return importLibraryFile(incoming.lists);
    }
    return Promise.reject(new Error("unrecognized export"));
  }

  // Called periodically while a saved video plays. Updates every copy of
  // that video. No-ops if the URL isn't saved. Never moves position backwards.
  function updatePositionByUrl(rawUrl, position, duration) {
    var normalized = normalizeUrl(rawUrl);
    return loadLibrary().then(function (lib) {
      var first = null;
      var changed = false;
      lib.lists.forEach(function (list) {
        var i;
        for (i = 0; i < list.items.length; i++) {
          if (list.items[i].normalizedUrl !== normalized) continue;
          var current = list.items[i];
          var nextPosition = Math.max(current.position || 0, position || 0);
          var nextDuration = duration || current.duration || 0;
          if (nextPosition !== (current.position || 0) || nextDuration !== (current.duration || 0)) {
            list.items[i] = Object.assign({}, current, { position: nextPosition, duration: nextDuration });
            changed = true;
          }
          if (!first) first = list.items[i];
        }
      });
      if (!first) return null;
      if (!changed) return first;
      return writeLibrary(lib).then(function () { return first; });
    });
  }

  function removeItem(id) {
    return loadLibrary().then(function (lib) {
      lib.lists.forEach(function (list) {
        list.items = list.items.filter(function (it) { return it.id !== id; });
      });
      return writeLibrary(lib);
    });
  }

  function updateItem(id, patch) {
    return loadLibrary().then(function (lib) {
      lib.lists.forEach(function (list) {
        list.items = list.items.map(function (it) {
          if (it.id !== id) return it;
          return normalizeItem(Object.assign({}, it, patch, { id: it.id }));
        });
      });
      return writeLibrary(lib);
    });
  }

  function clearAll() {
    return loadLibrary().then(function (lib) {
      lib.lists.forEach(function (list) { list.items = []; });
      return writeLibrary(lib);
    });
  }

  function clearList(listId) {
    return loadLibrary().then(function (lib) {
      var list = findList(lib, listId);
      if (!list) return Promise.reject(new Error("unknown list"));
      return getGrants().then(function (grants) {
        if (!listAccessGranted(list, grants)) return Promise.reject(new Error("locked"));
        list.items = [];
        return writeLibrary(lib).then(function () { return list; });
      });
    });
  }

  function getLists() {
    return loadLibrary().then(function (lib) {
      return lib.lists.map(function (list) {
        return {
          id: list.id,
          name: list.name,
          locked: !!list.locked,
          items: list.items.slice()
        };
      });
    });
  }

  function getListItems(listId) {
    return loadLibrary().then(function (lib) {
      var list = findList(lib, listId);
      return list ? list.items.slice() : [];
    });
  }

  function createList(name) {
    return loadLibrary().then(function (lib) {
      var list = blankList(cleanListName(name, "Untitled"));
      lib.lists.push(list);
      return writeLibrary(lib).then(function () { return list; });
    });
  }

  function renameList(id, name) {
    var trimmed = cleanListName(name, "");
    if (!trimmed) return Promise.reject(new Error("empty name"));
    return loadLibrary().then(function (lib) {
      var list = findList(lib, id);
      if (!list) return Promise.reject(new Error("unknown list"));
      list.name = trimmed;
      return writeLibrary(lib).then(function () { return list; });
    });
  }

  function deleteList(id) {
    return loadLibrary().then(function (lib) {
      if (lib.lists.length <= 1) return Promise.reject(new Error("last list"));
      var next = lib.lists.filter(function (list) { return list.id !== id; });
      if (next.length === lib.lists.length) return Promise.reject(new Error("unknown list"));
      lib.lists = next;
      return writeLibrary(lib).then(function () {
        return setSettings({}).then(function () { return lib.lists; });
      });
    });
  }

  function frontOrder(items) {
    if (!items.length) return 0;
    var min = isFinite(Number(items[0].manualOrder)) ? Number(items[0].manualOrder) : 0;
    var i;
    for (i = 0; i < items.length; i++) {
      var n = isFinite(Number(items[i].manualOrder)) ? Number(items[i].manualOrder) : i;
      if (n < min) min = n;
    }
    return min - 1;
  }

  function findItemList(lib, id) {
    var i;
    var j;
    for (i = 0; i < lib.lists.length; i++) {
      for (j = 0; j < lib.lists[i].items.length; j++) {
        if (lib.lists[i].items[j].id === id) return lib.lists[i];
      }
    }
    return null;
  }

  function rankedItems(list) {
    return list.items.slice().sort(function (a, b) {
      return a.manualOrder - b.manualOrder;
    });
  }

  function writeManualOrder(list, ranked) {
    ranked.forEach(function (item, index) { item.manualOrder = index; });
    list.items = ranked;
  }

  function orderItem(id, toIndex) {
    return loadLibrary().then(function (lib) {
      var list = findItemList(lib, id);
      if (!list) return Promise.reject(new Error("unknown item"));
      var ranked = rankedItems(list);
      var from = -1;
      var i;
      for (i = 0; i < ranked.length; i++) {
        if (ranked[i].id === id) from = i;
      }
      if (toIndex < 0) toIndex = 0;
      if (toIndex > ranked.length - 1) toIndex = ranked.length - 1;
      if (from !== toIndex) {
        var moved = ranked.splice(from, 1)[0];
        ranked.splice(toIndex, 0, moved);
      }
      writeManualOrder(list, ranked);
      return writeLibrary(lib).then(function () {
        return setSettings({ listSort: "manual" }).then(function () { return list; });
      });
    });
  }

  function applyOrder(ids) {
    return loadLibrary().then(function (lib) {
      if (!ids || !ids.length) return Promise.reject(new Error("unknown item"));
      var list = findItemList(lib, ids[0]);
      if (!list) return Promise.reject(new Error("unknown item"));
      var rank = {};
      ids.forEach(function (itemId, index) { rank[itemId] = index; });
      list.items.forEach(function (item) {
        if (isFinite(rank[item.id])) item.manualOrder = rank[item.id];
      });
      list.items.sort(function (a, b) { return a.manualOrder - b.manualOrder; });
      return writeLibrary(lib).then(function () {
        return setSettings({ listSort: "manual" });
      });
    });
  }

  function moveItem(id, direction) {
    return loadLibrary().then(function (lib) {
      var list = findItemList(lib, id);
      if (!list) return Promise.reject(new Error("unknown item"));
      var ranked = rankedItems(list);
      var from = -1;
      var i;
      for (i = 0; i < ranked.length; i++) {
        if (ranked[i].id === id) from = i;
      }
      var to = direction === "down" ? from + 1 : from - 1;
      if (to < 0 || to >= ranked.length) {
        return setSettings({ listSort: "manual" }).then(function () { return list; });
      }
      return orderItem(id, to);
    });
  }

  function setListLocked(listId, locked) {
    return getSettings().then(function (settings) {
      if (locked && !settings.lockCredentialId) return Promise.reject(new Error("no credential"));
      return loadLibrary().then(function (lib) {
        var list = findList(lib, listId);
        if (!list) return Promise.reject(new Error("unknown list"));
        list.locked = !!locked;
        return writeLibrary(lib).then(function () {
          var saved = findList(lib, listId);
          if (!locked) return saved;
          return revokeList(listId).then(function () { return saved; });
        });
      });
    });
  }

  function sessionGet(keys) {
    return promisify(chrome.storage.session.get.bind(chrome.storage.session), keys);
  }

  function sessionSet(obj) {
    return promisify(chrome.storage.session.set.bind(chrome.storage.session), obj);
  }

  function getGrants() {
    return sessionGet(SESSION_KEYS.GRANTS).then(function (res) {
      var raw = res[SESSION_KEYS.GRANTS];
      var grants = {};
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return grants;
      Object.keys(raw).forEach(function (id) {
        if (raw[id] === true && typeof id === "string") grants[id] = true;
      });
      return grants;
    });
  }

  function revokeList(listId) {
    return getGrants().then(function (grants) {
      if (!grants[listId]) return grants;
      delete grants[listId];
      var payload = {};
      payload[SESSION_KEYS.GRANTS] = grants;
      return sessionSet(payload).then(function () { return grants; });
    });
  }

  function grantList(listId) {
    if (typeof listId !== "string" || !listId) return Promise.reject(new Error("unknown list"));
    return getGrants().then(function (grants) {
      grants[listId] = true;
      var payload = {};
      payload[SESSION_KEYS.GRANTS] = grants;
      return sessionSet(payload).then(function () { return grants; });
    });
  }

  function listAccessGranted(list, grants) {
    if (!list || !list.locked) return true;
    return !!(grants && grants[list.id] === true);
  }

  function hasUrl(rawUrl, listId) {
    var normalized = normalizeUrl(rawUrl);
    return loadLibrary().then(function (lib) {
      if (typeof listId === "string") {
        var chosen = findList(lib, listId);
        if (!chosen) return false;
        return chosen.items.some(function (it) { return it.normalizedUrl === normalized; });
      }
      return getSettings().then(function (settings) {
        var list = saveTarget(lib, settings);
        return list.items.some(function (it) { return it.normalizedUrl === normalized; });
      });
    });
  }

  return {
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getSettings: getSettings,
    setSettings: setSettings,
    getItems: getItems,
    setItems: setItems,
    getLists: getLists,
    getListItems: getListItems,
    createList: createList,
    renameList: renameList,
    deleteList: deleteList,
    clearList: clearList,
    setListLocked: setListLocked,
    moveItem: moveItem,
    orderItem: orderItem,
    applyOrder: applyOrder,
    getGrants: getGrants,
    grantList: grantList,
    listAccessGranted: listAccessGranted,
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
