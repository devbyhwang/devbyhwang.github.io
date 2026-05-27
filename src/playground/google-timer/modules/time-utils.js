export const clampInt = function (value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, Math.floor(num)));
};

export const msFromMin = function (min) {
  return clampInt(min, 1, 300) * 60 * 1000;
};

export const normalizeDisplayMode = function (mode) {
  return mode === "todo" ? "todo" : "time";
};

export const normalizeTodoText = function (text) {
  return String(text || "").trim().slice(0, 60);
};

export const two = function (value) {
  return String(value).padStart(2, "0");
};

export const formatMMSS = function (ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ":" + two(s);
};

export const formatHHMMFromMinutes = function (minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return two(h) + ":" + two(m);
};

export const formatHumanMinutes = function (minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h <= 0) return m + "분";
  if (m === 0) return h + "시간";
  return h + "시간 " + m + "분";
};

export const getDisplayContent = function (mode, timeText, todoText) {
  if (normalizeDisplayMode(mode) === "todo") {
    const todo = normalizeTodoText(todoText);
    return todo || "Todo";
  }
  return timeText;
};

export const toDayKey = function (date) {
  return [
    date.getFullYear(),
    two(date.getMonth() + 1),
    two(date.getDate()),
  ].join("-");
};

export const normalizeLabel = function (label) {
  const text = String(label || "").trim();
  if (!text) return "";
  if (/^표준(?:\s*[\d\-.:]+.*)?$/u.test(text)) return "표준";
  if (/^단기(?:\s*[\d\-.:]+.*)?$/u.test(text)) return "단기";
  if (/^장기(?:\s*[\d\-.:]+.*)?$/u.test(text)) return "장기";
  return text;
};

export const polar = function (cx, cy, r, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  return {
    x: cx + Math.cos(rad) * r,
    y: cy + Math.sin(rad) * r,
  };
};
