export function createWakeLockService(ctx) {
  const { state } = ctx;
  let sentinel = null;
  let pending = false;

  const isSupported = function () {
    return !!(navigator.wakeLock && typeof navigator.wakeLock.request === "function");
  };

  const shouldHold = function () {
    return !!state.behavior.keepScreenAwake &&
      state.timer.status === "running" &&
      document.visibilityState === "visible";
  };

  const handleRelease = function () {
    sentinel = null;
  };

  const release = function () {
    if (!sentinel) return;
    const current = sentinel;
    sentinel = null;
    current.removeEventListener("release", handleRelease);
    current.release().catch(function () {});
  };

  const request = function () {
    if (!isSupported() || !shouldHold() || pending || sentinel) return;

    pending = true;
    navigator.wakeLock.request("screen")
      .then(function (nextSentinel) {
        pending = false;

        if (!shouldHold()) {
          nextSentinel.release().catch(function () {});
          return;
        }

        sentinel = nextSentinel;
        sentinel.addEventListener("release", handleRelease);
      })
      .catch(function () {
        pending = false;
      });
  };

  const sync = function () {
    if (shouldHold()) {
      request();
      return;
    }
    release();
  };

  const bindEvents = function () {
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", release);
  };

  return {
    bindEvents,
    isSupported,
    release,
    request,
    sync,
  };
}
