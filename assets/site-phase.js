(function () {
  "use strict";

  var config = window.QD_PHOTO_PHASE_CONFIG || {};
  var phaseMessages = {
    1: "開催案内を公開しました（9月1日より受付開始）",
    2: "作品投稿受付中！（9月20日まで）",
    3: "投票準備中...",
    4: "投票受付中！（9月30日まで）",
    5: "集計作業中...",
    6: "受賞作品を公開中です！"
  };
  var enabledByPhase = {
    headerTop: [1, 2, 3, 4, 5, 6],
    headerMypage: [2, 3, 4, 5, 6],
    menuSubmit: [2],
    menuEntries: [4, 5, 6],
    menuResults: [6],
    vote: [4]
  };
  var statusKeyByLink = {
    menuEntries: "galleryStatus",
    vote: "voteStatus",
    menuResults: "resultStatus"
  };

  renderPhase();
  refreshPhaseConfig();
  document.documentElement.classList.remove("phase-pending");

  function refreshPhaseConfig() {
    if (typeof window.fetch !== "function") return;
    var url = "assets/site-phase-config.js?refresh=" + Date.now();
    window.fetch(url, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Phase config request failed: " + response.status);
        return response.text();
      })
      .then(function (source) {
        var freshConfig = parsePhaseConfig(source);
        if (!freshConfig) return;
        config = freshConfig;
        window.QD_PHOTO_PHASE_CONFIG = Object.freeze(freshConfig);
        renderPhase();
      })
      .catch(function () {
        // Keep the initially loaded config when the refresh request fails.
      });
  }

  function parsePhaseConfig(source) {
    var prefix = "window.QD_PHOTO_PHASE_CONFIG = Object.freeze(";
    var text = String(source || "").trim();
    if (text.indexOf(prefix) !== 0 || text.slice(-2) !== ");") return null;
    try {
      return JSON.parse(text.slice(prefix.length, -2));
    } catch (error) {
      return null;
    }
  }

  function renderPhase() {
    var now = new Date();
    var phase = resolvePhase(config, now);
    renderEnvironmentBanner();
    updateDeploymentLinks();
    updatePhaseLinkLabels(phase);
    document.documentElement.dataset.sitePhase = String(phase);
    document.querySelectorAll("[data-phase-link]").forEach(function (element) {
      var key = String(element.dataset.phaseLink || "");
      var enabled = (enabledByPhase[key] || []).indexOf(phase) !== -1 && statusAllowsLink(config, key, now);
      setLinkEnabled(element, enabled, phase);
    });
    document.querySelectorAll("[data-phase-status]").forEach(function (element) {
      element.textContent = phaseMessages[phase] || "";
    });
  }

  function updatePhaseLinkLabels(phase) {
    if (phase !== 4 && phase !== 5 && phase !== 6) return;
    var label = phase === 4 ? "全作品を見る／投票する" : "全作品を見る";
    document.querySelectorAll('[data-phase-link="menuEntries"]').forEach(function (element) {
      element.textContent = label;
    });
  }

  function renderEnvironmentBanner() {
    if (!document.body || typeof document.createElement !== "function") return;
    var environment = String(config.environment || "production").toLowerCase();
    var existing = document.getElementById("testEnvironmentBanner");
    if (environment === "production") {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    var banner = existing || document.createElement("div");
    banner.id = "testEnvironmentBanner";
    banner.className = "test-environment-banner";
    banner.setAttribute("role", "status");
    banner.textContent = String(config.environmentLabel || "TEST環境");
    if (!existing) document.body.insertBefore(banner, document.body.firstChild);
  }

  function updateDeploymentLinks() {
    var voteUrl = String(config.voteWebAppUrl || "").trim();
    var appBaseUrl = voteUrl.split("?")[0];
    if (!appBaseUrl) return;
    var pageByPhaseLink = {
      headerMypage: "mypage",
      menuSubmit: "submit",
      vote: "vote"
    };
    Object.keys(pageByPhaseLink).forEach(function (key) {
      document.querySelectorAll('[data-phase-link="' + key + '"]').forEach(function (element) {
        element.setAttribute("href", appBaseUrl + "?page=" + encodeURIComponent(pageByPhaseLink[key]));
      });
    });
    document.querySelectorAll("[data-app-page]").forEach(function (element) {
      element.setAttribute("href", appBaseUrl + "?page=" + encodeURIComponent(String(element.dataset.appPage || "home")));
    });
  }

  function statusAllowsLink(values, linkKey, now) {
    var statusKey = statusKeyByLink[linkKey];
    if (!statusKey || !Object.prototype.hasOwnProperty.call(values, statusKey)) return true;
    var status = String(values[statusKey] || "").toLowerCase();
    if (status === "published") return true;
    if (statusKey === "resultStatus" && status === "scheduled") {
      now = now || new Date();
      var publishAt = parseTime(values.resultPublishAt);
      return publishAt != null && now.getTime() >= publishAt;
    }
    return false;
  }

  function resolvePhase(values, now) {
    return clampPhase(values.manualPhase);
  }

  function parseTime(value) {
    if (!value) return null;
    var timestamp = Date.parse(String(value));
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function clampPhase(value) {
    var number = Number(value);
    return number >= 1 && number <= 6 ? Math.floor(number) : 1;
  }

  function setLinkEnabled(element, enabled, phase) {
    element.classList.toggle("disabled", !enabled);
    if (!element.dataset.phaseGuardBound) {
      element.addEventListener("click", preventDisabledNavigation);
      element.dataset.phaseGuardBound = "true";
    }
    if (enabled) {
      element.removeAttribute("aria-disabled");
      element.removeAttribute("tabindex");
      element.removeAttribute("title");
      return;
    }
    element.setAttribute("aria-disabled", "true");
    element.setAttribute("tabindex", "-1");
    element.setAttribute("title", disabledReason(element.dataset.phaseLink, phase));
  }

  function preventDisabledNavigation(event) {
    if (event.currentTarget.classList.contains("disabled")) event.preventDefault();
  }

  function disabledReason(key, currentPhase) {
    if (!statusAllowsLink(config, key)) {
      if (key === "menuEntries") return "作品一覧は現在非公開です。";
      if (key === "menuResults") return "結果ページは現在非公開です。";
      if (key === "vote") return "投票フォームは現在非公開です。";
    }
    if (key === "menuSubmit") return currentPhase < 2 ? "作品受付開始前です。" : "作品受付は終了しました。";
    if (key === "menuEntries") return "作品一覧はまだ公開されていません。";
    if (key === "menuResults") return "結果はまだ発表されていません。";
    if (key === "vote") return currentPhase < 4 ? "投票開始前です。" : "投票受付は終了しました。";
    return "現在は利用できません。";
  }
})();
