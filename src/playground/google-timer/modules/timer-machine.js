export function createTimerMachine(ctx) {
  const { state, store, PHASE_META, utils } = ctx;
  const { clampInt, msFromMin } = utils;

  const getPhaseDurationMs = function (phase) {
    if (phase === "focus") return msFromMin(state.settings.focusMin);
    if (phase === "shortBreak") return msFromMin(state.settings.shortBreakMin);
    return msFromMin(state.settings.longBreakMin);
  };

  const getAllPresets = function () {
    const hidden = new Set(store.hiddenBuiltinPresetIds);
    const builtins = ctx.BUILTIN_PRESETS.filter(function (preset) {
      return !hidden.has(preset.id);
    });
    return builtins.concat(store.userPresets);
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
    if (preset && preset.name) return utils.normalizeLabel(preset.name);
    const custom = utils.normalizeLabel(state.timer.customLabel);
    return custom || "Custom";
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
        if (!silent) {
          ctx.setStatus("세션 완료");
          ctx.services.notification.notify("포모도로 완료", "최대 포모도로 횟수를 달성했습니다.");
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
        const label = PHASE_META[next].label;
        ctx.setStatus("집중 완료, " + label + " 시작");
        ctx.services.notification.notify("단계 전환", "집중 완료, " + label + " 시작");
      }
      ctx.render();
      ctx.storage.persistState();
      return;
    }

    startPhase("focus", nextPhaseStartAt);
    if (!silent) {
      ctx.setStatus(PHASE_META[nowPhase].label + " 완료, 집중 시작");
      ctx.services.notification.notify("단계 전환", PHASE_META[nowPhase].label + " 완료, 집중 시작");
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
    ctx.setStatus("집중 시작");
    ctx.render();
    ctx.storage.persistState();
  };

  const pauseTimer = function () {
    if (state.timer.status !== "running") return;
    state.timer.remainingMs = Math.max(0, state.timer.endAt - Date.now());
    state.timer.status = "paused";
    state.timer.endAt = null;
    stopTicker();
    ctx.setStatus("일시정지");
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
    ctx.setStatus("재개");
    ctx.render();
    ctx.storage.persistState();
  };

  const resetTimer = function () {
    setToFocusIdle();
    ctx.setStatus("초기화됨");
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
