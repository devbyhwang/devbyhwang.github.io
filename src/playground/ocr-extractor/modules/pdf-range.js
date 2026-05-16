export function getAutoMaxPages(totalPages, limits) {
  return Math.min(totalPages, limits.defaultProcessPages);
}

export function normalizePageRange(totalPages, startValue, endValue, limits) {
  const startNumber = Number(startValue);
  const endNumber = Number(endValue);
  const start = Number.isFinite(startNumber)
    ? Math.max(1, Math.min(totalPages, Math.floor(startNumber)))
    : 1;
  const fallbackEnd = Math.min(totalPages, start + limits.defaultProcessPages - 1);
  const maxEnd = Math.min(totalPages, start + limits.maxProcessPages - 1);
  const requestedEnd = Number.isFinite(endNumber)
    ? Math.max(start, Math.min(totalPages, Math.floor(endNumber)))
    : fallbackEnd;
  const end = Math.min(requestedEnd, maxEnd);
  return { start, end, requestedEnd, maxEnd };
}

export function getMaxEndPage(totalPages, startValue, limits) {
  const startNumber = Number(startValue);
  const start = Number.isFinite(startNumber)
    ? Math.max(1, Math.min(totalPages, Math.floor(startNumber)))
    : 1;
  return Math.min(totalPages, start + limits.maxProcessPages - 1);
}

export function getDefaultPageRange(totalPages, limits) {
  return {
    start: 1,
    end: totalPages > limits.largePdfPageThreshold ? getAutoMaxPages(totalPages, limits) : totalPages,
  };
}
