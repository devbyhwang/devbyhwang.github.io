import {
  BACKUP_SCHEMA_V1,
  BUILTIN_PRESETS,
  CX,
  CY,
  MAX_USER_PRESETS,
  PHASE_META,
  RADIUS,
  createStore,
} from "./modules/state-store.js";
import * as timeUtils from "./modules/time-utils.js";
import { getElements } from "./modules/dom-elements.js";
import { createNotificationService } from "./modules/notification-service.js";
import { createInsightsService } from "./modules/insights-service.js";
import { createOverlayController } from "./modules/overlay-controller.js";
import { createStorageService } from "./modules/storage-service.js";
import { createTimerMachine } from "./modules/timer-machine.js";
import { createDialUi } from "./modules/dial-ui.js";
import { createDisplayLabelService } from "./modules/display-label-service.js";
import { createPresetService } from "./modules/preset-service.js";

(function () {
  const store = createStore();
  const els = getElements();

  const ctx = {
    store,
    state: store.state,
    els,
    utils: timeUtils,
    PHASE_META,
    BUILTIN_PRESETS,
    MAX_USER_PRESETS,
    BACKUP_SCHEMA_V1,
    RADIUS,
    CX,
    CY,
    services: {},
    timer: null,
    storage: null,
    render: null,
    setStatus: function () {},
    getActiveLabel: function () { return "Custom"; },
    getPresetById: function () { return null; },
    getFallbackPreset: function () { return null; },
    getPhaseDurationMs: function () { return 25 * 60 * 1000; },
    stopTicker: function () {},
    tick: function () {},
    recoverRunningState: function () {},
    renderPresetList: function () {},
  };

  ctx.services.insights = createInsightsService(ctx);
  ctx.services.notification = createNotificationService(ctx);
  ctx.setStatus = ctx.services.notification.setStatus;

  ctx.timer = createTimerMachine(ctx);
  ctx.getActiveLabel = ctx.timer.getActiveLabel;
  ctx.getPresetById = ctx.timer.getPresetById;
  ctx.getFallbackPreset = ctx.timer.getFallbackPreset;
  ctx.getPhaseDurationMs = ctx.timer.getPhaseDurationMs;
  ctx.stopTicker = ctx.timer.stopTicker;
  ctx.tick = ctx.timer.tick;
  ctx.recoverRunningState = ctx.timer.recoverRunningState;

  ctx.storage = createStorageService(ctx);
  ctx.services.storage = ctx.storage;

  ctx.services.overlay = createOverlayController(ctx);
  ctx.services.dial = createDialUi(ctx);
  ctx.services.display = createDisplayLabelService(ctx);
  ctx.services.preset = createPresetService(ctx);
  ctx.renderPresetList = ctx.services.preset.renderPresetList;

  const syncSettingInputs = function () {
    const inputPairs = [
      [els.presetLabelTextInput, ctx.getActiveLabel()],
      [els.focusMinInput, ctx.state.settings.focusMin],
      [els.shortMinInput, ctx.state.settings.shortBreakMin],
      [els.longMinInput, ctx.state.settings.longBreakMin],
      [els.longEveryInput, ctx.state.settings.longBreakEvery],
      [els.maxPomodorosInput, ctx.state.settings.maxPomodoros],
    ];

    inputPairs.forEach(function (entry) {
      const input = entry[0];
      const value = entry[1];
      if (document.activeElement !== input) input.value = String(value);
    });

    ctx.services.display.syncDisplayInputs();
  };

  const render = function () {
    const meta = PHASE_META[ctx.state.timer.phase] || PHASE_META.focus;
    document.documentElement.style.setProperty("--phase", meta.phaseColor || "#ebe4dc");

    els.phaseTitle.textContent = ctx.getActiveLabel();
    els.cycleLabel.textContent = ctx.state.timer.completedFocusCount + " / " + ctx.state.settings.maxPomodoros + " 포모도로 완료";

    ctx.services.display.renderDisplayLabels();
    syncSettingInputs();

    ctx.services.dial.updateDial();
    ctx.services.insights.renderInsights();
    ctx.services.notification.updateTitleAndFavicon();
    ctx.services.notification.updateBadge();
  };

  ctx.render = render;

  const bindCoreControls = function () {
    els.trendScopePresetBtn.addEventListener("click", function () { ctx.services.insights.setTrendScope("preset"); });
    els.trendScopeAllBtn.addEventListener("click", function () { ctx.services.insights.setTrendScope("all"); });

    els.openGuideBtn.addEventListener("click", ctx.services.overlay.openGuide);
    els.closeGuideBtn.addEventListener("click", function () { ctx.services.overlay.closeGuide(true); });
    els.guideBackdrop.addEventListener("click", function () { ctx.services.overlay.closeGuide(true); });
    els.guideAcknowledgeBtn.addEventListener("click", function () { ctx.services.overlay.closeGuide(true); });
    els.guideRequestPermissionBtn.addEventListener("click", ctx.services.notification.requestPermissionFromGuide);

    els.openInsightsBtn.addEventListener("click", ctx.services.overlay.openInsights);
    els.closeInsightsBtn.addEventListener("click", ctx.services.overlay.closeInsights);
    els.insightsBackdrop.addEventListener("click", ctx.services.overlay.closeInsights);

    els.openSettingsBtn.addEventListener("click", ctx.services.overlay.openSheet);
    els.closeSettingsBtn.addEventListener("click", ctx.services.overlay.closeSheet);
    els.sheetBackdrop.addEventListener("click", ctx.services.overlay.closeSheet);

    ctx.services.dial.bindDialEvents();
    ctx.services.display.bindBottomLabelEditing();
    ctx.services.display.bindAutoSaveSettings();
    ctx.services.preset.bindPresetEvents();

    els.exportBackupBtn.addEventListener("click", function () {
      ctx.storage.downloadBackupFile();
    });

    els.importBackupBtn.addEventListener("click", function () {
      if (ctx.state.timer.status === "running") {
        const ok = window.confirm("실행 중입니다. 백업을 불러오면 현재 상태가 덮어써집니다. 계속할까요?");
        if (!ok) return;
      }
      els.backupFileInput.click();
    });

    els.backupFileInput.addEventListener("change", function (event) {
      const input = event.target;
      const file = input && input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(String(reader.result || "{}"));
          ctx.storage.applyBackupPayload(parsed);
        } catch {
          ctx.setStatus("백업 파일 형식이 올바르지 않습니다");
        } finally {
          input.value = "";
        }
      };
      reader.onerror = function () {
        ctx.setStatus("백업 파일을 읽지 못했습니다");
        input.value = "";
      };
      reader.readAsText(file);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      ctx.services.overlay.closeSheet();
      ctx.services.overlay.closeInsights();
      ctx.services.overlay.closeGuide(true);
    });

    window.addEventListener("beforeunload", function () {
      ctx.services.dial.clearTapToggleTimer();
      ctx.storage.persistState();
      ctx.storage.persistPresets();
      ctx.storage.persistHiddenBuiltins();
      ctx.storage.persistFocusHistory();
    });
  };

  const boot = function () {
    ctx.services.dial.drawTicks();
    ctx.services.notification.syncPermission();
    ctx.storage.loadUserPresets();
    ctx.storage.loadHiddenBuiltins();
    ctx.storage.loadFocusHistory();
    ctx.storage.migrateV1IfNeeded();
    ctx.storage.loadV2State();

    if (!ctx.getPresetById(ctx.state.timer.activePresetId)) {
      const fallback = ctx.getFallbackPreset();
      ctx.state.timer.activePresetId = fallback ? fallback.id : null;
    }

    ctx.state.timer.phaseDurationMs = ctx.getPhaseDurationMs(ctx.state.timer.phase);

    if (ctx.state.timer.status === "idle") {
      ctx.state.timer.remainingMs = ctx.state.timer.phaseDurationMs;
    }

    ctx.recoverRunningState();

    ctx.renderPresetList();
    render();
    bindCoreControls();

    if (!ctx.services.notification.hasSeenGuide()) {
      ctx.services.overlay.openGuide();
      if ("Notification" in window && Notification.permission === "default") {
        window.setTimeout(function () {
          ctx.services.notification.requestNotificationPermission().then(ctx.services.notification.syncPermission);
        }, 120);
      }
    }

    if (ctx.state.timer.status === "running") {
      ctx.stopTicker();
      ctx.store.tickerId = window.setInterval(ctx.tick, 200);
    }
  };

  try {
    boot();
  } catch (error) {
    console.error("Focus Timer bootstrap failed:", error);
    ctx.setStatus("초기화 중 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.");
  }
})();
