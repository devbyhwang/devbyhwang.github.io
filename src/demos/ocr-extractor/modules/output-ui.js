export function createOutputUiHelpers({
  state,
  els,
  t,
  I18N,
  getCurrentLocale,
  escapeHtml,
  formatBytes,
  fieldDefinitions,
  extractFields,
}) {
  function getFieldKeys() {
    return Object.keys(fieldDefinitions);
  }

  function ensureSelectedFields() {
    getFieldKeys().forEach((key) => {
      if (!(key in state.selectedFields)) {
        state.selectedFields[key] = false;
      }
    });
  }

  function getSelectedFieldKeys() {
    ensureSelectedFields();
    return getFieldKeys().filter((key) => state.selectedFields[key] === true);
  }

  function getSelectedFields() {
    return getSelectedFieldKeys().reduce((selected, key) => {
      selected[key] = state.fields[key] || [];
      return selected;
    }, {});
  }

  function hasSelectedField() {
    return getSelectedFieldKeys().length > 0;
  }

  function localizeStatus(status) {
    const statusMap = {
      "대기": "statusPending",
      "처리 중": "statusProcessing",
      "완료": "statusDone",
      "취소됨": "statusCancelled",
      "오류": "statusError",
      "제한": "statusLimited",
      "OCR 중": "statusOcr",
    };
    return statusMap[status] ? t(statusMap[status]) : status;
  }

  function renderFields() {
    ensureSelectedFields();
    const keys = getFieldKeys();
    const currentLocale = getCurrentLocale();

    els.fieldGrid.innerHTML = keys.map((key) => {
      const definition = fieldDefinitions[key];
      const values = state.fields[key] || [];
      const checked = state.selectedFields[key] === true;
      const body = values.length
        ? values.slice(0, 16).map((value) => `<span>${escapeHtml(value)}</span>`).join("")
        : `<span>${escapeHtml(t("noValues"))}</span>`;
      const hint = (I18N[currentLocale]?.fieldHints && I18N[currentLocale].fieldHints[key]) ||
        (I18N.en.fieldHints && I18N.en.fieldHints[key]) ||
        definition.hint;
      const label = (I18N[currentLocale]?.fieldLabels && I18N[currentLocale].fieldLabels[key]) ||
        (I18N.en.fieldLabels && I18N.en.fieldLabels[key]) ||
        definition.label;
      return `
        <div class="field-box${checked ? "" : " is-unselected"}">
          <label class="field-check">
            <input type="checkbox" data-field-key="${key}" ${checked ? "checked" : ""}>
            <b>${escapeHtml(label)}</b>
            <small class="field-count">${escapeHtml(t("countValues", { count: values.length }))}</small>
          </label>
          <p class="field-hint">${escapeHtml(hint)}</p>
          <div class="field-values">${body}</div>
        </div>
      `;
    }).join("");

    const count = keys.reduce((sum, key) => sum + (state.fields[key] || []).length, 0);
    const selectedCount = getSelectedFieldKeys().reduce((sum, key) => sum + (state.fields[key] || []).length, 0);
    els.summaryLine.textContent = state.files.length
      ? t("fieldSummary", { files: state.files.length, pages: state.pages.length, values: count, selected: selectedCount })
      : t("noFilesSummary");
  }

  function renderPages() {
    if (!state.pages.length) {
      els.pageList.innerHTML = `<div class="empty">${escapeHtml(t("pageListEmpty"))}</div>`;
      return;
    }

    els.pageList.innerHTML = state.pages.map((page) => `
      <div class="page-item">
        ${page.thumb ? `<img class="thumb" src="${page.thumb}" alt="${escapeHtml(t("previewAlt", { label: page.label }))}">` : `<div class="thumb"></div>`}
        <div>
          <div>${escapeHtml(page.label)}</div>
          <div class="hint">${escapeHtml(page.detail || "")}</div>
        </div>
        <span class="pill-status">${escapeHtml(localizeStatus(page.status))}</span>
      </div>
    `).join("");
    els.pageList.scrollTop = els.pageList.scrollHeight;
  }

  function renderSelectedFiles() {
    els.fileList.innerHTML = state.files.map((file) => `
      <div class="file-chip" data-file-key="${escapeHtml(file.key)}">
        <span>${escapeHtml(file.name)}</span>
        <small>${escapeHtml(file.status ? t("fileStatus", { status: localizeStatus(file.status), size: formatBytes(file.size) }) : formatBytes(file.size))}</small>
        <button class="file-remove-button" type="button" data-remove-file-key="${escapeHtml(file.key)}" aria-label="${escapeHtml(t("removeFile", { name: file.name }))}" ${file.status === "처리 중" ? "disabled" : ""}>×</button>
      </div>
    `).join("");
  }

  function updateOutput() {
    state.text = state.pages.map((page) => page.text || "").filter(Boolean).join("\n\n").trim();
    state.fields = extractFields(state.text);
    if (!state.fieldSelectionLockedByUser) {
      getFieldKeys().forEach((key) => {
        state.selectedFields[key] = (state.fields[key] || []).length > 0;
      });
    }
    ensureSelectedFields();
    els.textOutput.value = state.text;
    const hasText = Boolean(state.text);
    const hasPdf = state.pdfParts.length > 0;
    const canExportFields = hasText && hasSelectedField();

    els.copyTextBtn.disabled = !hasText;
    els.downloadTxtBtn.disabled = !hasText;
    els.downloadPdfBtn.disabled = !hasPdf;
    els.selectFieldsBtn.disabled = !hasText;
    els.clearFieldsBtn.disabled = !hasText;
    els.copyStructuredBtn.disabled = !canExportFields;
    els.downloadStructuredTxtBtn.disabled = !canExportFields;
    els.downloadRawJsonBtn.disabled = !hasText;
    els.downloadStructuredJsonBtn.disabled = !canExportFields;
    els.downloadCsvBtn.disabled = !canExportFields;
    els.clearBtn.disabled = state.busy || !state.pages.length;

    renderFields();
    renderSelectedFiles();
    renderPages();
  }

  return {
    getFieldKeys,
    ensureSelectedFields,
    getSelectedFieldKeys,
    getSelectedFields,
    hasSelectedField,
    localizeStatus,
    renderFields,
    renderPages,
    renderSelectedFiles,
    updateOutput,
  };
}
