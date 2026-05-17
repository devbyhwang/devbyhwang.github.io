import {
  CANCELLED_ERROR,
  LIMITS,
  TESSERACT_BASE_URL,
  TESSERACT_CACHE_PATH,
  TESSERACT_CORE_URL,
  installReadableStreamIteratorPolyfill,
  loadPdfJs,
} from "./modules/constants.js";
import { createElements, createInitialState } from "./modules/state.js";
import {
  DEFAULT_OCR_LANGUAGE_BY_LOCALE,
  I18N,
  LANGUAGE_OPTION_LABELS,
  detectLocale,
  interpolate,
} from "./modules/i18n.js";
import { escapeHtml, formatBytes, getFileKey, mergeFileList } from "./modules/utils.js";
import { setCheckboxLabel, setControlLabel, setHtml, setText } from "./modules/dom.js";
import { fieldDefinitions, extractFields } from "./modules/field-extractor.js";
import { createOutputUiHelpers } from "./modules/output-ui.js";
import { createImageProcessingHelpers } from "./modules/image-processing.js";
import { createPdfRangeWorkflow } from "./modules/pdf-range-workflow.js";
import {
  buildRawExportJson,
  buildSearchablePdfBytes,
  buildStructuredExportJson,
  download,
  fieldsToCsv,
  fieldsToTxt,
  getDownloadFilename,
} from "./modules/exporters.js";
import { isAcceptedFile, isImageFile, isPdfFile, waitForGlobal } from "./modules/ocr-pipeline.js";

installReadableStreamIteratorPolyfill();
const { pdfjsLib, pdfjsLoadError } = await loadPdfJs();
const els = createElements();
const state = createInitialState();
let currentLocale = "ko";
let hasUserSelectedOcrLanguage = false;
const getCurrentLocale = () => currentLocale;
const SESSION_CANCELLED = Symbol("SESSION_CANCELLED");
const SETTINGS_MOBILE_QUERY = "(max-width: 640px)";
const settingsMobileMediaQuery = window.matchMedia(SETTINGS_MOBILE_QUERY);

const outputUi = createOutputUiHelpers({
  state,
  els,
  t,
  I18N,
  getCurrentLocale,
  escapeHtml,
  formatBytes,
  fieldDefinitions,
  extractFields,
});
const {
  getFieldKeys,
  getSelectedFieldKeys,
  getSelectedFields,
  localizeStatus,
  renderFields,
  renderPages,
  renderSelectedFiles,
  updateOutput,
} = outputUi;

const imageHelpers = createImageProcessingHelpers({ els, t });
const {
  getCharacterWhitelist,
  getDictionaryConfig,
  canvasToThumb,
  imageFileToCanvas,
  renderPdfPage,
  extractNativePdfText,
} = imageHelpers;

    function t(key, values = {}) {
      const localeText = I18N[currentLocale] || I18N.en;
      const value = localeText[key] ?? I18N.en[key] ?? I18N.ko[key] ?? key;
      return typeof value === "function" ? value(values) : interpolate(value, values);
    }

    function tf(key, fallback, values = {}) {
      const localeText = I18N[currentLocale] || I18N.en;
      const value = localeText[key] ?? I18N.en[key] ?? fallback;
      return typeof value === "function" ? value(values) : interpolate(value, values);
    }

    function getStructuredFieldsTxt() {
      return fieldsToTxt(getSelectedFields());
    }

    function syncSettingsToggleLabel() {
      if (!els.settingsPanel || !els.settingsToggleBtn) return;
      const isCollapsed = els.settingsPanel.classList.contains("is-collapsed");
      els.settingsToggleBtn.textContent = isCollapsed ? t("settingsExpand") : t("settingsCollapse");
      els.settingsToggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
    }

    function setSettingsCollapsed(isCollapsed) {
      if (!els.settingsPanel || !els.settingsControls) return;
      els.settingsPanel.classList.toggle("is-collapsed", isCollapsed);
      els.settingsControls.hidden = isCollapsed;
      syncSettingsToggleLabel();
    }

    function applyLanguageOptionLabels() {
      const labels = LANGUAGE_OPTION_LABELS[currentLocale] || LANGUAGE_OPTION_LABELS.en;
      [...els.languageSelect.options].forEach((option) => {
        option.textContent = labels[option.value] || LANGUAGE_OPTION_LABELS.en[option.value] || option.textContent;
      });
    }

    function applyLocale(locale) {
      currentLocale = I18N[locale] ? locale : "en";
      document.documentElement.lang = I18N[currentLocale].lang || currentLocale;
      document.documentElement.dir = I18N[currentLocale].dir || "ltr";

      document.title = "PDF OCR Extractor | DevByHwang";
      setText(".tool-header h1", "PDF OCR Extractor");
      setHtml(".lead", t("lead"));
      document.querySelector(".support-pills")?.setAttribute("aria-label", t("supportLabel"));
      setText(".dropzone h2", t("dropTitle"));
      setText(".dropzone p", t("dropHint"));
      setText(".pick-button", t("addFiles"));
      setText("#workStatusTitle", t("workStatusTitle"));
      setText(".work-panel-heading .hint", t("workStatusHint"));
              els.cancelBtn.textContent = t("cancel");
              els.pageRangeTitle.textContent = t("pageRangeTitle");
              els.pageRangeMessage.textContent = t("pageRangeDefault");
      els.pageRangeProcessBtn.textContent = t("processRange");
      document.querySelector(".meter")?.setAttribute("aria-label", t("progressLabel"));
      els.fileList.setAttribute("aria-label", t("selectedFilesLabel"));
      if (!state.busy && els.statusLine.textContent === I18N.ko.idle) {
        setProgress(0, t("idle"));
      }

      setText("#settingsTitle", t("settingsTitle"));
      setText("#settingsTitle + .hint", t("settingsHint"));
      syncSettingsToggleLabel();
      setControlLabel(els.languageSelect, t("language"));
      setControlLabel(els.pdfQualitySelect, t("pdfQuality"));
      setControlLabel(els.psmSelect, t("psm"));
      setControlLabel(els.preprocessSelect, t("preprocess"));
      setControlLabel(els.upscaleSelect, t("upscale"));
      setControlLabel(els.dictionarySelect, t("dictionary"));
      setControlLabel(els.charModeSelect, t("charMode"));
      applyLanguageOptionLabels();
      if (!hasUserSelectedOcrLanguage) {
        els.languageSelect.value = DEFAULT_OCR_LANGUAGE_BY_LOCALE[currentLocale] || DEFAULT_OCR_LANGUAGE_BY_LOCALE.en;
      }

      els.pdfQualitySelect.options[0].textContent = t("quality2400");
      els.pdfQualitySelect.options[1].textContent = t("quality1800");
      els.pdfQualitySelect.options[2].textContent = t("quality1200");
      els.pdfQualitySelect.options[3].textContent = t("quality3000");
      els.psmSelect.options[0].textContent = t("psm3");
      els.psmSelect.options[1].textContent = t("psm4");
      els.psmSelect.options[2].textContent = t("psm6");
      els.psmSelect.options[3].textContent = t("psm7");
      els.psmSelect.options[4].textContent = t("psm11");
      els.psmSelect.options[5].textContent = t("psm5");
      els.preprocessSelect.options[0].textContent = t("contrast");
      els.preprocessSelect.options[1].textContent = t("grayscale");
      els.preprocessSelect.options[2].textContent = t("threshold");
      els.preprocessSelect.options[3].textContent = t("none");
      els.upscaleSelect.options[0].textContent = t("autoUpscale");
      els.upscaleSelect.options[1].textContent = t("noUpscale");
      els.dictionarySelect.options[0].textContent = t("dictionaryNormal");
      els.dictionarySelect.options[1].textContent = t("dictionaryOff");
      els.charModeSelect.options[0].textContent = t("charAll");
      els.charModeSelect.options[1].textContent = t("charNumbers");
      els.charModeSelect.options[2].textContent = t("charContact");

      setCheckboxLabel(els.autoRotateInput, t("autoRotate"));
      setCheckboxLabel(els.borderPaddingInput, t("borderPadding"));
      setCheckboxLabel(els.forceOcrInput, t("forceOcr"));
      setCheckboxLabel(els.preserveSpacesInput, t("preserveSpaces"));

      setText("#rawTitle", t("rawTitle"));
      setText("#rawTitle + .hint", t("rawHint"));
      els.copyTextBtn.textContent = t("copy");
      els.clearBtn.textContent = t("clear");
      els.textOutput.placeholder = t("textPlaceholder");
      setText("#structuredTitle", t("structuredTitle"));
      els.selectFieldsBtn.textContent = t("selectAll");
      els.clearFieldsBtn.textContent = t("clearAll");
      els.copyStructuredBtn.textContent = t("copy");
      els.downloadStructuredTxtBtn.textContent = "TXT";
      setText("#pagesTitle", t("pagesTitle"));

      renderFields();
      renderSelectedFiles();
      renderPages();
      if (!state.text) {
        els.summaryLine.textContent = t("noFilesSummary");
      }
    }

    function showToast(message) {
      els.toast.textContent = message;
      els.toast.classList.add("is-visible");
      window.clearTimeout(showToast.timer);
      const textLength = String(message || "").trim().length;
      const baseDuration = 1800;
      const extraDuration = textLength * 45;
      const toastDuration = Math.max(2200, Math.min(6500, baseDuration + extraDuration));
      showToast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), toastDuration);
    }

    function setProgress(percent, message) {
      els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      els.statusLine.textContent = message;
    }

    function setBusy(isBusy) {
      state.busy = isBusy;
      els.fileInput.disabled = isBusy;
      els.languageSelect.disabled = isBusy;
      els.pdfQualitySelect.disabled = isBusy;
      els.psmSelect.disabled = isBusy;
      els.preprocessSelect.disabled = isBusy;
      els.upscaleSelect.disabled = isBusy;
      els.dictionarySelect.disabled = isBusy;
      els.charModeSelect.disabled = isBusy;
      els.pdfRangeList.querySelectorAll("input").forEach((input) => {
        input.disabled = isBusy;
      });
      els.pageRangeProcessBtn.disabled = isBusy || state.pdfUnavailable;
      els.autoRotateInput.disabled = isBusy;
      els.borderPaddingInput.disabled = isBusy;
      els.forceOcrInput.disabled = isBusy;
      els.preserveSpacesInput.disabled = isBusy;
      els.cancelBtn.disabled = !isBusy;
      els.clearBtn.disabled = isBusy || !state.pages.length;
    }

    function setPdfUnavailable(message) {
      state.pdfUnavailable = true;
      state.pdfUnavailableMessage = message;
              state.pendingFiles = [];
              state.pdfRangeFiles = [];
              state.pdfPageRanges.clear();
              state.pdfFilePageCounts.clear();
              hidePdfRangePanel();
              els.pdfRangeList.innerHTML = "";
      setProgress(0, message);
      showToast(message);
    }

    function ensurePdfEngine() {
      if (pdfjsLib) return;
      throw new Error(t("pdfEngineMissing"));
    }

    function validateFiles(files) {
      const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
      if (totalBytes > LIMITS.maxTotalBytes) {
        const message = t("totalTooLarge", { size: formatBytes(LIMITS.maxTotalBytes) });
        setProgress(0, message);
        showToast(message);
        return false;
      }

      const oversizedImage = files.find((file) => isImageFile(file) && file.size > LIMITS.maxImageBytes);
      if (oversizedImage) {
        const message = t("imageTooLarge", { size: formatBytes(LIMITS.maxImageBytes) });
        setProgress(0, message);
        showToast(message);
        return false;
      }

      return true;
    }

    function isCancelledError(error) {
      return error && error.message === CANCELLED_ERROR;
    }

    function isSessionCancelled(ocrSession) {
      return !ocrSession || ocrSession.cancelled || state.cancelRequested || state.currentSession !== ocrSession;
    }

    function throwIfCancelled(ocrSession) {
      if (isSessionCancelled(ocrSession)) {
        throw new Error(CANCELLED_ERROR);
      }
    }

    function createSessionCancellation() {
      let signalCancel = () => {};
      const cancellationPromise = new Promise((resolve) => {
        signalCancel = resolve;
      });
      return { cancellationPromise, signalCancel };
    }

    function notifySessionCancelled(ocrSession) {
      if (!ocrSession || ocrSession.cancelSignaled) return;
      ocrSession.cancelSignaled = true;
      ocrSession.signalCancel?.(SESSION_CANCELLED);
    }

    async function terminateWorkerSafely(worker) {
      if (!worker?.terminate) return;
      try {
        await worker.terminate();
      } catch (error) {
        console.error(error);
      }
    }

    async function destroyPdfLoadingTaskSafely(loadingTask) {
      if (!loadingTask?.destroy) return;
      try {
        await loadingTask.destroy();
      } catch (error) {
        // pdf.destroy() can race with loadingTask.destroy(); ignore redundant teardown errors.
      }
    }

    async function awaitWithSessionCancellation(promise, ocrSession) {
      if (!ocrSession?.cancellationPromise) {
        return await promise;
      }

      const result = await Promise.race([
        promise,
        ocrSession.cancellationPromise,
      ]);
      if (result === SESSION_CANCELLED || isSessionCancelled(ocrSession)) {
        throw new Error(CANCELLED_ERROR);
      }
      return result;
    }

    function markCancelledPages() {
      let marked = false;
      state.pages = state.pages.map((page) => {
        if (page.status !== "OCR 중") return page;
        marked = true;
        return { ...page, status: "취소됨", detail: page.detail ? `${page.detail} · ${t("cancelledDetail")}` : t("cancelledDetail") };
      });

      if (!marked) {
        state.pages.push({
          label: t("cancelLogLabel"),
          detail: t("cancelLogDetail"),
          status: "취소됨",
          text: "",
          thumb: "",
        });
      }
      updateOutput();
    }

    function cancelCurrentSession() {
      const session = state.currentSession;
      if (!state.busy || !session) return;

      state.cancelRequested = true;
      session.cancelled = true;
      notifySessionCancelled(session);
      setProgress(0, t("canceling"));
      showToast(t("cancelingToast"));

      if (session.worker) {
        const worker = session.worker;
        session.worker = null;
        terminateWorkerSafely(worker);
      }
    }

    function getPdfDocument(data) {
      ensurePdfEngine();
      return pdfjsLib.getDocument({ data }).promise;
    }

    const pdfRangeWorkflow = createPdfRangeWorkflow({
      state,
      els,
      limits: LIMITS,
      t,
      escapeHtml,
      showToast,
      setProgress,
      isPdfFile,
      getPdfDocument,
    });
    const {
      hidePdfRangePanel,
      resetPdfRangePanel,
      collectPdfRangeInputs,
      applyMaxEndPage,
      getLargePageRangeSelections,
      getSelectedPageRange,
      preparePageRangeForFiles,
    } = pdfRangeWorkflow;

    function getFileMeta(key) {
      return state.files.find((file) => file.key === key);
    }

    function upsertFileMetadata(files, status = "대기") {
      files.forEach((file) => {
        const key = getFileKey(file);
        const existing = getFileMeta(key);
        if (existing) {
          existing.status = status;
          return;
        }

        state.files.push({
          key,
          name: file.name,
          type: file.type,
          size: file.size,
          status,
        });
      });
    }

    function setFileStatus(files, status) {
      files.forEach((file) => {
        const meta = getFileMeta(getFileKey(file));
        if (meta) meta.status = status;
      });
      renderSelectedFiles();
    }

    function removeFilesFromState(fileKeys) {
      const keys = new Set(fileKeys.filter(Boolean));
      if (!keys.size) return;

      state.files = state.files.filter((file) => !keys.has(file.key));
      state.pendingFiles = state.pendingFiles.filter((file) => !keys.has(getFileKey(file)));
      state.pdfRangeFiles = state.pdfRangeFiles.filter((file) => {
        if (!keys.has(getFileKey(file))) return true;
        state.pdfPageRanges.delete(file);
        state.pdfFilePageCounts.delete(file);
        return false;
      });
      state.pages = state.pages.filter((page) => !keys.has(page.fileKey));
      state.pdfParts = state.pdfParts.filter((part) => !keys.has(part.fileKey));

      const usedSourceIds = new Set(
        state.pdfParts
          .filter((part) => part.kind === "source-page")
          .map((part) => part.sourceId)
      );
      state.pdfSources = state.pdfSources.map((source, index) =>
        usedSourceIds.has(index) ? source : null
      );
    }

    async function removeFileByKey(fileKey) {
      const target = getFileMeta(fileKey);
      if (!target) return;
      if (target.status === "처리 중") {
        showToast(t("cannotRemoveProcessing"));
        return;
      }

      removeFilesFromState([fileKey]);

      if (!state.busy && !state.pendingFiles.length) {
        resetPdfRangePanel();
      } else if (!state.busy) {
        const remainingPendingFiles = [...state.pendingFiles];
        const stillNeedsRangeConfirmation = await preparePageRangeForFiles(remainingPendingFiles);
        if (!stillNeedsRangeConfirmation && remainingPendingFiles.length) {
          await processFiles(remainingPendingFiles, { confirmedRange: true });
        }
      }
      updateOutput();
      showToast(t("fileRemoved", { name: target.name }));
    }


    async function createOcrWorker() {
      try {
        const Tesseract = await waitForGlobal("Tesseract", t);
        return await Tesseract.createWorker(els.languageSelect.value, 1, {
          logger: (message) => {
            if (message.status === "recognizing text") {
              const task = createOcrWorker.currentTask;
              if (task) {
                setProgress(task.basePercent + message.progress * task.spanPercent, `${task.label} OCR ${Math.round(message.progress * 100)}%`);
              }
            } else if (message.status) {
              const task = createOcrWorker.currentTask;
              setProgress(task ? task.basePercent : 0, `${task ? task.label : "OCR"} ${message.status}`);
            }
          },
          workerPath: `${TESSERACT_BASE_URL}/worker.min.js`,
          corePath: TESSERACT_CORE_URL,
          cachePath: TESSERACT_CACHE_PATH,
        }, getDictionaryConfig());
      } catch (error) {
        console.error(error);
        throw new Error(t("ocrEngineMissing"));
      }
    }

    async function applyOcrParameters(worker) {
      const params = {
        tessedit_pageseg_mode: Number(els.psmSelect.value),
        preserve_interword_spaces: els.preserveSpacesInput.checked ? "1" : "0",
        user_defined_dpi: "300",
      };
      const whitelist = getCharacterWhitelist();
      if (whitelist) {
        params.tessedit_char_whitelist = whitelist;
      }

      await worker.setParameters(params);
    }

    async function getOcrWorker(ocrSession) {
      throwIfCancelled(ocrSession);
      if (!ocrSession.worker && !ocrSession.workerCreationPromise) {
        const workerCreationPromise = createOcrWorker().then(async (worker) => {
          if (isSessionCancelled(ocrSession) || ocrSession.workerCreationPromise !== workerCreationPromise) {
            await terminateWorkerSafely(worker);
            return null;
          }
          ocrSession.worker = worker;
          return worker;
        });
        ocrSession.workerCreationPromise = workerCreationPromise;
        workerCreationPromise.finally(() => {
          if (ocrSession.workerCreationPromise === workerCreationPromise) {
            ocrSession.workerCreationPromise = null;
          }
        });
      }
      if (!ocrSession.worker) {
        await awaitWithSessionCancellation(ocrSession.workerCreationPromise, ocrSession);
      }
      if (!ocrSession.worker) throw new Error(CANCELLED_ERROR);
      throwIfCancelled(ocrSession);
      return ocrSession.worker;
    }

    async function recognizeCanvas(worker, canvas, label, basePercent, spanPercent, ocrSession) {
      throwIfCancelled(ocrSession);
      createOcrWorker.currentTask = { label, basePercent, spanPercent };
      try {
        await awaitWithSessionCancellation(applyOcrParameters(worker), ocrSession);
        throwIfCancelled(ocrSession);
        const result = await awaitWithSessionCancellation(
          worker.recognize(
            canvas,
            {
              pdfTitle: label,
              rotateAuto: els.autoRotateInput.checked,
            },
            { text: true, pdf: true }
          ),
          ocrSession
        );
        throwIfCancelled(ocrSession);
        return {
          text: result.data.text.trim(),
          pdfBytes: result.data.pdf ? new Uint8Array(result.data.pdf) : null,
        };
      } finally {
        createOcrWorker.currentTask = null;
      }
    }

    async function processImage(file, index, total, ocrSession) {
      throwIfCancelled(ocrSession);
      const fileKey = getFileKey(file);
      const label = file.name;
      const base = (index / total) * 100;
      const canvas = await awaitWithSessionCancellation(imageFileToCanvas(file), ocrSession);
      throwIfCancelled(ocrSession);
      const thumb = await awaitWithSessionCancellation(canvasToThumb(canvas), ocrSession);
      state.pages.push({ fileKey, label, detail: `${canvas.width}x${canvas.height}`, status: "OCR 중", text: "", thumb });
      renderPages();
      const ocrWorker = await awaitWithSessionCancellation(getOcrWorker(ocrSession), ocrSession);
      const { text, pdfBytes } = await recognizeCanvas(ocrWorker, canvas, label, base, 100 / total, ocrSession);
      throwIfCancelled(ocrSession);
      if (pdfBytes) {
        state.pdfParts.push({ fileKey, kind: "ocr-pdf", bytes: pdfBytes, label });
      }
      state.pages[state.pages.length - 1] = { fileKey, label, detail: `${canvas.width}x${canvas.height}`, status: "완료", text, thumb };
      updateOutput();
    }

    async function processPdf(file, index, total, ocrSession) {
      throwIfCancelled(ocrSession);
      const fileKey = getFileKey(file);
      ensurePdfEngine();
      const bytes = new Uint8Array(await awaitWithSessionCancellation(file.arrayBuffer(), ocrSession));
      const sourceId = state.pdfSources.push({ fileKey, name: file.name, bytes }) - 1;
      const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
      let pdf = null;
      try {
        pdf = await awaitWithSessionCancellation(loadingTask.promise, ocrSession);
        const { start, end } = getSelectedPageRange(file, pdf.numPages);
        const pageCount = end - start + 1;
        const fileBase = (index / total) * 100;
        const fileSpan = 100 / total;

        if (pageCount < pdf.numPages) {
          showToast(t("pdfRangeLimited", { total: pdf.numPages, start, end }));
        }

        for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
          throwIfCancelled(ocrSession);
          const page = await awaitWithSessionCancellation(pdf.getPage(pageNumber), ocrSession);
          try {
            const label = `${file.name} · p.${pageNumber}`;
            const pageBase = fileBase + ((pageNumber - start) / pageCount) * fileSpan;
            const pageSpan = fileSpan / pageCount;
            setProgress(pageBase, t("analyzingPage", { label }));

            let text = "";
            let detail = t("nativeTextDetail");
            let thumb = "";
            if (!els.forceOcrInput.checked) {
              text = await awaitWithSessionCancellation(extractNativePdfText(page), ocrSession);
            }
            if (!text || text.length < 40 || els.forceOcrInput.checked) {
              const canvas = await awaitWithSessionCancellation(renderPdfPage(page), ocrSession);
              thumb = await awaitWithSessionCancellation(canvasToThumb(canvas), ocrSession);
              state.pages.push({ fileKey, label, detail: `${canvas.width}x${canvas.height}`, status: "OCR 중", text: "", thumb });
              renderPages();
              const ocrWorker = await awaitWithSessionCancellation(getOcrWorker(ocrSession), ocrSession);
              const ocrResult = await recognizeCanvas(ocrWorker, canvas, label, pageBase, pageSpan, ocrSession);
              throwIfCancelled(ocrSession);
              text = ocrResult.text;
              if (ocrResult.pdfBytes) {
                state.pdfParts.push({ fileKey, kind: "ocr-pdf", bytes: ocrResult.pdfBytes, label });
              }
              detail = t("imageOcrDetail");
              state.pages[state.pages.length - 1] = { fileKey, label, detail, status: "완료", text, thumb };
            } else {
              state.pdfParts.push({ fileKey, kind: "source-page", sourceId, pageIndex: pageNumber - 1, label });
              state.pages.push({ fileKey, label, detail, status: "완료", text, thumb });
            }
            updateOutput();
          } finally {
            page.cleanup?.();
          }
        }

        if (pageCount < pdf.numPages) {
          state.pages.push({
            fileKey,
            label: t("omittedLabel", { name: file.name }),
            detail: t("omittedDetail", { total: pdf.numPages, start, end }),
            status: "제한",
            text: "",
            thumb: "",
          });
          updateOutput();
        }
      } finally {
        await pdf?.destroy?.();
        if (!pdf || isSessionCancelled(ocrSession)) {
          await destroyPdfLoadingTaskSafely(loadingTask);
        }
      }
    }

    async function processFiles(files, options = {}) {
      if (state.busy) return;
      const acceptedFiles = [...files].filter(isAcceptedFile);
      if (!acceptedFiles.length) {
        showToast(t("noSupportedFiles"));
        return;
      }

      const existingKeys = new Set(
        state.files
          .filter((file) => file.status === "완료" || file.status === "처리 중")
          .map((file) => file.key)
          .filter(Boolean)
      );
      const seenIncoming = new Set();
      const dedupedAcceptedFiles = [];
      let duplicateCount = 0;
      for (const file of acceptedFiles) {
        const key = getFileKey(file);
        if (seenIncoming.has(key)) {
          duplicateCount += 1;
          continue;
        }
        if (!options.confirmedRange && existingKeys.has(key)) {
          duplicateCount += 1;
          continue;
        }
        seenIncoming.add(key);
        dedupedAcceptedFiles.push(file);
      }

      if (!dedupedAcceptedFiles.length) {
        showToast(t("alreadyAdded"));
        return;
      }

      if (duplicateCount > 0 && !options.confirmedRange) {
        showToast(t("duplicatesSkipped", { count: duplicateCount }));
      }

      const imageFiles = dedupedAcceptedFiles.filter(isImageFile);
      const pdfFiles = dedupedAcceptedFiles.filter(isPdfFile);

      let processTargets = dedupedAcceptedFiles;
      if (state.pdfUnavailable && pdfFiles.length) {
        if (!imageFiles.length) {
          const message = state.pdfUnavailableMessage || t("pdfEngineMissing");
          setProgress(0, message);
          showToast(message);
          return;
        }

        processTargets = imageFiles;
        state.pendingFiles = [];
        hidePdfRangePanel();
        showToast(t("skipPdfUseImages", { pdfs: pdfFiles.length, images: imageFiles.length }));
      }

      if (!validateFiles(processTargets)) return;

      upsertFileMetadata(processTargets, "대기");
      renderSelectedFiles();

      if (!options.confirmedRange) {
        const rangeCandidates = mergeFileList([...state.pendingFiles, ...processTargets]);
        const needsRangeConfirmation = await preparePageRangeForFiles(rangeCandidates);
        if (needsRangeConfirmation) return;
      }

      state.selectedFields = {};
      state.fieldSelectionLockedByUser = false;

      const ocrSession = {
        worker: null,
        workerCreationPromise: null,
        cancelled: false,
        id: state.sessionId + 1,
        ...createSessionCancellation(),
        cancelSignaled: false,
      };
      state.sessionId = ocrSession.id;
      state.currentSession = ocrSession;
      state.cancelRequested = false;
      setBusy(true);
      setFileStatus(processTargets, "처리 중");
      updateOutput();

      try {
        for (let i = 0; i < processTargets.length; i += 1) {
          throwIfCancelled(ocrSession);
          const file = processTargets[i];
          setProgress((i / processTargets.length) * 100, t("startFile", { name: file.name }));
          if (isPdfFile(file)) {
            await processPdf(file, i, processTargets.length, ocrSession);
          } else {
            await processImage(file, i, processTargets.length, ocrSession);
          }
          throwIfCancelled(ocrSession);
        }
        setProgress(100, t("statusDone"));
        setFileStatus(processTargets, "완료");
        showToast(t("completed"));
      } catch (error) {
        if (isCancelledError(error) || isSessionCancelled(ocrSession)) {
          removeFilesFromState(processTargets.map(getFileKey));
          markCancelledPages();
          setProgress(0, t("cancelled"));
          showToast(t("cancelledToast"));
        } else {
          setFileStatus(processTargets, "오류");
          console.error(error);
          setProgress(0, t("errorPrefix", { message: error.message || error }));
          showToast(error.message || t("genericError"));
        }
      } finally {
        createOcrWorker.currentTask = null;
        if (ocrSession.worker) {
          await terminateWorkerSafely(ocrSession.worker);
          ocrSession.worker = null;
        }
        if (ocrSession.workerCreationPromise) {
          try {
            await ocrSession.workerCreationPromise;
          } catch (_) {
            // Cancellation path can reject before worker setup settles.
          }
        }
        if (state.currentSession === ocrSession) {
          state.currentSession = null;
        }
        state.cancelRequested = false;
        els.fileInput.value = "";
        if (options.confirmedRange) {
          resetPdfRangePanel();
        }
        setBusy(false);
      }
    }

    async function downloadSearchablePdf() {
      try {
        els.downloadPdfBtn.disabled = true;
        setProgress(100, t("pdfBuildStart"));
        const bytes = await buildSearchablePdfBytes(state, (name, timeoutMs) => waitForGlobal(name, t, timeoutMs), t);
        download(getDownloadFilename(state, "ocr-searchable", "pdf"), bytes, "application/pdf");
        setProgress(100, t("pdfBuildDone"));
      } catch (error) {
        console.error(error);
        showToast(error.message || t("pdfBuildError"));
      } finally {
        els.downloadPdfBtn.disabled = state.pdfParts.length === 0;
      }
    }

    if (els.settingsToggleBtn) {
      els.settingsToggleBtn.addEventListener("click", () => {
        setSettingsCollapsed(!els.settingsPanel.classList.contains("is-collapsed"));
      });
    }
    els.fileInput.addEventListener("change", (event) => processFiles(event.target.files));
    els.fileList.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("[data-remove-file-key]");
      if (!button) return;
      removeFileByKey(button.dataset.removeFileKey);
    });
    els.pdfRangeList.addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const row = input.closest(".pdf-range-row");
      if (!row) return;

      const maxInput = row.querySelector('[data-range-role="max"]');
      if (!(maxInput instanceof HTMLInputElement)) return;

      if (input.dataset.rangeRole === "end") {
        maxInput.checked = false;
      } else if (input.dataset.rangeRole === "start" && maxInput.checked) {
        applyMaxEndPage(row);
      }
    });
    els.pdfRangeList.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.dataset.rangeRole !== "max") return;
      const row = input.closest(".pdf-range-row");
      if (row && input.checked) {
        applyMaxEndPage(row);
      }
    });
    els.pageRangeProcessBtn.addEventListener("click", () => {
      if (!state.pendingFiles.length) return;
      collectPdfRangeInputs();
      const largeRanges = getLargePageRangeSelections();
      if (largeRanges.length) {
        const rangeSummary = largeRanges
          .map((item) => `${item.name}: ${item.start}-${item.end} (${t("pageCount", { count: item.selectedCount })})`)
          .join("\n");
        const confirmed = window.confirm(t("largeConfirm", {
          confirm: LIMITS.confirmLargeRangePages,
          ranges: rangeSummary,
        }));
        if (!confirmed) {
          showToast(t("largeCancelled"));
          return;
        }
      }
      const confirmedFiles = [...state.pendingFiles];
      state.pendingFiles = [];
      hidePdfRangePanel();
      processFiles(confirmedFiles, { confirmedRange: true });
    });
    els.fieldGrid.addEventListener("change", (event) => {
      const checkbox = event.target;
      if (!(checkbox instanceof HTMLInputElement) || !checkbox.dataset.fieldKey) return;
      state.fieldSelectionLockedByUser = true;
      state.selectedFields[checkbox.dataset.fieldKey] = checkbox.checked;
      updateOutput();
    });
    ["dragenter", "dragover"].forEach((name) => els.dropzone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach((name) => els.dropzone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("is-dragging");
    }));
    els.dropzone.addEventListener("drop", (event) => processFiles(event.dataTransfer.files));

    els.copyTextBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(state.text);
      showToast(t("copied"));
    });
    els.selectFieldsBtn.addEventListener("click", () => {
      state.fieldSelectionLockedByUser = true;
      getFieldKeys().forEach((key) => {
        state.selectedFields[key] = true;
      });
      updateOutput();
    });
    els.clearFieldsBtn.addEventListener("click", () => {
      state.fieldSelectionLockedByUser = true;
      getFieldKeys().forEach((key) => {
        state.selectedFields[key] = false;
      });
      updateOutput();
    });
    els.copyStructuredBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(getStructuredFieldsTxt());
      showToast(t("copied"));
    });
    els.downloadTxtBtn.addEventListener("click", () => download(getDownloadFilename(state, "ocr-text", "txt"), state.text, "text/plain;charset=utf-8"));
    els.downloadStructuredTxtBtn.addEventListener("click", () => {
      download(getDownloadFilename(state, "ocr-fields", "txt"), getStructuredFieldsTxt(), "text/plain;charset=utf-8");
    });
    els.downloadPdfBtn.addEventListener("click", downloadSearchablePdf);
    els.cancelBtn.addEventListener("click", cancelCurrentSession);
    els.languageSelect.addEventListener("change", () => {
      hasUserSelectedOcrLanguage = true;
    });
    els.downloadRawJsonBtn.addEventListener("click", () => download(getDownloadFilename(state, "ocr-raw", "json"), JSON.stringify(buildRawExportJson(state), null, 2), "application/json;charset=utf-8"));
    els.downloadStructuredJsonBtn.addEventListener("click", () => {
      const selectedKeys = getSelectedFieldKeys();
      const selectedFields = getSelectedFields();
      download(
        getDownloadFilename(state, "ocr-structured", "json"),
        JSON.stringify(buildStructuredExportJson(selectedKeys, selectedFields), null, 2),
        "application/json;charset=utf-8"
      );
    });
    els.downloadCsvBtn.addEventListener("click", () => download(getDownloadFilename(state, "ocr-fields", "csv"), fieldsToCsv(getSelectedFields()), "text/csv;charset=utf-8"));
    els.clearBtn.addEventListener("click", () => {
      if (state.busy) {
        showToast(t("clearWhileBusy"));
        return;
      }
      state.files = [];
      state.pages = [];
      state.pdfParts = [];
      state.pdfSources = [];
      state.pdfPageCount = 0;
      state.pdfRangeFiles = [];
      state.pdfPageRanges.clear();
      state.pdfFilePageCounts.clear();
      state.pendingFiles = [];
      state.text = "";
      state.fields = {};
      state.selectedFields = {};
      state.fieldSelectionLockedByUser = false;
      els.fileInput.value = "";
      hidePdfRangePanel();
      els.pdfRangeList.innerHTML = "";
      setProgress(0, t("reset"));
      updateOutput();
    });

    applyLocale(detectLocale());
    setSettingsCollapsed(settingsMobileMediaQuery.matches);
    settingsMobileMediaQuery.addEventListener("change", (event) => {
      setSettingsCollapsed(event.matches);
    });

    if (pdfjsLoadError) {
      setPdfUnavailable(t("pdfUnavailableImageOnly"));
    }
