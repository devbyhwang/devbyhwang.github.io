export function createDisplayLabelService(ctx) {
  const { state, els, utils, i18n } = ctx;
  const { normalizeDisplayMode, normalizeTodoText, getDisplayContent, clampInt } = utils;
  const TOP_LABEL_OFFSET_MIN = -80;
  const TOP_LABEL_OFFSET_MAX = 80;
  const DIAL_OFFSET_MIN = -90;
  const DIAL_OFFSET_MAX = 90;
  const BOTTOM_LABEL_OFFSET_MIN = -80;
  const BOTTOM_LABEL_OFFSET_MAX = 80;

  const isBottomTodoEditable = function () {
    return !!state.display.bottomLabelEnabled && normalizeDisplayMode(state.display.bottomLabelMode) === "todo";
  };

  const renderDisplayLabels = function () {
    const time = utils.formatMMSS(state.timer.remainingMs);
    const todoText = normalizeTodoText(state.display.todoText);
    const centerEnabled = !!state.display.centerLabelEnabled;
    const bottomEnabled = !!state.display.bottomLabelEnabled;
    const centerMode = normalizeDisplayMode(state.display.centerLabelMode);
    const bottomMode = normalizeDisplayMode(state.display.bottomLabelMode);
    const topLabelOffsetY = clampInt(state.display.topLabelOffsetY ?? 0, TOP_LABEL_OFFSET_MIN, TOP_LABEL_OFFSET_MAX);
    const dialOffsetY = clampInt(state.display.dialOffsetY ?? 0, DIAL_OFFSET_MIN, DIAL_OFFSET_MAX);
    const bottomLabelOffsetY = clampInt(state.display.bottomLabelOffsetY ?? 0, BOTTOM_LABEL_OFFSET_MIN, BOTTOM_LABEL_OFFSET_MAX);

    document.documentElement.style.setProperty("--top-label-offset-y", topLabelOffsetY + "px");
    document.documentElement.style.setProperty("--dial-offset-y", dialOffsetY + "px");
    document.documentElement.style.setProperty("--bottom-label-offset-y", bottomLabelOffsetY + "px");

    els.bottomTime.textContent = getDisplayContent(centerMode, time, todoText);
    els.bottomTime.dataset.mode = centerMode;
    els.bottomTime.style.display = centerEnabled ? "" : "none";
    if (!state.ui.bottomTodoEditing) {
      els.bottomCustomLabel.textContent = getDisplayContent(bottomMode, time, todoText);
    }
    els.bottomCustomLabel.dataset.active = bottomEnabled ? "true" : "false";
    els.bottomCustomLabel.dataset.mode = bottomMode;
    els.bottomCustomLabel.dataset.editing = state.ui.bottomTodoEditing ? "true" : "false";
  };

  const syncDisplayInputs = function () {
    if (document.activeElement !== els.todoTextInput) {
      els.todoTextInput.value = String(state.display.todoText);
    }
    if (document.activeElement !== els.centerLabelModeInput) {
      els.centerLabelModeInput.value = normalizeDisplayMode(state.display.centerLabelMode);
    }
    if (document.activeElement !== els.bottomLabelModeInput) {
      els.bottomLabelModeInput.value = normalizeDisplayMode(state.display.bottomLabelMode);
    }
    if (document.activeElement !== els.centerLabelEnabledInput) {
      els.centerLabelEnabledInput.checked = !!state.display.centerLabelEnabled;
    }
    if (document.activeElement !== els.bottomLabelEnabledInput) {
      els.bottomLabelEnabledInput.checked = !!state.display.bottomLabelEnabled;
    }
    if (document.activeElement !== els.topLabelOffsetYInput) {
      els.topLabelOffsetYInput.value = String(clampInt(state.display.topLabelOffsetY ?? 0, TOP_LABEL_OFFSET_MIN, TOP_LABEL_OFFSET_MAX));
    }
    if (document.activeElement !== els.dialOffsetYInput) {
      els.dialOffsetYInput.value = String(clampInt(state.display.dialOffsetY ?? 0, DIAL_OFFSET_MIN, DIAL_OFFSET_MAX));
    }
    if (document.activeElement !== els.bottomLabelOffsetYInput) {
      els.bottomLabelOffsetYInput.value = String(clampInt(state.display.bottomLabelOffsetY ?? 0, BOTTOM_LABEL_OFFSET_MIN, BOTTOM_LABEL_OFFSET_MAX));
    }
    if (document.activeElement !== els.keepScreenAwakeInput) {
      els.keepScreenAwakeInput.checked = !!state.behavior.keepScreenAwake;
    }
  };

  const readSettingsFormValues = function () {
    return {
      next: {
        focusMin: clampInt(els.focusMinInput.value, 1, 180),
        shortBreakMin: clampInt(els.shortMinInput.value, 1, 60),
        longBreakMin: clampInt(els.longMinInput.value, 1, 120),
        longBreakEvery: clampInt(els.longEveryInput.value, 1, 12),
        maxPomodoros: clampInt(els.maxPomodorosInput.value, 1, 24),
      },
      customLabel: String(els.presetLabelTextInput.value || "").trim().slice(0, 30) || i18n.t("presets.custom"),
      display: {
        todoText: normalizeTodoText(els.todoTextInput.value),
        centerLabelEnabled: !!els.centerLabelEnabledInput.checked,
        centerLabelMode: normalizeDisplayMode(els.centerLabelModeInput.value),
        bottomLabelEnabled: !!els.bottomLabelEnabledInput.checked,
        bottomLabelMode: normalizeDisplayMode(els.bottomLabelModeInput.value),
        topLabelOffsetY: clampInt(els.topLabelOffsetYInput.value || 0, TOP_LABEL_OFFSET_MIN, TOP_LABEL_OFFSET_MAX),
        dialOffsetY: clampInt(els.dialOffsetYInput.value || 0, DIAL_OFFSET_MIN, DIAL_OFFSET_MAX),
        bottomLabelOffsetY: clampInt(els.bottomLabelOffsetYInput.value || 0, BOTTOM_LABEL_OFFSET_MIN, BOTTOM_LABEL_OFFSET_MAX),
      },
      behavior: {
        keepScreenAwake: !!els.keepScreenAwakeInput.checked,
      },
    };
  };

  const commitSettingsFromForm = function () {
    const payload = readSettingsFormValues();
    const next = payload.next;
    const customLabel = payload.customLabel;
    const display = payload.display;
    const behavior = payload.behavior;

    const paramsChanged =
      next.focusMin !== state.settings.focusMin ||
      next.shortBreakMin !== state.settings.shortBreakMin ||
      next.longBreakMin !== state.settings.longBreakMin ||
      next.longBreakEvery !== state.settings.longBreakEvery ||
      next.maxPomodoros !== state.settings.maxPomodoros ||
      customLabel !== ctx.getActiveLabel();

    const displayChanged =
      display.todoText !== state.display.todoText ||
      display.centerLabelEnabled !== state.display.centerLabelEnabled ||
      display.centerLabelMode !== state.display.centerLabelMode ||
      display.bottomLabelEnabled !== state.display.bottomLabelEnabled ||
      display.bottomLabelMode !== state.display.bottomLabelMode ||
      display.topLabelOffsetY !== clampInt(state.display.topLabelOffsetY ?? 0, TOP_LABEL_OFFSET_MIN, TOP_LABEL_OFFSET_MAX) ||
      display.dialOffsetY !== clampInt(state.display.dialOffsetY ?? 0, DIAL_OFFSET_MIN, DIAL_OFFSET_MAX) ||
      display.bottomLabelOffsetY !== clampInt(state.display.bottomLabelOffsetY ?? 0, BOTTOM_LABEL_OFFSET_MIN, BOTTOM_LABEL_OFFSET_MAX);

    const behaviorChanged =
      behavior.keepScreenAwake !== state.behavior.keepScreenAwake;

    if (!paramsChanged && !displayChanged && !behaviorChanged) return;

    if (paramsChanged && state.timer.status === "running") {
      const ok = window.confirm(i18n.t("confirm.settingsRunning"));
      if (!ok) {
        ctx.render();
        return;
      }
    }

    state.display.todoText = display.todoText;
    state.display.centerLabelEnabled = display.centerLabelEnabled;
    state.display.centerLabelMode = display.centerLabelMode;
    state.display.bottomLabelEnabled = display.bottomLabelEnabled;
    state.display.bottomLabelMode = display.bottomLabelMode;
    state.display.topLabelOffsetY = display.topLabelOffsetY;
    state.display.dialOffsetY = display.dialOffsetY;
    state.display.bottomLabelOffsetY = display.bottomLabelOffsetY;
    state.behavior.keepScreenAwake = behavior.keepScreenAwake;

    if (paramsChanged) {
      ctx.timer.applySettings(next, null, customLabel);
      ctx.setStatus(i18n.t("status.settingsSaved"));
      ctx.renderPresetList();
    } else {
      ctx.setStatus(i18n.t("status.displaySaved"));
    }

    ctx.render();
    if (ctx.services.wakeLock) ctx.services.wakeLock.sync();
    ctx.storage.persistState();
  };

  const bindAutoSaveSettings = function () {
    let timerId = null;
    const queueCommit = function () {
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(function () {
        timerId = null;
        commitSettingsFromForm();
      }, 220);
    };

    const inputTargets = [
      els.presetLabelTextInput,
      els.focusMinInput,
      els.shortMinInput,
      els.longMinInput,
      els.longEveryInput,
      els.maxPomodorosInput,
      els.todoTextInput,
      els.topLabelOffsetYInput,
      els.dialOffsetYInput,
      els.bottomLabelOffsetYInput,
    ];
    inputTargets.forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", queueCommit);
      el.addEventListener("change", queueCommit);
    });

    const changeOnlyTargets = [
      els.centerLabelEnabledInput,
      els.centerLabelModeInput,
      els.bottomLabelEnabledInput,
      els.bottomLabelModeInput,
      els.keepScreenAwakeInput,
    ];
    changeOnlyTargets.forEach(function (el) {
      if (!el) return;
      el.addEventListener("change", queueCommit);
    });

    const bindOffsetReset = function (button, input) {
      if (!button || !input) return;
      button.addEventListener("click", function () {
        input.value = "0";
        commitSettingsFromForm();
      });
    };

    bindOffsetReset(els.resetTopLabelOffsetBtn, els.topLabelOffsetYInput);
    bindOffsetReset(els.resetDialOffsetBtn, els.dialOffsetYInput);
    bindOffsetReset(els.resetBottomLabelOffsetBtn, els.bottomLabelOffsetYInput);
  };

  const endBottomTodoEdit = function (commit) {
    if (!state.ui.bottomTodoEditing) return;
    state.ui.bottomTodoEditing = false;
    els.bottomCustomLabel.removeAttribute("contenteditable");

    if (commit) {
      state.display.todoText = normalizeTodoText(els.bottomCustomLabel.textContent || "");
      ctx.storage.persistState();
      ctx.setStatus(i18n.t("status.bottomTodoSaved"));
    } else {
      state.display.todoText = normalizeTodoText(state.ui.bottomTodoBeforeEdit);
      ctx.setStatus(i18n.t("status.bottomTodoCancelled"));
    }

    ctx.render();
  };

  const beginBottomTodoEdit = function () {
    if (!isBottomTodoEditable()) return;
    if (state.ui.bottomTodoEditing) return;

    state.ui.bottomTodoEditing = true;
    state.ui.bottomTodoBeforeEdit = state.display.todoText;
    els.bottomCustomLabel.dataset.editing = "true";
    els.bottomCustomLabel.setAttribute("contenteditable", "true");
    els.bottomCustomLabel.textContent = state.display.todoText || "";
    els.bottomCustomLabel.focus();

    const sel = window.getSelection && window.getSelection();
    if (sel && typeof document.createRange === "function") {
      const range = document.createRange();
      range.selectNodeContents(els.bottomCustomLabel);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const bindBottomLabelEditing = function () {
    els.bottomCustomLabel.addEventListener("dblclick", function (event) {
      event.preventDefault();
      event.stopPropagation();
      beginBottomTodoEdit();
    });
    els.bottomCustomLabel.addEventListener("keydown", function (event) {
      if (!state.ui.bottomTodoEditing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        endBottomTodoEdit(true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        endBottomTodoEdit(false);
      }
    });
    els.bottomCustomLabel.addEventListener("blur", function () {
      if (!state.ui.bottomTodoEditing) return;
      endBottomTodoEdit(true);
    });
  };

  return {
    renderDisplayLabels,
    syncDisplayInputs,
    bindAutoSaveSettings,
    bindBottomLabelEditing,
  };
}
