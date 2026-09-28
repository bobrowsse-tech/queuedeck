"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");

// Mirrors popup.js setThumbBackground URL acceptance rules (no DOM needed).
function acceptThumbUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    var u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

test("absolute https thumbnail is accepted", function () {
  assert.equal(
    acceptThumbUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg"),
    "https://i.ytimg.com/vi/abc/hqdefault.jpg"
  );
});

test("relative thumbnail path is rejected", function () {
  assert.equal(acceptThumbUrl("/image.jpg"), null);
  assert.equal(acceptThumbUrl("image.jpg"), null);
});

test("non-http schemes are rejected", function () {
  assert.equal(acceptThumbUrl("javascript:alert(1)"), null);
  assert.equal(acceptThumbUrl("data:image/png;base64,aaa"), null);
});
