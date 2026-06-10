const els = {
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  imageCount: document.querySelector("#image-count"),
  labelCount: document.querySelector("#label-count"),
  boxCount: document.querySelector("#box-count"),
  classes: document.querySelector("#classes"),
  labelFormat: document.querySelector("#label-format"),
  customFormatRow: document.querySelector("#custom-format-row"),
  customFormat: document.querySelector("#custom-format"),
  formatHelp: document.querySelector("#format-help"),
  emptyLabels: document.querySelector("#empty-labels"),
  includeImages: document.querySelector("#include-images"),
  clearFiles: document.querySelector("#clear-files"),
  downloadLabelsTop: document.querySelector("#download-labels-top"),
  reviewSection: document.querySelector("#review-section"),
  reviewedToggle: document.querySelector("#reviewed-toggle"),
  autoReviewToggle: document.querySelector("#auto-review-toggle"),
  downloadLabels: document.querySelector("#download-labels"),
  modeButtons: document.querySelectorAll(".mode-button"),
  activeClass: document.querySelector("#active-class"),
  deleteBox: document.querySelector("#delete-box"),
  currentName: document.querySelector("#current-name"),
  currentLabelFile: document.querySelector("#current-label-file"),
  currentSize: document.querySelector("#current-size"),
  currentBoxes: document.querySelector("#current-boxes"),
  currentStatus: document.querySelector("#current-status"),
  boxList: document.querySelector("#box-list"),
  canvas: document.querySelector("#label-canvas"),
  canvasWrap: document.querySelector(".canvas-wrap"),
  prevImage: document.querySelector("#prev-image"),
  nextImage: document.querySelector("#next-image"),
  thumbStrip: document.querySelector("#thumb-strip"),
};

const ctx = els.canvas.getContext("2d");
const state = {
  images: [],
  labelsByBaseName: new Map(),
  currentIndex: 0,
  selectedBoxId: null,
  mode: "select",
  autoReview: true,
  drag: null,
};

const boxColor = "#1f5d4a";
const selectedColor = "#c8872e";
const canvasFitRatio = 0.75;
const minBoxSize = 0.005;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, "").trim();
}

function normalizeBoxToBounds(box) {
  const w = clamp(Number.isFinite(box.w) ? box.w : 0);
  const h = clamp(Number.isFinite(box.h) ? box.h : 0);
  return {
    ...box,
    x: clamp(Number.isFinite(box.x) ? box.x : 0.5, w / 2, 1 - w / 2),
    y: clamp(Number.isFinite(box.y) ? box.y : 0.5, h / 2, 1 - h / 2),
    w,
    h,
  };
}

function markDirty(item) {
  if (item) item.dirty = true;
}

function getClasses() {
  return els.classes.value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getLabelFormat() {
  if (els.labelFormat.value !== "custom") return els.labelFormat.value;
  const pattern = els.customFormat.value.toLowerCase();
  return pattern.includes("x1") || pattern.includes("polygon") || pattern.includes("points")
    ? "polygon"
    : "bbox";
}

function updateFormatHelp() {
  const selected = els.labelFormat.value;
  els.customFormatRow.hidden = selected !== "custom";
  if (selected === "polygon") {
    els.formatHelp.textContent = "테두리 polygon: 각 줄은 `Class_ID x1 y1 x2 y2 x3 y3 ...` 형식입니다. 검수 화면에서는 polygon을 감싸는 사각형으로 보여주고, 편집된 박스는 4점 polygon으로 저장합니다.";
    return;
  }
  if (selected === "custom") {
    els.formatHelp.textContent = `커스텀: 현재 패턴은 \`${els.customFormat.value || "Class_ID x_center y_center width height"}\` 입니다. x1/y1 또는 polygon/points가 포함되면 polygon으로, 아니면 bbox로 읽고 저장합니다.`;
    return;
  }
  els.formatHelp.textContent = "사각형 bbox: 각 줄은 `Class_ID x_center y_center width height` 형식입니다. 좌표는 0~1 정규화 값으로 읽고 저장합니다.";
}

function ensureClassName(classId) {
  const classes = getClasses();
  if (classes[classId]) return;
  updateClassSelect();
}

function labelFor(classId) {
  return getClasses()[classId] || `class_${classId + 1}`;
}

function updateClassSelect() {
  const classes = getClasses();
  const selectedValue = els.activeClass.value;
  const maxExistingClassId = state.images.reduce((max, item) => {
    const itemMax = item.boxes.reduce((boxMax, box) => Math.max(boxMax, box.classId), -1);
    return Math.max(max, itemMax);
  }, -1);
  const optionCount = Math.max(classes.length, maxExistingClassId + 1, 1);
  els.activeClass.replaceChildren(
    ...Array.from({ length: optionCount }, (_, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${index}: ${classes[index] || `class_${index + 1}`}`;
      return option;
    })
  );
  if ([...els.activeClass.options].some((option) => option.value === selectedValue)) {
    els.activeClass.value = selectedValue;
  }
}

function parseLabelText(text, labelFileName) {
  const boxes = [];
  const invalidLines = [];
  const labelFormat = getLabelFormat();
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length < 5 || parts.some((value) => !Number.isFinite(value))) {
      invalidLines.push(index + 1);
      return;
    }
    const classIdRaw = parts[0];
    const classId = Math.max(0, Math.trunc(classIdRaw));
    ensureClassName(classId);

    if (labelFormat === "polygon") {
      const coords = parts.slice(1);
      if (coords.length < 6 || coords.length % 2 !== 0) {
        invalidLines.push(index + 1);
        return;
      }
      const points = [];
      for (let coordIndex = 0; coordIndex < coords.length; coordIndex += 2) {
        points.push({ x: clamp(coords[coordIndex]), y: clamp(coords[coordIndex + 1]) });
      }
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      const w = right - left;
      const h = bottom - top;
      if (w <= 0 || h <= 0) {
        invalidLines.push(index + 1);
        return;
      }
      boxes.push(normalizeBoxToBounds({
        id: crypto.randomUUID(),
        classId,
        label: labelFor(classId),
        x: (left + right) / 2,
        y: (top + bottom) / 2,
        w,
        h,
        points,
        confidence: null,
        source: "polygon",
      }));
      return;
    }

    const [, xRaw, yRaw, wRaw, hRaw] = parts;
    const w = clamp(wRaw);
    const h = clamp(hRaw);
    if (w <= 0 || h <= 0) {
      invalidLines.push(index + 1);
      return;
    }
    boxes.push(normalizeBoxToBounds({
      id: crypto.randomUUID(),
      classId,
      label: labelFor(classId),
      x: clamp(xRaw),
      y: clamp(yRaw),
      w,
      h,
      points: null,
      confidence: null,
      source: "txt",
    }));
  });
  return { boxes, invalidLines, labelFileName };
}

async function readImageFile(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  const labelSource = state.labelsByBaseName.get(baseName(file.name));
  const parsed = labelSource ? parseLabelText(labelSource.text, labelSource.labelFileName) : null;
  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    baseName: baseName(file.name),
    url,
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    boxes: parsed ? parsed.boxes.map((box) => ({ ...box, id: crypto.randomUUID() })) : [],
    labelFileName: parsed?.labelFileName || "",
    invalidLabelLines: parsed?.invalidLines || [],
    reviewed: false,
    seen: false,
    dirty: false,
  };
}

async function readLabelFile(file) {
  const text = await file.text();
  state.labelsByBaseName.set(baseName(file.name), { text, labelFileName: file.name });
}

async function addFiles(fileList) {
  const files = Array.from(fileList);
  const labelFiles = files.filter((file) => file.name.toLowerCase().endsWith(".txt"));
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));

  for (const file of labelFiles) {
    try {
      await readLabelFile(file);
    } catch (error) {
      console.warn(error);
    }
  }

  const existingByName = new Map(state.images.map((item) => [item.name, item]));
  const loadedImages = [];
  for (const file of imageFiles) {
    try {
      const image = await readImageFile(file);
      if (existingByName.has(image.name)) {
        const index = state.images.findIndex((item) => item.name === image.name);
        state.images.splice(index, 1, image);
      } else {
        loadedImages.push(image);
      }
    } catch (error) {
      console.warn(error);
    }
  }

  state.images.push(...loadedImages);
  applyLabelsToExistingImages();
  if (state.currentIndex >= state.images.length) state.currentIndex = Math.max(0, state.images.length - 1);
  if (state.images.length && loadedImages.length) state.currentIndex = state.images.length - loadedImages.length;
  state.selectedBoxId = null;
  updateClassSelect();
  updateCounts();
  renderReview();
}

function applyLabelsToExistingImages() {
  state.images.forEach((item) => {
    if (item.dirty) return;
    const labelSource = state.labelsByBaseName.get(item.baseName);
    if (!labelSource) return;
    const parsed = parseLabelText(labelSource.text, labelSource.labelFileName);
    item.boxes = parsed.boxes.map((box) => ({ ...box, id: crypto.randomUUID() }));
    item.labelFileName = parsed.labelFileName;
    item.invalidLabelLines = parsed.invalidLines;
    item.reviewed = false;
    item.seen = false;
    item.dirty = false;
  });
}

function updateCounts() {
  const boxes = state.images.reduce((sum, item) => sum + item.boxes.length, 0);
  const matchedLabels = state.images.filter((item) => item.labelFileName).length;
  els.imageCount.textContent = state.images.length;
  els.labelCount.textContent = matchedLabels;
  els.boxCount.textContent = boxes;
  els.downloadLabelsTop.disabled = !state.images.length;
}

function currentItem() {
  return state.images[state.currentIndex] || null;
}

function imageToCanvas(item, x, y) {
  const rect = els.canvas.getBoundingClientRect();
  const scaleX = els.canvas.width / rect.width;
  const scaleY = els.canvas.height / rect.height;
  return {
    x: clamp(((x - rect.left) * scaleX) / item.width),
    y: clamp(((y - rect.top) * scaleY) / item.height),
  };
}

function boxAt(item, point) {
  for (let i = item.boxes.length - 1; i >= 0; i -= 1) {
    const box = item.boxes[i];
    const x1 = box.x - box.w / 2;
    const y1 = box.y - box.h / 2;
    const x2 = box.x + box.w / 2;
    const y2 = box.y + box.h / 2;
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) return box;
  }
  return null;
}

function resizeHandleAt(item, point, box) {
  const tolerance = Math.max(8 / Math.max(item.width, item.height), 0.006);
  const x1 = box.x - box.w / 2;
  const y1 = box.y - box.h / 2;
  const x2 = box.x + box.w / 2;
  const y2 = box.y + box.h / 2;
  const handles = [
    ["nw", x1, y1],
    ["ne", x2, y1],
    ["sw", x1, y2],
    ["se", x2, y2],
  ];
  const found = handles.find(([, x, y]) => Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance);
  return found ? found[0] : "";
}

function updateCanvasDisplaySize(item) {
  const wrapRect = els.canvasWrap.getBoundingClientRect();
  const maxWidth = Math.max(240, wrapRect.width * canvasFitRatio);
  const maxHeight = Math.max(240, wrapRect.height * canvasFitRatio);
  const scale = Math.min(maxWidth / item.width, maxHeight / item.height);
  const displayWidth = Math.max(1, item.width * scale);
  const displayHeight = Math.max(1, item.height * scale);
  els.canvas.style.setProperty("--canvas-display-width", `${displayWidth}px`);
  els.canvas.style.setProperty("--canvas-display-height", `${displayHeight}px`);
}

function draw() {
  const item = currentItem();
  if (!item) return;
  els.canvas.width = item.width;
  els.canvas.height = item.height;
  updateCanvasDisplaySize(item);
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  ctx.drawImage(item.image, 0, 0, item.width, item.height);
  ctx.lineWidth = Math.max(2, item.width / 360);
  ctx.font = `${Math.max(14, item.width / 48)}px system-ui`;

  item.boxes.forEach((box) => {
    const selected = box.id === state.selectedBoxId;
    const x = (box.x - box.w / 2) * item.width;
    const y = (box.y - box.h / 2) * item.height;
    const w = box.w * item.width;
    const h = box.h * item.height;
    if (box.points?.length && box.source !== "edited") {
      ctx.beginPath();
      box.points.forEach((point, index) => {
        const px = point.x * item.width;
        const py = point.y * item.height;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.strokeStyle = selected ? selectedColor : boxColor;
      ctx.setLineDash([12, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = selected ? selectedColor : boxColor;
    ctx.fillStyle = selected ? "rgba(200, 135, 46, 0.12)" : "rgba(31, 93, 74, 0.1)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    const label = `${box.classId}: ${labelFor(box.classId)}`;
    const labelWidth = ctx.measureText(label).width + 12;
    ctx.fillStyle = selected ? selectedColor : boxColor;
    ctx.fillRect(x, Math.max(0, y - 24), labelWidth, 24);
    ctx.fillStyle = "#fffaf1";
    ctx.fillText(label, x + 6, Math.max(17, y - 7));
    if (selected) {
      const handleSize = Math.max(8, item.width / 90);
      const points = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ];
      ctx.fillStyle = "#fffaf1";
      ctx.strokeStyle = selectedColor;
      points.forEach(([px, py]) => {
        ctx.fillRect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize);
      });
    }
  });

  if (state.drag?.preview) {
    const box = state.drag.preview;
    ctx.strokeStyle = selectedColor;
    ctx.setLineDash([10, 7]);
    ctx.strokeRect(
      (box.x - box.w / 2) * item.width,
      (box.y - box.h / 2) * item.height,
      box.w * item.width,
      box.h * item.height
    );
    ctx.setLineDash([]);
  }
}

function renderBoxList(item) {
  els.boxList.innerHTML = "";
  if (!item || !item.boxes.length) {
    els.boxList.innerHTML = `<p class="status-text">박스가 없습니다.</p>`;
    return;
  }
  item.boxes.forEach((box, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `box-item${box.id === state.selectedBoxId ? " is-active" : ""}`;
    const title = document.createElement("strong");
    title.textContent = `#${index + 1} · ${box.classId}: ${labelFor(box.classId)}`;
    const source = document.createElement("span");
    source.textContent = box.source;
    button.replaceChildren(title, source);
    button.addEventListener("click", () => {
      state.selectedBoxId = box.id;
      renderReview();
    });
    els.boxList.append(button);
  });
}

function renderThumbs() {
  els.thumbStrip.innerHTML = "";
  const start = Math.max(0, state.currentIndex - 3);
  const end = Math.min(state.images.length, state.currentIndex + 4);
  for (let index = start; index < end; index += 1) {
    const item = state.images[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thumb${index === state.currentIndex ? " is-active" : ""}`;
    const image = document.createElement("img");
    image.src = item.url;
    image.alt = "";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const status = document.createElement("span");
    status.textContent = `${item.boxes.length} boxes · ${item.reviewed ? "검수됨" : "검수 전"}`;
    button.replaceChildren(image, name, status);
    button.addEventListener("click", () => {
      state.currentIndex = index;
      state.selectedBoxId = null;
      renderReview();
    });
    els.thumbStrip.append(button);
  }
}

function markReviewed(item, reviewed = true) {
  if (!item) return;
  item.reviewed = reviewed;
  item.seen = true;
}

function updateAutoReviewButton() {
  els.autoReviewToggle.checked = state.autoReview;
}

function renderReview() {
  const item = currentItem();
  els.reviewSection.hidden = !state.images.length;
  if (!item) {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    return;
  }
  if (state.autoReview && !item.reviewed) {
    markReviewed(item, true);
    updateCounts();
  }
  els.currentName.textContent = item.name;
  const selectedBox = item.boxes.find((box) => box.id === state.selectedBoxId);
  if (selectedBox) els.activeClass.value = String(selectedBox.classId);
  els.currentLabelFile.textContent = item.labelFileName || "없음";
  els.currentSize.textContent = `${item.width} x ${item.height}`;
  els.currentBoxes.textContent = item.boxes.length;
  els.currentStatus.textContent = item.reviewed ? "검수됨" : "검수 전";
  els.reviewedToggle.checked = item.reviewed;
  if (item.invalidLabelLines.length) {
    els.currentStatus.textContent = `일부 라벨 무시됨 (${item.invalidLabelLines.join(", ")})`;
  }
  els.deleteBox.disabled = !state.selectedBoxId;
  renderBoxList(item);
  renderThumbs();
  draw();
}

function moveImage(delta) {
  if (!state.images.length) return;
  state.currentIndex = clamp(state.currentIndex + delta, 0, state.images.length - 1);
  state.selectedBoxId = null;
  renderReview();
}

function deleteSelectedBox() {
  const item = currentItem();
  if (!item || !state.selectedBoxId) return;
  item.boxes = item.boxes.filter((box) => box.id !== state.selectedBoxId);
  markDirty(item);
  state.selectedBoxId = null;
  updateCounts();
  renderReview();
}

function polygonPointsForBox(box) {
  const normalized = normalizeBoxToBounds(box);
  const left = clamp(normalized.x - normalized.w / 2);
  const top = clamp(normalized.y - normalized.h / 2);
  const right = clamp(normalized.x + normalized.w / 2);
  const bottom = clamp(normalized.y + normalized.h / 2);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

function saveLabelsFor(item) {
  const labelFormat = getLabelFormat();
  const lines = item.boxes.map((box) => {
    const normalized = normalizeBoxToBounds(box);
    if (labelFormat === "polygon") {
      const points = box.points && box.source !== "edited" ? box.points : polygonPointsForBox(normalized);
      return `${box.classId} ${points.map((point) => `${point.x.toFixed(6)} ${point.y.toFixed(6)}`).join(" ")}`;
    }
    return `${box.classId} ${normalized.x.toFixed(6)} ${normalized.y.toFixed(6)} ${normalized.w.toFixed(6)} ${normalized.h.toFixed(6)}`;
  });
  if (!lines.length && !els.emptyLabels.checked) return null;
  return `${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function u16(value) {
  return [value & 255, (value >>> 8) & 255];
}

function u32(value) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const utf8FileNameFlag = 0x0800;
  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = file.bytes;
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(utf8FileNameFlag), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
    ]);
    localParts.push(local, nameBytes, data);
    const central = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(utf8FileNameFlag), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

async function downloadZip() {
  if (!state.images.length) return;
  const encoder = new TextEncoder();
  const classes = getClasses();
  const files = [];
  state.images.forEach((item) => {
    const label = saveLabelsFor(item);
    if (label !== null) files.push({ name: `labels/${item.baseName}.txt`, bytes: encoder.encode(label) });
  });
  files.push({ name: "classes.txt", bytes: encoder.encode(`${classes.join("\n")}\n`) });
  files.push({ name: "label-format.txt", bytes: encoder.encode(`${els.labelFormat.value}\n${els.labelFormat.value === "custom" ? els.customFormat.value : ""}\n`) });
  files.push({
    name: "data.yaml",
    bytes: encoder.encode(`path: .\ntrain: images\nval: images\nnames:\n${classes.map((name, index) => `  ${index}: ${name}`).join("\n")}\n`),
  });
  if (els.includeImages.checked) {
    for (const item of state.images) {
      files.push({ name: `images/${item.name}`, bytes: new Uint8Array(await item.file.arrayBuffer()) });
    }
  }
  const blob = makeZip(files);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "yolo-labels-edited.zip";
  link.click();
  URL.revokeObjectURL(url);
}

function clearFiles() {
  state.images.forEach((item) => URL.revokeObjectURL(item.url));
  state.images = [];
  state.labelsByBaseName.clear();
  state.currentIndex = 0;
  state.selectedBoxId = null;
  els.fileInput.value = "";
  updateCounts();
  renderReview();
}

els.fileInput.addEventListener("change", () => addFiles(els.fileInput.files));
els.classes.addEventListener("input", () => {
  updateClassSelect();
  state.images.forEach((item) => {
    item.boxes.forEach((box) => {
      box.label = labelFor(box.classId);
    });
  });
  renderReview();
});
els.activeClass.addEventListener("change", () => {
  const item = currentItem();
  const selectedBox = item?.boxes.find((box) => box.id === state.selectedBoxId);
  if (!selectedBox) return;
  selectedBox.classId = Number(els.activeClass.value || 0);
  selectedBox.label = labelFor(selectedBox.classId);
  selectedBox.source = "edited";
  selectedBox.points = null;
  markDirty(item);
  updateCounts();
  renderReview();
});
els.labelFormat.addEventListener("change", () => {
  updateFormatHelp();
  applyLabelsToExistingImages();
  updateCounts();
  renderReview();
});
els.customFormat.addEventListener("input", () => {
  updateFormatHelp();
  applyLabelsToExistingImages();
  updateCounts();
  renderReview();
});
els.clearFiles.addEventListener("click", clearFiles);
els.prevImage.addEventListener("click", () => moveImage(-1));
els.nextImage.addEventListener("click", () => moveImage(1));
els.deleteBox.addEventListener("click", deleteSelectedBox);
els.downloadLabels.addEventListener("click", downloadZip);
els.downloadLabelsTop.addEventListener("click", downloadZip);
els.reviewedToggle.addEventListener("change", () => {
  const item = currentItem();
  if (!item) return;
  markReviewed(item, els.reviewedToggle.checked);
  updateCounts();
  renderReview();
});
els.autoReviewToggle.addEventListener("change", () => {
  state.autoReview = els.autoReviewToggle.checked;
  const item = currentItem();
  if (state.autoReview && item) {
    markReviewed(item, true);
  }
  updateAutoReviewButton();
  updateCounts();
  renderReview();
});

els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    els.modeButtons.forEach((node) => node.classList.toggle("is-active", node === button));
  });
});

els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("is-dragging");
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("is-dragging"));
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("is-dragging");
  addFiles(event.dataTransfer.files);
});

els.canvas.addEventListener("pointerdown", (event) => {
  const item = currentItem();
  if (!item) return;
  els.canvas.setPointerCapture(event.pointerId);
  const point = imageToCanvas(item, event.clientX, event.clientY);
  if (state.mode === "draw") {
    state.drag = { type: "draw", start: point, preview: null };
    return;
  }
  const box = boxAt(item, point);
  state.selectedBoxId = box?.id || null;
  const handle = box ? resizeHandleAt(item, point, box) : "";
  state.drag = box
    ? { type: handle ? "resize" : "move", handle, boxId: box.id, start: point, original: { ...box } }
    : null;
  renderReview();
});

els.canvas.addEventListener("pointermove", (event) => {
  const item = currentItem();
  if (!item || !state.drag) return;
  const point = imageToCanvas(item, event.clientX, event.clientY);
  if (state.drag.type === "draw") {
    const x1 = Math.min(state.drag.start.x, point.x);
    const y1 = Math.min(state.drag.start.y, point.y);
    const x2 = Math.max(state.drag.start.x, point.x);
    const y2 = Math.max(state.drag.start.y, point.y);
    state.drag.preview = { x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 };
    draw();
    return;
  }
  const box = item.boxes.find((candidate) => candidate.id === state.drag.boxId);
  if (!box) return;
  if (state.drag.type === "resize") {
    const original = state.drag.original;
    let x1 = original.x - original.w / 2;
    let y1 = original.y - original.h / 2;
    let x2 = original.x + original.w / 2;
    let y2 = original.y + original.h / 2;
    if (state.drag.handle.includes("w")) x1 = point.x;
    if (state.drag.handle.includes("e")) x2 = point.x;
    if (state.drag.handle.includes("n")) y1 = point.y;
    if (state.drag.handle.includes("s")) y2 = point.y;
    const left = clamp(Math.min(x1, x2));
    const right = clamp(Math.max(x1, x2));
    const top = clamp(Math.min(y1, y2));
    const bottom = clamp(Math.max(y1, y2));
    Object.assign(box, normalizeBoxToBounds({
      ...box,
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      w: Math.max(minBoxSize, right - left),
      h: Math.max(minBoxSize, bottom - top),
    }));
    box.source = "edited";
    box.points = null;
    markDirty(item);
    draw();
    return;
  }
  const nextX = state.drag.original.x + point.x - state.drag.start.x;
  const nextY = state.drag.original.y + point.y - state.drag.start.y;
  Object.assign(box, normalizeBoxToBounds({ ...box, x: nextX, y: nextY }));
  box.source = "edited";
  box.points = null;
  markDirty(item);
  draw();
});

els.canvas.addEventListener("pointerup", () => {
  const item = currentItem();
  if (!item || !state.drag) return;
  if (state.drag.type === "draw" && state.drag.preview && state.drag.preview.w > minBoxSize && state.drag.preview.h > minBoxSize) {
    const classId = Number(els.activeClass.value || 0);
    const box = normalizeBoxToBounds({
      id: crypto.randomUUID(),
      classId,
      label: labelFor(classId),
      ...state.drag.preview,
      points: null,
      confidence: null,
      source: "manual",
    });
    item.boxes.push(box);
    markDirty(item);
    state.selectedBoxId = box.id;
  }
  state.drag = null;
  updateCounts();
  renderReview();
});

document.addEventListener("keydown", (event) => {
  const tagName = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;
  if (event.key === "ArrowLeft") moveImage(-1);
  if (event.key === "ArrowRight") moveImage(1);
  if (event.key === "Delete" || event.key === "Backspace") deleteSelectedBox();
});

window.addEventListener("resize", () => {
  const item = currentItem();
  if (item) updateCanvasDisplaySize(item);
});

updateClassSelect();
updateFormatHelp();
updateAutoReviewButton();
updateCounts();
