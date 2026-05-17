(function () {
  const MIN_SLOT_WIDTH = 1;
  const SECOND_PASS_DELAY_MS = 500;
  let resizeFrame = 0;

  const getAvailableWidth = function (slot) {
    if (!slot || !slot.isConnected || !slot.getClientRects().length) return 0;
    const slotRect = slot.getBoundingClientRect();
    if (slotRect.width > 0) return slotRect.width;
    const parent = slot.parentElement;
    if (!parent) return 0;
    return parent.getBoundingClientRect().width || 0;
  };

  const initializeVisibleSlots = function () {
    const slots = document.querySelectorAll("ins.adsbygoogle");
    if (!slots.length) return;

    slots.forEach((slot) => {
      if (slot.dataset.adsInitialized === "1") return;
      if (getAvailableWidth(slot) < MIN_SLOT_WIDTH) return;

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        slot.dataset.adsInitialized = "1";
      } catch {
        // Ignore transient ad-init errors from blocked or slow ad scripts.
      }
    });
  };

  const scheduleInitialize = function () {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(function () {
      resizeFrame = 0;
      initializeVisibleSlots();
    });
  };

  const runInitialInit = function () {
    scheduleInitialize();
    window.setTimeout(scheduleInitialize, SECOND_PASS_DELAY_MS);
  };

  runInitialInit();
  window.addEventListener("resize", scheduleInitialize, { passive: true });
  window.addEventListener("orientationchange", scheduleInitialize, { passive: true });
})();
