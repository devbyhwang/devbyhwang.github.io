export function createImageProcessingHelpers({ els, t }) {
  function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function getPdfTargetWidth() {
    const selected = Number(els.pdfQualitySelect.value);
    return Number.isFinite(selected) ? Math.max(900, Math.min(3200, selected)) : 2400;
  }

  function getCharacterWhitelist() {
    if (els.charModeSelect.value === "numbers") {
      return "0123456789.,:-/₩$% 원만원억원KRWUSD";
    }
    if (els.charModeSelect.value === "contact") {
      return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@._-:/+?&=%#~";
    }
    return "";
  }

  function getDictionaryConfig() {
    if (els.dictionarySelect.value !== "off") return {};

    return {
      load_system_dawg: "0",
      load_freq_dawg: "0",
      load_unambig_dawg: "0",
      load_punc_dawg: "0",
      load_number_dawg: "0",
      load_bigram_dawg: "0",
    };
  }

  function getImageScaleRatio(width, height) {
    const longest = Math.max(width, height);
    const maxEdge = 2400;
    if (longest <= 0) return 1;
    if (els.upscaleSelect.value !== "auto") {
      return Math.min(1, maxEdge / longest);
    }

    const minOcrEdge = 1600;
    const targetEdge = longest < minOcrEdge
      ? Math.min(maxEdge, minOcrEdge, longest * 2)
      : Math.min(maxEdge, longest);
    return targetEdge / longest;
  }

  function enhanceCanvas(canvas) {
    const mode = els.preprocessSelect.value;
    if (mode === "none") return canvas;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      let value = gray;
      if (mode === "contrast") {
        value = gray < 180 ? Math.max(0, gray - 28) : Math.min(255, gray + 20);
      } else if (mode === "threshold") {
        value = gray < 178 ? 0 : 255;
      }
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function addWhiteBorder(canvas, padding = 12) {
    if (!els.borderPaddingInput.checked) return canvas;

    const padded = makeCanvas(canvas.width + padding * 2, canvas.height + padding * 2);
    const ctx = padded.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, padded.width, padded.height);
    ctx.drawImage(canvas, padding, padding);
    return padded;
  }

  async function canvasToThumb(canvas) {
    const thumb = makeCanvas(160, Math.round(160 * canvas.height / canvas.width));
    const ctx = thumb.getContext("2d");
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(0, 0, thumb.width, thumb.height);
    ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL("image/jpeg", 0.76);
  }

  async function decodeImageFile(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file);
      } catch (error) {
        // Some image/* files, notably SVG in Chromium, need the HTMLImage fallback.
      }
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(t("imageReadError")));
      };
      image.src = url;
    });
  }

  async function imageFileToCanvas(file) {
    const bitmap = await decodeImageFile(file);
    const ratio = getImageScaleRatio(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return enhanceCanvas(addWhiteBorder(canvas));
  }

  async function renderPdfPage(page) {
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = getPdfTargetWidth();
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return enhanceCanvas(canvas);
  }

  async function extractNativePdfText(page) {
    const content = await page.getTextContent();
    return content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
  }

  return {
    getCharacterWhitelist,
    getDictionaryConfig,
    canvasToThumb,
    imageFileToCanvas,
    renderPdfPage,
    extractNativePdfText,
  };
}
