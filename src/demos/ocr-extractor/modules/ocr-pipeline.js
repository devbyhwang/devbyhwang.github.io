import { getExtension } from "./utils.js";

export function isPdfFile(file) {
  return file.type === "application/pdf" || getExtension(file) === "pdf";
}

export function isImageFile(file) {
  return file.type.startsWith("image/");
}

export function isAcceptedFile(file) {
  return isPdfFile(file) || isImageFile(file);
}

export async function waitForGlobal(name, t, timeoutMs = 10000) {
  const startedAt = performance.now();
  while (!window[name]) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error(t("globalLoadFailed", { name }));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return window[name];
}
