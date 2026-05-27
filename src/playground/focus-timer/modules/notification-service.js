import {
  STORAGE_GUIDE_SEEN_V1,
} from "./state-store.js";

export function createNotificationService(ctx) {
  const { state, els, utils, i18n } = ctx;
  const { formatMMSS } = utils;

  const setStatus = function (text) {
    els.statusLine.textContent = text;
  };

  const syncPermission = function () {
    const updateGuidePermissionButton = function (show) {
      if (!els.guideRequestPermissionBtn) return;
      els.guideRequestPermissionBtn.style.display = show ? "" : "none";
    };

    if (!("Notification" in window)) {
      els.permissionLabel.textContent = i18n.t("permission.unsupported");
      updateGuidePermissionButton(true);
      if (els.guidePermissionState) {
        els.guidePermissionState.textContent = i18n.t("permission.unsupportedDetail");
      }
      return;
    }
    const map = {
      default: i18n.t("permission.default"),
      granted: i18n.t("permission.granted"),
      denied: i18n.t("permission.denied"),
    };
    els.permissionLabel.textContent = map[Notification.permission] || Notification.permission;
    updateGuidePermissionButton(Notification.permission !== "granted");
    if (!els.guidePermissionState) return;
    if (Notification.permission === "granted") {
      els.guidePermissionState.textContent = i18n.t("permission.grantedDetail");
      return;
    }
    if (Notification.permission === "denied") {
      els.guidePermissionState.textContent = i18n.t("permission.deniedDetail");
      return;
    }
    els.guidePermissionState.textContent = i18n.t("permission.defaultDetail");
  };

  const hasSeenGuide = function () {
    try {
      return localStorage.getItem(STORAGE_GUIDE_SEEN_V1) === "1";
    } catch {
      return false;
    }
  };

  const markGuideSeen = function () {
    try {
      localStorage.setItem(STORAGE_GUIDE_SEEN_V1, "1");
    } catch {
      // ignore
    }
  };

  const requestNotificationPermission = function () {
    if (!("Notification" in window)) {
      syncPermission();
      return Promise.resolve("unsupported");
    }
    if (Notification.permission !== "default") {
      syncPermission();
      return Promise.resolve(Notification.permission);
    }
    return Notification.requestPermission()
      .then(function (result) {
        syncPermission();
        return result;
      })
      .catch(function () {
        syncPermission();
        return "default";
      });
  };

  const requestPermissionFromGuide = function () {
    if (!("Notification" in window)) {
      syncPermission();
      return;
    }
    if (Notification.permission === "denied") {
      window.alert(i18n.t("permission.deniedAlert"));
      syncPermission();
      return;
    }
    requestNotificationPermission().then(syncPermission);
  };

  const requestPermissionOnBoot = function () {
    if (!("Notification" in window)) {
      syncPermission();
      return;
    }
    if (Notification.permission !== "default") {
      syncPermission();
      return;
    }

    const maybeRequest = function () {
      if (Notification.permission !== "default") {
        syncPermission();
        return Promise.resolve(Notification.permission);
      }
      return requestNotificationPermission();
    };

    // Try immediately first.
    maybeRequest().then(function (result) {
      if (result !== "default") return;

      // If browser defers non-gesture prompts, retry once on first interaction.
      const retryOnce = function () {
        window.removeEventListener("pointerdown", retryOnce, true);
        window.removeEventListener("keydown", retryOnce, true);
        window.removeEventListener("touchstart", retryOnce, true);
        maybeRequest().then(syncPermission);
      };

      window.addEventListener("pointerdown", retryOnce, true);
      window.addEventListener("keydown", retryOnce, true);
      window.addEventListener("touchstart", retryOnce, true);
    });
  };

  const updateBadge = function () {
    if (typeof navigator.setAppBadge !== "function") return;
    const remain = Math.max(0, Math.ceil(state.timer.remainingMs / 60000));
    if (state.timer.status === "running" && remain > 0) {
      navigator.setAppBadge(remain).catch(function () {});
      return;
    }
    if (typeof navigator.clearAppBadge === "function") {
      navigator.clearAppBadge().catch(function () {});
    }
  };

  const updateTitleAndFavicon = function () {
    const remain = formatMMSS(state.timer.remainingMs);
    const baseTitle = i18n.t("app.title");
    document.title = state.timer.status === "running" ? (remain + " · " + baseTitle) : baseTitle;

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;

    ctx2.fillStyle = "#d7c1b0";
    if (typeof ctx2.roundRect === "function") {
      ctx2.beginPath();
      ctx2.roundRect(2, 2, 60, 60, 12);
      ctx2.fill();
    } else {
      ctx2.fillRect(2, 2, 60, 60);
    }

    ctx2.fillStyle = "#2b2622";
    ctx2.font = "700 20px Avenir";
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    const short = remain.length > 5 ? remain.slice(-5) : remain;
    ctx2.fillText(short, 32, 35);

    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = canvas.toDataURL("image/png");
  };

  const beep = function () {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    [0, 0.22, 0.44].forEach(function (offset) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = 780;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ac.destination);
      const start = ac.currentTime + offset;
      osc.start(start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.stop(start + 0.15);
    });
  };

  const notify = function (title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, { body: body, tag: "focus-timer", renotify: true });
      n.onclick = function () { window.focus(); n.close(); };
    }
    beep();
  };

  return {
    setStatus,
    syncPermission,
    hasSeenGuide,
    markGuideSeen,
    requestNotificationPermission,
    requestPermissionOnBoot,
    requestPermissionFromGuide,
    updateBadge,
    updateTitleAndFavicon,
    notify,
  };
}
