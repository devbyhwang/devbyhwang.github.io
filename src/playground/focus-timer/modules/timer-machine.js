export function createTimerMachine(ctx) {
  const { state, store, utils, i18n } = ctx;
  const { clampInt, msFromMin } = utils;

  const getPhaseDurationMs = function (phase) {
    if (phase === "focus") return msFromMin(state.settings.focusMin);
    if (phase === "shortBreak") return msFromMin(state.settings.shortBreakMin);
    return msFromMin(state.settings.longBreakMin);
  };

  const syncWakeLock = function () {
    if (ctx.services.wakeLock) ctx.services.wakeLock.sync();
  };

  const getAllPresets = function () {
    const hidden = new Set(store.hiddenBuiltinPresetIds);
    const userById = new Map(
      store.userPresets.map(function (preset) {
        return [preset.id, preset];
      })
    );
    const builtins = [];

    ctx.BUILTIN_PRESETS.forEach(function (builtin) {
      const override = userById.get(builtin.id);
      userById.delete(builtin.id);
      if (hidden.has(builtin.id)) return;

      if (override) {
        builtins.push({
          id: builtin.id,
          name: override.name,
          focusMin: override.focusMin,
          shortBreakMin: override.shortBreakMin,
          longBreakMin: override.longBreakMin,
          longBreakEvery: override.longBreakEvery,
          maxPomodoros: override.maxPomodoros,
          builtin: true,
        });
        return;
      }

      builtins.push(builtin);
    });

    const userPresets = Array.from(userById.values()).map(function (preset) {
      return { ...preset, builtin: false };
    });

    return builtins.concat(userPresets);
  };

  const getPresetById = function (id) {
    return getAllPresets().find(function (p) { return p.id === id; }) || null;
  };

  const getFallbackPreset = function () {
    const presets = getAllPresets();
    return presets.length > 0 ? presets[0] : null;
  };

  const getActiveLabel = function () {
    const preset = getPresetById(state.timer.activePresetId);
    if (preset && preset.name) return i18n.normalizePresetName(preset.name);
    const custom = utils.normalizeLabel(state.timer.customLabel);
    return i18n.normalizePresetName(custom) || i18n.t("presets.custom");
  };

  const stopTicker = function () {
    if (!store.tickerId) return;
    window.clearInterval(store.tickerId);
    store.tickerId = null;
  };

  const setToFocusIdle = function () {
    stopTicker();
    state.timer.status = "idle";
    state.timer.phase = "focus";
    state.timer.completedFocusCount = 0;
    state.timer.phaseDurationMs = getPhaseDurationMs("focus");
    state.timer.remainingMs = state.timer.phaseDurationMs;
    state.timer.endAt = null;
  };

  const startPhase = function (phase, startedAt) {
    const phaseStart = Number.isFinite(startedAt) ? startedAt : Date.now();
    state.timer.phase = phase;
    state.timer.phaseDurationMs = getPhaseDurationMs(phase);
    state.timer.status = "running";
    state.timer.endAt = phaseStart + state.timer.phaseDurationMs;
    state.timer.remainingMs = Math.max(0, state.timer.endAt - Date.now());
  };

  const completeSession = function () {
    stopTicker();
    state.timer.status = "completed";
    state.timer.remainingMs = 0;
    state.timer.endAt = null;
  };

  const transitionAfterPhaseEnd = function (silent) {
    const nowPhase = state.timer.phase;
    const nextPhaseStartAt = Number.isFinite(state.timer.endAt) ? state.timer.endAt : Date.now();

    if (nowPhase === "focus") {
      ctx.storage.appendFocusHistory(Math.round(state.timer.phaseDurationMs / 60000));
      state.timer.completedFocusCount += 1;

      if (state.timer.completedFocusCount >= state.settings.maxPomodoros) {
        completeSession();
        syncWakeLock();
        if (!silent) {
          ctx.setStatus(i18n.t("status.sessionComplete"));
          ctx.services.notification.notify(i18n.t("notification.pomodoroTitle"), i18n.t("notification.pomodoroBody"));
        }
        ctx.render();
        ctx.storage.persistState();
        return;
      }

      const next = state.timer.completedFocusCount % state.settings.longBreakEvery === 0
        ? "longBreak"
        : "shortBreak";
      startPhase(next, nextPhaseStartAt);
      if (!silent) {
        const label = i18n.phaseLabel(next);
        const message = i18n.t("message.focusCompleteStart", { phase: label });
        ctx.setStatus(message);
        ctx.services.notification.notify(i18n.t("notification.transitionTitle"), message);
      }
      ctx.render();
      ctx.storage.persistState();
      return;
    }

    startPhase("focus", nextPhaseStartAt);
    if (!silent) {
      const message = i18n.t("message.phaseCompleteFocus", { phase: i18n.phaseLabel(nowPhase) });
      ctx.setStatus(message);
      ctx.services.notification.notify(i18n.t("notification.transitionTitle"), message);
    }
    ctx.render();
    ctx.storage.persistState();
  };

  const tick = function () {
    if (state.timer.status !== "running" || !Number.isFinite(state.timer.endAt)) return;
    state.timer.remainingMs = Math.max(0, state.timer.endAt - Date.now());

    if (state.timer.remainingMs <= 0) {
      transitionAfterPhaseEnd(false);
      return;
    }

    ctx.render();
    ctx.storage.safePersistTick();
  };

  const startTimer = function () {
    state.timer.phase = "focus";
    state.timer.completedFocusCount = 0;
    state.timer.phaseDurationMs = getPhaseDurationMs("focus");
    state.timer.remainingMs = state.timer.phaseDurationMs;
    state.timer.status = "running";
    state.timer.endAt = Date.now() + state.timer.remainingMs;
    stopTicker();
    store.tickerId = window.setInterval(tick, 200);
    ctx.services.notification.requestNotificationPermission();
    syncWakeLock();
    ctx.setStatus(i18n.t("status.focusStart"));
    ctx.render();
    ctx.storage.persistState();
  };

  const pauseTimer = function () {
    if (state.timer.status !== "running") return;
    state.timer.remainingMs = Math.max(0, state.timer.endAt - Date.now());
    state.timer.status = "paused";
    state.timer.endAt = null;
    stopTicker();
    syncWakeLock();
    ctx.setStatus(i18n.t("status.paused"));
    ctx.render();
    ctx.storage.persistState();
  };

  const resumeTimer = function () {
    if (state.timer.status !== "paused" || state.timer.remainingMs <= 0) return;
    state.timer.status = "running";
    state.timer.endAt = Date.now() + state.timer.remainingMs;
    stopTicker();
    store.tickerId = window.setInterval(tick, 200);
    ctx.services.notification.requestNotificationPermission();
    syncWakeLock();
    ctx.setStatus(i18n.t("status.resumed"));
    ctx.render();
    ctx.storage.persistState();
  };

  const resetTimer = function () {
    setToFocusIdle();
    syncWakeLock();
    ctx.setStatus(i18n.t("status.reset"));
    ctx.render();
    ctx.storage.persistState();
  };

  const toggleTimerByTap = function () {
    if (state.timer.status === "running") {
      pauseTimer();
      return;
    }
    if (state.timer.status === "paused") {
      resumeTimer();
      return;
    }
    startTimer();
  };

  const applySettings = function (next, presetId, customLabel) {
    state.settings.focusMin = clampInt(next.focusMin, 1, 180);
    state.settings.shortBreakMin = clampInt(next.shortBreakMin, 1, 60);
    state.settings.longBreakMin = clampInt(next.longBreakMin, 1, 120);
    state.settings.longBreakEvery = clampInt(next.longBreakEvery, 1, 12);
    state.settings.maxPomodoros = clampInt(next.maxPomodoros, 1, 24);
    state.timer.activePresetId = presetId || null;
    if (presetId) {
      const preset = getPresetById(presetId);
      state.timer.customLabel = preset && preset.name ? preset.name : getActiveLabel();
    } else {
      const nextLabel = utils.normalizeLabel(customLabel);
      state.timer.customLabel = nextLabel || getActiveLabel();
    }
    setToFocusIdle();
    syncWakeLock();
  };

  const recoverRunningState = function () {
    if (state.timer.status !== "running" || !Number.isFinite(state.timer.endAt)) return;

    let guard = 0;
    while (guard < 48) {
      const remain = state.timer.endAt - Date.now();
      if (remain > 0) {
        state.timer.remainingMs = remain;
        return;
      }
      transitionAfterPhaseEnd(true);
      if (state.timer.status !== "running") return;
      guard += 1;
    }

    state.timer.status = "paused";
    state.timer.endAt = null;
  };

  return {
    getPhaseDurationMs,
    getAllPresets,
    getPresetById,
    getFallbackPreset,
    getActiveLabel,
    stopTicker,
    setToFocusIdle,
    startPhase,
    completeSession,
    transitionAfterPhaseEnd,
    tick,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    toggleTimerByTap,
    applySettings,
    recoverRunningState,
  };
}
