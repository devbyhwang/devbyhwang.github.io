import {
  getAutoMaxPages,
  getDefaultPageRange,
  getMaxEndPage,
  normalizePageRange,
} from "./pdf-range.js";

export function createPdfRangeWorkflow({
  state,
  els,
  limits,
  t,
  escapeHtml,
  showToast,
  setProgress,
  isPdfFile,
  getPdfDocument,
}) {
  const pdfInspectionCache = new WeakMap();
  const encryptMarker = new TextEncoder().encode("/Encrypt");

  function bytesIncludeMarker(bytes, marker) {
    if (!bytes || bytes.length < marker.length) return false;
    for (let index = 0; index <= bytes.length - marker.length; index += 1) {
      let matches = true;
      for (let markerIndex = 0; markerIndex < marker.length; markerIndex += 1) {
        if (bytes[index + markerIndex] !== marker[markerIndex]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
    return false;
  }

  function isPdfProtectionError(error) {
    const name = String(error?.name || "");
    const message = String(error?.message || error || "").toLowerCase();
    return name === "PasswordException" || message.includes("password") || message.includes("encrypted");
  }

  function createProtectedPdfError(file) {
    const error = new Error(t("pdfProtectedRejected", { name: file.name }));
    error.code = "PDF_PROTECTED";
    return error;
  }

  function showPdfRangePanel() {
    els.pageRangeModal.classList.add("is-visible");
    els.pageRangePanel.classList.add("is-visible");
    document.body.classList.add("has-modal");
    window.requestAnimationFrame(() => {
      const firstInput = els.pdfRangeList.querySelector("input");
      (firstInput || els.pageRangeProcessBtn).focus();
    });
  }

  function hidePdfRangePanel() {
    els.pageRangeModal.classList.remove("is-visible");
    els.pageRangePanel.classList.remove("is-visible");
    document.body.classList.remove("has-modal");
  }

  function resetPdfRangePanel() {
    state.pdfPageCount = 0;
    state.pdfRangeFiles = [];
    state.pdfPageRanges.clear();
    state.pdfFilePageCounts.clear();
    state.pendingFiles = [];
    hidePdfRangePanel();
    els.pdfRangeList.innerHTML = "";
  }

  function normalizeRangeWithNotice(totalPages, startValue, endValue) {
    const range = normalizePageRange(totalPages, startValue, endValue, limits);
    if (range.requestedEnd > range.maxEnd) {
      showToast(t("overMaxPages", { max: limits.maxProcessPages }));
    }
    return { start: range.start, end: range.end };
  }

  function setPdfPageRanges(pdfInfos) {
    const maxPageCount = Math.max(...pdfInfos.map(({ pageCount }) => pageCount));
    state.pdfPageCount = maxPageCount;
    state.pdfRangeFiles = pdfInfos.map(({ file }) => file);
    state.pdfPageRanges.clear();
    state.pdfFilePageCounts.clear();

    pdfInfos.forEach(({ file, pageCount }) => {
      state.pdfPageRanges.set(file, getDefaultPageRange(pageCount, limits));
      state.pdfFilePageCounts.set(file, pageCount);
    });

    els.pageRangeMessage.textContent = pdfInfos.length > 1
      ? t("pdfRangeMany", { count: pdfInfos.length, max: limits.maxProcessPages, confirm: limits.confirmLargeRangePages })
      : t("pdfRangeOne", { pages: maxPageCount, max: limits.maxProcessPages, confirm: limits.confirmLargeRangePages });

    els.pdfRangeList.innerHTML = pdfInfos.map(({ file, pageCount }, index) => {
      const range = state.pdfPageRanges.get(file);
      return `
        <div class="pdf-range-row" data-pdf-range-index="${index}" data-page-count="${pageCount}">
          <div class="pdf-range-heading">
            <span>${escapeHtml(file.name)}</span>
            <small>${escapeHtml(t("pageCount", { count: pageCount }))}</small>
          </div>
          <div class="pdf-range-inputs">
            <label class="control">${escapeHtml(t("startPage"))}
              <input data-range-role="start" type="number" min="1" max="${pageCount}" value="${range.start}">
            </label>
            <div class="pdf-range-end-control">
              <label class="control">${escapeHtml(t("endPage"))}
                <input data-range-role="end" type="number" min="1" max="${pageCount}" value="${range.end}">
              </label>
              <label class="range-max-check">
                <input data-range-role="max" type="checkbox">
                <span>${escapeHtml(t("toMaxPage"))}</span>
              </label>
            </div>
          </div>
        </div>
      `;
    }).join("");

    showPdfRangePanel();
  }

  function collectPdfRangeInputs() {
    els.pdfRangeList.querySelectorAll(".pdf-range-row").forEach((row) => {
      const index = Number(row.dataset.pdfRangeIndex);
      const pageCount = Number(row.dataset.pageCount);
      const file = state.pdfRangeFiles[index];
      const startInput = row.querySelector('[data-range-role="start"]');
      const endInput = row.querySelector('[data-range-role="end"]');
      if (!file || !startInput || !endInput || !Number.isFinite(pageCount)) return;

      const range = normalizeRangeWithNotice(pageCount, startInput.value, endInput.value);
      startInput.value = String(range.start);
      endInput.value = String(range.end);
      state.pdfPageRanges.set(file, range);
    });
  }

  function applyMaxEndPage(row) {
    const pageCount = Number(row.dataset.pageCount);
    const startInput = row.querySelector('[data-range-role="start"]');
    const endInput = row.querySelector('[data-range-role="end"]');
    if (!startInput || !endInput || !Number.isFinite(pageCount)) return;
    endInput.value = String(getMaxEndPage(pageCount, startInput.value, limits));
  }

  function getLargePageRangeSelections() {
    return state.pdfRangeFiles.reduce((ranges, file) => {
      const totalPages = Number(state.pdfFilePageCounts.get(file));
      if (!Number.isFinite(totalPages)) return ranges;

      const selectedRange = state.pdfPageRanges.get(file) || getDefaultPageRange(totalPages, limits);
      const range = normalizeRangeWithNotice(totalPages, selectedRange.start, selectedRange.end);
      const selectedCount = range.end - range.start + 1;
      if (selectedCount > limits.confirmLargeRangePages) {
        ranges.push({ name: file.name, start: range.start, end: range.end, selectedCount });
      }
      return ranges;
    }, []);
  }

  function getSelectedPageRange(file, totalPages) {
    const range = state.pdfPageRanges.get(file) || getDefaultPageRange(totalPages, limits);
    return normalizeRangeWithNotice(totalPages, range.start, range.end);
  }

  async function inspectPdfFile(file) {
    if (pdfInspectionCache.has(file)) return pdfInspectionCache.get(file);

    const bytes = await file.arrayBuffer();
    const data = new Uint8Array(bytes);
    if (bytesIncludeMarker(data, encryptMarker)) {
      throw createProtectedPdfError(file);
    }

    let pdf = null;
    try {
      pdf = await getPdfDocument(data.slice());
      const info = { file, pageCount: pdf.numPages };
      pdfInspectionCache.set(file, info);
      return info;
    } catch (error) {
      if (isPdfProtectionError(error)) {
        throw createProtectedPdfError(file);
      }
      throw error;
    } finally {
      await pdf?.destroy?.();
    }
  }

  async function getPdfPageCount(file) {
    const { pageCount } = await inspectPdfFile(file);
    return pageCount;
  }

  async function rejectProtectedPdfFiles(files) {
    const acceptedFiles = [];
    const rejectedNames = [];

    for (const file of files) {
      if (!isPdfFile(file)) {
        acceptedFiles.push(file);
        continue;
      }

      try {
        await inspectPdfFile(file);
        acceptedFiles.push(file);
      } catch (error) {
        if (error?.code === "PDF_PROTECTED") {
          rejectedNames.push(file.name);
          continue;
        }
        throw error;
      }
    }

    if (rejectedNames.length) {
      const previewNames = rejectedNames.slice(0, 3).join(", ");
      const extraCount = Math.max(0, rejectedNames.length - 3);
      showToast(t("pdfProtectedRejected", { name: extraCount ? `${previewNames} +${extraCount}` : previewNames }));
    }

    return acceptedFiles;
  }

  async function preparePageRangeForFiles(files) {
    const pdfFiles = files.filter(isPdfFile);

    if (!pdfFiles.length) {
      resetPdfRangePanel();
      return false;
    }

    try {
      setProgress(0, t("checkingPdfPages"));
      const pdfInfos = [];
      for (const file of pdfFiles) {
        const pageCount = await getPdfPageCount(file);
        pdfInfos.push({ file, pageCount });
      }

      const maxPageCount = Math.max(...pdfInfos.map(({ pageCount }) => pageCount));
      const hasLargePdf = pdfInfos.some(({ pageCount }) => pageCount > limits.largePdfPageThreshold);
      const needsRangeConfirmation = hasLargePdf || pdfInfos.length > 1;

      if (needsRangeConfirmation) {
        setPdfPageRanges(pdfInfos);
        state.pendingFiles = files;
        showToast(t("confirmPdfRange"));
        return true;
      }

      state.pdfPageCount = maxPageCount;
      hidePdfRangePanel();
      els.pdfRangeList.innerHTML = "";
    } catch (error) {
      console.error(error);
      hidePdfRangePanel();
    } finally {
      setProgress(0, t("idle"));
    }

    state.pendingFiles = [];
    return false;
  }

  return {
    showPdfRangePanel,
    hidePdfRangePanel,
    resetPdfRangePanel,
    collectPdfRangeInputs,
    applyMaxEndPage,
    getLargePageRangeSelections,
    getSelectedPageRange,
    rejectProtectedPdfFiles,
    preparePageRangeForFiles,
  };
}
