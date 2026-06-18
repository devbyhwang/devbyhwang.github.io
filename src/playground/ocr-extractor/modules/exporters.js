export function stripFileExtension(filename) {
  return String(filename || "").replace(/\.[^./\\]+$/, "");
}

export function sanitizeDownloadName(filename) {
  const normalized = String(filename || "")
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return (normalized || "ocr-result").slice(0, 120).replace(/[.\s]+$/g, "") || "ocr-result";
}

export function getBaseDownloadName(state) {
  const firstFile = state.files[0];
  const firstName = sanitizeDownloadName(stripFileExtension(firstFile?.name));
  if (state.files.length <= 1) return firstName;
  return sanitizeDownloadName(`${firstName}_plus-${state.files.length - 1}-files`);
}

export function getDownloadFilename(state, suffix, extension) {
  return `${getBaseDownloadName(state)}_${suffix}.${extension}`;
}

export function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fieldsToCsv(selectedFields) {
  const rows = [["field", "value"]];
  Object.entries(selectedFields).forEach(([key, values]) => {
    values.forEach((value) => rows.push([key, value]));
  });
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function fieldsToTxt(selectedFields) {
  return Object.entries(selectedFields)
    .map(([key, values]) => {
      const lines = [`[${key}]`, ...values.map((value) => String(value))];
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildRawExportJson(state) {
  return {
    files: state.files.map(({ name, type, size }) => ({ name, type, size })),
    pages: state.pages.map(({ thumb, fileKey, ...page }) => page),
    text: state.text,
  };
}

export function buildStructuredExportJson(selectedFieldKeys, selectedFields) {
  return {
    selectedFields: selectedFieldKeys,
    fields: selectedFields,
  };
}

export async function buildSearchablePdfBytes(state, waitForGlobalFn, t) {
  if (!state.pdfParts.length) {
    throw new Error(t("noPdfToSave"));
  }

  let PDFLib;
  try {
    PDFLib = await waitForGlobalFn("PDFLib");
  } catch (error) {
    console.error(error);
    throw new Error(t("pdfSaveEngineMissing"));
  }
  const outputPdf = await PDFLib.PDFDocument.create();
  const sourceCache = new Map();

  for (const part of state.pdfParts) {
    if (part.kind === "ocr-pdf") {
      const sourcePdf = await PDFLib.PDFDocument.load(part.bytes);
      const copiedPages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      copiedPages.forEach((page) => outputPdf.addPage(page));
      continue;
    }

    if (part.kind === "source-page") {
      let sourcePdf = sourceCache.get(part.sourceId);
      if (!sourcePdf) {
        const source = state.pdfSources[part.sourceId];
        if (!source) continue;
        const sourceBytes = source.bytes || await source.file?.arrayBuffer();
        if (!sourceBytes) continue;
        sourcePdf = await PDFLib.PDFDocument.load(sourceBytes);
        sourceCache.set(part.sourceId, sourcePdf);
      }
      const [copiedPage] = await outputPdf.copyPages(sourcePdf, [part.pageIndex]);
      outputPdf.addPage(copiedPage);
    }
  }

  return outputPdf.save();
}
