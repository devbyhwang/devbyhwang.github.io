import {
  BACKUP_SCHEMA_V1,
  MAX_USER_PRESETS,
  STORAGE_FOCUS_HISTORY_V1,
  STORAGE_PRESETS_V1,
  STORAGE_PRESET_HIDDEN_BUILTINS_V1,
  STORAGE_STATE_V1,
  STORAGE_STATE_V2,
} from "./state-store.js";

export function createStorageService(ctx) {
  const { state, store, utils, i18n } = ctx;
  const { clampInt, two, normalizeLabel, normalizeTodoText, normalizeDisplayMode } = utils;

  const persistState = function () {
    try {
      localStorage.setItem(STORAGE_STATE_V2, JSON.stringify({
        settings: state.settings,
        timer: state.timer,
        display: state.display,
        behavior: state.behavior,
      }));
    } catch {
      // ignore
    }
  };

  const persistPresets = function () {
    try {
      localStorage.setItem(STORAGE_PRESETS_V1, JSON.stringify(store.userPresets));
    } catch {
      // ignore
    }
  };

  const persistHiddenBuiltins = function () {
    try {
      localStorage.setItem(STORAGE_PRESET_HIDDEN_BUILTINS_V1, JSON.stringify(store.hiddenBuiltinPresetIds));
    } catch {
      // ignore
    }
  };

  const persistFocusHistory = function () {
    try {
      localStorage.setItem(STORAGE_FOCUS_HISTORY_V1, JSON.stringify(store.sessionHistory));
    } catch {
      // ignore
    }
  };

  const makeBackupPayload = function () {
    return {
      schema: BACKUP_SCHEMA_V1,
      exportedAt: new Date().toISOString(),
      stateV2: {
        settings: state.settings,
        timer: state.timer,
        display: state.display,
        behavior: state.behavior,
      },
      presetsV1: store.userPresets,
      hiddenBuiltinsV1: store.hiddenBuiltinPresetIds,
      focusHistoryV1: store.sessionHistory,
    };
  };

  const downloadBackupFile = function () {
    try {
      const payload = makeBackupPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const filename = "focus-timer-backup-" + now.getFullYear() + two(now.getMonth() + 1) + two(now.getDate()) + "-" + two(now.getHours()) + two(now.getMinutes()) + ".json";
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      ctx.setStatus(i18n.t("status.backupSaved"));
    } catch {
      ctx.setStatus(i18n.t("status.backupSaveFailed"));
    }
  };

  const sanitizeUserPresets = function (presets) {
    if (!Array.isArray(presets)) return [];
    return presets
      .filter(function (p) { return p && typeof p === "object" && typeof p.id === "string"; })
      .map(function (p) {
        return {
          id: String(p.id),
          name: String(p.name || i18n.t("presets.custom")).slice(0, 30),
          focusMin: clampInt(p.focusMin, 1, 180),
          shortBreakMin: clampInt(p.shortBreakMin, 1, 60),
          longBreakMin: clampInt(p.longBreakMin, 1, 120),
          longBreakEvery: clampInt(p.longBreakEvery, 1, 12),
          maxPomodoros: clampInt(p.maxPomodoros, 1, 24),
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
          builtin: false,
        };
      })
      .slice(0, MAX_USER_PRESETS);
  };

  const sanitizeHiddenBuiltins = function (ids) {
    if (!Array.isArray(ids)) return [];
    const builtinIdSet = new Set(ctx.BUILTIN_PRESETS.map(function (preset) { return preset.id; }));
    return ids
      .filter(function (id) { return typeof id === "string" && builtinIdSet.has(id); })
      .filter(function (id, index, arr) { return arr.indexOf(id) === index; });
  };

  const sanitizeHistory = function (history) {
    if (!Array.isArray(history)) return [];
    return history
      .filter(function (entry) {
        return entry && typeof entry === "object" && typeof entry.endedAt === "string";
      })
      .map(function (entry) {
        return {
          id: String(entry.id || ""),
          endedAt: String(entry.endedAt),
          focusMin: clampInt(entry.focusMin, 1, 180),
          sessionKey: typeof entry.sessionKey === "string" ? entry.sessionKey : "",
          sessionLabel: typeof entry.sessionLabel === "string" ? entry.sessionLabel : "",
        };
      })
      .slice(-2000);
  };

  const sanitizeAndApplyStateV2 = function (stateV2) {
    if (!stateV2 || typeof stateV2 !== "object") throw new Error("invalid backup");

    const settings = stateV2.settings || {};
    state.settings.focusMin = clampInt(settings.focusMin, 1, 180);
    state.settings.shortBreakMin = clampInt(settings.shortBreakMin, 1, 60);
    state.settings.longBreakMin = clampInt(settings.longBreakMin, 1, 120);
    state.settings.longBreakEvery = clampInt(settings.longBreakEvery, 1, 12);
    state.settings.maxPomodoros = clampInt(settings.maxPomodoros, 1, 24);

    const timer = stateV2.timer || {};
    const status = String(timer.status || "idle");
    state.timer.status = ["idle", "running", "paused", "completed"].includes(status) ? status : "idle";
    const phase = String(timer.phase || "focus");
    state.timer.phase = ["focus", "shortBreak", "longBreak"].includes(phase) ? phase : "focus";
    state.timer.phaseDurationMs = clampInt(timer.phaseDurationMs, 1000, 1000 * 60 * 300);
    state.timer.remainingMs = clampInt(timer.remainingMs, 0, state.timer.phaseDurationMs);
    state.timer.endAt = Number.isFinite(Number(timer.endAt)) ? Number(timer.endAt) : null;
    state.timer.completedFocusCount = clampInt(timer.completedFocusCount, 0, 9999);
    state.timer.activePresetId = timer.activePresetId ? String(timer.activePresetId) : null;
    state.timer.customLabel = timer.customLabel ? normalizeLabel(String(timer.customLabel).slice(0, 30)) : state.timer.customLabel;

    const display = stateV2.display || {};
    state.display.todoText = normalizeTodoText(display.todoText);
    state.display.centerLabelEnabled = display.centerLabelEnabled !== false;
    state.display.centerLabelMode = normalizeDisplayMode(display.centerLabelMode);
    state.display.bottomLabelEnabled = display.bottomLabelEnabled === true;
    state.display.bottomLabelMode = normalizeDisplayMode(display.bottomLabelMode);

    const behavior = stateV2.behavior || {};
    state.behavior.keepScreenAwake = behavior.keepScreenAwake === true;
  };

  const applyBackupPayload = function (payload) {
    if (!payload || typeof payload !== "object") throw new Error("invalid backup");
    if (payload.schema && payload.schema !== BACKUP_SCHEMA_V1) {
      throw new Error("unsupported backup schema");
    }

    ctx.stopTicker();
    store.userPresets = sanitizeUserPresets(payload.presetsV1);
    store.hiddenBuiltinPresetIds = sanitizeHiddenBuiltins(payload.hiddenBuiltinsV1);
    store.sessionHistory = sanitizeHistory(payload.focusHistoryV1);
    sanitizeAndApplyStateV2(payload.stateV2 || {});

    if (!ctx.getPresetById(state.timer.activePresetId)) {
      const fallback = ctx.getFallbackPreset();
      state.timer.activePresetId = fallback ? fallback.id : null;
    }

    state.timer.phaseDurationMs = ctx.getPhaseDurationMs(state.timer.phase);
    if (state.timer.status === "idle") {
      state.timer.remainingMs = state.timer.phaseDurationMs;
    }

    ctx.recoverRunningState();
    if (state.timer.status === "running") {
      store.tickerId = window.setInterval(ctx.tick, 200);
    }

    persistState();
    persistPresets();
    persistHiddenBuiltins();
    persistFocusHistory();
    ctx.renderPresetList();
    ctx.render();
    if (ctx.services.wakeLock) ctx.services.wakeLock.sync();
    ctx.setStatus(i18n.t("status.backupLoaded"));
  };

  const loadUserPresets = function () {
    try {
      const raw = localStorage.getItem(STORAGE_PRESETS_V1);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      store.userPresets = sanitizeUserPresets(parsed);
    } catch {
      store.userPresets = [];
    }
  };

  const loadHiddenBuiltins = function () {
    try {
      const raw = localStorage.getItem(STORAGE_PRESET_HIDDEN_BUILTINS_V1);
      if (!raw) {
        store.hiddenBuiltinPresetIds = [];
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        store.hiddenBuiltinPresetIds = [];
        return;
      }
      store.hiddenBuiltinPresetIds = sanitizeHiddenBuiltins(parsed);
    } catch {
      store.hiddenBuiltinPresetIds = [];
    }
  };

  const loadFocusHistory = function () {
    try {
      const raw = localStorage.getItem(STORAGE_FOCUS_HISTORY_V1);
      if (!raw) {
        store.sessionHistory = [];
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        store.sessionHistory = [];
        return;
      }
      store.sessionHistory = sanitizeHistory(parsed);
    } catch {
      store.sessionHistory = [];
    }
  };

  const migrateV1IfNeeded = function () {
    try {
      if (localStorage.getItem(STORAGE_STATE_V2)) return;
      const raw = localStorage.getItem(STORAGE_STATE_V1);
      if (!raw) return;
      const legacy = JSON.parse(raw);
      if (!legacy || typeof legacy !== "object") return;

      const configuredMs = clampInt(Number(legacy.configuredMs) || 1500000, 1000, 1000 * 60 * 180);
      state.settings.focusMin = clampInt(Math.round(configuredMs / 60000), 1, 180);
      state.timer.phase = "focus";
      state.timer.phaseDurationMs = configuredMs;
      state.timer.remainingMs = clampInt(Number(legacy.remainingMs) || configuredMs, 0, configuredMs);
      state.timer.completedFocusCount = 0;

      if (legacy.running && Number.isFinite(Number(legacy.endAt))) {
        state.timer.status = "running";
        state.timer.endAt = Number(legacy.endAt);
      } else if (state.timer.remainingMs > 0 && state.timer.remainingMs < configuredMs) {
        state.timer.status = "paused";
        state.timer.endAt = null;
      } else {
        state.timer.status = "idle";
        state.timer.endAt = null;
      }

      persistState();
    } catch {
      // ignore migration errors
    }
  };

  const loadV2State = function () {
    try {
      const raw = localStorage.getItem(STORAGE_STATE_V2);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      sanitizeAndApplyStateV2(parsed);
    } catch {
      // ignore restore errors
    }
  };

  const appendFocusHistory = function (minutes) {
    const safeMinutes = clampInt(minutes, 1, 180);
    const sessionKey = ctx.services.insights.getCurrentSessionKey();
    const sessionLabel = ctx.services.insights.getCurrentSessionLabel();
    const id = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : "focus-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    store.sessionHistory.push({
      id: id,
      endedAt: new Date().toISOString(),
      focusMin: safeMinutes,
      sessionKey: sessionKey,
      sessionLabel: sessionLabel,
    });
    if (store.sessionHistory.length > 2000) {
      store.sessionHistory = store.sessionHistory.slice(store.sessionHistory.length - 2000);
    }
    persistFocusHistory();
  };

  const safePersistTick = function () {
    const now = Date.now();
    if (now - store.lastPersistAt < 1000) return;
    store.lastPersistAt = now;
    persistState();
  };

  return {
    persistState,
    persistPresets,
    persistHiddenBuiltins,
    persistFocusHistory,
    makeBackupPayload,
    downloadBackupFile,
    applyBackupPayload,
    loadUserPresets,
    loadHiddenBuiltins,
    loadFocusHistory,
    migrateV1IfNeeded,
    loadV2State,
    appendFocusHistory,
    safePersistTick,
  };
}
