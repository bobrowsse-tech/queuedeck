(function () {
  "use strict";

  var listEl = document.getElementById("list");
  var emptyEl = document.getElementById("emptyState");
  var noMatchesEl = document.getElementById("noMatches");
  var countEl = document.getElementById("countLabel");
  var clearBtn = document.getElementById("clearAll");
  var openOptionsBtn = document.getElementById("openOptions");
  var itemTemplate = document.getElementById("itemTemplate");
  var liveRegion = document.getElementById("liveRegion");
  var filterSelect = document.getElementById("filterSelect");
  var sortSelect = document.getElementById("sortSelect");
  var listSelect = document.getElementById("listSelect");
  var saveTargetNote = document.getElementById("saveTargetNote");
  var lockedState = document.getElementById("lockedState");
  var unlockListBtn = document.getElementById("unlockList");

  var quickAdd = document.getElementById("quickAdd");
  var quickAddThumb = document.getElementById("quickAddThumb");
  var quickAddTitle = document.getElementById("quickAddTitle");
  var quickAddBtn = document.getElementById("quickAddBtn");

  var currentTabMeta = null;
  var focusAfterRender = null;

  function applyTheme(settings) {
    if (settings.theme === "light" || settings.theme === "dark") {
      document.documentElement.setAttribute("data-theme", settings.theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  QueueStorage.getSettings().then(function (s) {
    applyTheme(s);
    filterSelect.value = s.listFilter;
    sortSelect.value = s.listSort;
  });

  openOptionsBtn.addEventListener("click", function () {
    chrome.runtime.openOptionsPage();
  });
  unlockListBtn.addEventListener("click", function () {
    chrome.runtime.openOptionsPage();
  });

  clearBtn.addEventListener("click", function () {
    QueueStorage.getSettings().then(function (settings) {
      return QueueStorage.getListItems(settings.activeListId).then(function (items) {
        if (items.length === 0) return;
        var name = listSelect.options[listSelect.selectedIndex]
          ? listSelect.options[listSelect.selectedIndex].textContent
          : "this list";
        if (confirm("Remove all " + items.length + " saved videos from " + name + "? This can't be undone.")) {
          QueueStorage.clearList(settings.activeListId).then(render);
        }
      });
    });
  });

  listSelect.addEventListener("change", function () {
    QueueStorage.setSettings({ activeListId: listSelect.value }).then(function () {
      render();
      refreshQuickAdd();
    });
  });

  filterSelect.addEventListener("change", function () {
    QueueStorage.setSettings({ listFilter: filterSelect.value }).then(render);
  });
  sortSelect.addEventListener("change", function () {
    QueueStorage.setSettings({ listSort: sortSelect.value }).then(render);
  });

  function relativeTime(ts) {
    var diff = Date.now() - ts;
    var min = Math.round(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m ago";
    var hr = Math.round(min / 60);
    if (hr < 24) return hr + "h ago";
    var day = Math.round(hr / 24);
    if (day < 7) return day + "d ago";
    var wk = Math.round(day / 7);
    if (wk < 5) return wk + "w ago";
    return new Date(ts).toLocaleDateString();
  }

  function formatTime(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    var ss = String(sec).padStart(2, "0");
    return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  // Best-effort resume link. Most sites don't support seeking via URL, so
  // this only applies on the handful of platforms known to honor a time
  // parameter; everywhere else we just link to the saved URL as-is.
  function buildResumeUrl(item) {
    if (!item.position || item.position < 5) return item.url;
    if (item.duration && item.position >= item.duration - 3) return item.url; // basically finished
    try {
      var u = new URL(item.url);
      var host = u.hostname.replace(/^www\./, "");
      var seconds = Math.floor(item.position);
      if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
        u.searchParams.set("t", seconds + "s");
        return u.toString();
      }
      if (host === "vimeo.com" || host === "player.vimeo.com") {
        u.hash = "t=" + seconds + "s";
        return u.toString();
      }
    } catch (e) { /* fall through */ }
    return item.url;
  }

  function announce(text) {
    liveRegion.textContent = "";
    setTimeout(function () { liveRegion.textContent = text; }, 30);
  }

  function applyFilterAndSort(items, settings) {
    var filtered = items.filter(function (item) {
      if (settings.listFilter === "watched") return !!item.watched;
      if (settings.listFilter === "unwatched") return !item.watched;
      return true;
    });
    if (settings.listSort === "oldest") {
      filtered.sort(function (a, b) { return a.addedAt - b.addedAt; });
    } else if (settings.listSort === "site") {
      filtered.sort(function (a, b) {
        return (a.siteName || "").localeCompare(b.siteName || "") || (b.addedAt - a.addedAt);
      });
    } else if (settings.listSort === "manual") {
      filtered.sort(function (a, b) { return a.manualOrder - b.manualOrder; });
    } else {
      filtered.sort(function (a, b) { return b.addedAt - a.addedAt; });
    }
    return filtered;
  }

  function fillListSelect(lists, activeId) {
    var signature = lists.map(function (list) { return list.id + ":" + list.name; }).join("|");
    if (listSelect.dataset.signature !== signature) {
      listSelect.dataset.signature = signature;
      while (listSelect.firstChild) listSelect.removeChild(listSelect.firstChild);
      lists.forEach(function (list) {
        var option = document.createElement("option");
        option.value = list.id;
        option.textContent = list.name;
        listSelect.appendChild(option);
      });
    }
    if (activeId && listSelect.value !== activeId) listSelect.value = activeId;
  }

  function render() {
    Promise.all([QueueStorage.getLists(), QueueStorage.getSettings(), QueueStorage.getGrants()]).then(function (res) {
      var lists = res[0];
      var settings = res[1];
      var grants = res[2];
      var open = null;
      var saveList = null;
      lists.forEach(function (list) {
        if (list.id === settings.activeListId) open = list;
        if (list.id === settings.saveListId) saveList = list;
      });
      if (!open) open = lists[0];
      fillListSelect(lists, open ? open.id : "");
      var items = open ? open.items : [];
      if (saveList && open && saveList.id !== open.id) {
        saveTargetNote.hidden = false;
        saveTargetNote.textContent = "Saves from a page go to " + saveList.name;
      } else {
        saveTargetNote.hidden = true;
        saveTargetNote.textContent = "";
      }
      var visible = applyFilterAndSort(items, settings);
      var locked = !!(open && open.locked && !QueueStorage.listAccessGranted(open, grants));

      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      if (locked) {
        countEl.textContent = "Locked";
        emptyEl.hidden = true;
        clearBtn.hidden = true;
        noMatchesEl.hidden = true;
        lockedState.hidden = false;
        focusAfterRender = null;
        return;
      }
      lockedState.hidden = true;
      countEl.textContent = items.length + (items.length === 1 ? " saved" : " saved");
      emptyEl.hidden = items.length > 0;
      clearBtn.hidden = items.length === 0;
      noMatchesEl.hidden = !(items.length > 0 && visible.length === 0);

      var reorderEnabled = settings.listFilter === "all";
      visible.forEach(function (item) {
        var node = itemTemplate.content.firstElementChild.cloneNode(true);
        node.classList.toggle("watched", !!item.watched);

        var handle = node.querySelector(".drag-handle");
        handle.disabled = !reorderEnabled;
        handle.draggable = reorderEnabled;
        if (!reorderEnabled) handle.setAttribute("aria-disabled", "true");
        handle.addEventListener("keydown", function (e) {
          if (!reorderEnabled) return;
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          var ids = visible.map(function (entry) { return entry.id; });
          var from = ids.indexOf(item.id);
          var to = e.key === "ArrowDown" ? from + 1 : from - 1;
          if (from < 0 || to < 0 || to >= ids.length) return;
          ids.splice(from, 1);
          ids.splice(to, 0, item.id);
          focusAfterRender = item.id;
          QueueStorage.applyOrder(ids).then(function () {
            announce("Moved " + item.title);
            render();
          });
        });
        handle.addEventListener("dragstart", function (e) {
          if (!reorderEnabled) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData("text/plain", item.id);
          e.dataTransfer.effectAllowed = "move";
          node.classList.add("dragging");
        });
        handle.addEventListener("dragend", function () {
          node.classList.remove("dragging");
        });
        node.addEventListener("dragover", function (e) {
          if (!reorderEnabled) return;
          e.preventDefault();
        });
        node.addEventListener("drop", function (e) {
          if (!reorderEnabled) return;
          e.preventDefault();
          var draggedId = e.dataTransfer.getData("text/plain");
          if (!draggedId || draggedId === item.id) return;
          var ids = visible.map(function (entry) { return entry.id; });
          var from = ids.indexOf(draggedId);
          var to = ids.indexOf(item.id);
          if (from < 0 || to < 0) return;
          ids.splice(from, 1);
          ids.splice(to, 0, draggedId);
          var dragged = visible.filter(function (entry) { return entry.id === draggedId; })[0];
          QueueStorage.applyOrder(ids).then(function () {
            announce("Moved " + (dragged ? dragged.title : "video"));
            render();
          });
        });
        if (focusAfterRender === item.id) node.dataset.restoreFocus = "true";

        var link = node.querySelector(".item-link");
        link.href = buildResumeUrl(item);
        link.setAttribute("aria-label", item.title + (item.watched ? " (watched)" : ""));

        var thumb = node.querySelector(".item-thumb");
        setThumbBackground(thumb, item.thumbnail);
        if (item.duration > 0) {
          var pct = Math.min(100, Math.round(((item.position || 0) / item.duration) * 100));
          node.querySelector(".item-progress-fill").style.width = pct + "%";
        }

        node.querySelector(".item-title").textContent = item.title;
        node.querySelector(".item-site").textContent = item.siteName || "";
        node.querySelector(".item-time").textContent = relativeTime(item.addedAt);

        var resumeEl = node.querySelector(".item-resume");
        if (item.position >= 5 && !(item.duration && item.position >= item.duration - 3)) {
          resumeEl.textContent = "Resume at " + formatTime(item.position);
        }

        var notePreview = node.querySelector(".item-note-preview");
        if (item.note) {
          notePreview.textContent = item.note;
          notePreview.hidden = false;
        }

        var watchBtn = node.querySelector(".watch-toggle");
        watchBtn.setAttribute("aria-pressed", String(!!item.watched));
        watchBtn.setAttribute("aria-label", item.watched ? "Mark as unwatched" : "Mark as watched");
        watchBtn.addEventListener("click", function () {
          QueueStorage.updateItem(item.id, { watched: !item.watched }).then(render);
        });

        var editBtn = node.querySelector(".edit-btn");
        editBtn.addEventListener("click", function () {
          startRename(node, item);
        });

        var noteBtn = node.querySelector(".note-btn");
        noteBtn.classList.toggle("has-note", !!item.note);
        noteBtn.setAttribute("aria-label", item.note ? "Edit note" : "Add note");
        var noteEditor = node.querySelector(".item-note-editor");
        var noteInput = node.querySelector(".item-note-input");
        var noteSave = node.querySelector(".note-save");
        var noteCancel = node.querySelector(".note-cancel");

        noteBtn.addEventListener("click", function () {
          var opening = noteEditor.hidden;
          noteEditor.hidden = !opening;
          if (opening) {
            noteInput.value = item.note || "";
            noteInput.focus();
          }
        });
        noteCancel.addEventListener("click", function () { noteEditor.hidden = true; });
        noteInput.addEventListener("keydown", function (e) {
          if (e.key === "Escape") noteEditor.hidden = true;
        });
        noteSave.addEventListener("click", function () {
          var value = noteInput.value.trim();
          QueueStorage.updateItem(item.id, { note: value }).then(function () {
            announce(value ? "Note saved" : "Note removed");
            render();
          });
        });

        var removeBtn = node.querySelector(".remove-btn");
        removeBtn.addEventListener("click", function () {
          QueueStorage.removeItem(item.id).then(function () {
            announce("Removed " + item.title);
            render();
          });
        });

        listEl.appendChild(node);
      });
      if (focusAfterRender) {
        var restored = listEl.querySelector('[data-restore-focus="true"] .drag-handle');
        if (restored) restored.focus();
      }
      focusAfterRender = null;
    });
  }

  function setupQuickAdd() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) return;

      chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_INFO" }, function (videoMeta) {
        if (chrome.runtime.lastError) return; // no content script on this page (e.g. chrome:// or store)
        if (videoMeta && videoMeta.titleStale) return; // page title still names the previous video
        var meta = videoMeta || {
          url: tab.url,
          title: QueueStorage.pickBestTitle([tab.title], hostnameOf(tab.url)),
          thumbnail: "",
          siteName: hostnameOf(tab.url)
        };
        currentTabMeta = meta;

        QueueStorage.getSettings().then(function (settings) {
          return QueueStorage.hasUrl(meta.url, settings.activeListId);
        }).then(function (already) {
          if (already) return; // already in the open list
          quickAddTitle.textContent = meta.title;
          setThumbBackground(quickAddThumb, meta.thumbnail);
          quickAdd.hidden = false;
        });
      });
    });
  }

  function startRename(node, item) {
    var titleEl = node.querySelector(".item-title");
    var input = document.createElement("input");
    input.type = "text";
    input.className = "item-title-input";
    input.value = item.title;
    input.setAttribute("aria-label", "Rename video title");
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    var done = false;
    function commit() {
      if (done) return;
      done = true;
      var value = input.value.trim() || item.title;
      QueueStorage.updateItem(item.id, { title: value }).then(function () {
        announce("Renamed");
        render();
      });
    }
    function cancel() {
      if (done) return;
      done = true;
      render();
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);
  }

  function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  // Only absolute http(s) thumbnails; escape quotes so CSS url() can't break out.
  // No base URL — relative paths must throw and be ignored, not resolve to a fake host.
  function setThumbBackground(el, rawUrl) {
    if (!el || !rawUrl) return;
    try {
      var u = new URL(rawUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      el.style.backgroundImage = 'url("' + u.href.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '")';
      el.classList.add("has-image");
    } catch (e) { /* ignore bad / relative thumbnail URLs */ }
  }

  function refreshQuickAdd() {
    if (!currentTabMeta) return;
    QueueStorage.getSettings().then(function (settings) {
      return QueueStorage.hasUrl(currentTabMeta.url, settings.activeListId);
    }).then(function (already) {
      if (already) {
        quickAdd.hidden = true;
        return;
      }
      quickAddTitle.textContent = currentTabMeta.title;
      setThumbBackground(quickAddThumb, currentTabMeta.thumbnail);
      quickAdd.hidden = false;
    });
  }

  quickAddBtn.addEventListener("click", function () {
    if (!currentTabMeta) return;
    QueueStorage.getSettings().then(function (settings) {
      var listName = listSelect.options[listSelect.selectedIndex]
        ? listSelect.options[listSelect.selectedIndex].textContent
        : "QueueDeck";
      return QueueStorage.addItem(currentTabMeta, settings.activeListId).then(function () {
        quickAdd.hidden = true;
        announce("Added to " + listName);
        render();
      });
    });
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "session") {
      render();
      return;
    }
    if (area !== "local") return;
    if (changes[QueueStorage.KEYS.SETTINGS]) {
      applyTheme(Object.assign({}, QueueStorage.DEFAULT_SETTINGS, changes[QueueStorage.KEYS.SETTINGS].newValue || {}));
    }
    if (changes[QueueStorage.KEYS.ITEMS] || changes[QueueStorage.KEYS.SETTINGS]) {
      render();
      refreshQuickAdd();
    }
  });

  render();
  setupQuickAdd();
})();
