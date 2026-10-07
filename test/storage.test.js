"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var fs = require("node:fs");
var vm = require("node:vm");
var { createChromeMock } = require("./chrome-mock.js");

function loadQueueStorage() {
  var mock = createChromeMock();
  var code = fs.readFileSync(path.join(__dirname, "..", "storage.js"), "utf8");
  var sandbox = {
    chrome: global.chrome,
    console: console,
    URL: URL,
    Promise: Promise,
    Object: Object,
    Array: Array,
    Math: Math,
    Date: Date,
    Number: Number,
    String: String,
    Boolean: Boolean,
    isFinite: isFinite,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  sandbox.self = sandbox;
  vm.runInNewContext(code, sandbox, { filename: "storage.js" });
  return { QueueStorage: sandbox.QueueStorage, mock: mock };
}

test("normalizeUrl strips tracking params and playback start times", function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var cleaned = QueueStorage.normalizeUrl(
    "https://www.youtube.com/watch?v=abc123&si=sharetoken&utm_source=twitter&t=90s"
  );
  assert.equal(cleaned, "https://www.youtube.com/watch?v=abc123");
  var vimeo = QueueStorage.normalizeUrl("https://vimeo.com/123456#t=30s");
  assert.equal(vimeo, "https://vimeo.com/123456");
  var kept = QueueStorage.normalizeUrl("https://vimeo.com/123456#chapter");
  assert.equal(kept, "https://vimeo.com/123456#chapter");
});

test("hasUrl treats a resume timestamp as the saved video", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.addItem({
    url: "https://www.youtube.com/watch?v=abc123",
    title: "Saved"
  });
  await QueueStorage.addItem({
    url: "https://vimeo.com/123456",
    title: "Clip"
  });

  assert.equal(
    await QueueStorage.hasUrl("https://www.youtube.com/watch?v=abc123&t=90s"),
    true
  );
  assert.equal(await QueueStorage.hasUrl("https://vimeo.com/123456#t=30s"), true);
});

test("addItem does not duplicate a video that only adds a start time", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var first = await QueueStorage.addItem({
    url: "https://www.youtube.com/watch?v=abc123&t=30s",
    title: "Early"
  });
  var second = await QueueStorage.addItem({
    url: "https://www.youtube.com/watch?v=abc123&t=90s",
    title: "Later"
  });
  assert.equal(first.alreadyExisted, false);
  assert.equal(second.alreadyExisted, true);
  assert.equal(first.item.id, second.item.id);
  var items = await QueueStorage.getItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].normalizedUrl, "https://www.youtube.com/watch?v=abc123");
});

test("addItem de-duplicates by normalized URL", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var first = await QueueStorage.addItem({
    url: "https://example.com/v?utm_source=x",
    title: "One"
  });
  var second = await QueueStorage.addItem({
    url: "https://example.com/v?utm_medium=y",
    title: "Two"
  });
  assert.equal(first.alreadyExisted, false);
  assert.equal(second.alreadyExisted, true);
  assert.equal(first.item.id, second.item.id);
  var items = await QueueStorage.getItems();
  assert.equal(items.length, 1);
});

test("addItem advances resume position but never regresses it", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.addItem({
    url: "https://example.com/a",
    title: "A",
    position: 30,
    duration: 100
  });
  await QueueStorage.addItem({
    url: "https://example.com/a",
    title: "A",
    position: 50,
    duration: 100
  });
  var mid = await QueueStorage.getItems();
  assert.equal(mid[0].position, 50);

  await QueueStorage.addItem({
    url: "https://example.com/a",
    title: "A",
    position: 20,
    duration: 100
  });
  var end = await QueueStorage.getItems();
  assert.equal(end[0].position, 50);
});

test("updatePositionByUrl is a no-op for unsaved URLs", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var result = await QueueStorage.updatePositionByUrl("https://example.com/none", 10, 60);
  assert.equal(result, null);
});

test("setSettings clamps delay and rejects invalid enums", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var s = await QueueStorage.setSettings({
    popupDelaySeconds: 999,
    theme: "neon",
    listSort: "wat",
    listFilter: "maybe"
  });
  assert.equal(s.popupDelaySeconds, 180);
  assert.equal(s.theme, "system");
  assert.equal(s.listSort, "newest");
  assert.equal(s.listFilter, "all");

  var low = await QueueStorage.setSettings({ popupDelaySeconds: 1 });
  assert.equal(low.popupDelaySeconds, 5);
});

test("importItems preserves notes/position and export order", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.addItem({ url: "https://example.com/existing", title: "Keep" });

  var result = await QueueStorage.importItems([
    {
      url: "https://example.com/new-a?utm_source=x",
      title: "A",
      note: "watch later for talk",
      position: 42,
      duration: 300,
      watched: true
    },
    {
      url: "https://example.com/new-b",
      title: "B",
      note: ""
    },
    {
      url: "https://example.com/existing?si=dup",
      title: "Should skip"
    }
  ]);

  assert.equal(result.added, 2);
  assert.equal(result.total, 3);
  var items = await QueueStorage.getItems();
  assert.equal(items[0].title, "A");
  assert.equal(items[0].note, "watch later for talk");
  assert.equal(items[0].position, 42);
  assert.equal(items[0].duration, 300);
  assert.equal(items[0].watched, true);
  assert.equal(items[1].title, "B");
  assert.equal(items[2].title, "Keep");
});

test("importItems rejects non-arrays", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await assert.rejects(function () {
    return QueueStorage.importItems({ not: "an array" });
  });
});

test("getItems backfills missing note/position fields", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  mock.store.queue_items = [{
    id: "q_old",
    url: "https://example.com/legacy",
    normalizedUrl: "https://example.com/legacy",
    title: "Legacy",
    addedAt: 1,
    watched: false
  }];
  var items = await QueueStorage.getItems();
  assert.equal(items[0].note, "");
  assert.equal(items[0].position, 0);
  assert.equal(items[0].duration, 0);
  assert.equal(items[0].thumbnail, "");
});

test("pickBestTitle prefers real titles over YouTube brand stubs", function () {
  var { QueueStorage } = loadQueueStorage();
  assert.equal(
    QueueStorage.pickBestTitle(["YouTube", "Real Talk - YouTube", "YouTube"], "YouTube"),
    "Real Talk"
  );
  assert.equal(
    QueueStorage.pickBestTitle(["youtube.com", "How to Brew", ""], "YouTube"),
    "How to Brew"
  );
  assert.equal(
    QueueStorage.pickBestTitle(["(12) Me at the zoo - YouTube", "Me at the zoo", "YouTube"], "YouTube"),
    "Me at the zoo"
  );
  assert.equal(QueueStorage.stripSiteSuffix("(947) Me at the zoo - YouTube"), "Me at the zoo");
  assert.equal(QueueStorage.isWeakTitle("YouTube", "YouTube"), true);
  assert.equal(QueueStorage.isWeakTitle("How to Brew", "YouTube"), false);
  assert.equal(QueueStorage.stripSiteSuffix("Clip - YouTube"), "Clip");
});

test("pickFreshTitle waits out titles left behind by the previous video", function () {
  var { QueueStorage } = loadQueueStorage();
  var stale = ["Calming White Flowers", "Elegant Blooming Flower"];
  assert.equal(
    QueueStorage.pickFreshTitle(
      [
        "Calming White Flowers - YouTube",
        "(3) Calming White Flowers - YouTube",
        "Elegant Blooming Flower"
      ],
      "YouTube",
      stale
    ),
    ""
  );
  assert.equal(
    QueueStorage.pickFreshTitle(
      ["Calming White Flowers", "White Floral Elegance - YouTube", "Elegant Blooming Flower"],
      "YouTube",
      ["calming white flowers", "elegant blooming flower"]
    ),
    "White Floral Elegance"
  );
  assert.equal(QueueStorage.pickFreshTitle(["YouTube", ""], "YouTube", []), "");
  assert.equal(
    QueueStorage.pickFreshTitle(["How to Brew - YouTube"], "YouTube", []),
    "How to Brew"
  );
});

test("staleTitleKeys is only the title from the page being left", function () {
  var { QueueStorage } = loadQueueStorage();
  assert.equal(
    QueueStorage.staleTitleKeys("Calming White Flowers - YouTube").join("|"),
    "calming white flowers"
  );
  assert.equal(QueueStorage.staleTitleKeys("").length, 0);
  assert.equal(QueueStorage.staleTitleKeys("YouTube").length, 0);
});

test("pickFreshWatchTitle waits instead of using a lagged og:title", function () {
  var { QueueStorage } = loadQueueStorage();
  var stale = ["calming white flowers"];
  assert.equal(
    QueueStorage.pickFreshWatchTitle(
      "Calming White Flowers",
      "Calming White Flowers - YouTube",
      "Elegant Blooming Flower",
      "YouTube",
      stale
    ),
    ""
  );
  assert.equal(
    QueueStorage.pickFreshWatchTitle(
      "White Floral Elegance",
      "Calming White Flowers - YouTube",
      "Elegant Blooming Flower",
      "YouTube",
      stale
    ),
    "White Floral Elegance"
  );
});

test("addItem upgrades a weak title and empty thumbnail on re-save", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.addItem({
    url: "https://www.youtube.com/watch?v=abc123",
    title: "YouTube",
    siteName: "YouTube",
    thumbnail: "",
    position: 5,
    duration: 100
  });
  var upgraded = await QueueStorage.addItem({
    url: "https://www.youtube.com/watch?v=abc123",
    title: "Deep Dive into Storage - YouTube",
    siteName: "YouTube",
    thumbnail: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    position: 5,
    duration: 100
  });
  assert.equal(upgraded.alreadyExisted, true);
  assert.equal(upgraded.item.title, "Deep Dive into Storage");
  assert.equal(upgraded.item.thumbnail, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");

  // Strong titles must not be overwritten by a later weak capture.
  var kept = await QueueStorage.addItem({
    url: "https://www.youtube.com/watch?v=abc123",
    title: "YouTube",
    siteName: "YouTube",
    position: 5,
    duration: 100
  });
  assert.equal(kept.item.title, "Deep Dive into Storage");
});

test("a stored array migrates once and keeps its list id", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  mock.store.queue_items = [{
    id: "q_old",
    url: "https://example.com/legacy",
    normalizedUrl: "https://example.com/legacy",
    title: "Legacy",
    addedAt: 1,
    watched: false
  }];
  var first = await QueueStorage.getLists();
  var second = await QueueStorage.getLists();
  assert.equal(first.length, 1);
  assert.equal(first[0].name, "Watch later");
  assert.equal(first[0].id, second[0].id);
  assert.equal(second[0].items.length, 1);
  assert.equal(second[0].items[0].title, "Legacy");
  assert.equal(second[0].items[0].id, "q_old");
  assert.equal(Array.isArray(mock.store.queue_items), false);
  assert.equal(mock.store.queue_items.lists[0].id, first[0].id);
});

test("empty storage creates one list", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var lists = await QueueStorage.getLists();
  assert.equal(lists.length, 1);
  assert.equal(lists[0].name, "Watch later");
  assert.equal(lists[0].items.length, 0);
  assert.equal(lists[0].locked, false);
});

test("the same video can exist in two lists and resume updates both", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var first = await QueueStorage.addItem({
    url: "https://example.com/shared",
    title: "Shared",
    position: 10,
    duration: 100
  });
  var other = await QueueStorage.createList("Reference");
  var second = await QueueStorage.addItem({
    url: "https://example.com/shared?utm_source=x",
    title: "Shared",
    position: 10,
    duration: 100
  }, other.id);
  assert.equal(first.alreadyExisted, false);
  assert.equal(second.alreadyExisted, false);
  assert.notEqual(first.item.id, second.item.id);
  var all = await QueueStorage.getItems();
  assert.equal(all.length, 2);

  var updated = await QueueStorage.updatePositionByUrl("https://example.com/shared", 40, 120);
  assert.equal(updated.position, 40);
  var watchLater = await QueueStorage.getListItems(first.item && (await QueueStorage.getLists())[0].id);
  var lists = await QueueStorage.getLists();
  assert.equal(lists[0].items[0].position, 40);
  assert.equal(lists[1].items[0].position, 40);
  assert.equal(lists[0].items[0].duration, 120);
  assert.equal(lists[1].items[0].duration, 120);

  var missing = await QueueStorage.updatePositionByUrl("https://example.com/nowhere", 5, 10);
  assert.equal(missing, null);
  assert.equal(watchLater[0].position, 40);
});

test("hasUrl follows the save target, and addItem can switch it", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.addItem({ url: "https://example.com/home", title: "Home" });
  var clips = await QueueStorage.createList("Clips");
  assert.equal(await QueueStorage.hasUrl("https://example.com/home"), true);
  assert.equal(await QueueStorage.hasUrl("https://example.com/home", clips.id), false);

  await QueueStorage.addItem({ url: "https://example.com/clip", title: "Clip" }, clips.id);
  assert.equal(await QueueStorage.hasUrl("https://example.com/clip"), true);
  assert.equal(await QueueStorage.hasUrl("https://example.com/home"), false);
  assert.equal(await QueueStorage.hasUrl("https://example.com/clip", clips.id), true);

  await QueueStorage.addItem({ url: "https://example.com/silent", title: "Silent" });
  var lists = await QueueStorage.getLists();
  var silentList = lists.filter(function (list) {
    return list.items.some(function (item) { return item.url === "https://example.com/silent"; });
  });
  assert.equal(silentList.length, 1);
  assert.equal(silentList[0].id, clips.id);
});

test("deleteList refuses the last list and drops that list's videos", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var lists = await QueueStorage.getLists();
  await assert.rejects(function () { return QueueStorage.deleteList(lists[0].id); });
  var extra = await QueueStorage.createList("Temporary");
  await QueueStorage.addItem({ url: "https://example.com/gone", title: "Gone" }, extra.id);
  await QueueStorage.deleteList(extra.id);
  var remaining = await QueueStorage.getLists();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, lists[0].id);
  var items = await QueueStorage.getItems();
  assert.equal(items.some(function (item) { return item.url === "https://example.com/gone"; }), false);
  var settings = await QueueStorage.getSettings();
  assert.equal(settings.saveListId, lists[0].id);
  assert.equal(settings.activeListId, lists[0].id);
});

test("a version-2 export round-trips names and items", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.addItem({ url: "https://example.com/a", title: "Alpha" });
  var reference = await QueueStorage.createList("Reference");
  await QueueStorage.addItem({ url: "https://example.com/b", title: "Beta" }, reference.id);
  var file = { version: 2, lists: await QueueStorage.getLists() };
  mock.clear();
  var result = await QueueStorage.importItems(file);
  assert.equal(result.added, 2);
  var lists = await QueueStorage.getLists();
  var names = lists.map(function (list) { return list.name; }).sort();
  assert.equal(names.join("|"), "Reference|Watch later");
  var titles = [];
  lists.forEach(function (list) {
    list.items.forEach(function (item) { titles.push(list.name + ":" + item.title); });
  });
  titles.sort();
  assert.equal(titles.join("|"), "Reference:Beta|Watch later:Alpha");
});

test("a bare array merges into the save-target list", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.addItem({ url: "https://example.com/keep", title: "Keep" });
  var clips = await QueueStorage.createList("Clips");
  await QueueStorage.addItem({ url: "https://example.com/seed", title: "Seed" }, clips.id);
  var result = await QueueStorage.importItems([
    { url: "https://example.com/imported", title: "Imported", note: "from file" }
  ]);
  assert.equal(result.added, 1);
  var lists = await QueueStorage.getLists();
  var watchLater = lists[0];
  var clipList = lists.filter(function (list) { return list.id === clips.id; })[0];
  assert.equal(watchLater.items.some(function (item) { return item.title === "Imported"; }), false);
  assert.equal(clipList.items[0].title, "Imported");
  assert.equal(clipList.items[0].note, "from file");
});

test("a lock needs a credential, and a grant covers one list", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var junk = await QueueStorage.setSettings({ lockCredentialId: 12 });
  assert.equal(junk.lockCredentialId, "");

  mock.store.queue_items = {
    lists: [{ id: "l_planted", name: "Watch later", locked: true, items: [] }]
  };
  var planted = await QueueStorage.getLists();
  assert.equal(planted[0].locked, false);
  assert.equal(mock.store.queue_items.lists[0].locked, false);

  var lists = await QueueStorage.getLists();
  await assert.rejects(function () { return QueueStorage.setListLocked(lists[0].id, true); });
  assert.equal((await QueueStorage.getLists())[0].locked, false);

  await QueueStorage.setSettings({ lockCredentialId: "cred-1" });
  var locked = await QueueStorage.setListLocked(lists[0].id, true);
  assert.equal(locked.locked, true);
  var other = await QueueStorage.createList("Open");
  await QueueStorage.addItem({
    url: "https://example.com/while-locked",
    title: "Still saved"
  }, lists[0].id);
  var hidden = await QueueStorage.getListItems(lists[0].id);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].title, "Still saved");

  await QueueStorage.grantList(lists[0].id);
  var grants = await QueueStorage.getGrants();
  var current = await QueueStorage.getLists();
  var lockedList = current.filter(function (list) { return list.id === lists[0].id; })[0];
  var openList = current.filter(function (list) { return list.id === other.id; })[0];
  assert.equal(QueueStorage.listAccessGranted(lockedList, grants), true);
  assert.equal(QueueStorage.listAccessGranted(openList, grants), true);
  await QueueStorage.setListLocked(other.id, true);
  openList = (await QueueStorage.getLists()).filter(function (list) { return list.id === other.id; })[0];
  assert.equal(QueueStorage.listAccessGranted(openList, grants), false);
  assert.equal(mock.store.queue_grants, undefined);
  assert.equal(mock.sessionStore.queue_grants[lists[0].id], true);

  await QueueStorage.setSettings({ lockCredentialId: "" });
  var cleared = await QueueStorage.getLists();
  cleared.forEach(function (list) { assert.equal(list.locked, false); });
});

test("manual order stays put when the view sort changes", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  mock.store.queue_items = {
    lists: [{
      id: "l1",
      name: "Watch later",
      locked: false,
      items: [
        { id: "a", url: "https://example.com/a", normalizedUrl: "https://example.com/a", title: "A", addedAt: 2 },
        { id: "b", url: "https://example.com/b", normalizedUrl: "https://example.com/b", title: "B", addedAt: 1 }
      ]
    }]
  };
  var read = await QueueStorage.getListItems("l1");
  assert.equal(read[0].manualOrder, 0);
  assert.equal(read[1].manualOrder, 1);
  assert.equal(mock.store.queue_items.lists[0].items[0].manualOrder, undefined);

  var added = await QueueStorage.addItem({ url: "https://example.com/c", title: "C" }, "l1");
  assert.ok(added.item.manualOrder < read[0].manualOrder);
  assert.equal((await QueueStorage.getSettings()).listSort, "newest");

  await QueueStorage.moveItem("b", "up");
  assert.equal((await QueueStorage.getSettings()).listSort, "manual");
  var ordered = await QueueStorage.getListItems("l1");
  var byId = {};
  ordered.forEach(function (item) { byId[item.id] = item.manualOrder; });
  assert.ok(byId.b < byId.a);

  var snapshot = [byId.a, byId.b, byId[added.item.id]].join(":");
  await QueueStorage.setSettings({ listSort: "oldest" });
  var after = {};
  (await QueueStorage.getListItems("l1")).forEach(function (item) { after[item.id] = item.manualOrder; });
  assert.equal([after.a, after.b, after[added.item.id]].join(":"), snapshot);
  assert.equal((await QueueStorage.getSettings()).listSort, "oldest");
});

test("locking again clears that list's unlock grant", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.setSettings({ lockCredentialId: "cred-1" });
  var id = (await QueueStorage.getLists())[0].id;
  await QueueStorage.setListLocked(id, true);
  await QueueStorage.grantList(id);
  await QueueStorage.setListLocked(id, false);
  await QueueStorage.setListLocked(id, true);
  var grants = await QueueStorage.getGrants();
  var list = (await QueueStorage.getLists())[0];
  assert.equal(grants[id], undefined);
  assert.equal(list.locked, true);
  assert.equal(QueueStorage.listAccessGranted(list, grants), false);
});

test("import puts new videos at the front of the custom order", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  var first = await QueueStorage.addItem({ url: "https://example.com/a", title: "A" });
  var second = await QueueStorage.addItem({ url: "https://example.com/b", title: "B" });
  await QueueStorage.applyOrder([first.item.id, second.item.id]);
  await QueueStorage.importItems([
    { url: "https://example.com/c", title: "C" },
    { url: "https://example.com/d", title: "D" }
  ]);
  var items = await QueueStorage.getListItems((await QueueStorage.getLists())[0].id);
  items.sort(function (a, b) { return a.manualOrder - b.manualOrder; });
  assert.equal(items.map(function (item) { return item.title; }).join("|"), "C|D|A|B");
});

test("a locked Watch later backup stays locked when this device has a credential", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.setSettings({ lockCredentialId: "cred-1" });
  await QueueStorage.importItems({
    version: 2,
    lists: [{
      id: "l_from_backup",
      name: "Watch later",
      locked: true,
      items: [{ url: "https://example.com/secret", title: "Secret" }]
    }]
  });
  var lists = await QueueStorage.getLists();
  assert.equal(lists.length, 1);
  assert.equal(lists[0].name, "Watch later");
  assert.equal(lists[0].locked, true);
  assert.equal(lists[0].items[0].title, "Secret");

  mock.clear();
  await QueueStorage.importItems({
    version: 2,
    lists: [{
      id: "l_from_backup",
      name: "Watch later",
      locked: true,
      items: [{ url: "https://example.com/secret", title: "Secret" }]
    }]
  });
  assert.equal((await QueueStorage.getLists())[0].locked, false);
});

test("clearList refuses a locked list until it is unlocked", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.setSettings({ lockCredentialId: "cred-1" });
  var id = (await QueueStorage.getLists())[0].id;
  await QueueStorage.addItem({ url: "https://example.com/a", title: "A" }, id);
  await QueueStorage.setListLocked(id, true);
  await assert.rejects(function () { return QueueStorage.clearList(id); });
  assert.equal((await QueueStorage.getListItems(id)).length, 1);

  await QueueStorage.grantList(id);
  await QueueStorage.clearList(id);
  assert.equal((await QueueStorage.getListItems(id)).length, 0);

  await QueueStorage.setListLocked(id, false);
  await QueueStorage.addItem({ url: "https://example.com/b", title: "B" }, id);
  await QueueStorage.clearList(id);
  assert.equal((await QueueStorage.getListItems(id)).length, 0);
});

test("importing a locked list revokes that list's unlock grant", async function () {
  var { QueueStorage, mock } = loadQueueStorage();
  mock.clear();
  await QueueStorage.setSettings({ lockCredentialId: "cred-1" });
  var id = (await QueueStorage.getLists())[0].id;
  await QueueStorage.grantList(id);
  await QueueStorage.importItems({
    version: 2,
    lists: [{
      id: id,
      name: "Watch later",
      locked: true,
      items: [{ url: "https://example.com/secret", title: "Secret" }]
    }]
  });
  var list = (await QueueStorage.getLists())[0];
  var grants = await QueueStorage.getGrants();
  assert.equal(list.locked, true);
  assert.equal(grants[id], undefined);
  assert.equal(QueueStorage.listAccessGranted(list, grants), false);

  await QueueStorage.grantList(id);
  await QueueStorage.importItems({
    version: 2,
    lists: [{ id: id, name: "Watch later", locked: false, items: [] }]
  });
  assert.equal((await QueueStorage.getGrants())[id], true);
});
