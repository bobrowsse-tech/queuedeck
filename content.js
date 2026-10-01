(function () {
  "use strict";

  // Never run inside iframes/ads — only the top-level page.
  if (window.top !== window.self) return;

  var settings = null;
  var trackedVideo = null;
  var watchedSeconds = 0;
  var tickCount = 0;
  var tickTimer = null;
  var lastUrl = location.href;
  var toastShownForUrl = null;
  var dismissedForUrl = null;
  var savedForUrl = null;
  var hostEl = null;
  var shadow = null;
  // Bumped on every navigation so an in-flight hasUrl reply cannot show a
  // card for a page the viewer has already left.
  var promptGeneration = 0;
  var promptInFlight = false;
  // Last title we trusted for lastUrl. staleTitles is replaced on each
  // navigation with only that title.
  var committedTitle = "";
  var staleTitles = [];

  QueueStorage.getSettings().then(function (s) {
    settings = s;
    boot();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes[QueueStorage.KEYS.SETTINGS]) {
      settings = Object.assign({}, QueueStorage.DEFAULT_SETTINGS, changes[QueueStorage.KEYS.SETTINGS].newValue || {});
    }
  });

  function boot() {
    if (location.href !== lastUrl) noteNavigation();
    scanForVideo();
    var mo = new MutationObserver(debounce(scanForVideo, 500));
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(pollForNavigation, 1000);
    document.addEventListener("yt-navigate-finish", onNavigateFinish);
    window.addEventListener("popstate", onPopState);
  }

  function onNavigateFinish() {
    if (location.href !== lastUrl) noteNavigation();
  }

  function onPopState() {
    if (location.href !== lastUrl) noteNavigation();
  }

  function pollForNavigation() {
    if (location.href !== lastUrl) noteNavigation();
  }

  function noteNavigation() {
    if (location.href === lastUrl) return;
    // Replace, don't append. Only the title trusted while the previous URL
    // was current is stale. A heading read at navigate-start may already
    // be the next video, so it is not copied into this list.
    staleTitles = QueueStorage.staleTitleKeys(committedTitle);
    committedTitle = "";
    lastUrl = location.href;
    resetTracking();
    scanForVideo();
  }

  function resetTracking() {
    promptGeneration += 1;
    promptInFlight = false;
    watchedSeconds = 0;
    tickCount = 0;
    toastShownForUrl = null;
    dismissedForUrl = null;
    savedForUrl = null;
    detachVideo();
    removeToast();
  }

  function scanForVideo() {
    var videos = Array.prototype.slice.call(document.querySelectorAll("video"));
    if (videos.length === 0) {
      detachVideo();
      return;
    }
    // Prefer the largest visible video on the page (main player over ads/thumbnails).
    var best = videos.reduce(function (a, b) {
      return rectArea(b) > rectArea(a) ? b : a;
    });
    if (best !== trackedVideo) {
      attachVideo(best);
    }
  }

  function rectArea(el) {
    var r = el.getBoundingClientRect();
    return Math.max(0, r.width) * Math.max(0, r.height);
  }

  function detachVideo() {
    if (trackedVideo) {
      trackedVideo.removeEventListener("play", startTicking);
      trackedVideo.removeEventListener("pause", stopTicking);
      trackedVideo.removeEventListener("ended", stopTicking);
    }
    stopTicking();
    trackedVideo = null;
  }

  function attachVideo(video) {
    if (trackedVideo === video) return;
    detachVideo();
    trackedVideo = video;
    video.addEventListener("play", startTicking);
    video.addEventListener("pause", stopTicking);
    video.addEventListener("ended", stopTicking);
    if (!video.paused) startTicking();
  }

  function startTicking() {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      if (location.href !== lastUrl) {
        noteNavigation();
        return;
      }
      watchedSeconds += 1;
      tickCount += 1;
      rememberCommittedTitle();
      maybePrompt();
      if (tickCount % 10 === 0 && trackedVideo) {
        QueueStorage.updatePositionByUrl(location.href, trackedVideo.currentTime, trackedVideo.duration || 0);
      }
    }, 1000);
  }

  function stopTicking() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function maybePrompt() {
    if (!settings || !settings.popupEnabled) return;
    if (location.href !== lastUrl) {
      noteNavigation();
      return;
    }
    var url = location.href;
    if (toastShownForUrl === url || dismissedForUrl === url || savedForUrl === url) return;
    if (watchedSeconds < settings.popupDelaySeconds) return;
    if (promptInFlight) return;
    if (!freshTitle()) return;

    promptInFlight = true;
    var generation = promptGeneration;
    QueueStorage.hasUrl(url).then(function (already) {
      if (generation !== promptGeneration || location.href !== url) return;
      promptInFlight = false;
      if (already) {
        savedForUrl = url;
        return;
      }
      var meta = getVideoMeta();
      if (meta.titleStale || meta.url !== url) return;
      showToast(meta);
      toastShownForUrl = url;
    }, function () {
      if (generation === promptGeneration) promptInFlight = false;
    });
  }

  // ---- Metadata extraction ----

  function metaContent(selector) {
    var el = document.querySelector(selector);
    return el ? el.getAttribute("content") : "";
  }

  function visiblePlayerTitle() {
    var selectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "h1.ytd-video-primary-info-renderer",
      "#title h1 yt-formatted-string",
      "h1.title",
      ".ytp-title-link"
    ];
    var i;
    for (i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      var text = el && (el.textContent || "").trim();
      if (text) return text;
    }
    return "";
  }

  function siteNameOf() {
    return metaContent('meta[property="og:site_name"]') || location.hostname.replace(/^www\./, "");
  }

  function titleCandidates() {
    // Only the watch heading, tab title, and og:title. Other text on the
    // page (ads, recommendations) is not a title for this video.
    return [
      visiblePlayerTitle(),
      document.title,
      metaContent('meta[property="og:title"]')
    ];
  }

  function freshTitle() {
    var candidates = titleCandidates();
    return QueueStorage.pickFreshWatchTitle(
      candidates[0],
      candidates[1],
      candidates[2],
      siteNameOf(),
      staleTitles
    );
  }

  function rememberCommittedTitle() {
    var fresh = freshTitle();
    if (fresh) committedTitle = fresh;
  }

  function getVideoMeta() {
    var ogImage = metaContent('meta[property="og:image"]');
    var siteName = siteNameOf();
    // YouTube SPA navigations update the player immediately and the heading
    // later. A title that still matches the previous video is not usable yet.
    var fresh = freshTitle();
    if (fresh) committedTitle = fresh;
    var title = fresh || QueueStorage.pickBestTitle(titleCandidates(), siteName);
    return {
      url: location.href,
      title: title,
      titleStale: !fresh,
      thumbnail: ogImage || "",
      siteName: siteName,
      position: trackedVideo ? trackedVideo.currentTime || 0 : 0,
      duration: trackedVideo ? trackedVideo.duration || 0 : 0
    };
  }

  // ---- Messaging (popup asks "is there a video here?") ----

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "GET_VIDEO_INFO") {
      scanForVideo();
      var hasVideo = !!document.querySelector("video");
      sendResponse(hasVideo ? getVideoMeta() : null);
    }
    return true;
  });

  // ---- Toast UI (isolated in a shadow root) ----

  function removeToast() {
    if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    hostEl = null;
    shadow = null;
  }

  function showToast(meta) {
    removeToast();

    hostEl = document.createElement("div");
    hostEl.style.all = "initial";
    hostEl.style.position = "fixed";
    hostEl.style.zIndex = "2147483647";
    hostEl.style.bottom = "20px";
    hostEl.style.right = "20px";
    document.documentElement.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: "open" });

    var style = document.createElement("style");
    style.textContent = TOAST_CSS;
    shadow.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "q-toast";
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Save video to QueueDeck");
    wrap.innerHTML =
      '<div class="q-row q-head">' +
        '<span class="q-dot" aria-hidden="true"></span>' +
        '<span class="q-eyebrow">Still watching?</span>' +
        '<button type="button" class="q-icon-btn" data-action="close" aria-label="Dismiss">\u2715</button>' +
      "</div>" +
      '<p class="q-title"></p>' +
      '<p class="q-site"></p>' +
      '<div class="q-row q-actions">' +
        '<button type="button" class="q-btn q-btn-primary" data-action="save">Save video</button>' +
        '<button type="button" class="q-btn q-btn-ghost" data-action="dismiss">Not now</button>' +
      "</div>" +
      '<button type="button" class="q-settings-link" data-action="settings">Adjust or turn off this prompt</button>' +
      '<div class="q-live" aria-live="polite"></div>';

    wrap.querySelector(".q-title").textContent = meta.title;
    wrap.querySelector(".q-site").textContent = meta.siteName;
    shadow.appendChild(wrap);

    wrap.addEventListener("click", function (e) {
      var action = e.target.getAttribute("data-action");
      if (!action) return;

      if (action === "save") {
        QueueStorage.addItem(meta).then(function () {
          savedForUrl = meta.url;
          announce(wrap, "Saved to QueueDeck.");
          collapseAfterDelay();
        });
      } else if (action === "dismiss") {
        dismissedForUrl = meta.url;
        removeToast();
      } else if (action === "close") {
        dismissedForUrl = meta.url;
        removeToast();
      } else if (action === "settings") {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
        removeToast();
      }
    });
  }

  function collapseAfterDelay() {
    var el = hostEl;
    setTimeout(function () {
      if (el === hostEl) removeToast();
    }, 1600);
  }

  function announce(wrap, text) {
    var actions = wrap.querySelector(".q-actions");
    var settingsLink = wrap.querySelector(".q-settings-link");
    if (actions) actions.remove();
    if (settingsLink) settingsLink.remove();
    var live = wrap.querySelector(".q-live");
    live.textContent = text;
    var titleEl = wrap.querySelector(".q-title");
    titleEl.insertAdjacentHTML("afterend", '<p class="q-confirm">\u2713 ' + text + "</p>");
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  var TOAST_CSS = [
    ":host, * { box-sizing: border-box; }",
    ".q-toast {",
    "  all: initial;",
    "  display: block;",
    "  width: 300px;",
    "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;",
    "  background: #1D2129;",
    "  color: #EDEFF2;",
    "  border: 1px solid #333A46;",
    "  border-radius: 10px;",
    "  padding: 14px 14px 12px;",
    "  box-shadow: 0 8px 30px rgba(0,0,0,.45);",
    "  animation: q-in .22s ease-out;",
    "}",
    "@media (prefers-reduced-motion: reduce) { .q-toast { animation: none; } }",
    "@keyframes q-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }",
    ".q-row { display: flex; align-items: center; }",
    ".q-head { justify-content: space-between; margin-bottom: 8px; }",
    ".q-dot { width: 8px; height: 8px; border-radius: 50%; background: #F2A93B; margin-right: 8px; flex-shrink: 0; }",
    ".q-eyebrow { font-size: 12px; color: #8B93A1; flex: 1; }",
    ".q-icon-btn { all: unset; cursor: pointer; color: #8B93A1; font-size: 13px; padding: 4px; line-height: 1; border-radius: 4px; }",
    ".q-icon-btn:hover { color: #EDEFF2; }",
    ".q-icon-btn:focus-visible { outline: 2px solid #F2A93B; outline-offset: 2px; }",
    ".q-title { font-size: 14px; font-weight: 600; line-height: 1.35; margin: 0 0 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
    ".q-site { font-size: 12px; color: #8B93A1; margin: 0 0 12px; }",
    ".q-confirm { font-size: 13px; color: #4FD1C5; margin: 4px 0 0; }",
    ".q-actions { gap: 8px; margin-bottom: 8px; }",
    ".q-btn { all: unset; cursor: pointer; font-size: 13px; font-weight: 600; text-align: center; padding: 8px 12px; border-radius: 7px; flex: 1; }",
    ".q-btn-primary { background: #F2A93B; color: #14171C; }",
    ".q-btn-primary:hover { background: #F7BB60; }",
    ".q-btn-ghost { background: transparent; color: #C4CAD3; border: 1px solid #333A46; }",
    ".q-btn-ghost:hover { border-color: #4A5262; }",
    ".q-btn:focus-visible { outline: 2px solid #F2A93B; outline-offset: 2px; }",
    ".q-settings-link { all: unset; cursor: pointer; display: block; font-size: 11px; color: #6B7280; text-decoration: underline; }",
    ".q-settings-link:hover { color: #8B93A1; }",
    ".q-settings-link:focus-visible { outline: 2px solid #F2A93B; outline-offset: 2px; }",
    ".q-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }"
  ].join("\n");
})();
