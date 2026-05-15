export function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[char]));
}

export function unique(matches) {
  return [...new Set((matches || []).map((value) => value.trim()).filter(Boolean))];
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0MB";
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

export function getExtension(file) {
  const name = file && typeof file.name === "string" ? file.name : "";
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index + 1).toLowerCase();
}

export function getFileKey(file) {
  const name = file && typeof file.name === "string" ? file.name : "";
  const size = Number(file && file.size) || 0;
  const modified = Number(file && file.lastModified) || 0;
  return `${name}__${size}__${modified}`;
}

export function mergeFileList(files) {
  const merged = [];
  const seen = new Set();
  files.forEach((file) => {
    const key = getFileKey(file);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(file);
  });
  return merged;
}
