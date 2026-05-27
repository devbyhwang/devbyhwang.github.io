import {
  BASE_TITLE,
  STORAGE_GUIDE_SEEN_V1,
} from "./state-store.js";

export function createNotificationService(ctx) {
  const { state, els, utils } = ctx;
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
      els.permissionLabel.textContent = "미지원";
      updateGuidePermissionButton(true);
      if (els.guidePermissionState) {
        els.guidePermissionState.textContent = "이 브라우저는 알림 기능을 지원하지 않습니다.";
      }
      return;
    }
    const map = {
      default: "요청 전",
      granted: "허용됨",
      denied: "차단됨",
    };
    els.permissionLabel.textContent = map[Notification.permission] || Notification.permission;
    updateGuidePermissionButton(Notification.permission !== "granted");
    if (!els.guidePermissionState) return;
    if (Notification.permission === "granted") {
      els.guidePermissionState.textContent = "현재 알림 권한이 허용되어 있습니다.";
      return;
    }
    if (Notification.permission === "denied") {
      els.guidePermissionState.textContent = "알림 권한이 차단되어 있습니다. 브라우저 사이트 설정에서 다시 허용해 주세요.";
      return;
    }
    els.guidePermissionState.textContent = "알림 권한이 아직 요청 전입니다. 아래 버튼으로 권한 요청을 진행해 주세요.";
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
      window.alert("알림 권한이 차단되어 있습니다. 브라우저 사이트 설정에서 알림을 허용해 주세요.");
      syncPermission();
      return;
    }
    requestNotificationPermission().then(syncPermission);
  };

  const updateBadge = function () {
    if (typeof navigator.setAppBadge !== "function") return;
    const remain = Math.max(0, Math.ceil(state.timer.remainingMs / 1000));
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
    document.title = state.timer.status === "running" ? (remain + " · " + BASE_TITLE) : BASE_TITLE;

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
    requestPermissionFromGuide,
    updateBadge,
    updateTitleAndFavicon,
    notify,
  };
}
