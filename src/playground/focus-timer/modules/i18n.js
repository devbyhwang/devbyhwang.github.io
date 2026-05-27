const SUPPORTED_LOCALES = ["ko", "en", "ja", "zh-CN", "zh-TW", "es", "fr", "de", "pt", "ru", "ar", "hi"];

const LOCALE_META = {
  ko: { lang: "ko", dir: "ltr" },
  en: { lang: "en", dir: "ltr" },
  ja: { lang: "ja", dir: "ltr" },
  "zh-CN": { lang: "zh-Hans", dir: "ltr" },
  "zh-TW": { lang: "zh-Hant", dir: "ltr" },
  es: { lang: "es", dir: "ltr" },
  fr: { lang: "fr", dir: "ltr" },
  de: { lang: "de", dir: "ltr" },
  pt: { lang: "pt", dir: "ltr" },
  ru: { lang: "ru", dir: "ltr" },
  ar: { lang: "ar", dir: "rtl" },
  hi: { lang: "hi", dir: "ltr" },
};

const TIME_ZONE_LOCALES = [
  [/^Asia\/Seoul$/i, "ko"],
  [/^Asia\/Tokyo$/i, "ja"],
  [/^Asia\/(Shanghai|Chongqing|Urumqi)$/i, "zh-CN"],
  [/^Asia\/(Taipei|Hong_Kong|Macau)$/i, "zh-TW"],
  [/^Europe\/(Madrid|Andorra)$/i, "es"],
  [/^America\/(Mexico_City|Monterrey|Tijuana|Bogota|Lima|Santiago|Buenos_Aires)$/i, "es"],
  [/^Europe\/(Paris|Brussels|Monaco|Luxembourg)$/i, "fr"],
  [/^Europe\/(Berlin|Zurich|Vienna)$/i, "de"],
  [/^America\/(Sao_Paulo|Fortaleza|Recife|Belem)$/i, "pt"],
  [/^Europe\/(Lisbon|Madeira)$/i, "pt"],
  [/^Europe\/Moscow$/i, "ru"],
  [/^Asia\/(Riyadh|Dubai|Qatar|Kuwait|Muscat|Bahrain|Amman|Beirut)$/i, "ar"],
  [/^Asia\/Kolkata$/i, "hi"],
  [/^America\//i, "en"],
  [/^Europe\/London$/i, "en"],
  [/^Australia\//i, "en"],
];

const TEXT = {
  ko: {
    "app.title": "Focus Timer",
    "phase.focus": "집중",
    "phase.shortBreak": "짧은 휴식",
    "phase.longBreak": "긴 휴식",
    "presets.standard": "표준",
    "presets.short": "단기",
    "presets.long": "장기",
    "presets.custom": "Custom",
    "cycle.completed": "{completed} / {max} 포모도로 완료",
    "status.ready": "준비됨",
    "status.dialAdjusting": "다이얼로 시간 조절 중",
    "status.dialSet": "다이얼 설정: {minutes}분",
    "status.focusStart": "집중 시작",
    "status.paused": "일시정지",
    "status.resumed": "재개",
    "status.reset": "초기화됨",
    "status.sessionComplete": "세션 완료",
    "status.settingsSaved": "설정 자동 저장됨",
    "status.displaySaved": "표시 설정 자동 저장됨",
    "status.bottomTodoSaved": "하단 Todo 라벨 저장됨",
    "status.bottomTodoCancelled": "하단 Todo 라벨 편집 취소",
    "status.backupSaved": "백업 파일을 저장했습니다",
    "status.backupSaveFailed": "백업 저장에 실패했습니다",
    "status.backupLoaded": "백업 파일을 불러왔습니다",
    "status.backupInvalid": "백업 파일 형식이 올바르지 않습니다",
    "status.backupReadFailed": "백업 파일을 읽지 못했습니다",
    "status.bootError": "초기화 중 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.",
    "status.presetApplied": "프리셋 적용: {name}",
    "status.presetDeleted": "프리셋 삭제 완료",
    "status.presetSaved": "프리셋 저장 완료",
    "status.presetNameRequired": "프리셋 이름을 입력해 주세요",
    "status.maxPresets": "프리셋은 최대 {count}개까지 저장됩니다",
    "message.focusCompleteStart": "집중 완료, {phase} 시작",
    "message.phaseCompleteFocus": "{phase} 완료, 집중 시작",
    "notification.pomodoroTitle": "포모도로 완료",
    "notification.pomodoroBody": "최대 포모도로 횟수를 달성했습니다.",
    "notification.transitionTitle": "단계 전환",
    "notification.permissionPrefix": "알림 권한:",
    "notification.badgeHint": "탭 아이콘/제목 + 설치형 앱 배지",
    "permission.checking": "확인 전",
    "permission.unsupported": "미지원",
    "permission.default": "요청 전",
    "permission.granted": "허용됨",
    "permission.denied": "차단됨",
    "permission.unsupportedDetail": "이 브라우저는 알림 기능을 지원하지 않습니다.",
    "permission.grantedDetail": "현재 알림 권한이 허용되어 있습니다.",
    "permission.deniedDetail": "알림 권한이 차단되어 있습니다. 브라우저 사이트 설정에서 다시 허용해 주세요.",
    "permission.defaultDetail": "알림 권한이 아직 요청 전입니다. 아래 버튼으로 권한 요청을 진행해 주세요.",
    "permission.deniedAlert": "알림 권한이 차단되어 있습니다. 브라우저 사이트 설정에서 알림을 허용해 주세요.",
    "aria.openInsights": "추세 패널 열기",
    "aria.openSettings": "설정 열기",
    "aria.toggleTimer": "타이머 시작 또는 일시정지",
    "aria.insightsDialog": "집중 추세 패널",
    "aria.trendScope": "추세 범위",
    "aria.closeInsights": "추세 닫기",
    "aria.weeklyChart": "최근 7일 집중 차트",
    "aria.settingsDialog": "포모도로 설정",
    "aria.closeSettings": "설정 닫기",
    "aria.guideDialog": "사용 안내 및 권한 안내",
    "aria.closeGuide": "안내 닫기",
    "trend.titlePreset": "현재 선택 섹션 추세",
    "trend.titleAll": "전체 프리셋 추세",
    "trend.hintPreset": "현재 선택한 프리셋 기준 통계",
    "trend.hintAll": "모든 프리셋의 누적 통계",
    "trend.currentPreset": "현재 프리셋",
    "trend.allPresets": "전체 프리셋",
    "trend.today": "오늘",
    "trend.week": "이번 주",
    "trend.month": "이번 달",
    "trend.recent7": "최근 7일",
    "trend.total": "전체",
    "trend.chart": "차트",
    "trend.summary": "합계",
    "trend.focusCount": "집중 횟수",
    "trend.todayTotal": "오늘 집중 시간 합계",
    "settings.title": "포모도로 설정",
    "settings.guide": "사용 안내",
    "settings.params": "타이머 파라미터",
    "settings.presetLabel": "프리셋 라벨 텍스트",
    "settings.focusMinutes": "집중 (분)",
    "settings.shortMinutes": "짧은 휴식 (분)",
    "settings.longMinutes": "긴 휴식 (분)",
    "settings.longEvery": "긴 휴식 간격",
    "settings.maxPomodoros": "최대 포모도로",
    "settings.autoSaveHint": "값을 변경하면 자동 저장됩니다. 실행 중 변경/적용은 확인 후 타이머를 안전하게 초기화해 반영됩니다.",
    "settings.presets": "프리셋",
    "settings.addPreset": "+ 프리셋 추가",
    "settings.name": "이름",
    "settings.namePlaceholder": "예: 회의 전 집중",
    "settings.save": "저장",
    "settings.cancel": "취소",
    "settings.display": "표시 커스텀",
    "settings.todoText": "Todo 작업명 텍스트",
    "settings.todoPlaceholder": "예: 제안서 1차 초안 작성",
    "settings.centerLabel": "중앙 라벨 표시",
    "settings.centerContent": "중앙 라벨 내용",
    "settings.bottomLabel": "하단 라벨 표시",
    "settings.bottomContent": "하단 라벨 내용",
    "settings.remainingTime": "남은 시간",
    "settings.todo": "Todo",
    "settings.displayHint": "중앙/하단 라벨을 각각 켜고 끌 수 있고, 남은 시간 또는 Todo 텍스트를 선택할 수 있습니다.",
    "settings.backup": "백업",
    "settings.exportBackup": "백업 내보내기",
    "settings.importBackup": "백업 불러오기",
    "settings.backupHint": "브라우저 캐시/사이트 데이터 삭제 전에 백업 파일을 저장해 두세요.",
    "guide.title": "사용 안내",
    "guide.item1": "타이머는 다이얼 클릭으로 시작/일시정지, 더블클릭으로 초기화됩니다.",
    "guide.item2": "알림 권한을 허용하지 않으면 시간 종료/단계 전환 알림을 받을 수 없습니다.",
    "guide.item3": "브라우저 캐시/사이트 데이터 삭제 시 기록이 사라질 수 있으므로 백업 내보내기를 권장합니다.",
    "guide.installHint": "💡 앱을 추가하고 편리하게 알림을 받아보세요!\niPhone / iPad: [공유] ➔ [홈 화면에 추가] (알림 수신을 위해 필수)\nMac: [공유] ➔ [Dock에 추가] (알림 수신을 위해 필수)\nAndroid / Windows: 홈 화면이나 바탕화면에 추가해 두시면, 알림 확인은 물론 더욱 빠르고 편리하게 이용하실 수 있습니다.",
    "guide.permissionChecking": "알림 권한 상태 확인 중...",
    "guide.requestPermission": "알림 권한 요청",
    "guide.acknowledge": "확인했어요",
    "preset.apply": "적용",
    "preset.edit": "수정",
    "preset.delete": "삭제",
    "preset.meta": "집중 {focus} / 짧휴 {short} / 긴휴 {long} · 간격 {every} · 최대 {max}",
    "confirm.importRunning": "실행 중입니다. 백업을 불러오면 현재 상태가 덮어써집니다. 계속할까요?",
    "confirm.settingsRunning": "실행 중입니다. 설정 변경 시 타이머를 초기화합니다. 계속할까요?",
    "confirm.applyPresetRunning": "실행 중입니다. 프리셋 적용 시 타이머를 초기화합니다. 적용할까요?",
    "confirm.deletePreset": "프리셋을 삭제할까요?",
    "confirm.applySavedPresetRunning": "실행 중입니다. 저장한 프리셋 적용 시 타이머를 초기화합니다. 적용할까요?",
    "insights.currentSelection": "현재 선택",
    "unit.count": "{count}회",
    "unit.minutes": "{count}분",
    "unit.hours": "{count}시간",
    "unit.hoursMinutes": "{hours}시간 {minutes}분"
  },
  en: {
    "app.title": "Focus Timer",
    "phase.focus": "Focus",
    "phase.shortBreak": "Short Break",
    "phase.longBreak": "Long Break",
    "presets.standard": "Standard",
    "presets.short": "Short",
    "presets.long": "Long",
    "presets.custom": "Custom",
    "cycle.completed": "{completed} / {max} pomodoros done",
    "status.ready": "Ready",
    "status.dialAdjusting": "Adjusting time with the dial",
    "status.dialSet": "Dial set: {minutes} min",
    "status.focusStart": "Focus started",
    "status.paused": "Paused",
    "status.resumed": "Resumed",
    "status.reset": "Reset",
    "status.sessionComplete": "Session complete",
    "status.settingsSaved": "Settings auto-saved",
    "status.displaySaved": "Display settings auto-saved",
    "status.bottomTodoSaved": "Bottom Todo label saved",
    "status.bottomTodoCancelled": "Bottom Todo label edit canceled",
    "status.backupSaved": "Backup file saved",
    "status.backupSaveFailed": "Failed to save backup",
    "status.backupLoaded": "Backup file loaded",
    "status.backupInvalid": "Backup file format is invalid",
    "status.backupReadFailed": "Could not read backup file",
    "status.bootError": "Something went wrong during startup. Refresh and try again.",
    "status.presetApplied": "Preset applied: {name}",
    "status.presetDeleted": "Preset deleted",
    "status.presetSaved": "Preset saved",
    "status.presetNameRequired": "Enter a preset name",
    "status.maxPresets": "You can save up to {count} presets",
    "message.focusCompleteStart": "Focus complete, starting {phase}",
    "message.phaseCompleteFocus": "{phase} complete, starting Focus",
    "notification.pomodoroTitle": "Pomodoro complete",
    "notification.pomodoroBody": "You reached the maximum pomodoro count.",
    "notification.transitionTitle": "Phase changed",
    "notification.permissionPrefix": "Notification permission:",
    "notification.badgeHint": "tab icon/title + installed app badge",
    "permission.checking": "Not checked",
    "permission.unsupported": "Unsupported",
    "permission.default": "Not requested",
    "permission.granted": "Allowed",
    "permission.denied": "Blocked",
    "permission.unsupportedDetail": "This browser does not support notifications.",
    "permission.grantedDetail": "Notification permission is currently allowed.",
    "permission.deniedDetail": "Notification permission is blocked. Allow it again in browser site settings.",
    "permission.defaultDetail": "Notification permission has not been requested yet. Use the button below to request it.",
    "permission.deniedAlert": "Notification permission is blocked. Allow notifications in browser site settings.",
    "aria.openInsights": "Open trends panel",
    "aria.openSettings": "Open settings",
    "aria.toggleTimer": "Start or pause timer",
    "aria.insightsDialog": "Focus trends panel",
    "aria.trendScope": "Trend scope",
    "aria.closeInsights": "Close trends",
    "aria.weeklyChart": "Last 7 days focus chart",
    "aria.settingsDialog": "Pomodoro settings",
    "aria.closeSettings": "Close settings",
    "aria.guideDialog": "Usage and permission guide",
    "aria.closeGuide": "Close guide",
    "trend.titlePreset": "Current selection trends",
    "trend.titleAll": "All preset trends",
    "trend.hintPreset": "Stats for the currently selected preset",
    "trend.hintAll": "Cumulative stats across all presets",
    "trend.currentPreset": "Current preset",
    "trend.allPresets": "All presets",
    "trend.today": "Today",
    "trend.week": "This week",
    "trend.month": "This month",
    "trend.recent7": "Last 7 days",
    "trend.total": "Total",
    "trend.chart": "Chart",
    "trend.summary": "Summary",
    "trend.focusCount": "Focus count",
    "trend.todayTotal": "Today's focus total",
    "settings.title": "Pomodoro Settings",
    "settings.guide": "Guide",
    "settings.params": "Timer Parameters",
    "settings.presetLabel": "Preset label text",
    "settings.focusMinutes": "Focus (min)",
    "settings.shortMinutes": "Short break (min)",
    "settings.longMinutes": "Long break (min)",
    "settings.longEvery": "Long break interval",
    "settings.maxPomodoros": "Max pomodoros",
    "settings.autoSaveHint": "Changes are saved automatically. While running, changes are applied after confirmation and a safe timer reset.",
    "settings.presets": "Presets",
    "settings.addPreset": "+ Add preset",
    "settings.name": "Name",
    "settings.namePlaceholder": "e.g. Focus before meeting",
    "settings.save": "Save",
    "settings.cancel": "Cancel",
    "settings.display": "Display Customization",
    "settings.todoText": "Todo task text",
    "settings.todoPlaceholder": "e.g. Draft proposal v1",
    "settings.centerLabel": "Show center label",
    "settings.centerContent": "Center label content",
    "settings.bottomLabel": "Show bottom label",
    "settings.bottomContent": "Bottom label content",
    "settings.remainingTime": "Remaining time",
    "settings.todo": "Todo",
    "settings.displayHint": "Turn center/bottom labels on or off and choose remaining time or Todo text.",
    "settings.backup": "Backup",
    "settings.exportBackup": "Export backup",
    "settings.importBackup": "Import backup",
    "settings.backupHint": "Save a backup file before clearing browser cache or site data.",
    "guide.title": "Guide",
    "guide.item1": "Click the dial to start/pause, double-click to reset.",
    "guide.item2": "Without notification permission, you will not receive end-time or phase-change notifications.",
    "guide.item3": "Browser cache or site data deletion can remove your history, so exporting a backup is recommended.",
    "guide.installHint": "💡 Add the app and get notifications more conveniently!\niPhone / iPad: [Share] ➔ [Add to Home Screen] (required for notifications)\nMac: [Share] ➔ [Add to Dock] (required for notifications)\nAndroid / Windows: Add it to your home screen or desktop for faster, more convenient access and easier notification checks.",
    "guide.permissionChecking": "Checking notification permission...",
    "guide.requestPermission": "Request notification permission",
    "guide.acknowledge": "Got it",
    "preset.apply": "Apply",
    "preset.edit": "Edit",
    "preset.delete": "Delete",
    "preset.meta": "Focus {focus} / short {short} / long {long} · every {every} · max {max}",
    "confirm.importRunning": "The timer is running. Importing a backup will overwrite the current state. Continue?",
    "confirm.settingsRunning": "The timer is running. Changing settings will reset it. Continue?",
    "confirm.applyPresetRunning": "The timer is running. Applying a preset will reset it. Apply?",
    "confirm.deletePreset": "Delete this preset?",
    "confirm.applySavedPresetRunning": "The timer is running. Applying the saved preset will reset it. Apply?",
    "insights.currentSelection": "Current selection",
    "unit.count": "{count} times",
    "unit.minutes": "{count} min",
    "unit.hours": "{count} hr",
    "unit.hoursMinutes": "{hours} hr {minutes} min"
  }
};

const ALIASES = {
  ja: {
    "phase.focus": "集中", "phase.shortBreak": "短い休憩", "phase.longBreak": "長い休憩", "presets.standard": "標準", "presets.short": "短め", "presets.long": "長め", "cycle.completed": "{completed} / {max} ポモドーロ完了", "status.ready": "準備完了", "status.focusStart": "集中を開始", "status.paused": "一時停止", "status.resumed": "再開", "status.reset": "リセット済み", "trend.today": "今日", "trend.week": "今週", "trend.month": "今月", "trend.recent7": "直近7日", "trend.total": "合計", "settings.title": "ポモドーロ設定", "settings.guide": "使い方", "settings.presets": "プリセット", "settings.addPreset": "+ プリセット追加", "settings.save": "保存", "settings.cancel": "キャンセル", "guide.title": "使い方", "guide.acknowledge": "確認しました", "preset.apply": "適用", "preset.edit": "編集", "preset.delete": "削除", "notification.permissionPrefix": "通知権限:", "permission.checking": "未確認", "permission.granted": "許可済み", "permission.denied": "ブロック", "permission.default": "未要求", "unit.count": "{count}回", "unit.minutes": "{count}分", "unit.hours": "{count}時間", "unit.hoursMinutes": "{hours}時間 {minutes}分"
  },
  "zh-CN": {
    "phase.focus": "专注", "phase.shortBreak": "短休息", "phase.longBreak": "长休息", "presets.standard": "标准", "presets.short": "短时", "presets.long": "长时", "cycle.completed": "已完成 {completed} / {max} 个番茄钟", "status.ready": "准备就绪", "status.focusStart": "开始专注", "status.paused": "已暂停", "status.resumed": "已继续", "status.reset": "已重置", "trend.today": "今天", "trend.week": "本周", "trend.month": "本月", "trend.recent7": "最近7天", "trend.total": "全部", "settings.title": "番茄钟设置", "settings.guide": "使用指南", "settings.presets": "预设", "settings.addPreset": "+ 添加预设", "settings.save": "保存", "settings.cancel": "取消", "guide.title": "使用指南", "guide.acknowledge": "知道了", "preset.apply": "应用", "preset.edit": "编辑", "preset.delete": "删除", "notification.permissionPrefix": "通知权限:", "permission.checking": "未检查", "permission.granted": "已允许", "permission.denied": "已阻止", "permission.default": "未请求", "unit.count": "{count}次", "unit.minutes": "{count}分钟", "unit.hours": "{count}小时", "unit.hoursMinutes": "{hours}小时 {minutes}分钟"
  },
  "zh-TW": {
    "phase.focus": "專注", "phase.shortBreak": "短休息", "phase.longBreak": "長休息", "presets.standard": "標準", "presets.short": "短時", "presets.long": "長時", "cycle.completed": "已完成 {completed} / {max} 個番茄鐘", "status.ready": "準備就緒", "status.focusStart": "開始專注", "status.paused": "已暫停", "status.resumed": "已繼續", "status.reset": "已重設", "trend.today": "今天", "trend.week": "本週", "trend.month": "本月", "trend.recent7": "最近7天", "trend.total": "全部", "settings.title": "番茄鐘設定", "settings.guide": "使用說明", "settings.presets": "預設", "settings.addPreset": "+ 新增預設", "settings.save": "儲存", "settings.cancel": "取消", "guide.title": "使用說明", "guide.acknowledge": "知道了", "preset.apply": "套用", "preset.edit": "編輯", "preset.delete": "刪除", "notification.permissionPrefix": "通知權限:", "permission.checking": "未檢查", "permission.granted": "已允許", "permission.denied": "已封鎖", "permission.default": "未要求", "unit.count": "{count}次", "unit.minutes": "{count}分鐘", "unit.hours": "{count}小時", "unit.hoursMinutes": "{hours}小時 {minutes}分鐘"
  },
  es: {
    "phase.focus": "Enfoque", "phase.shortBreak": "Descanso corto", "phase.longBreak": "Descanso largo", "presets.standard": "Estándar", "presets.short": "Corto", "presets.long": "Largo", "cycle.completed": "{completed} / {max} pomodoros completados", "status.ready": "Listo", "status.focusStart": "Enfoque iniciado", "status.paused": "Pausado", "status.resumed": "Reanudado", "status.reset": "Restablecido", "trend.today": "Hoy", "trend.week": "Esta semana", "trend.month": "Este mes", "trend.recent7": "Últimos 7 días", "trend.total": "Total", "settings.title": "Ajustes de Pomodoro", "settings.guide": "Guía", "settings.presets": "Preajustes", "settings.addPreset": "+ Añadir preajuste", "settings.save": "Guardar", "settings.cancel": "Cancelar", "guide.title": "Guía", "guide.acknowledge": "Entendido", "preset.apply": "Aplicar", "preset.edit": "Editar", "preset.delete": "Eliminar", "notification.permissionPrefix": "Permiso de notificación:", "permission.checking": "Sin comprobar", "permission.granted": "Permitido", "permission.denied": "Bloqueado", "permission.default": "No solicitado", "unit.count": "{count} veces", "unit.minutes": "{count} min", "unit.hours": "{count} h", "unit.hoursMinutes": "{hours} h {minutes} min"
  },
  fr: {
    "phase.focus": "Concentration", "phase.shortBreak": "Pause courte", "phase.longBreak": "Pause longue", "presets.standard": "Standard", "presets.short": "Court", "presets.long": "Long", "cycle.completed": "{completed} / {max} pomodoros terminés", "status.ready": "Prêt", "status.focusStart": "Concentration démarrée", "status.paused": "En pause", "status.resumed": "Repris", "status.reset": "Réinitialisé", "trend.today": "Aujourd'hui", "trend.week": "Cette semaine", "trend.month": "Ce mois-ci", "trend.recent7": "7 derniers jours", "trend.total": "Total", "settings.title": "Réglages Pomodoro", "settings.guide": "Guide", "settings.presets": "Préréglages", "settings.addPreset": "+ Ajouter", "settings.save": "Enregistrer", "settings.cancel": "Annuler", "guide.title": "Guide", "guide.acknowledge": "Compris", "preset.apply": "Appliquer", "preset.edit": "Modifier", "preset.delete": "Supprimer", "notification.permissionPrefix": "Autorisation de notification:", "permission.checking": "Non vérifié", "permission.granted": "Autorisé", "permission.denied": "Bloqué", "permission.default": "Non demandé", "unit.count": "{count} fois", "unit.minutes": "{count} min", "unit.hours": "{count} h", "unit.hoursMinutes": "{hours} h {minutes} min"
  },
  de: {
    "phase.focus": "Fokus", "phase.shortBreak": "Kurze Pause", "phase.longBreak": "Lange Pause", "presets.standard": "Standard", "presets.short": "Kurz", "presets.long": "Lang", "cycle.completed": "{completed} / {max} Pomodoros erledigt", "status.ready": "Bereit", "status.focusStart": "Fokus gestartet", "status.paused": "Pausiert", "status.resumed": "Fortgesetzt", "status.reset": "Zurückgesetzt", "trend.today": "Heute", "trend.week": "Diese Woche", "trend.month": "Dieser Monat", "trend.recent7": "Letzte 7 Tage", "trend.total": "Gesamt", "settings.title": "Pomodoro-Einstellungen", "settings.guide": "Anleitung", "settings.presets": "Voreinstellungen", "settings.addPreset": "+ Voreinstellung", "settings.save": "Speichern", "settings.cancel": "Abbrechen", "guide.title": "Anleitung", "guide.acknowledge": "Verstanden", "preset.apply": "Anwenden", "preset.edit": "Bearbeiten", "preset.delete": "Löschen", "notification.permissionPrefix": "Benachrichtigungsrecht:", "permission.checking": "Nicht geprüft", "permission.granted": "Erlaubt", "permission.denied": "Blockiert", "permission.default": "Nicht angefragt", "unit.count": "{count} mal", "unit.minutes": "{count} Min.", "unit.hours": "{count} Std.", "unit.hoursMinutes": "{hours} Std. {minutes} Min."
  },
  pt: {
    "phase.focus": "Foco", "phase.shortBreak": "Pausa curta", "phase.longBreak": "Pausa longa", "presets.standard": "Padrão", "presets.short": "Curto", "presets.long": "Longo", "cycle.completed": "{completed} / {max} pomodoros concluídos", "status.ready": "Pronto", "status.focusStart": "Foco iniciado", "status.paused": "Pausado", "status.resumed": "Retomado", "status.reset": "Redefinido", "trend.today": "Hoje", "trend.week": "Esta semana", "trend.month": "Este mês", "trend.recent7": "Últimos 7 dias", "trend.total": "Total", "settings.title": "Configurações Pomodoro", "settings.guide": "Guia", "settings.presets": "Predefinições", "settings.addPreset": "+ Adicionar", "settings.save": "Salvar", "settings.cancel": "Cancelar", "guide.title": "Guia", "guide.acknowledge": "Entendi", "preset.apply": "Aplicar", "preset.edit": "Editar", "preset.delete": "Excluir", "notification.permissionPrefix": "Permissão de notificação:", "permission.checking": "Não verificado", "permission.granted": "Permitido", "permission.denied": "Bloqueado", "permission.default": "Não solicitado", "unit.count": "{count} vezes", "unit.minutes": "{count} min", "unit.hours": "{count} h", "unit.hoursMinutes": "{hours} h {minutes} min"
  },
  ru: {
    "phase.focus": "Фокус", "phase.shortBreak": "Короткий перерыв", "phase.longBreak": "Длинный перерыв", "presets.standard": "Стандарт", "presets.short": "Короткий", "presets.long": "Длинный", "cycle.completed": "Выполнено {completed} / {max} помодоро", "status.ready": "Готово", "status.focusStart": "Фокус начат", "status.paused": "Пауза", "status.resumed": "Продолжено", "status.reset": "Сброшено", "trend.today": "Сегодня", "trend.week": "Эта неделя", "trend.month": "Этот месяц", "trend.recent7": "Последние 7 дней", "trend.total": "Всего", "settings.title": "Настройки Pomodoro", "settings.guide": "Справка", "settings.presets": "Пресеты", "settings.addPreset": "+ Добавить", "settings.save": "Сохранить", "settings.cancel": "Отмена", "guide.title": "Справка", "guide.acknowledge": "Понятно", "preset.apply": "Применить", "preset.edit": "Изменить", "preset.delete": "Удалить", "notification.permissionPrefix": "Разрешение уведомлений:", "permission.checking": "Не проверено", "permission.granted": "Разрешено", "permission.denied": "Заблокировано", "permission.default": "Не запрошено", "unit.count": "{count} раз", "unit.minutes": "{count} мин", "unit.hours": "{count} ч", "unit.hoursMinutes": "{hours} ч {minutes} мин"
  },
  ar: {
    "phase.focus": "تركيز", "phase.shortBreak": "استراحة قصيرة", "phase.longBreak": "استراحة طويلة", "presets.standard": "قياسي", "presets.short": "قصير", "presets.long": "طويل", "cycle.completed": "اكتمل {completed} / {max} بومودورو", "status.ready": "جاهز", "status.focusStart": "بدأ التركيز", "status.paused": "متوقف مؤقتاً", "status.resumed": "تم الاستئناف", "status.reset": "تمت إعادة الضبط", "trend.today": "اليوم", "trend.week": "هذا الأسبوع", "trend.month": "هذا الشهر", "trend.recent7": "آخر 7 أيام", "trend.total": "الإجمالي", "settings.title": "إعدادات بومودورو", "settings.guide": "الدليل", "settings.presets": "الإعدادات", "settings.addPreset": "+ إضافة", "settings.save": "حفظ", "settings.cancel": "إلغاء", "guide.title": "الدليل", "guide.acknowledge": "فهمت", "preset.apply": "تطبيق", "preset.edit": "تعديل", "preset.delete": "حذف", "notification.permissionPrefix": "إذن الإشعارات:", "permission.checking": "لم يتم الفحص", "permission.granted": "مسموح", "permission.denied": "محظور", "permission.default": "لم يطلب", "unit.count": "{count} مرة", "unit.minutes": "{count} دقيقة", "unit.hours": "{count} ساعة", "unit.hoursMinutes": "{hours} ساعة {minutes} دقيقة"
  },
  hi: {
    "phase.focus": "फोकस", "phase.shortBreak": "छोटा ब्रेक", "phase.longBreak": "लंबा ब्रेक", "presets.standard": "मानक", "presets.short": "छोटा", "presets.long": "लंबा", "cycle.completed": "{completed} / {max} पोमोडोरो पूरे", "status.ready": "तैयार", "status.focusStart": "फोकस शुरू", "status.paused": "रुका हुआ", "status.resumed": "फिर शुरू", "status.reset": "रीसेट", "trend.today": "आज", "trend.week": "इस सप्ताह", "trend.month": "इस महीने", "trend.recent7": "पिछले 7 दिन", "trend.total": "कुल", "settings.title": "पोमोडोरो सेटिंग्स", "settings.guide": "गाइड", "settings.presets": "प्रीसेट", "settings.addPreset": "+ प्रीसेट जोड़ें", "settings.save": "सेव", "settings.cancel": "रद्द", "guide.title": "गाइड", "guide.acknowledge": "समझ गया", "preset.apply": "लागू", "preset.edit": "संपादित", "preset.delete": "हटाएं", "notification.permissionPrefix": "नोटिफिकेशन अनुमति:", "permission.checking": "जाँचा नहीं", "permission.granted": "अनुमति है", "permission.denied": "ब्लॉक", "permission.default": "अनुरोध नहीं", "unit.count": "{count} बार", "unit.minutes": "{count} मिनट", "unit.hours": "{count} घंटे", "unit.hoursMinutes": "{hours} घंटे {minutes} मिनट"
  }
};

Object.keys(ALIASES).forEach(function (locale) {
  TEXT[locale] = Object.assign({}, TEXT.en, ALIASES[locale]);
});

const STATIC_TEXT = {
  phaseTitle: "phase.focus",
  cycleLabel: "cycle.completed",
  statusLine: "status.ready",
  trendTitle: "trend.titlePreset",
  trendScopeHint: "trend.hintPreset",
  trendScopePresetBtn: "trend.currentPreset",
  trendScopeAllBtn: "trend.allPresets",
  trendTodayLabel: "trend.today",
  trendWeekLabel: "trend.week",
  trendMonthLabel: "trend.month",
  trendRecent7Label: "trend.recent7",
  trendTotalLabel: "trend.total",
  trendChartTitle: "trend.chart",
  trendSummaryTitle: "trend.summary",
  summaryCountLabel: "trend.focusCount",
  summaryTodayLabel: "trend.todayTotal",
  settingsTitle: "settings.title",
  openGuideBtn: "settings.guide",
  presetLabelTextLabel: "settings.presetLabel",
  focusMinLabel: "settings.focusMinutes",
  shortMinLabel: "settings.shortMinutes",
  longMinLabel: "settings.longMinutes",
  longEveryLabel: "settings.longEvery",
  maxPomodorosLabel: "settings.maxPomodoros",
  timerParamsHint: "settings.autoSaveHint",
  presetsTitle: "settings.presets",
  addPresetBtn: "settings.addPreset",
  presetNameLabel: "settings.name",
  presetFocusLabel: "phase.focus",
  presetShortLabel: "phase.shortBreak",
  presetLongLabel: "phase.longBreak",
  presetEveryLabel: "settings.longEvery",
  presetMaxLabel: "settings.maxPomodoros",
  savePresetBtn: "settings.save",
  cancelPresetBtn: "settings.cancel",
  todoTextLabel: "settings.todoText",
  centerLabelEnabledLabel: "settings.centerLabel",
  centerLabelModeLabel: "settings.centerContent",
  bottomLabelEnabledLabel: "settings.bottomLabel",
  bottomLabelModeLabel: "settings.bottomContent",
  displayTitle: "settings.display",
  displayHint: "settings.displayHint",
  backupTitle: "settings.backup",
  exportBackupBtn: "settings.exportBackup",
  importBackupBtn: "settings.importBackup",
  backupHint: "settings.backupHint",
  guideTitle: "guide.title",
  guideItem1: "guide.item1",
  guideItem2: "guide.item2",
  guideItem3: "guide.item3",
  guideInstallHint: "guide.installHint",
  guidePermissionState: "guide.permissionChecking",
  guideRequestPermissionBtn: "guide.requestPermission",
  guideAcknowledgeBtn: "guide.acknowledge"
};

const STATIC_QUERY = [
  [".timer-params-summary", "settings.params"],
  [".timer-params .hint", "settings.autoSaveHint"],
  ["#settingsOverlay .sheet-title", "settings.title"],
  ["#settingsOverlay .sheet-block:nth-of-type(2) h3", "settings.presets"],
  ["#settingsOverlay .sheet-block:nth-of-type(3) h3", "settings.display"],
  ["#settingsOverlay .sheet-block:nth-of-type(3) .hint", "settings.displayHint"],
  ["#settingsOverlay .sheet-block:nth-of-type(4) h3", "settings.backup"],
  ["#settingsOverlay .sheet-block:nth-of-type(4) .hint", "settings.backupHint"],
  ["#guideOverlay .guide-title", "guide.title"],
  ["#guideOverlay .guide-list li:nth-child(1)", "guide.item1"],
  ["#guideOverlay .guide-list li:nth-child(2)", "guide.item2"],
  ["#guideOverlay .guide-list li:nth-child(3)", "guide.item3"],
  ["#insightsOverlay .trend-cell:nth-child(1) .trend-label", "trend.today"],
  ["#insightsOverlay .trend-cell:nth-child(2) .trend-label", "trend.week"],
  ["#insightsOverlay .trend-cell:nth-child(3) .trend-label", "trend.month"],
  ["#insightsOverlay .trend-cell:nth-child(4) .trend-label", "trend.recent7"],
  ["#insightsOverlay .trend-cell:nth-child(5) .trend-label", "trend.total"],
  ["#insightsOverlay .sheet-block:nth-of-type(2) h3", "trend.chart"],
  ["#insightsOverlay .sheet-block:nth-of-type(3) h3", "trend.summary"],
  ["#insightsOverlay .summary-card:nth-child(1) p", "trend.focusCount"],
  ["#insightsOverlay .summary-card:nth-child(2) p", "trend.todayTotal"]
];

const ATTRS = [
  ["openInsightsBtn", "aria-label", "aria.openInsights"],
  ["openSettingsBtn", "aria-label", "aria.openSettings"],
  ["dialShell", "aria-label", "aria.toggleTimer"],
  ["closeInsightsBtn", "aria-label", "aria.closeInsights"],
  ["weeklyChart", "aria-label", "aria.weeklyChart"],
  ["closeSettingsBtn", "aria-label", "aria.closeSettings"],
  ["closeGuideBtn", "aria-label", "aria.closeGuide"],
  ["presetNameInput", "placeholder", "settings.namePlaceholder"],
  ["todoTextInput", "placeholder", "settings.todoPlaceholder"]
];

const DIALOG_ATTRS = [
  ["#insightsOverlay .sheet", "aria-label", "aria.insightsDialog"],
  ["#insightsOverlay .scope-toggle", "aria-label", "aria.trendScope"],
  ["#settingsOverlay .sheet", "aria-label", "aria.settingsDialog"],
  ["#guideOverlay .guide-card", "aria-label", "aria.guideDialog"]
];

function format(template, params) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, key) {
    return Object.prototype.hasOwnProperty.call(params || {}, key) ? String(params[key]) : match;
  });
}

function normalizeLocale(value) {
  const raw = String(value || "").trim().replace(/_/g, "-");
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("zh")) {
    return /-(tw|hk|mo)$/i.test(raw) ? "zh-TW" : "zh-CN";
  }
  if (lower.startsWith("pt")) return "pt";
  const base = lower.split("-")[0];
  if (SUPPORTED_LOCALES.includes(raw)) return raw;
  if (SUPPORTED_LOCALES.includes(base)) return base;
  return "";
}

function detectFromTimeZone() {
  let timeZone = "";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    timeZone = "";
  }
  const match = TIME_ZONE_LOCALES.find(function (entry) { return entry[0].test(timeZone); });
  return match ? match[1] : "";
}

function detectLocale() {
  const params = new URLSearchParams(window.location.search);
  const explicit = normalizeLocale(params.get("lang"));
  if (explicit) return explicit;

  const browserLocales = Array.from(navigator.languages || [navigator.language || ""]);
  for (const locale of browserLocales) {
    const normalized = normalizeLocale(locale);
    if (normalized) return normalized;
  }

  return detectFromTimeZone() || "en";
}

function getText(locale, key) {
  const active = TEXT[locale] || TEXT.en;
  return active[key] || TEXT.en[key] || TEXT.ko[key] || key;
}

export function createFocusTimerI18n() {
  const locale = detectLocale();
  const meta = LOCALE_META[locale] || LOCALE_META.en;

  const t = function (key, params) {
    return format(getText(locale, key), params || {});
  };

  const phaseLabel = function (phase) {
    return t("phase." + (phase || "focus"));
  };

  const presetName = function (id, fallback) {
    if (id === "preset-standard") return t("presets.standard");
    if (id === "preset-short") return t("presets.short");
    if (id === "preset-long") return t("presets.long");
    return fallback || t("presets.custom");
  };

  const normalizePresetName = function (name) {
    const value = String(name || "").trim();
    const builtInNames = [
      "표준", "Standard", "標準", "标准", "標準", "Estándar", "Padrão", "Стандарт", "قياسي", "मानक",
      "단기", "Short", "短め", "短时", "短時", "Corto", "Court", "Kurz", "Curto", "Короткий", "قصير", "छोटा",
      "장기", "Long", "長め", "长时", "長時", "Largo", "Long", "Lang", "Longo", "Длинный", "طويل", "लंबा"
    ];
    if (!value) return "";
    if (builtInNames.includes(value)) {
      if (["표준", "Standard", "標準", "标准", "Estándar", "Padrão", "Стандарт", "قياسي", "मानक"].includes(value)) return t("presets.standard");
      if (["단기", "Short", "短め", "短时", "短時", "Corto", "Court", "Kurz", "Curto", "Короткий", "قصير", "छोटा"].includes(value)) return t("presets.short");
      return t("presets.long");
    }
    return value;
  };

  const localizeBuiltInPresets = function (presets) {
    return presets.map(function (preset) {
      return { ...preset, name: presetName(preset.id, preset.name) };
    });
  };

  const formatHumanMinutes = function (minutes) {
    const safe = Math.max(0, Math.round(minutes));
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    if (hours <= 0) return t("unit.minutes", { count: mins });
    if (mins === 0) return t("unit.hours", { count: hours });
    return t("unit.hoursMinutes", { hours: hours, minutes: mins });
  };

  const applyStaticTranslations = function () {
    document.documentElement.lang = meta.lang;
    document.documentElement.dir = meta.dir;
    document.title = t("app.title");

    Object.keys(STATIC_TEXT).forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      const params = id === "cycleLabel" ? { completed: 0, max: 12 } : {};
      el.textContent = t(STATIC_TEXT[id], params);
    });

    STATIC_QUERY.forEach(function (entry) {
      const el = document.querySelector(entry[0]);
      if (el) el.textContent = t(entry[1]);
    });

    ATTRS.forEach(function (entry) {
      const el = document.getElementById(entry[0]);
      if (el) el.setAttribute(entry[1], t(entry[2]));
    });

    DIALOG_ATTRS.forEach(function (entry) {
      const el = document.querySelector(entry[0]);
      if (el) el.setAttribute(entry[1], t(entry[2]));
    });

    document.querySelectorAll('option[value="time"]').forEach(function (option) {
      option.textContent = t("settings.remainingTime");
    });
    document.querySelectorAll('option[value="todo"]').forEach(function (option) {
      option.textContent = t("settings.todo");
    });

    const permissionLabel = document.getElementById("permissionLabel");
    if (permissionLabel && permissionLabel.parentElement) {
      permissionLabel.textContent = t("permission.checking");
      permissionLabel.parentElement.replaceChildren(
        document.createTextNode(t("notification.permissionPrefix") + " "),
        permissionLabel,
        document.createTextNode(" · " + t("notification.badgeHint"))
      );
    }
  };

  return {
    locale,
    lang: meta.lang,
    dir: meta.dir,
    t,
    phaseLabel,
    presetName,
    normalizePresetName,
    localizeBuiltInPresets,
    formatHumanMinutes,
    applyStaticTranslations,
  };
}
