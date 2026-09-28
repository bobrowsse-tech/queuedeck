"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("manifest is valid MV3 with expected permissions and entry points", function () {
  var manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.options_ui.page, "options.html");
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "storage"].sort());
  assert.ok(!manifest.host_permissions, "no host_permissions block");
  assert.deepEqual(manifest.content_scripts[0].js, ["storage.js", "content.js"]);
  ["16", "32", "48", "128"].forEach(function (size) {
    var iconPath = manifest.icons[size];
    assert.ok(fs.existsSync(path.join(ROOT, iconPath)), "missing icon " + iconPath);
  });
});

test("extension sources make no network calls", function () {
  var files = [
    "background.js",
    "content.js",
    "storage.js",
    "popup.js",
    "options.js"
  ];
  var banned = /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket\s*\(/;
  files.forEach(function (file) {
    var src = read(file);
    assert.equal(banned.test(src), false, file + " must not make network calls");
  });
});

test("only storage.js touches chrome.storage.local get/set", function () {
  var offenders = ["background.js", "content.js", "popup.js", "options.js"];
  var pattern = /chrome\.storage\.local\.(get|set)\b/;
  offenders.forEach(function (file) {
    assert.equal(pattern.test(read(file)), false, file + " bypasses QueueStorage");
  });
  assert.ok(pattern.test(read("storage.js")));
});

test("HTML surfaces load storage.js before their page scripts", function () {
  assert.match(read("popup.html"), /storage\.js[\s\S]*popup\.js/);
  assert.match(read("options.html"), /storage\.js[\s\S]*options\.js/);
});
