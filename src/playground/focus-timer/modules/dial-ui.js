export function createDialUi(ctx) {
  const { state, els, utils, i18n, RADIUS, CX, CY } = ctx;
  const { clampInt, polar } = utils;

  const buildSectorPath = function (progress) {
    if (progress <= 0) return "";
    if (progress >= 0.9999) {
      return [
        "M", CX, CY,
        "m", 0, -RADIUS,
        "a", RADIUS, RADIUS, 0, 1, 1, 0, RADIUS * 2,
        "a", RADIUS, RADIUS, 0, 1, 1, 0, -RADIUS * 2,
        "z",
      ].join(" ");
    }

    const start = polar(CX, CY, RADIUS, -90);
    const end = polar(CX, CY, RADIUS, -90 + (360 * progress));
    const largeArc = progress > 0.5 ? 1 : 0;

    return [
      "M", CX, CY,
      "L", start.x, start.y,
      "A", RADIUS, RADIUS, 0, largeArc, 1, end.x, end.y,
      "Z",
    ].join(" ");
  };

  const drawTicks = function () {
    const ns = "http://www.w3.org/2000/svg";
    const tickLabelRadius = 148;
    els.tickLayer.innerHTML = "";

    for (let i = 0; i < 60; i += 1) {
      const deg = -90 + i * 6;
      const major = i % 5 === 0;
      const inner = major ? 122 : 128;
      const outer = 139;
      const p1 = polar(CX, CY, inner, deg);
      const p2 = polar(CX, CY, outer, deg);

      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(p1.x));
      line.setAttribute("y1", String(p1.y));
      line.setAttribute("x2", String(p2.x));
      line.setAttribute("y2", String(p2.y));
      line.setAttribute("class", major ? "tick-major" : "tick-minor");
      els.tickLayer.appendChild(line);

      if (major) {
        const labelP = polar(CX, CY, tickLabelRadius, deg);
        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", String(labelP.x));
        text.setAttribute("y", String(labelP.y));
        text.setAttribute("class", "tick-label");
        text.textContent = String(i);
        els.tickLayer.appendChild(text);
      }
    }
  };

  const updateDial = function () {
    const getPhaseMinutes = function () {
      if (state.timer.phase === "focus") return clampInt(state.settings.focusMin, 1, 180);
      if (state.timer.phase === "shortBreak") return clampInt(state.settings.shortBreakMin, 1, 60);
      return clampInt(state.settings.longBreakMin, 1, 120);
    };

    const minuteDialVisual = function (minutes) {
      if (minutes <= 0) {
        return { progress: 0, accumulatedCycles: 0 };
      }

      const totalCycles = minutes / 60;
      let fullCycles = Math.floor(totalCycles);
      let partial = totalCycles - fullCycles;

      if (partial === 0) {
        partial = 1;
        fullCycles = Math.max(0, fullCycles - 1);
      }

      return {
        progress: Math.max(0, Math.min(1, partial)),
        accumulatedCycles: Math.max(0, Math.min(2, fullCycles)),
      };
    };

    let visual = { progress: 0, accumulatedCycles: 0 };
    if (state.timer.status === "running" || state.timer.status === "paused") {
      const remainingMinutes = state.timer.remainingMs / 60000;
      visual = minuteDialVisual(remainingMinutes);
    } else if (state.timer.status === "completed") {
      visual = { progress: 0, accumulatedCycles: 0 };
    } else {
      visual = minuteDialVisual(getPhaseMinutes());
    }

    const progress = visual.progress;
    const accumPath = buildSectorPath(visual.accumulatedCycles > 0 ? 1 : 0);
    const accumOpacity = visual.accumulatedCycles > 0
      ? String(Math.min(0.66, 0.26 * visual.accumulatedCycles))
      : "0";
    els.wedgeAccumPath.setAttribute("d", accumPath);
    els.wedgeAccumPath.style.opacity = accumOpacity;

    const path = buildSectorPath(progress);
    els.wedgePath.setAttribute("d", path);
    els.wedgePath.style.opacity = progress <= 0 ? "0" : "0.94";

    const endAngle = -90 + progress * 360;
    const knob = polar(CX, CY, RADIUS, endAngle);
    els.wedgeKnob.setAttribute("cx", String(knob.x));
    els.wedgeKnob.setAttribute("cy", String(knob.y));
    els.wedgeHand.setAttribute("x1", String(CX));
    els.wedgeHand.setAttribute("y1", String(CY));
    els.wedgeHand.setAttribute("x2", String(knob.x));
    els.wedgeHand.setAttribute("y2", String(knob.y));
  };

  const dialAngleFromPointer = function (event) {
    const rect = els.dialSvg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = ((event.clientX - rect.left) / rect.width) * 320;
    const y = ((event.clientY - rect.top) / rect.height) * 320;
    const dx = x - CX;
    const dy = y - CY;
    if (Math.hypot(dx, dy) < 16) return null;

    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    return (angle + 90 + 360) % 360;
  };

  const applyDialMinutes = function (minutes) {
    const nextMinutes = clampInt(minutes, 1, 180);
    state.settings.focusMin = nextMinutes;
    state.timer.activePresetId = null;
    state.timer.customLabel = i18n.normalizePresetName(utils.normalizeLabel(state.timer.customLabel)) || i18n.t("presets.custom");
    state.timer.phase = "focus";
    state.timer.status = "idle";
    state.timer.completedFocusCount = 0;
    state.timer.phaseDurationMs = nextMinutes * 60 * 1000;
    state.timer.remainingMs = state.timer.phaseDurationMs;
    state.timer.endAt = null;
  };

  const dialCycleMinutesFromAngle = function (angleFromTop) {
    const mark = Math.round(angleFromTop / 6) % 60;
    return mark === 0 ? 60 : mark;
  };

  const moveDialByPointer = function (event) {
    const angle = dialAngleFromPointer(event);
    if (angle == null) return;

    if (state.ui.dialDragLastAngle !== null) {
      const prev = state.ui.dialDragLastAngle;
      if (prev > 300 && angle < 60) state.ui.dialDragTurns += 1;
      if (prev < 60 && angle > 300) state.ui.dialDragTurns -= 1;
    }

    state.ui.dialDragLastAngle = angle;

    const cycleMinutes = dialCycleMinutesFromAngle(angle);
    let nextMinutes = state.ui.dialDragTurns * 60 + cycleMinutes;
    nextMinutes = clampInt(nextMinutes, 1, 180);
    state.ui.dialDragTurns = Math.floor((nextMinutes - 1) / 60);

    applyDialMinutes(nextMinutes);
    state.ui.dialChanged = true;
    ctx.render();
  };

  const beginDialDrag = function (event) {
    if (state.timer.status === "running") return;
    if (event.button !== undefined && event.button !== 0) return;

    state.ui.dialDragging = true;
    state.ui.dialDragStarted = false;
    state.ui.dialPointerId = event.pointerId;
    state.ui.dialStartX = event.clientX;
    state.ui.dialStartY = event.clientY;
    state.ui.dialDragLastAngle = dialAngleFromPointer(event);
    state.ui.dialDragTurns = Math.floor((clampInt(state.settings.focusMin, 1, 180) - 1) / 60);
    state.ui.dialChanged = false;

    if (typeof els.dialSvg.setPointerCapture === "function") {
      try {
        els.dialSvg.setPointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture errors
      }
    }
  };

  const trackDialDrag = function (event) {
    if (!state.ui.dialDragging) return;
    if (state.ui.dialPointerId !== null && event.pointerId !== state.ui.dialPointerId) return;

    if (!state.ui.dialDragStarted) {
      const dx = event.clientX - state.ui.dialStartX;
      const dy = event.clientY - state.ui.dialStartY;
      if (Math.hypot(dx, dy) < 6) return;
      state.ui.dialDragStarted = true;
      ctx.setStatus(i18n.t("status.dialAdjusting"));
    }

    moveDialByPointer(event);
    event.preventDefault();
  };

  const endDialDrag = function (event) {
    if (!state.ui.dialDragging) return;
    if (state.ui.dialPointerId !== null && event.pointerId !== state.ui.dialPointerId) return;
    const wasDragging = state.ui.dialDragStarted || state.ui.dialChanged;

    if (typeof els.dialSvg.releasePointerCapture === "function") {
      try {
        els.dialSvg.releasePointerCapture(event.pointerId);
      } catch {
        // ignore pointer release errors
      }
    }

    state.ui.dialDragging = false;
    state.ui.dialDragStarted = false;
    state.ui.dialPointerId = null;
    state.ui.dialDragLastAngle = null;

    if (state.ui.dialChanged) {
      ctx.renderPresetList();
      ctx.storage.persistState();
      state.ui.preventToggleUntil = Date.now() + 260;
      ctx.setStatus(i18n.t("status.dialSet", { minutes: state.settings.focusMin }));
    } else {
      ctx.setStatus(i18n.t("status.ready"));
    }

    state.ui.dialChanged = false;
    if (wasDragging) {
      event.preventDefault();
    }
  };

  const clearTapToggleTimer = function () {
    if (state.ui.tapToggleTimerId === null) return;
    window.clearTimeout(state.ui.tapToggleTimerId);
    state.ui.tapToggleTimerId = null;
  };

  const handleDialClick = function () {
    if (Date.now() < state.ui.preventToggleUntil) return;
    clearTapToggleTimer();
    state.ui.tapToggleTimerId = window.setTimeout(function () {
      state.ui.tapToggleTimerId = null;
      ctx.timer.toggleTimerByTap();
    }, 220);
  };

  const handleDialDoubleClick = function () {
    clearTapToggleTimer();
    if (state.ui.dialDragging) return;
    state.ui.preventToggleUntil = Date.now() + 260;
    ctx.timer.resetTimer();
  };

  const bindDialEvents = function () {
    els.dialShell.addEventListener("click", handleDialClick);
    els.dialShell.addEventListener("dblclick", handleDialDoubleClick);
    els.dialShell.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (Date.now() < state.ui.preventToggleUntil) return;
        clearTapToggleTimer();
        ctx.timer.toggleTimerByTap();
      }
    });
    els.dialSvg.addEventListener("pointerdown", beginDialDrag);
    window.addEventListener("pointermove", trackDialDrag);
    window.addEventListener("pointerup", endDialDrag);
    window.addEventListener("pointercancel", endDialDrag);
  };

  return {
    drawTicks,
    updateDial,
    bindDialEvents,
    clearTapToggleTimer,
  };
}
