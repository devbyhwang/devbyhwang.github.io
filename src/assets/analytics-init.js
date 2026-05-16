(function () {
  const script = document.currentScript;
  const measurementId = script && script.dataset ? script.dataset.measurementId : "";

  if (!measurementId) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId);
})();
