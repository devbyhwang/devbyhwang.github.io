export const STORAGE_STATE_V2 = "focus-timer-playground-state-v2";
export const STORAGE_STATE_V1 = "focus-timer-playground-state-v1";
export const STORAGE_PRESETS_V1 = "focus-timer-presets-v1";
export const STORAGE_PRESET_HIDDEN_BUILTINS_V1 = "focus-timer-hidden-builtins-v1";
export const STORAGE_FOCUS_HISTORY_V1 = "focus-timer-focus-history-v1";
export const STORAGE_GUIDE_SEEN_V1 = "focus-timer-guide-seen-v1";
export const BACKUP_SCHEMA_V1 = "focus-timer-backup-v1";
export const BASE_TITLE = "Focus Timer";
export const MAX_USER_PRESETS = 20;
export const RADIUS = 134;
export const CX = 160;
export const CY = 160;

export const PHASE_META = {
  focus: { label: "집중", detail: "Focus", phaseColor: "#1a73e8" },
  shortBreak: { label: "짧은 휴식", detail: "Short Break", phaseColor: "#34a853" },
  longBreak: { label: "긴 휴식", detail: "Long Break", phaseColor: "#fbbc04" },
};

export const BUILTIN_PRESETS = [
  {
    id: "preset-standard",
    name: "표준",
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    maxPomodoros: 12,
    builtin: true,
  },
  {
    id: "preset-short",
    name: "단기",
    focusMin: 15,
    shortBreakMin: 3,
    longBreakMin: 10,
    longBreakEvery: 4,
    maxPomodoros: 12,
    builtin: true,
  },
  {
    id: "preset-long",
    name: "장기",
    focusMin: 50,
    shortBreakMin: 10,
    longBreakMin: 20,
    longBreakEvery: 4,
    maxPomodoros: 8,
    builtin: true,
  },
];

export function createStore() {
  return {
    state: {
      settings: {
        focusMin: 25,
        shortBreakMin: 5,
        longBreakMin: 15,
        longBreakEvery: 4,
        maxPomodoros: 12,
      },
      timer: {
        status: "idle",
        phase: "focus",
        phaseDurationMs: 25 * 60 * 1000,
        remainingMs: 25 * 60 * 1000,
        endAt: null,
        completedFocusCount: 0,
        activePresetId: "preset-standard",
        customLabel: "표준",
      },
      display: {
        todoText: "",
        centerLabelEnabled: true,
        centerLabelMode: "time",
        bottomLabelEnabled: false,
        bottomLabelMode: "todo",
      },
      behavior: {
        keepScreenAwake: false,
      },
      ui: {
        editingPresetId: null,
        dialDragging: false,
        dialDragStarted: false,
        dialPointerId: null,
        dialStartX: 0,
        dialStartY: 0,
        dialDragLastAngle: null,
        dialDragTurns: 0,
        dialChanged: false,
        preventToggleUntil: 0,
        tapToggleTimerId: null,
        trendScope: "preset",
        bottomTodoEditing: false,
        bottomTodoBeforeEdit: "",
      },
    },
    userPresets: [],
    hiddenBuiltinPresetIds: [],
    sessionHistory: [],
    tickerId: null,
    lastPersistAt: 0,
  };
}
