(function () {
  "use strict";

  var popupEnabled = document.getElementById("popupEnabled");
  var delayRow = document.getElementById("delayRow");
  var delaySeconds = document.getElementById("delaySeconds");
  var delayValue = document.getElementById("delayValue");
  var themeRadios = document.querySelectorAll('input[name="theme"]');
  var exportBtn = document.getElementById("exportBtn");
  var importBtn = document.getElementById("importBtn");
  var importFile = document.getElementById("importFile");
  var clearAllBtn = document.getElementById("clearAllBtn");
  var dataStatus = document.getElementById("dataStatus");
  var itemCountFoot = document.getElementById("itemCountFoot");
  var listManager = document.getElementById("listManager");
  var createListForm = document.getElementById("createListForm");
  var newListName = document.getElementById("newListName");
  var saveTargetHint = document.getElementById("saveTargetHint");
  var lockHint = document.getElementById("lockHint");
  var canLock = false;

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function videoLabel(count) {
    return count + (count === 1 ? " video" : " videos");
  }

  function bytesToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = "";
    var i;
    for (i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    var i;
    for (i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes() {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function platformAvailable() {
    if (!window.PublicKeyCredential || typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") {
      return Promise.resolve(false);
    }
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function (yes) {
      return !!yes;
    }).catch(function () { return false; });
  }

  function enrollCredential() {
    return navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(),
        rp: { name: "QueueDeck" },
        user: { id: randomBytes(), name: "queuedeck", displayName: "QueueDeck" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
        attestation: "none"
      }
    }).then(function (cred) {
      if (!cred || !cred.rawId) throw new Error("cancelled");
      return bytesToBase64(cred.rawId);
    });
  }

  function verifyCredential(credentialId) {
    return navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(),
        allowCredentials: [{ type: "public-key", id: base64ToBytes(credentialId) }],
        userVerification: "required",
        timeout: 60000
      }
    }).then(function (cred) {
      if (!cred) throw new Error("cancelled");
      return cred;
    });
  }

  function renderLists(lists, settings, grants) {
    var saveList = null;
    lists.forEach(function (list) {
      if (list.id === settings.saveListId) saveList = list;
    });
    saveTargetHint.textContent = saveList
      ? "Videos saved from a page, without opening QueueDeck, go to " + saveList.name + "."
      : "Videos saved from a page go to your first list.";
    lockHint.textContent = canLock
      ? "A lock hides a list until this device unlocks it. It is a screen lock, not encryption, and saving a video still works."
      : "This device has no OS unlock the browser can use, so lists stay open.";
    while (listManager.firstChild) listManager.removeChild(listManager.firstChild);
    lists.forEach(function (list) {
      var row = document.createElement("li");
      row.className = "managed-list";
      var granted = QueueStorage.listAccessGranted(list, grants);

      var name = document.createElement("span");
      name.className = "managed-list-name";
      name.textContent = list.name;

      var count = document.createElement("span");
      count.className = "managed-list-count";
      count.textContent = granted ? videoLabel(list.items.length) : "Locked";

      row.appendChild(name);
      row.appendChild(count);

      if (granted) {
        var renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "btn btn-secondary";
        renameBtn.textContent = "Rename";
        renameBtn.addEventListener("click", function () { startRename(row, list); });

        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.disabled = lists.length < 2;
        if (deleteBtn.disabled) deleteBtn.title = "QueueDeck always keeps one list";
        deleteBtn.addEventListener("click", function () {
          var message = list.items.length
            ? "Delete " + list.name + " and its " + videoLabel(list.items.length) + "? This can't be undone."
            : "Delete " + list.name + "? This can't be undone.";
          if (!confirm(message)) return;
          QueueStorage.deleteList(list.id).then(load).catch(function () {
            showStatus("That list can't be deleted.");
          });
        });
        row.appendChild(renameBtn);
        row.appendChild(deleteBtn);
      }

      if (canLock) row.appendChild(lockButton(list, settings, granted));
      listManager.appendChild(row);
    });
  }

  function lockButton(list, settings, granted) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary";
    if (!list.locked) {
      button.textContent = "Lock";
      button.addEventListener("click", function () { turnLockOn(list, settings); });
      return button;
    }
    if (!granted) {
      button.textContent = "Unlock";
      button.addEventListener("click", function () { unlockList(list, settings); });
      return button;
    }
    button.textContent = "Turn lock off";
    button.addEventListener("click", function () { turnLockOff(list, settings); });
    return button;
  }

  function turnLockOn(list, settings) {
    var ready = settings.lockCredentialId
      ? Promise.resolve(settings.lockCredentialId)
      : enrollCredential().then(function (id) {
        return QueueStorage.setSettings({ lockCredentialId: id }).then(function () { return id; });
      });
    ready.then(function () {
      return QueueStorage.setListLocked(list.id, true);
    }).then(function () {
      showStatus(list.name + " is locked. Saving still works.");
      load();
    }).catch(function () {
      showStatus("Lock unchanged.");
    });
  }

  function unlockList(list, settings) {
    verifyCredential(settings.lockCredentialId).then(function () {
      return QueueStorage.grantList(list.id);
    }).then(function () {
      showStatus(list.name + " is unlocked until you quit the browser.");
      load();
    }).catch(function () {
      showStatus("Still locked.");
    });
  }

  function turnLockOff(list, settings) {
    verifyCredential(settings.lockCredentialId).then(function () {
      return QueueStorage.setListLocked(list.id, false);
    }).then(function () {
      showStatus("Lock turned off for " + list.name + ".");
      load();
    }).catch(function () {
      showStatus("Lock left on.");
    });
  }

  function startRename(row, list) {
    var nameEl = row.querySelector(".managed-list-name");
    var input = document.createElement("input");
    input.type = "text";
    input.value = list.name;
    input.maxLength = 80;
    input.setAttribute("aria-label", "Rename list");
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    var done = false;
    function commit() {
      if (done) return;
      done = true;
      var value = input.value.trim();
      if (!value || value === list.name) {
        load();
        return;
      }
      QueueStorage.renameList(list.id, value).then(function () {
        showStatus("Renamed to " + value + ".");
        load();
      }).catch(function () {
        showStatus("That name can't be used.");
        load();
      });
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") {
        done = true;
        load();
      }
    });
    input.addEventListener("blur", commit);
  }

  function load() {
    Promise.all([
      QueueStorage.getSettings(),
      QueueStorage.getLists(),
      QueueStorage.getGrants(),
      platformAvailable()
    ]).then(function (res) {
      var s = res[0];
      var lists = res[1];
      var grants = res[2];
      canLock = res[3];
      popupEnabled.checked = s.popupEnabled;
      delayRow.hidden = !s.popupEnabled;
      delaySeconds.value = s.popupDelaySeconds;
      delayValue.textContent = s.popupDelaySeconds;
      themeRadios.forEach(function (r) { r.checked = r.value === s.theme; });
      applyTheme(s.theme);
      renderLists(lists, s, grants);
      var visible = 0;
      lists.forEach(function (list) {
        if (QueueStorage.listAccessGranted(list, grants)) visible += list.items.length;
      });
      itemCountFoot.textContent = visible + (visible === 1 ? " video saved." : " videos saved.");
    });
  }

  createListForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = newListName.value.trim();
    if (!name) return;
    QueueStorage.createList(name).then(function () {
      newListName.value = "";
      showStatus("Created " + name + ".");
      load();
    });
  });

  popupEnabled.addEventListener("change", function () {
    delayRow.hidden = !popupEnabled.checked;
    QueueStorage.setSettings({ popupEnabled: popupEnabled.checked });
  });

  delaySeconds.addEventListener("input", function () {
    delayValue.textContent = delaySeconds.value;
  });
  delaySeconds.addEventListener("change", function () {
    QueueStorage.setSettings({ popupDelaySeconds: Number(delaySeconds.value) });
  });

  themeRadios.forEach(function (radio) {
    radio.addEventListener("change", function () {
      if (radio.checked) {
        applyTheme(radio.value);
        QueueStorage.setSettings({ theme: radio.value });
      }
    });
  });

  function showStatus(text) {
    dataStatus.textContent = text;
    setTimeout(function () {
      if (dataStatus.textContent === text) dataStatus.textContent = "";
    }, 4000);
  }

  exportBtn.addEventListener("click", function () {
    Promise.all([QueueStorage.getLists(), QueueStorage.getGrants()]).then(function (res) {
      var lists = res[0];
      var grants = res[1];
      var skipped = false;
      var file = {
        version: 2,
        lists: lists.map(function (list) {
          var open = QueueStorage.listAccessGranted(list, grants);
          if (!open) skipped = true;
          return { id: list.id, name: list.name, locked: !!list.locked, items: open ? list.items : [] };
        })
      };
      var count = 0;
      file.lists.forEach(function (list) { count += list.items.length; });
      var blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "queue-export-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus(skipped
        ? "Exported " + count + " videos. Locked lists were left out."
        : "Exported " + count + " videos.");
    });
  });

  importBtn.addEventListener("click", function () { importFile.click(); });

  importFile.addEventListener("change", function () {
    var file = importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var incoming = JSON.parse(String(reader.result));
        importIfOpen(incoming).then(function (result) {
          showStatus("Imported " + result.added + " new videos.");
          load();
        }).catch(function (err) {
          showStatus(err && err.message === "locked"
            ? "Unlock that list before importing into it."
            : "That file doesn't look like a QueueDeck export.");
        });
      } catch (e) {
        showStatus("That file doesn't look like a QueueDeck export.");
      }
    };
    reader.readAsText(file);
    importFile.value = "";
  });

  function importIfOpen(incoming) {
    return Promise.all([QueueStorage.getLists(), QueueStorage.getSettings(), QueueStorage.getGrants()]).then(function (res) {
      var lists = res[0];
      var settings = res[1];
      var grants = res[2];
      function blocked(list) {
        return !!(list && !QueueStorage.listAccessGranted(list, grants));
      }
      function findNamed(raw) {
        var dest = null;
        if (!raw || typeof raw !== "object") return null;
        lists.forEach(function (list) {
          if (!dest && raw.id && list.id === raw.id) dest = list;
        });
        if (!dest && typeof raw.name === "string") {
          var name = raw.name.trim();
          lists.forEach(function (list) {
            if (!dest && list.name === name) dest = list;
          });
        }
        return dest;
      }
      if (Array.isArray(incoming)) {
        var target = null;
        lists.forEach(function (list) {
          if (list.id === settings.saveListId) target = list;
        });
        if (blocked(target)) return Promise.reject(new Error("locked"));
      } else if (incoming && incoming.version === 2 && Array.isArray(incoming.lists)) {
        var deny = false;
        incoming.lists.forEach(function (raw) {
          if (blocked(findNamed(raw))) deny = true;
        });
        if (deny) return Promise.reject(new Error("locked"));
      }
      return QueueStorage.importItems(incoming);
    });
  }

  clearAllBtn.addEventListener("click", function () {
    Promise.all([QueueStorage.getLists(), QueueStorage.getGrants()]).then(function (res) {
      var grants = res[1];
      var openLists = res[0].filter(function (list) {
        return list.items.length && QueueStorage.listAccessGranted(list, grants);
      });
      var count = 0;
      openLists.forEach(function (list) { count += list.items.length; });
      if (!count) {
        showStatus("Nothing unlocked to clear.");
        return;
      }
      if (!confirm("Remove " + count + " videos from unlocked lists? Locked lists stay. This can't be undone.")) return;
      var chain = Promise.resolve();
      openLists.forEach(function (list) {
        chain = chain.then(function () { return QueueStorage.clearList(list.id); });
      });
      return chain.then(function () {
        showStatus("Cleared unlocked lists.");
        load();
      });
    });
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" || area === "session") load();
  });

  load();
})();
