export function createPresetService(ctx) {
  const { state, store, els, utils, i18n } = ctx;
  const { clampInt } = utils;
  const defaultEditorParent = els.presetEditor ? els.presetEditor.parentElement : null;

  const mountEditorAtDefault = function () {
    if (!els.presetEditor || !defaultEditorParent) return;
    defaultEditorParent.appendChild(els.presetEditor);
  };

  const mountEditorUnderPreset = function (presetId) {
    if (!els.presetEditor || !els.presetList || !presetId) {
      mountEditorAtDefault();
      return;
    }
    const target = Array.from(els.presetList.children).find(function (node) {
      return node && node.dataset && node.dataset.presetId === presetId;
    });
    if (!target) {
      mountEditorAtDefault();
      return;
    }
    target.appendChild(els.presetEditor);
  };

  const renderPresetList = function () {
    els.presetList.innerHTML = "";
    ctx.timer.getAllPresets().forEach(function (preset) {
      const li = document.createElement("li");
      li.dataset.presetId = preset.id;
      li.className = "preset-item" + (preset.id === state.timer.activePresetId ? " active" : "");

      const row = document.createElement("div");
      row.className = "preset-row";

      const name = document.createElement("p");
      name.className = "preset-name";
      name.textContent = preset.name;
      row.appendChild(name);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "6px";

      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "mini primary";
      applyBtn.textContent = i18n.t("preset.apply");
      applyBtn.addEventListener("click", function () {
        if (state.timer.status === "running") {
          const ok = window.confirm(i18n.t("confirm.applyPresetRunning"));
          if (!ok) return;
        }
        ctx.timer.applySettings(preset, preset.id, preset.name);
        ctx.setStatus(i18n.t("status.presetApplied", { name: preset.name }));
        ctx.render();
        ctx.storage.persistState();
        renderPresetList();
      });
      actions.appendChild(applyBtn);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "mini";
      editBtn.textContent = i18n.t("preset.edit");
      editBtn.addEventListener("click", function () {
        state.ui.editingPresetId = preset.id;
        renderPresetList();
        openEditor(preset);
      });
      actions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "mini warn";
      delBtn.textContent = i18n.t("preset.delete");
      delBtn.addEventListener("click", function () {
        const shouldWarnReset = ["running", "paused"].includes(state.timer.status) && state.timer.activePresetId === preset.id;
        const confirmKey = shouldWarnReset
          ? "confirm.deleteActivePresetRunning"
          : "confirm.deletePreset";
        const ok = window.confirm(i18n.t(confirmKey));
        if (!ok) return;

        if (preset.builtin) {
          store.hiddenBuiltinPresetIds = Array.from(new Set(store.hiddenBuiltinPresetIds.concat([preset.id])));
          ctx.storage.persistHiddenBuiltins();
        } else {
          store.userPresets = store.userPresets.filter(function (item) { return item.id !== preset.id; });
          ctx.storage.persistPresets();
        }

        if (state.timer.activePresetId === preset.id) {
          const fallback = ctx.timer.getFallbackPreset();
          if (fallback) {
            ctx.timer.applySettings(fallback, fallback.id, fallback.name);
          } else {
            state.timer.activePresetId = null;
            state.timer.customLabel = i18n.normalizePresetName(utils.normalizeLabel(state.timer.customLabel)) || i18n.t("presets.custom");
            ctx.timer.setToFocusIdle();
          }
        }

        ctx.setStatus(i18n.t("status.presetDeleted"));
        renderPresetList();
        ctx.render();
        ctx.storage.persistState();
      });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      li.appendChild(row);

      const meta = document.createElement("p");
      meta.className = "preset-meta";
      meta.textContent = i18n.t("preset.meta", {
        focus: preset.focusMin,
        short: preset.shortBreakMin,
        long: preset.longBreakMin,
        every: preset.longBreakEvery,
        max: preset.maxPomodoros,
      });
      li.appendChild(meta);

      els.presetList.appendChild(li);
    });

    if (state.ui.editingPresetId) {
      mountEditorUnderPreset(state.ui.editingPresetId);
      return;
    }
    mountEditorAtDefault();
  };

  const openEditor = function (preset) {
    const p = preset || {
      name: "",
      focusMin: state.settings.focusMin,
      shortBreakMin: state.settings.shortBreakMin,
      longBreakMin: state.settings.longBreakMin,
      longBreakEvery: state.settings.longBreakEvery,
      maxPomodoros: state.settings.maxPomodoros,
    };
    if (state.ui.editingPresetId) {
      mountEditorUnderPreset(state.ui.editingPresetId);
    } else {
      mountEditorAtDefault();
    }
    els.presetEditor.dataset.open = "true";
    els.presetNameInput.value = p.name || "";
    els.presetFocusInput.value = String(p.focusMin);
    els.presetShortInput.value = String(p.shortBreakMin);
    els.presetLongInput.value = String(p.longBreakMin);
    els.presetEveryInput.value = String(p.longBreakEvery);
    els.presetMaxInput.value = String(p.maxPomodoros);
  };

  const closeEditor = function () {
    state.ui.editingPresetId = null;
    els.presetEditor.dataset.open = "false";
    mountEditorAtDefault();
  };

  const readEditorPreset = function () {
    return {
      name: String(els.presetNameInput.value || "").trim(),
      focusMin: clampInt(els.presetFocusInput.value, 1, 180),
      shortBreakMin: clampInt(els.presetShortInput.value, 1, 60),
      longBreakMin: clampInt(els.presetLongInput.value, 1, 120),
      longBreakEvery: clampInt(els.presetEveryInput.value, 1, 12),
      maxPomodoros: clampInt(els.presetMaxInput.value, 1, 24),
    };
  };

  const bindPresetEvents = function () {
    els.addPresetBtn.addEventListener("click", function () {
      state.ui.editingPresetId = null;
      openEditor(null);
    });

    els.cancelPresetBtn.addEventListener("click", closeEditor);

    els.savePresetBtn.addEventListener("click", function () {
      const payload = readEditorPreset();
      if (!payload.name) {
        ctx.setStatus(i18n.t("status.presetNameRequired"));
        return;
      }

      const editingId = state.ui.editingPresetId;
      const isBuiltinEditing = !!ctx.BUILTIN_PRESETS.find(function (builtin) { return builtin.id === editingId; });

      const customPresetCount = store.userPresets.filter(function (item) {
        return !ctx.BUILTIN_PRESETS.some(function (builtin) { return builtin.id === item.id; });
      }).length;

      if (!editingId && customPresetCount >= ctx.MAX_USER_PRESETS) {
        ctx.setStatus(i18n.t("status.maxPresets", { count: ctx.MAX_USER_PRESETS }));
        return;
      }

      if (editingId) {
        const nowIso = new Date().toISOString();

        if (isBuiltinEditing) {
          const existing = store.userPresets.find(function (item) { return item.id === editingId; });
          const override = {
            id: editingId,
            name: payload.name,
            focusMin: payload.focusMin,
            shortBreakMin: payload.shortBreakMin,
            longBreakMin: payload.longBreakMin,
            longBreakEvery: payload.longBreakEvery,
            maxPomodoros: payload.maxPomodoros,
            createdAt: existing && existing.createdAt ? existing.createdAt : nowIso,
            updatedAt: nowIso,
            builtin: true,
          };
          store.userPresets = store.userPresets.filter(function (item) { return item.id !== editingId; });
          store.userPresets.push(override);
        } else {
          store.userPresets = store.userPresets.map(function (item) {
            if (item.id !== editingId) return item;
            return {
              id: item.id,
              name: payload.name,
              focusMin: payload.focusMin,
              shortBreakMin: payload.shortBreakMin,
              longBreakMin: payload.longBreakMin,
              longBreakEvery: payload.longBreakEvery,
              maxPomodoros: payload.maxPomodoros,
              createdAt: item.createdAt || nowIso,
              updatedAt: nowIso,
              builtin: false,
            };
          });
        }
      } else {
        const id = window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "preset-" + Date.now() + "-" + Math.floor(Math.random() * 1000);

        store.userPresets.push({
          id: id,
          name: payload.name,
          focusMin: payload.focusMin,
          shortBreakMin: payload.shortBreakMin,
          longBreakMin: payload.longBreakMin,
          longBreakEvery: payload.longBreakEvery,
          maxPomodoros: payload.maxPomodoros,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          builtin: false,
        });
      }

      ctx.storage.persistPresets();
      closeEditor();
      renderPresetList();
      ctx.setStatus(i18n.t("status.presetSaved"));

      const latest = editingId
        ? store.userPresets.find(function (item) { return item.id === editingId; })
        : store.userPresets[store.userPresets.length - 1];

      if (latest) {
        if (state.timer.status === "running") {
          const ok = window.confirm(i18n.t("confirm.applySavedPresetRunning"));
          if (!ok) {
            ctx.storage.persistState();
            return;
          }
        }
        ctx.timer.applySettings(latest, latest.id, latest.name);
        ctx.setStatus(i18n.t("status.presetApplied", { name: latest.name }));
      }

      ctx.render();
      ctx.storage.persistState();
    });
  };

  return {
    renderPresetList,
    bindPresetEvents,
  };
}
