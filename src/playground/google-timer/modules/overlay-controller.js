export function createOverlayController(ctx) {
  const { els } = ctx;

  const updateOverlayScrollLock = function () {
    const settingsOpen = els.settingsOverlay && els.settingsOverlay.dataset.open === "true";
    const insightsOpen = els.insightsOverlay && els.insightsOverlay.dataset.open === "true";
    const guideOpen = els.guideOverlay && els.guideOverlay.dataset.open === "true";
    document.body.style.overflow = settingsOpen || insightsOpen || guideOpen ? "hidden" : "";
  };

  const openSheet = function () {
    if (els.insightsOverlay) els.insightsOverlay.dataset.open = "false";
    els.settingsOverlay.dataset.open = "true";
    updateOverlayScrollLock();
  };

  const closeSheet = function () {
    els.settingsOverlay.dataset.open = "false";
    updateOverlayScrollLock();
  };

  const openInsights = function () {
    if (els.settingsOverlay) els.settingsOverlay.dataset.open = "false";
    if (els.insightsOverlay) els.insightsOverlay.dataset.open = "true";
    ctx.services.insights.syncTrendScopeButtons();
    ctx.services.insights.renderInsights();
    updateOverlayScrollLock();
  };

  const closeInsights = function () {
    if (els.insightsOverlay) els.insightsOverlay.dataset.open = "false";
    updateOverlayScrollLock();
  };

  const openGuide = function () {
    if (els.settingsOverlay) els.settingsOverlay.dataset.open = "false";
    if (els.insightsOverlay) els.insightsOverlay.dataset.open = "false";
    if (els.guideOverlay) els.guideOverlay.dataset.open = "true";
    ctx.services.notification.syncPermission();
    updateOverlayScrollLock();
  };

  const closeGuide = function (markSeen) {
    if (els.guideOverlay) els.guideOverlay.dataset.open = "false";
    if (markSeen) ctx.services.notification.markGuideSeen();
    updateOverlayScrollLock();
  };

  return {
    updateOverlayScrollLock,
    openSheet,
    closeSheet,
    openInsights,
    closeInsights,
    openGuide,
    closeGuide,
  };
}
