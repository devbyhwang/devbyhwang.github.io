const els = {
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  imageCount: document.querySelector("#image-count"),
  labelCount: document.querySelector("#label-count"),
  boxCount: document.querySelector("#box-count"),
  uploadStatus: document.querySelector("#upload-status"),
  uploadStatusTitle: document.querySelector("#upload-status-title"),
  uploadStatusCount: document.querySelector("#upload-status-count"),
  uploadStatusDetail: document.querySelector("#upload-status-detail"),
  uploadProgressBar: document.querySelector("#upload-progress-bar"),
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
  runQuality: document.querySelector("#run-quality"),
  qualityTotal: document.querySelector("#quality-total"),
  qualityIncluded: document.querySelector("#quality-included"),
  qualityReview: document.querySelector("#quality-review"),
  qualityExcluded: document.querySelector("#quality-excluded"),
  qualityFilters: document.querySelectorAll(".quality-filter"),
  qualityReasons: document.querySelector("#quality-reasons"),
  qualityIncludeFiltered: document.querySelector("#quality-include-filtered"),
  qualityExcludeFiltered: document.querySelector("#quality-exclude-filtered"),
  modeButtons: document.querySelectorAll(".mode-button"),
  eraserMode: document.querySelector('[data-mode="erase"]'),
  polygonFill: document.querySelector("#polygon-fill"),
  eraserSize: document.querySelector("#eraser-size"),
  eraserSizeValue: document.querySelector("#eraser-size-value"),
  eraserHelp: document.querySelector("#eraser-help"),
  activeClass: document.querySelector("#active-class"),
  deleteBox: document.querySelector("#delete-box"),
  currentName: document.querySelector("#current-name"),
  currentLabelFile: document.querySelector("#current-label-file"),
  currentSize: document.querySelector("#current-size"),
  currentBoxes: document.querySelector("#current-boxes"),
  currentStatus: document.querySelector("#current-status"),
  currentQuality: document.querySelector("#current-quality"),
  currentQualityReasons: document.querySelector("#current-quality-reasons"),
  qualityIncludeCurrent: document.querySelector("#quality-include-current"),
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
  labelFormatManual: false,
  qualityFilter: "all",
  qualityReasonFilter: "",
  drag: null,
  eraserFeedback: null,
  eraserFeedbackTimer: null,
};

const boxColor = "#1f5d4a";
const selectedColor = "#c8872e";
const canvasFitRatio = 0.75;
const minBoxSize = 0.005;
const dragThresholdPx = 6;
const historyLimit = 80;
const maxMaskSide = 1200;
const minPolygonArea = 0.00002;
const maxPolygonPoints = 320;
const maxEditPolygonPoints = 900;
const eraserFeedbackMs = 2600;
const lowResolutionShortSide = 320;
const extremeAspectRatio = 3;
const tinyLabelArea = 0.0004;
const hugeLabelArea = 0.7;
const duplicateLabelIou = 0.95;
const duplicateImageHashDistance = 4;
const excessiveLabelCount = 50;

const qualityReasons = {
  missing_label: { label: "라벨 없음", severity: "exclude" },
  empty_label: { label: "빈 라벨", severity: "exclude" },
  parse_error: { label: "라벨 형식 오류", severity: "exclude" },
  invalid_class: { label: "Class_ID 확인", severity: "exclude" },
  invalid_geometry: { label: "좌표/면적 오류", severity: "exclude" },
  low_resolution: { label: "저해상도", severity: "exclude" },
  duplicate_image: { label: "중복 이미지", severity: "exclude" },
  tiny_label: { label: "작은 라벨", severity: "review" },
  huge_label: { label: "큰 라벨", severity: "review" },
  duplicate_label: { label: "중복 라벨", severity: "review" },
  extreme_ratio: { label: "비율 확인", severity: "review" },
  many_labels: { label: "라벨 과다", severity: "review" },
  edge_label: { label: "경계 라벨", severity: "review" },
  watermark_suspect: { label: "워터마크 의심", severity: "review" },
};

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

function boundsForPoints(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    right,
    top,
    bottom,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    w: right - left,
    h: bottom - top,
  };
}

function polygonArea(points) {
  if (!points?.length) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    const point = points[index];
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function validPolygon(points) {
  if (!points || points.length < 3) return false;
  return Math.abs(polygonArea(points)) >= minPolygonArea;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = currentPoint.y > point.y !== previousPoint.y > point.y
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function translatePoints(points, dx, dy) {
  return points.map((point) => ({
    x: point.x + dx,
    y: point.y + dy,
  }));
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function imagePoint(point, item) {
  return {
    x: point.x * item.width,
    y: point.y * item.height,
  };
}

function segmentOrientation(a, b, c) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function pointOnSegment(point, start, end) {
  return Math.abs(segmentOrientation(start, end, point)) < 0.000001
    && point.x >= Math.min(start.x, end.x) - 0.000001
    && point.x <= Math.max(start.x, end.x) + 0.000001
    && point.y >= Math.min(start.y, end.y) - 0.000001
    && point.y <= Math.max(start.y, end.y) + 0.000001;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = segmentOrientation(a, b, c);
  const o2 = segmentOrientation(a, b, d);
  const o3 = segmentOrientation(c, d, a);
  const o4 = segmentOrientation(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return pointOnSegment(c, a, b)
    || pointOnSegment(d, a, b)
    || pointOnSegment(a, c, d)
    || pointOnSegment(b, c, d);
}

function segmentDistance(startA, endA, startB, endB) {
  if (segmentsIntersect(startA, endA, startB, endB)) return 0;
  return Math.min(
    distanceToSegment(startA, startB, endB),
    distanceToSegment(endA, startB, endB),
    distanceToSegment(startB, startA, endA),
    distanceToSegment(endB, startA, endA)
  );
}

function simplifyOpenPoints(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let splitIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance <= tolerance) return [first, last];
  const left = simplifyOpenPoints(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyOpenPoints(points.slice(splitIndex), tolerance);
  return left.slice(0, -1).concat(right);
}

function simplifyClosedPoints(points, tolerance) {
  if (points.length <= 3) return points;
  const ring = [...points, points[0]];
  const simplified = simplifyOpenPoints(ring, tolerance).slice(0, -1);
  return simplified.length >= 3 ? simplified : points;
}

function scalePointsToBox(points, fromBox, toBox) {
  const fromLeft = fromBox.x - fromBox.w / 2;
  const fromTop = fromBox.y - fromBox.h / 2;
  const fromW = fromBox.w || 1;
  const fromH = fromBox.h || 1;
  const toLeft = toBox.x - toBox.w / 2;
  const toTop = toBox.y - toBox.h / 2;
  return points.map((point) => ({
    x: clamp(toLeft + ((point.x - fromLeft) / fromW) * toBox.w),
    y: clamp(toTop + ((point.y - fromTop) / fromH) * toBox.h),
  }));
}

function clonePoints(points) {
  return points ? points.map((point) => ({ ...point })) : null;
}

function editablePointsForBox(box) {
  return box?.editPoints?.length ? box.editPoints : box?.points || null;
}

function markDirty(item) {
  if (item) item.dirty = true;
}

function cloneBox(box) {
  return {
    ...box,
    points: clonePoints(box.points),
    editPoints: clonePoints(box.editPoints),
  };
}

function snapshotItem(item) {
  return {
    boxes: item.boxes.map(cloneBox),
    selectedBoxId: state.selectedBoxId,
  };
}

function restoreSnapshot(item, snapshot) {
  item.boxes = snapshot.boxes.map(cloneBox);
  state.selectedBoxId = item.boxes.some((box) => box.id === snapshot.selectedBoxId)
    ? snapshot.selectedBoxId
    : null;
  markDirty(item);
  updateCounts();
  renderReview();
}

function pushUndo(item, snapshot) {
  if (!item || !snapshot) return;
  item.undoStack ||= [];
  item.redoStack ||= [];
  item.undoStack.push(snapshot);
  if (item.undoStack.length > historyLimit) item.undoStack.shift();
  item.redoStack = [];
}

function undoEdit() {
  const item = currentItem();
  if (!item?.undoStack?.length) return;
  item.redoStack ||= [];
  item.redoStack.push(snapshotItem(item));
  if (item.redoStack.length > historyLimit) item.redoStack.shift();
  restoreSnapshot(item, item.undoStack.pop());
}

function redoEdit() {
  const item = currentItem();
  if (!item?.redoStack?.length) return;
  item.undoStack ||= [];
  item.undoStack.push(snapshotItem(item));
  if (item.undoStack.length > historyLimit) item.undoStack.shift();
  restoreSnapshot(item, item.redoStack.pop());
}

function selectedBoxFor(item) {
  return item?.boxes.find((box) => box.id === state.selectedBoxId) || null;
}

function canErase(item) {
  return Boolean(editablePointsForBox(selectedBoxFor(item))?.length);
}

function setMode(mode) {
  if (mode === "erase" && !canErase(currentItem())) mode = "select";
  state.mode = mode;
  els.modeButtons.forEach((node) => node.classList.toggle("is-active", node.dataset.mode === state.mode));
  els.canvas.classList.toggle("is-erasing", state.mode === "erase");
}

function updateEraserControls(item = currentItem()) {
  const selected = selectedBoxFor(item);
  const eraserAvailable = Boolean(editablePointsForBox(selected)?.length);
  els.eraserMode.disabled = !eraserAvailable;
  if (!eraserAvailable && state.mode === "erase") setMode("select");
  const feedbackActive = state.eraserFeedback && Date.now() < state.eraserFeedback.until;
  if (feedbackActive) {
    els.eraserHelp.textContent = state.eraserFeedback.message;
  } else {
    els.eraserHelp.textContent = eraserAvailable
      ? "선택한 polygon 위를 드래그하면 해당 영역을 제외합니다."
      : "polygon 라벨을 선택하면 지우개를 사용할 수 있습니다.";
  }
  els.canvas.classList.toggle("is-erasing", state.mode === "erase" && eraserAvailable);
}

function setEraserFeedback(message) {
  state.eraserFeedback = {
    message,
    until: Date.now() + eraserFeedbackMs,
  };
  if (state.eraserFeedbackTimer) window.clearTimeout(state.eraserFeedbackTimer);
  state.eraserFeedbackTimer = window.setTimeout(() => {
    state.eraserFeedback = null;
    updateEraserControls();
  }, eraserFeedbackMs);
}

function eraserFeedbackMessage(reason) {
  if (reason === "miss") return "선택한 polygon에 닿는 위치에서 지우개를 사용하세요.";
  return "남은 polygon이 너무 작거나 유효하지 않아 적용하지 않았습니다.";
}

function eraserSizePx() {
  return Number(els.eraserSize.value || 24);
}

function eraserLineWidthForImage(item) {
  const rect = els.canvas.getBoundingClientRect();
  const displayWidth = Math.max(1, rect.width);
  return Math.max(1, eraserSizePx() * (item.width / displayWidth));
}

function maskSizeForItem(item) {
  const scale = Math.min(1, maxMaskSide / Math.max(item.width, item.height));
  return {
    width: Math.max(1, Math.round(item.width * scale)),
    height: Math.max(1, Math.round(item.height * scale)),
    scale,
  };
}

function traceComponents(binary, width, height) {
  const visited = new Uint8Array(binary.length);
  const components = [];
  const stack = [];
  for (let start = 0; start < binary.length; start += 1) {
    if (!binary[start] || visited[start]) continue;
    const component = [];
    visited[start] = 1;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop();
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      neighbors.forEach((neighbor) => {
        if (neighbor >= 0 && binary[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      });
    }
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length);
}

function traceBoundaryLoops(component, width, height) {
  const inside = new Uint8Array(width * height);
  component.forEach((index) => { inside[index] = 1; });
  const isInside = (x, y) => x >= 0 && x < width && y >= 0 && y < height && inside[y * width + x];
  const edges = new Map();
  const addEdge = (startX, startY, endX, endY) => {
    const key = `${startX},${startY}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({ x: endX, y: endY });
  };
  component.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!isInside(x, y - 1)) addEdge(x + 1, y, x, y);
    if (!isInside(x + 1, y)) addEdge(x + 1, y + 1, x + 1, y);
    if (!isInside(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1);
    if (!isInside(x - 1, y)) addEdge(x, y, x, y + 1);
  });

  const loops = [];
  while (edges.size) {
    const firstKey = edges.keys().next().value;
    const [startX, startY] = firstKey.split(",").map(Number);
    const start = { x: startX, y: startY };
    const loop = [start];
    let current = start;
    let guard = 0;
    while (guard < width * height * 4) {
      guard += 1;
      const key = `${current.x},${current.y}`;
      const targets = edges.get(key);
      if (!targets?.length) break;
      const next = targets.pop();
      if (!targets.length) edges.delete(key);
      current = next;
      if (current.x === start.x && current.y === start.y) break;
      loop.push(current);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function eraserTouchesPolygon(box, item, path) {
  const sourcePoints = editablePointsForBox(box);
  if (!sourcePoints?.length || !path.length) return false;
  const radius = Math.max(1, eraserLineWidthForImage(item) / 2);
  const polygon = sourcePoints.map((point) => imagePoint(point, item));
  const eraserPath = path.map((point) => imagePoint(point, item));
  if (path.some((point) => pointInPolygon(point, sourcePoints))) return true;
  for (let polygonIndex = 0; polygonIndex < polygon.length; polygonIndex += 1) {
    const polygonStart = polygon[polygonIndex];
    const polygonEnd = polygon[(polygonIndex + 1) % polygon.length];
    if (eraserPath.length === 1) {
      if (distanceToSegment(eraserPath[0], polygonStart, polygonEnd) <= radius) return true;
      continue;
    }
    for (let pathIndex = 1; pathIndex < eraserPath.length; pathIndex += 1) {
      if (segmentDistance(eraserPath[pathIndex - 1], eraserPath[pathIndex], polygonStart, polygonEnd) <= radius) {
        return true;
      }
    }
  }
  return false;
}

function eraserCanStartOnPolygon(box, item, point) {
  return eraserTouchesPolygon(box, item, [point]);
}

function eraserFailure(reason) {
  return { points: null, reason };
}

function polygonFromEraserMask(box, item, path) {
  const sourcePoints = editablePointsForBox(box);
  if (!sourcePoints?.length || !path.length) return eraserFailure("empty");
  if (!eraserTouchesPolygon(box, item, path)) return eraserFailure("miss");
  const { width, height, scale } = maskSizeForItem(item);
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskCtx = mask.getContext("2d", { willReadFrequently: true });
  maskCtx.fillStyle = "#fff";
  maskCtx.beginPath();
  sourcePoints.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) maskCtx.moveTo(x, y);
    else maskCtx.lineTo(x, y);
  });
  maskCtx.closePath();
  maskCtx.fill();

  maskCtx.globalCompositeOperation = "destination-out";
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  maskCtx.lineWidth = Math.max(1, eraserLineWidthForImage(item) * scale);
  maskCtx.beginPath();
  path.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) maskCtx.moveTo(x, y);
    else maskCtx.lineTo(x, y);
  });
  if (path.length === 1) {
    const point = path[0];
    maskCtx.arc(point.x * width, point.y * height, maskCtx.lineWidth / 2, 0, Math.PI * 2);
    maskCtx.fill();
  } else {
    maskCtx.stroke();
  }

  const imageData = maskCtx.getImageData(0, 0, width, height).data;
  const binary = new Uint8Array(width * height);
  for (let index = 0; index < binary.length; index += 1) {
    binary[index] = imageData[index * 4 + 3] > 0 ? 1 : 0;
  }
  const components = traceComponents(binary, width, height);
  const largest = components[0] || [];
  if (largest.length < 12) return eraserFailure("empty");
  const loops = traceBoundaryLoops(largest, width, height);
  if (!loops.length) return eraserFailure("empty");
  const largestLoop = loops.reduce((best, loop) => {
    const area = Math.abs(polygonArea(loop));
    return area > best.area ? { loop, area } : best;
  }, { loop: null, area: 0 }).loop;
  if (!largestLoop) return eraserFailure("empty");

  let editPoints = largestLoop.map((point) => ({
    x: clamp(point.x / width),
    y: clamp(point.y / height),
  }));
  let tolerance = 0.35 / Math.max(width, height);
  editPoints = simplifyClosedPoints(editPoints, tolerance);
  while (editPoints.length > maxEditPolygonPoints && tolerance < 0.01) {
    tolerance *= 1.35;
    editPoints = simplifyClosedPoints(editPoints, tolerance);
  }
  let points = editPoints;
  tolerance = 0.7 / Math.max(width, height);
  points = simplifyClosedPoints(points, tolerance);
  while (points.length > maxPolygonPoints && tolerance < 0.02) {
    tolerance *= 1.35;
    points = simplifyClosedPoints(points, tolerance);
  }
  return validPolygon(editPoints) ? { points, editPoints, reason: "" } : eraserFailure("empty");
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

function setUploadStatus({ active, title = "", current = 0, total = 0, detail = "" }) {
  els.uploadStatus.hidden = !active;
  if (!active) return;
  const progress = total > 0 ? Math.round((current / total) * 100) : 0;
  els.uploadStatusTitle.textContent = title;
  els.uploadStatusCount.textContent = `${current} / ${total}`;
  els.uploadStatusDetail.textContent = detail;
  els.uploadProgressBar.style.width = `${clamp(progress, 0, 100)}%`;
}

function detectLabelFormatFromText(text) {
  let bbox = 0;
  let polygon = 0;
  let invalid = 0;
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.some((value) => !Number.isFinite(value)) || parts.length < 5) {
      invalid += 1;
      return;
    }
    const coordCount = parts.length - 1;
    if (parts.length === 5) bbox += 1;
    else if (coordCount >= 6 && coordCount % 2 === 0) polygon += 1;
    else invalid += 1;
  });
  if (polygon > bbox) return "polygon";
  if (bbox > 0) return "bbox";
  if (polygon > 0) return "polygon";
  return invalid > 0 ? "unknown" : "bbox";
}

function applyDetectedLabelFormat(format) {
  if (state.labelFormatManual || !["bbox", "polygon"].includes(format)) return;
  if (els.labelFormat.value !== format) {
    els.labelFormat.value = format;
    updateFormatHelp();
  }
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

function defaultQuality() {
  return {
    scanned: false,
    status: "normal",
    reasons: [],
    includeInExport: true,
    manualInclude: false,
    hash: "",
  };
}

function reasonFor(id, detail = "", severity = "") {
  const definition = qualityReasons[id];
  return {
    id,
    label: definition?.label || id,
    severity: severity || definition?.severity || "review",
    detail,
  };
}

function statusForReasons(reasons) {
  if (reasons.some((reason) => reason.severity === "exclude")) return "exclude";
  if (reasons.length) return "review";
  return "normal";
}

function setQualityResult(item, reasons, hash = item.quality?.hash || "") {
  const previous = item.quality || defaultQuality();
  const status = statusForReasons(reasons);
  const includeInExport = previous.manualInclude ? previous.includeInExport : status !== "exclude";
  item.quality = {
    scanned: true,
    status,
    reasons,
    includeInExport,
    manualInclude: previous.manualInclude,
    hash,
  };
}

function setIncludeInExport(item, includeInExport, manual = true) {
  item.quality ||= defaultQuality();
  item.quality.includeInExport = includeInExport;
  item.quality.manualInclude = manual;
}

function invalidateQuality(item) {
  if (!item) return;
  const previous = item.quality || defaultQuality();
  const next = defaultQuality();
  if (previous.manualInclude) {
    next.includeInExport = previous.includeInExport;
    next.manualInclude = true;
  }
  item.quality = next;
}

function resetQualityFilters() {
  state.qualityFilter = "all";
  state.qualityReasonFilter = "";
}

function parseLabelText(text, labelFileName, forcedFormat = "") {
  const boxes = [];
  const invalidLines = [];
  const labelFormat = forcedFormat || getLabelFormat();
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length < 5 || parts.some((value) => !Number.isFinite(value))) {
      invalidLines.push(index + 1);
      return;
    }
    const classIdRaw = parts[0];
    if (classIdRaw < 0 || !Number.isInteger(classIdRaw)) {
      invalidLines.push(index + 1);
      return;
    }
    const classId = Math.max(0, Math.trunc(classIdRaw));
    ensureClassName(classId);

    if (labelFormat === "polygon") {
      const coords = parts.slice(1);
      if (coords.length < 6 || coords.length % 2 !== 0 || coords.some((coord) => coord < 0 || coord > 1)) {
        invalidLines.push(index + 1);
        return;
      }
      const points = [];
      for (let coordIndex = 0; coordIndex < coords.length; coordIndex += 2) {
        points.push({ x: clamp(coords[coordIndex]), y: clamp(coords[coordIndex + 1]) });
      }
      const bounds = boundsForPoints(points);
      if (bounds.w <= 0 || bounds.h <= 0) {
        invalidLines.push(index + 1);
        return;
      }
      boxes.push(normalizeBoxToBounds({
        id: crypto.randomUUID(),
        classId,
        label: labelFor(classId),
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        points,
        confidence: null,
        source: "polygon",
      }));
      return;
    }

    const [, xRaw, yRaw, wRaw, hRaw] = parts;
    if ([xRaw, yRaw, wRaw, hRaw].some((coord) => coord < 0 || coord > 1)) {
      invalidLines.push(index + 1);
      return;
    }
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
  return { boxes, invalidLines, labelFileName, labelFormat };
}

async function readImageFile(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  const labelSource = state.labelsByBaseName.get(baseName(file.name));
  const parsed = labelSource
    ? parseLabelText(
      labelSource.text,
      labelSource.labelFileName,
      state.labelFormatManual ? getLabelFormat() : labelSource.format
    )
    : null;
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
    labelFormat: parsed?.labelFormat || getLabelFormat(),
    invalidLabelLines: parsed?.invalidLines || [],
    reviewed: false,
    seen: false,
    dirty: false,
    quality: defaultQuality(),
    undoStack: [],
    redoStack: [],
  };
}

async function readLabelFile(file) {
  const text = await file.text();
  const detectedFormat = detectLabelFormatFromText(text);
  state.labelsByBaseName.set(baseName(file.name), { text, labelFileName: file.name, format: detectedFormat });
  return detectedFormat;
}

async function addFiles(fileList) {
  const files = Array.from(fileList);
  const labelFiles = files.filter((file) => file.name.toLowerCase().endsWith(".txt"));
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const totalWork = labelFiles.length + imageFiles.length;
  if (totalWork === 0) {
    setUploadStatus({
      active: true,
      title: "읽을 파일 없음",
      current: 0,
      total: 0,
      detail: "이미지 파일이나 YOLO 라벨 좌표 txt 파일을 선택하세요.",
    });
    window.setTimeout(() => setUploadStatus({ active: false }), 1400);
    return;
  }
  let completedWork = 0;
  setUploadStatus({
    active: true,
    title: "파일 읽는 중",
    current: 0,
    total: totalWork,
    detail: `${labelFiles.length}개 라벨 txt와 ${imageFiles.length}개 이미지를 확인합니다.`,
  });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const detectedFormats = [];

  for (const file of labelFiles) {
    try {
      detectedFormats.push(await readLabelFile(file));
    } catch (error) {
      console.warn(error);
    }
    completedWork += 1;
    setUploadStatus({
      active: true,
      title: "라벨 읽는 중",
      current: completedWork,
      total: totalWork,
      detail: file.name,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  const bboxDetections = detectedFormats.filter((format) => format === "bbox").length;
  const polygonDetections = detectedFormats.filter((format) => format === "polygon").length;
  if (polygonDetections > bboxDetections) applyDetectedLabelFormat("polygon");
  else if (bboxDetections > 0) applyDetectedLabelFormat("bbox");

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
    completedWork += 1;
    setUploadStatus({
      active: true,
      title: "이미지 로드 중",
      current: completedWork,
      total: totalWork,
      detail: file.name,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  state.images.push(...loadedImages);
  applyLabelsToExistingImages();
  if (state.currentIndex >= state.images.length) state.currentIndex = Math.max(0, state.images.length - 1);
  if (state.images.length && loadedImages.length) state.currentIndex = state.images.length - loadedImages.length;
  state.selectedBoxId = null;
  updateClassSelect();
  updateCounts();
  renderReview();
  setUploadStatus({
    active: true,
    title: "로드 완료",
    current: totalWork,
    total: totalWork,
    detail: `${loadedImages.length}개 이미지가 추가되었습니다.`,
  });
  window.setTimeout(() => setUploadStatus({ active: false }), 1200);
}

function applyLabelsToExistingImages() {
  state.images.forEach((item) => {
    if (item.dirty) return;
    const labelSource = state.labelsByBaseName.get(item.baseName);
    if (!labelSource) return;
    const parsed = parseLabelText(
      labelSource.text,
      labelSource.labelFileName,
      state.labelFormatManual ? getLabelFormat() : labelSource.format
    );
    item.boxes = parsed.boxes.map((box) => ({ ...box, id: crypto.randomUUID() }));
    item.labelFileName = parsed.labelFileName;
    item.labelFormat = parsed.labelFormat;
    item.invalidLabelLines = parsed.invalidLines;
    item.reviewed = false;
    item.seen = false;
    item.dirty = false;
    invalidateQuality(item);
    item.undoStack = [];
    item.redoStack = [];
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

function boxBounds(box) {
  return {
    left: box.x - box.w / 2,
    top: box.y - box.h / 2,
    right: box.x + box.w / 2,
    bottom: box.y + box.h / 2,
  };
}

function boxArea(box) {
  const points = editablePointsForBox(box);
  if (points?.length && validPolygon(points)) return Math.abs(polygonArea(points));
  return Math.max(0, box.w) * Math.max(0, box.h);
}

function boxIou(a, b) {
  const ab = boxBounds(a);
  const bb = boxBounds(b);
  const left = Math.max(ab.left, bb.left);
  const top = Math.max(ab.top, bb.top);
  const right = Math.min(ab.right, bb.right);
  const bottom = Math.min(ab.bottom, bb.bottom);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}

function touchesImageEdge(box) {
  const bounds = boxBounds(box);
  return bounds.left <= 0.002 || bounds.top <= 0.002 || bounds.right >= 0.998 || bounds.bottom >= 0.998;
}

function imageHash(item) {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const hashCtx = canvas.getContext("2d", { willReadFrequently: true });
  hashCtx.drawImage(item.image, 0, 0, 8, 8);
  const data = hashCtx.getImageData(0, 0, 8, 8).data;
  const grays = [];
  for (let index = 0; index < data.length; index += 4) {
    grays.push(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }
  const average = grays.reduce((sum, value) => sum + value, 0) / grays.length;
  return grays.map((value) => (value >= average ? "1" : "0")).join("");
}

function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) distance += 1;
  }
  return distance;
}

function watermarkSuspect(item) {
  const width = 96;
  const height = Math.max(24, Math.round((item.height / item.width) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(item.image, 0, 0, width, height);
  const data = sampleCtx.getImageData(0, 0, width, height).data;
  const gray = (x, y) => {
    const index = (y * width + x) * 4;
    return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  };
  const density = (x1, y1, x2, y2) => {
    let edges = 0;
    let total = 0;
    for (let y = Math.max(1, y1); y < Math.min(height - 1, y2); y += 1) {
      for (let x = Math.max(1, x1); x < Math.min(width - 1, x2); x += 1) {
        const gx = Math.abs(gray(x + 1, y) - gray(x - 1, y));
        const gy = Math.abs(gray(x, y + 1) - gray(x, y - 1));
        if (gx + gy > 72) edges += 1;
        total += 1;
      }
    }
    return total ? edges / total : 0;
  };
  const center = density(Math.round(width * 0.25), Math.round(height * 0.25), Math.round(width * 0.75), Math.round(height * 0.75));
  const bottom = density(0, Math.round(height * 0.78), width, height);
  const top = density(0, 0, width, Math.round(height * 0.16));
  const leftCorner = density(0, 0, Math.round(width * 0.34), Math.round(height * 0.24));
  const rightCorner = density(Math.round(width * 0.66), 0, width, Math.round(height * 0.24));
  const baseline = Math.max(center, 0.015);
  return bottom > 0.08 && bottom > baseline * 2.1
    || top > 0.09 && top > baseline * 2.4
    || leftCorner > 0.11 && leftCorner > baseline * 2.4
    || rightCorner > 0.11 && rightCorner > baseline * 2.4;
}

function analyzeItemQuality(item, hash, duplicateOf = "") {
  const reasons = [];
  const classes = getClasses();
  const shortSide = Math.min(item.width, item.height);
  const aspectRatio = item.width / Math.max(1, item.height);
  const labelSource = state.labelsByBaseName.get(item.baseName);
  const canExportCurrentLabel = item.boxes.length > 0 || els.emptyLabels.checked;
  if (!labelSource && !canExportCurrentLabel) reasons.push(reasonFor("missing_label", "매칭되는 txt 없음"));
  else if (!labelSource && !item.boxes.length) reasons.push(reasonFor("missing_label", "빈 txt로 내보낼 수 있음", "review"));
  else if (labelSource && !labelSource.text.trim() && !canExportCurrentLabel) reasons.push(reasonFor("empty_label", "txt가 비어 있음"));
  else if (labelSource && !labelSource.text.trim() && !item.boxes.length) reasons.push(reasonFor("empty_label", "빈 txt로 내보낼 수 있음", "review"));
  if (item.invalidLabelLines.length) reasons.push(reasonFor("parse_error", `${item.invalidLabelLines.length}개 줄 무시됨`));
  if (shortSide < lowResolutionShortSide) reasons.push(reasonFor("low_resolution", `짧은 변 ${shortSide}px`));
  if (aspectRatio > extremeAspectRatio || aspectRatio < 1 / extremeAspectRatio) {
    reasons.push(reasonFor("extreme_ratio", `${item.width}:${item.height}`));
  }
  if (duplicateOf) reasons.push(reasonFor("duplicate_image", `${duplicateOf}와 유사`));
  if (item.boxes.length > excessiveLabelCount) reasons.push(reasonFor("many_labels", `${item.boxes.length}개 라벨`));
  item.boxes.forEach((box, index) => {
    if (box.classId >= classes.length) reasons.push(reasonFor("invalid_class", `#${index + 1} class ${box.classId}`));
    const area = boxArea(box);
    if (!Number.isFinite(area) || area <= 0 || box.w <= 0 || box.h <= 0) {
      reasons.push(reasonFor("invalid_geometry", `#${index + 1}`));
    } else {
      if (area < tinyLabelArea) reasons.push(reasonFor("tiny_label", `#${index + 1} ${(area * 100).toFixed(3)}%`));
      if (area > hugeLabelArea) reasons.push(reasonFor("huge_label", `#${index + 1} ${(area * 100).toFixed(1)}%`));
    }
    const points = editablePointsForBox(box);
    if (points?.length && !validPolygon(points)) reasons.push(reasonFor("invalid_geometry", `#${index + 1} polygon`));
    if (touchesImageEdge(box)) reasons.push(reasonFor("edge_label", `#${index + 1}`));
  });
  for (let index = 0; index < item.boxes.length; index += 1) {
    for (let next = index + 1; next < item.boxes.length; next += 1) {
      if (item.boxes[index].classId === item.boxes[next].classId && boxIou(item.boxes[index], item.boxes[next]) >= duplicateLabelIou) {
        reasons.push(reasonFor("duplicate_label", `#${index + 1} / #${next + 1}`));
      }
    }
  }
  if (watermarkSuspect(item)) reasons.push(reasonFor("watermark_suspect", "가장자리 고대비 패턴"));
  const uniqueReasons = [];
  const seen = new Set();
  reasons.forEach((reason) => {
    const key = `${reason.id}:${reason.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueReasons.push(reason);
  });
  setQualityResult(item, uniqueReasons, hash);
}

async function runQualityScan() {
  if (!state.images.length) return;
  setUploadStatus({
    active: true,
    title: "품질 검사 중",
    current: 0,
    total: state.images.length,
    detail: "이미지와 라벨 상태를 확인합니다.",
  });
  const seenHashes = [];
  for (let index = 0; index < state.images.length; index += 1) {
    const item = state.images[index];
    const hash = imageHash(item);
    const duplicate = seenHashes.find((candidate) => hammingDistance(candidate.hash, hash) <= duplicateImageHashDistance);
    analyzeItemQuality(item, hash, duplicate?.name || "");
    seenHashes.push({ name: item.name, hash });
    setUploadStatus({
      active: true,
      title: "품질 검사 중",
      current: index + 1,
      total: state.images.length,
      detail: item.name,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  renderReview();
  setUploadStatus({
    active: true,
    title: "품질 검사 완료",
    current: state.images.length,
    total: state.images.length,
    detail: "사유별 보기에서 포함 여부를 조정할 수 있습니다.",
  });
  window.setTimeout(() => setUploadStatus({ active: false }), 1400);
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

function pointerDistance(startEvent, event) {
  return Math.hypot(event.clientX - startEvent.clientX, event.clientY - startEvent.clientY);
}

function normalizedDistance(a, b, item) {
  return Math.hypot((a.x - b.x) * item.width, (a.y - b.y) * item.height);
}

function applyEraser(item, box, path) {
  const result = polygonFromEraserMask(box, item, path);
  if (!result.points) {
    setEraserFeedback(eraserFeedbackMessage(result.reason));
    return false;
  }
  const { points, editPoints } = result;
  const bounds = boundsForPoints(editPoints || points);
  if (bounds.w <= minBoxSize || bounds.h <= minBoxSize) {
    setEraserFeedback(eraserFeedbackMessage("empty"));
    return false;
  }
  box.points = points;
  box.editPoints = editPoints || points;
  Object.assign(box, normalizeBoxToBounds({
    ...box,
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
  }));
  box.source = "edited";
  markDirty(item);
  invalidateQuality(item);
  return true;
}

function boxesAt(item, point) {
  const boxes = [];
  for (let i = item.boxes.length - 1; i >= 0; i -= 1) {
    const box = item.boxes[i];
    const x1 = box.x - box.w / 2;
    const y1 = box.y - box.h / 2;
    const x2 = box.x + box.w / 2;
    const y2 = box.y + box.h / 2;
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) boxes.push(box);
  }
  return boxes;
}

function boxAt(item, point) {
  return boxesAt(item, point)[0] || null;
}

function nextStackedBoxId(candidateIds, selectedId) {
  const currentIndex = candidateIds.indexOf(selectedId);
  return candidateIds[(currentIndex + 1) % candidateIds.length];
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
    const polygonPoints = editablePointsForBox(box);
    if (polygonPoints?.length) {
      ctx.beginPath();
      polygonPoints.forEach((point, index) => {
        const px = point.x * item.width;
        const py = point.y * item.height;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      if (els.polygonFill.checked) {
        ctx.fillStyle = selected ? "rgba(200, 135, 46, 0.24)" : "rgba(31, 93, 74, 0.18)";
        ctx.fill();
      }
      ctx.strokeStyle = selected ? selectedColor : boxColor;
      ctx.setLineDash([12, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = selected ? selectedColor : boxColor;
    if (!polygonPoints?.length) {
      ctx.fillStyle = selected ? "rgba(200, 135, 46, 0.12)" : "rgba(31, 93, 74, 0.1)";
      ctx.fillRect(x, y, w, h);
    }
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

  if (state.drag?.type === "erase" && state.drag.path?.length) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const eraserWidth = eraserLineWidthForImage(item);
    ctx.lineWidth = eraserWidth;
    ctx.strokeStyle = "rgba(196, 84, 73, 0.72)";
    ctx.fillStyle = "rgba(196, 84, 73, 0.22)";
    ctx.beginPath();
    state.drag.path.forEach((point, index) => {
      const px = point.x * item.width;
      const py = point.y * item.height;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    if (state.drag.path.length === 1) {
      const point = state.drag.path[0];
      ctx.arc(point.x * item.width, point.y * item.height, eraserWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
    const cursor = state.drag.cursor || state.drag.path[state.drag.path.length - 1];
    ctx.beginPath();
    ctx.arc(cursor.x * item.width, cursor.y * item.height, eraserWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(196, 84, 73, 0.18)";
    ctx.fill();
    ctx.lineWidth = Math.max(2, item.width / 420);
    ctx.strokeStyle = "rgba(132, 44, 37, 0.88)";
    ctx.stroke();
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

function qualityStatusLabel(item) {
  const quality = item?.quality || defaultQuality();
  if (!quality.scanned) return "미검사";
  if (quality.status === "exclude") return "제외 권장";
  if (quality.status === "review") return "확인 필요";
  return "정상";
}

function qualityReasonCounts() {
  const counts = new Map();
  state.images.forEach((item) => {
    (item.quality?.reasons || []).forEach((reason) => {
      counts.set(reason.id, (counts.get(reason.id) || 0) + 1);
    });
  });
  return counts;
}

function itemMatchesQualityFilter(item) {
  const quality = item.quality || defaultQuality();
  if (state.qualityReasonFilter && !quality.reasons.some((reason) => reason.id === state.qualityReasonFilter)) return false;
  if (state.qualityFilter === "included") return quality.includeInExport !== false;
  if (state.qualityFilter === "review") return quality.status === "review";
  if (state.qualityFilter === "exclude") return quality.status === "exclude" || quality.includeInExport === false;
  return true;
}

function visibleImageIndexes() {
  return state.images
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => itemMatchesQualityFilter(item))
    .map(({ index }) => index);
}

function filteredItems() {
  return visibleImageIndexes().map((index) => state.images[index]);
}

function ensureCurrentVisible() {
  const visible = visibleImageIndexes();
  if (!visible.length) {
    state.currentIndex = -1;
    state.selectedBoxId = null;
    return false;
  }
  if (!visible.includes(state.currentIndex)) {
    state.currentIndex = visible[0];
    state.selectedBoxId = null;
  }
  return true;
}

function renderQualityPanel() {
  const total = state.images.length;
  const included = state.images.filter((item) => item.quality?.includeInExport !== false).length;
  const review = state.images.filter((item) => item.quality?.status === "review").length;
  const excluded = state.images.filter((item) => item.quality?.status === "exclude" || item.quality?.includeInExport === false).length;
  els.qualityTotal.textContent = total;
  els.qualityIncluded.textContent = included;
  els.qualityReview.textContent = review;
  els.qualityExcluded.textContent = excluded;
  els.qualityFilters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.qualityFilter === state.qualityFilter);
  });

  const counts = qualityReasonCounts();
  els.qualityReasons.innerHTML = "";
  if (!counts.size) {
    const empty = document.createElement("span");
    empty.className = "status-text";
    empty.textContent = "검사 후 사유가 표시됩니다.";
    els.qualityReasons.append(empty);
  } else {
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([id, count]) => {
        const definition = qualityReasons[id];
        const button = document.createElement("button");
        button.type = "button";
        button.className = `reason-filter${state.qualityReasonFilter === id ? " is-active" : ""}`;
        button.textContent = `${definition?.label || id} ${count}`;
        button.addEventListener("click", () => {
          state.qualityReasonFilter = state.qualityReasonFilter === id ? "" : id;
          ensureCurrentVisible();
          renderReview();
        });
        els.qualityReasons.append(button);
      });
  }
}

function renderCurrentQuality(item) {
  const quality = item?.quality || defaultQuality();
  els.qualityIncludeCurrent.checked = quality.includeInExport !== false;
  els.currentQuality.textContent = qualityStatusLabel(item);
  els.currentQualityReasons.innerHTML = "";
  if (!quality.scanned) {
    const note = document.createElement("span");
    note.className = "quality-chip";
    note.textContent = "품질 검사 전";
    els.currentQualityReasons.append(note);
    return;
  }
  if (!quality.reasons.length) {
    const note = document.createElement("span");
    note.className = "quality-chip";
    note.textContent = "사유 없음";
    els.currentQualityReasons.append(note);
    return;
  }
  quality.reasons.forEach((reason) => {
    const chip = document.createElement("span");
    chip.className = `quality-chip is-${reason.severity}`;
    chip.textContent = reason.detail ? `${reason.label}: ${reason.detail}` : reason.label;
    els.currentQualityReasons.append(chip);
  });
}

function renderThumbs() {
  els.thumbStrip.innerHTML = "";
  const visible = visibleImageIndexes();
  if (!visible.length) {
    els.thumbStrip.innerHTML = `<p class="status-text">현재 필터에 맞는 이미지가 없습니다.</p>`;
    return;
  }
  const visiblePosition = Math.max(0, visible.indexOf(state.currentIndex));
  const start = Math.max(0, visiblePosition - 3);
  const end = Math.min(visible.length, visiblePosition + 4);
  for (let position = start; position < end; position += 1) {
    const index = visible[position];
    const item = state.images[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thumb${index === state.currentIndex ? " is-active" : ""}${item.quality?.includeInExport === false ? " is-excluded" : ""}`;
    const image = document.createElement("img");
    image.src = item.url;
    image.alt = "";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const status = document.createElement("span");
    status.textContent = `${item.boxes.length} boxes · ${item.reviewed ? "검수됨" : "검수 전"}`;
    const badges = document.createElement("div");
    badges.className = "thumb-badges";
    if (item.quality?.scanned) {
      const chip = document.createElement("span");
      chip.className = `quality-chip is-${item.quality.status === "exclude" ? "exclude" : item.quality.status === "review" ? "review" : "normal"}`;
      chip.textContent = qualityStatusLabel(item);
      badges.append(chip);
    }
    if (item.quality?.includeInExport === false) {
      const chip = document.createElement("span");
      chip.className = "quality-chip is-exclude";
      chip.textContent = "다운로드 제외";
      badges.append(chip);
    }
    button.replaceChildren(image, name, status, badges);
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
  const hasVisibleItem = ensureCurrentVisible();
  const item = hasVisibleItem ? currentItem() : null;
  els.reviewSection.hidden = !state.images.length;
  if (!item) {
    state.selectedBoxId = null;
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    renderQualityPanel();
    renderThumbs();
    els.currentName.textContent = state.images.length ? "필터 결과 없음" : "-";
    els.currentLabelFile.textContent = "없음";
    els.currentSize.textContent = "-";
    els.currentBoxes.textContent = "0";
    els.currentStatus.textContent = "검수 전";
    els.currentQuality.textContent = "미검사";
    els.qualityIncludeCurrent.checked = false;
    els.qualityIncludeCurrent.disabled = true;
    els.reviewedToggle.checked = false;
    els.reviewedToggle.disabled = true;
    els.deleteBox.disabled = true;
    els.currentQualityReasons.innerHTML = "";
    return;
  }
  els.qualityIncludeCurrent.disabled = false;
  els.reviewedToggle.disabled = false;
  if (state.autoReview && !item.reviewed) {
    markReviewed(item, true);
    updateCounts();
  }
  els.currentName.textContent = item.name;
  const selectedBox = selectedBoxFor(item);
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
  updateEraserControls(item);
  renderCurrentQuality(item);
  renderQualityPanel();
  renderBoxList(item);
  renderThumbs();
  draw();
}

function moveImage(delta) {
  if (!state.images.length) return;
  const visible = visibleImageIndexes();
  if (!visible.length) return;
  const position = Math.max(0, visible.indexOf(state.currentIndex));
  const nextPosition = clamp(position + delta, 0, visible.length - 1);
  state.currentIndex = visible[nextPosition];
  state.selectedBoxId = null;
  renderReview();
}

function deleteSelectedBox() {
  const item = currentItem();
  if (!item || !state.selectedBoxId) return;
  pushUndo(item, snapshotItem(item));
  item.boxes = item.boxes.filter((box) => box.id !== state.selectedBoxId);
  markDirty(item);
  invalidateQuality(item);
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

function effectiveLabelFormatForItem(item) {
  return state.labelFormatManual ? getLabelFormat() : (item?.labelFormat || getLabelFormat());
}

function saveLabelsFor(item) {
  const labelFormat = effectiveLabelFormatForItem(item);
  const lines = item.boxes.map((box) => {
    const normalized = normalizeBoxToBounds(box);
    if (labelFormat === "polygon") {
      const points = editablePointsForBox(box) || polygonPointsForBox(normalized);
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
  const exportImages = state.images.filter((item) => item.quality?.includeInExport !== false);
  exportImages.forEach((item) => {
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
    for (const item of exportImages) {
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
  resetQualityFilters();
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
    invalidateQuality(item);
  });
  renderReview();
});
els.activeClass.addEventListener("change", () => {
  const item = currentItem();
  const selectedBox = item?.boxes.find((box) => box.id === state.selectedBoxId);
  if (!selectedBox) return;
  if (selectedBox.classId === Number(els.activeClass.value || 0)) return;
  pushUndo(item, snapshotItem(item));
  selectedBox.classId = Number(els.activeClass.value || 0);
  selectedBox.label = labelFor(selectedBox.classId);
  selectedBox.source = "edited";
  markDirty(item);
  invalidateQuality(item);
  updateCounts();
  renderReview();
});
els.labelFormat.addEventListener("change", () => {
  state.labelFormatManual = true;
  updateFormatHelp();
  applyLabelsToExistingImages();
  updateCounts();
  renderReview();
});
els.customFormat.addEventListener("input", () => {
  state.labelFormatManual = true;
  updateFormatHelp();
  applyLabelsToExistingImages();
  updateCounts();
  renderReview();
});
els.polygonFill.addEventListener("change", draw);
els.eraserSize.addEventListener("input", () => {
  els.eraserSizeValue.textContent = `${eraserSizePx()}px`;
  draw();
});
els.runQuality.addEventListener("click", runQualityScan);
els.qualityFilters.forEach((button) => {
  button.addEventListener("click", () => {
    state.qualityFilter = button.dataset.qualityFilter;
    ensureCurrentVisible();
    renderReview();
  });
});
els.qualityIncludeFiltered.addEventListener("click", () => {
  filteredItems().forEach((item) => setIncludeInExport(item, true));
  renderReview();
});
els.qualityExcludeFiltered.addEventListener("click", () => {
  filteredItems().forEach((item) => setIncludeInExport(item, false));
  renderReview();
});
els.qualityIncludeCurrent.addEventListener("change", () => {
  const item = currentItem();
  if (!item) return;
  setIncludeInExport(item, els.qualityIncludeCurrent.checked);
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
    if (button.disabled) return;
    setMode(button.dataset.mode);
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
  if (state.mode === "erase") {
    const box = selectedBoxFor(item);
    if (!editablePointsForBox(box)?.length) return;
    if (!eraserCanStartOnPolygon(box, item, point)) {
      setEraserFeedback(eraserFeedbackMessage("miss"));
      updateEraserControls(item);
      draw();
      return;
    }
    state.drag = {
      type: "erase",
      boxId: box.id,
      before: snapshotItem(item),
      path: [point],
      cursor: point,
    };
    draw();
    return;
  }
  if (state.mode === "draw") {
    state.drag = {
      type: "draw",
      pending: true,
      start: point,
      startEvent: { clientX: event.clientX, clientY: event.clientY },
      before: snapshotItem(item),
      preview: null,
    };
    return;
  }
  const candidates = boxesAt(item, point);
  const candidateIds = candidates.map((candidate) => candidate.id);
  const selectedInStack = candidateIds.includes(state.selectedBoxId);
  const box = selectedInStack
    ? candidates.find((candidate) => candidate.id === state.selectedBoxId)
    : candidates[0];
  const cycleOnClick = selectedInStack && candidates.length > 1;
  state.selectedBoxId = box?.id || null;
  const handle = box ? resizeHandleAt(item, point, box) : "";
  state.drag = box
    ? {
      type: handle ? "resize" : "move",
      pending: true,
      cycleOnClick,
      candidateIds,
      handle,
      boxId: box.id,
      start: point,
      startEvent: { clientX: event.clientX, clientY: event.clientY },
      before: snapshotItem(item),
      original: cloneBox(box),
    }
    : null;
  renderReview();
});

els.canvas.addEventListener("pointermove", (event) => {
  const item = currentItem();
  if (!item || !state.drag) return;
  const point = imageToCanvas(item, event.clientX, event.clientY);
  if (state.drag.type === "erase") {
    state.drag.cursor = point;
    const previous = state.drag.path[state.drag.path.length - 1];
    if (!previous || normalizedDistance(previous, point, item) >= 1.5) {
      state.drag.path.push(point);
    }
    draw();
    return;
  }
  if (state.drag.pending) {
    if (pointerDistance(state.drag.startEvent, event) < dragThresholdPx) return;
    state.drag.pending = false;
  }
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
    const resized = normalizeBoxToBounds({
      ...box,
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      w: Math.max(minBoxSize, right - left),
      h: Math.max(minBoxSize, bottom - top),
    });
    Object.assign(box, resized);
    if (state.drag.original.points?.length) {
      box.points = scalePointsToBox(state.drag.original.points, state.drag.original, resized);
    }
    if (state.drag.original.editPoints?.length) {
      box.editPoints = scalePointsToBox(state.drag.original.editPoints, state.drag.original, resized);
    }
    box.source = "edited";
    markDirty(item);
    draw();
    return;
  }
  const nextX = state.drag.original.x + point.x - state.drag.start.x;
  const nextY = state.drag.original.y + point.y - state.drag.start.y;
  const moved = normalizeBoxToBounds({ ...box, x: nextX, y: nextY });
  const dx = moved.x - state.drag.original.x;
  const dy = moved.y - state.drag.original.y;
  Object.assign(box, moved);
  if (state.drag.original.points?.length) {
    box.points = translatePoints(state.drag.original.points, dx, dy);
  }
  if (state.drag.original.editPoints?.length) {
    box.editPoints = translatePoints(state.drag.original.editPoints, dx, dy);
  }
  box.source = "edited";
  markDirty(item);
  draw();
});

els.canvas.addEventListener("pointerup", () => {
  const item = currentItem();
  if (!item || !state.drag) return;
  if (state.drag.type === "erase") {
    const box = item.boxes.find((candidate) => candidate.id === state.drag.boxId);
    if (box && applyEraser(item, box, state.drag.path)) {
      pushUndo(item, state.drag.before);
    }
  } else if (state.drag.type === "draw" && state.drag.preview && state.drag.preview.w > minBoxSize && state.drag.preview.h > minBoxSize) {
    pushUndo(item, state.drag.before);
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
    if (effectiveLabelFormatForItem(item) === "polygon") {
      box.points = polygonPointsForBox(box);
      box.editPoints = clonePoints(box.points);
      box.source = "manual-polygon";
    }
    item.boxes.push(box);
    markDirty(item);
    invalidateQuality(item);
    state.selectedBoxId = box.id;
  } else if ((state.drag.type === "move" || state.drag.type === "resize") && !state.drag.pending) {
    pushUndo(item, state.drag.before);
    invalidateQuality(item);
  } else if ((state.drag.type === "move" || state.drag.type === "resize") && state.drag.pending && state.drag.cycleOnClick) {
    state.selectedBoxId = nextStackedBoxId(state.drag.candidateIds, state.selectedBoxId);
  }
  state.drag = null;
  updateCounts();
  renderReview();
});

document.addEventListener("keydown", (event) => {
  const tagName = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;
  const key = event.key.toLowerCase();
  const hasModifier = event.metaKey || event.ctrlKey;
  if (hasModifier && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redoEdit();
    else undoEdit();
    return;
  }
  if (event.ctrlKey && key === "y") {
    event.preventDefault();
    redoEdit();
    return;
  }
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
