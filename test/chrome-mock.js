"use strict";

/**
 * In-memory chrome.storage.local mock for Node tests.
 * Load this before storage.js so QueueStorage binds to the mock.
 * Session storage is a separate area so unlock grants never land in local.
 */
function createChromeMock() {
  var store = Object.create(null);
  var sessionStore = Object.create(null);

  function readArea(area, keys, callback) {
    var result = {};
    var list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
    if (keys && typeof keys === "object" && !Array.isArray(keys)) {
      list = Object.keys(keys);
      list.forEach(function (k) {
        result[k] = Object.prototype.hasOwnProperty.call(area, k) ? area[k] : keys[k];
      });
    } else {
      list.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(area, k)) result[k] = area[k];
      });
    }
    setImmediate(function () { callback(result); });
  }

  function get(keys, callback) {
    readArea(store, keys, callback);
  }

  function set(obj, callback) {
    Object.keys(obj).forEach(function (k) { store[k] = obj[k]; });
    setImmediate(function () { callback(); });
  }

  function sessionGet(keys, callback) {
    readArea(sessionStore, keys, callback);
  }

  function sessionSet(obj, callback) {
    Object.keys(obj).forEach(function (k) { sessionStore[k] = obj[k]; });
    setImmediate(function () { callback(); });
  }

  function clear(callback) {
    Object.keys(store).forEach(function (k) { delete store[k]; });
    Object.keys(sessionStore).forEach(function (k) { delete sessionStore[k]; });
    setImmediate(function () { callback && callback(); });
  }

  global.chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: { get: get, set: set, clear: clear },
      session: { get: sessionGet, set: sessionSet },
      onChanged: { addListener: function () {} }
    }
  };

  return {
    store: store,
    sessionStore: sessionStore,
    clear: function () {
      Object.keys(store).forEach(function (k) { delete store[k]; });
      Object.keys(sessionStore).forEach(function (k) { delete sessionStore[k]; });
    }
  };
}

module.exports = { createChromeMock: createChromeMock };
