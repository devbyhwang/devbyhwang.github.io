export const PDFJS_VERSION = "5.7.284";
export const PDFJS_MODULE_URL = new URL("../vendor/pdfjs/pdf.min.js", import.meta.url).toString();
export const PDFJS_WORKER_URL = new URL("../vendor/pdfjs/pdf.worker.min.js", import.meta.url).toString();

export const TESSERACT_BASE_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist";
export const TESSERACT_CORE_URL = "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0";
export const TESSERACT_CACHE_PATH = "tesseract-v6-lstm-best-int";

export const LIMITS = {
  maxTotalBytes: 500 * 1024 * 1024,
  maxImageBytes: 30 * 1024 * 1024,
  largePdfPageThreshold: 50,
  defaultProcessPages: 100,
  maxProcessPages: 2000,
  confirmLargeRangePages: 1000,
};

export const CANCELLED_ERROR = "OCR_CANCELLED";

export function installReadableStreamIteratorPolyfill() {
  if (!("ReadableStream" in window) || !window.ReadableStream.prototype) return;

  const proto = window.ReadableStream.prototype;
  if (typeof proto.values !== "function") {
    Object.defineProperty(proto, "values", {
      configurable: true,
      writable: true,
      value(options = {}) {
        const reader = this.getReader();
        const preventCancel = Boolean(options.preventCancel);
        let isFinished = false;

        const iterator = {
          async next() {
            if (isFinished) return { done: true, value: undefined };

            const result = await reader.read();
            if (result.done) {
              isFinished = true;
              reader.releaseLock();
              return { done: true, value: undefined };
            }

            return { done: false, value: result.value };
          },
          async return() {
            if (isFinished) return { done: true, value: undefined };
            isFinished = true;

            try {
              if (!preventCancel) {
                await reader.cancel();
              }
            } finally {
              reader.releaseLock();
            }

            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };

        return iterator;
      },
    });
  }

  if (typeof proto[Symbol.asyncIterator] !== "function") {
    Object.defineProperty(proto, Symbol.asyncIterator, {
      configurable: true,
      writable: true,
      value() {
        return this.values();
      },
    });
  }
}

export async function loadPdfJs() {
  let pdfjsLib = null;
  let pdfjsLoadError = null;
  try {
    pdfjsLib = await import(PDFJS_MODULE_URL);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  } catch (error) {
    pdfjsLoadError = error;
    console.error(error);
  }

  return { pdfjsLib, pdfjsLoadError };
}
