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

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function load() {
    QueueStorage.getSettings().then(function (s) {
      popupEnabled.checked = s.popupEnabled;
      delayRow.hidden = !s.popupEnabled;
      delaySeconds.value = s.popupDelaySeconds;
      delayValue.textContent = s.popupDelaySeconds;
      themeRadios.forEach(function (r) { r.checked = r.value === s.theme; });
      applyTheme(s.theme);
    });
    QueueStorage.getItems().then(function (items) {
      itemCountFoot.textContent = items.length + (items.length === 1 ? " video saved." : " videos saved.");
    });
  }

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
    QueueStorage.getItems().then(function (items) {
      var blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "queue-export-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus("Exported " + items.length + " videos.");
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
        QueueStorage.importItems(incoming).then(function (result) {
          showStatus("Imported " + result.added + " new videos.");
          load();
        }).catch(function () {
          showStatus("That file doesn't look like a QueueDeck export.");
        });
      } catch (e) {
        showStatus("That file doesn't look like a QueueDeck export.");
      }
    };
    reader.readAsText(file);
    importFile.value = "";
  });

  clearAllBtn.addEventListener("click", function () {
    QueueStorage.getItems().then(function (items) {
      if (items.length === 0) {
        showStatus("Your list is already empty.");
        return;
      }
      if (confirm("Remove all " + items.length + " saved videos? This can't be undone.")) {
        QueueStorage.clearAll().then(function () {
          showStatus("Cleared.");
          load();
        });
      }
    });
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local") load();
  });

  load();
})();
