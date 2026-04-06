(function () {
  const slots = document.querySelectorAll("ins.adsbygoogle");
  if (!slots.length) return;

  slots.forEach((slot) => {
    if (slot.dataset.adsInitialized === "1") return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      slot.dataset.adsInitialized = "1";
    } catch {
      // Ignore transient ad-init errors from blocked or slow ad scripts.
    }
  });
})();
