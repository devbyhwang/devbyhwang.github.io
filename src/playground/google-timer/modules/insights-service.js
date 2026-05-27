export function createInsightsService(ctx) {
  const { state, store, els, utils } = ctx;
  const {
    clampInt,
    toDayKey,
    two,
    formatHHMMFromMinutes,
    formatHumanMinutes,
    normalizeLabel,
  } = utils;

  const toSessionMinutes = function (entry) {
    return clampInt(entry && entry.focusMin, 1, 180);
  };

  const getSessionDate = function (entry) {
    const date = new Date(entry && entry.endedAt);
    if (!Number.isFinite(date.getTime())) return null;
    return date;
  };

  const getCurrentSessionKey = function () {
    if (state.timer.activePresetId) return "preset:" + state.timer.activePresetId;
    const label = normalizeLabel(state.timer.customLabel || ctx.getActiveLabel() || "Custom");
    return "custom:" + label;
  };

  const getCurrentSessionLabel = function () {
    return normalizeLabel(ctx.getActiveLabel()) || "현재 선택";
  };

  const getScopedHistory = function () {
    const key = getCurrentSessionKey();
    const label = getCurrentSessionLabel();
    return store.sessionHistory.filter(function (entry) {
      if (!entry) return false;
      if (entry.sessionKey && entry.sessionKey === key) return true;
      if (!entry.sessionKey && entry.sessionLabel) {
        return normalizeLabel(entry.sessionLabel) === label;
      }
      return false;
    });
  };

  const syncTrendScopeButtons = function () {
    if (!els.trendScopePresetBtn || !els.trendScopeAllBtn) return;
    const presetActive = state.ui.trendScope !== "all";
    els.trendScopePresetBtn.dataset.active = presetActive ? "true" : "false";
    els.trendScopeAllBtn.dataset.active = presetActive ? "false" : "true";
  };

  const setTrendScope = function (scope) {
    state.ui.trendScope = scope === "all" ? "all" : "preset";
    syncTrendScopeButtons();
    renderInsights();
  };

  const getDailySeries = function (days, sourceHistory) {
    const history = Array.isArray(sourceHistory) ? sourceHistory : store.sessionHistory;
    const now = new Date();
    const byDay = new Map();
    history.forEach(function (entry) {
      const date = getSessionDate(entry);
      if (!date) return;
      const key = toDayKey(date);
      byDay.set(key, (byDay.get(key) || 0) + toSessionMinutes(entry));
    });

    const series = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = toDayKey(date);
      series.push({
        key: key,
        label: String(date.getDate()),
        minutes: byDay.get(key) || 0,
      });
    }
    return series;
  };

  const getTodayMinutes = function (sourceHistory) {
    const history = Array.isArray(sourceHistory) ? sourceHistory : store.sessionHistory;
    const todayKey = toDayKey(new Date());
    return history.reduce(function (sum, entry) {
      const date = getSessionDate(entry);
      if (!date || toDayKey(date) !== todayKey) return sum;
      return sum + toSessionMinutes(entry);
    }, 0);
  };

  const getMinutesInLastDays = function (days, sourceHistory) {
    const series = getDailySeries(days, sourceHistory);
    return series.reduce(function (sum, item) { return sum + item.minutes; }, 0);
  };

  const getCurrentWeekMinutes = function (sourceHistory) {
    const history = Array.isArray(sourceHistory) ? sourceHistory : store.sessionHistory;
    const now = new Date();
    const day = now.getDay();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const startKey = toDayKey(start);
    return history.reduce(function (sum, entry) {
      const date = getSessionDate(entry);
      if (!date) return sum;
      const key = toDayKey(date);
      if (key < startKey) return sum;
      return sum + toSessionMinutes(entry);
    }, 0);
  };

  const getCurrentMonthMinutes = function (sourceHistory) {
    const history = Array.isArray(sourceHistory) ? sourceHistory : store.sessionHistory;
    const now = new Date();
    const ym = now.getFullYear() + "-" + two(now.getMonth() + 1);
    return history.reduce(function (sum, entry) {
      const date = getSessionDate(entry);
      if (!date) return sum;
      const key = date.getFullYear() + "-" + two(date.getMonth() + 1);
      return key === ym ? sum + toSessionMinutes(entry) : sum;
    }, 0);
  };

  const getTotalMinutes = function (sourceHistory) {
    const history = Array.isArray(sourceHistory) ? sourceHistory : store.sessionHistory;
    return history.reduce(function (sum, entry) {
      return sum + toSessionMinutes(entry);
    }, 0);
  };

  const renderWeeklyChart = function (sourceHistory) {
    const history = Array.isArray(sourceHistory) ? sourceHistory : store.sessionHistory;
    const svg = els.weeklyChart;
    if (!svg) return;
    const series = getDailySeries(7, history);
    const maxMinutes = Math.max(10, ...series.map(function (item) { return item.minutes; }));

    const W = 320;
    const H = 180;
    const padX = 18;
    const padTop = 12;
    const padBottom = 24;
    const plotH = H - padTop - padBottom;
    const gap = 6;
    const barW = (W - padX * 2 - gap * 6) / 7;

    let parts = "";
    [0, 0.5, 1].forEach(function (r) {
      const y = padTop + plotH * r;
      parts += '<line x1="' + padX + '" y1="' + y + '" x2="' + (W - padX) + '" y2="' + y + '" stroke="var(--line)" stroke-width="1" opacity="0.66" />';
    });

    series.forEach(function (item, idx) {
      const x = padX + idx * (barW + gap);
      const h = Math.max(0, (item.minutes / maxMinutes) * plotH);
      const y = padTop + (plotH - h);

      parts += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="4" fill="var(--phase)" opacity="0.88" />';
      parts += '<text x="' + (x + barW / 2) + '" y="' + (H - 8) + '" text-anchor="middle" fill="var(--muted)" font-size="10">' + item.label + "</text>";
    });

    svg.innerHTML = parts;
  };

  const renderSessionList = function () {
    // 리스트 UI는 제거되어 있으나 데이터 흐름 호환을 위해 함수는 유지.
  };

  const renderInsights = function () {
    if (!els.insightsOverlay || els.insightsOverlay.dataset.open !== "true") return;

    const useAll = state.ui.trendScope === "all";
    const history = useAll ? store.sessionHistory : getScopedHistory();

    const todayMinutes = getTodayMinutes(history);
    const weekMinutes = getCurrentWeekMinutes(history);
    const monthMinutes = getCurrentMonthMinutes(history);
    const recent7Minutes = getMinutesInLastDays(7, history);
    const totalMinutes = getTotalMinutes(history);
    const totalCount = history.length;

    if (els.trendTitle) {
      els.trendTitle.textContent = useAll
        ? "전체 프리셋 추세"
        : "현재 선택 섹션 추세";
    }
    if (els.trendScopeHint) {
      els.trendScopeHint.textContent = useAll
        ? "모든 프리셋의 누적 통계"
        : "현재 선택한 프리셋 기준 통계";
    }
    if (els.trendToday) els.trendToday.textContent = formatHHMMFromMinutes(todayMinutes);
    if (els.trendWeek) els.trendWeek.textContent = formatHHMMFromMinutes(weekMinutes);
    if (els.trendMonth) els.trendMonth.textContent = formatHHMMFromMinutes(monthMinutes);
    if (els.trendRecent7) els.trendRecent7.textContent = formatHHMMFromMinutes(recent7Minutes);
    if (els.trendTotal) els.trendTotal.textContent = formatHHMMFromMinutes(totalMinutes);
    if (els.summaryCount) els.summaryCount.textContent = totalCount + "회";
    if (els.summaryToday) els.summaryToday.textContent = formatHumanMinutes(todayMinutes);

    renderWeeklyChart(history);
    renderSessionList(history);
  };

  return {
    setTrendScope,
    syncTrendScopeButtons,
    renderInsights,
    getScopedHistory,
    getCurrentSessionKey,
    getCurrentSessionLabel,
  };
}
