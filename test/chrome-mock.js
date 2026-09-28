"use strict";

/**
 * In-memory chrome.storage.local mock for Node tests.
 * Load this before storage.js so QueueStorage binds to the mock.
 */
function createChromeMock() {
  var store = Object.create(null);

  function get(keys, callback) {
    var result = {};
    var list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
    if (keys && typeof keys === "object" && !Array.isArray(keys)) {
      list = Object.keys(keys);
      list.forEach(function (k) {
        result[k] = Object.prototype.hasOwnProperty.call(store, k) ? store[k] : keys[k];
      });
    } else {
      list.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(store, k)) result[k] = store[k];
      });
    }
    setImmediate(function () { callback(result); });
  }

  function set(obj, callback) {
    Object.keys(obj).forEach(function (k) { store[k] = obj[k]; });
    setImmediate(function () { callback(); });
  }

  function clear(callback) {
    Object.keys(store).forEach(function (k) { delete store[k]; });
    setImmediate(function () { callback && callback(); });
  }

  global.chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: { get: get, set: set, clear: clear },
      onChanged: { addListener: function () {} }
    }
  };

  return {
    store: store,
    clear: function () {
      Object.keys(store).forEach(function (k) { delete store[k]; });
    }
  };
}

module.exports = { createChromeMock: createChromeMock };
