export function createPresetService(ctx) {
  const { state, store, els, utils } = ctx;
  const { clampInt } = utils;

  const renderPresetList = function () {
    els.presetList.innerHTML = "";
    ctx.timer.getAllPresets().forEach(function (preset) {
      const li = document.createElement("li");
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
      applyBtn.textContent = "적용";
      applyBtn.addEventListener("click", function () {
        if (state.timer.status === "running") {
          const ok = window.confirm("실행 중입니다. 프리셋 적용 시 타이머를 초기화합니다. 적용할까요?");
          if (!ok) return;
        }
        ctx.timer.applySettings(preset, preset.id, preset.name);
        ctx.setStatus("프리셋 적용: " + preset.name);
        ctx.render();
        ctx.storage.persistState();
        renderPresetList();
      });
      actions.appendChild(applyBtn);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "mini";
      editBtn.textContent = "수정";
      editBtn.disabled = !!preset.builtin;
      editBtn.addEventListener("click", function () {
        if (preset.builtin) return;
        state.ui.editingPresetId = preset.id;
        openEditor(preset);
      });
      actions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "mini warn";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", function () {
        const ok = window.confirm("프리셋을 삭제할까요?");
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
            state.timer.customLabel = utils.normalizeLabel(state.timer.customLabel) || "Custom";
            ctx.timer.setToFocusIdle();
          }
        }

        ctx.setStatus("프리셋 삭제 완료");
        renderPresetList();
        ctx.render();
        ctx.storage.persistState();
      });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      li.appendChild(row);

      const meta = document.createElement("p");
      meta.className = "preset-meta";
      meta.textContent = "집중 " + preset.focusMin + " / 짧휴 " + preset.shortBreakMin + " / 긴휴 " + preset.longBreakMin + " · 간격 " + preset.longBreakEvery + " · 최대 " + preset.maxPomodoros;
      li.appendChild(meta);

      els.presetList.appendChild(li);
    });
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
        ctx.setStatus("프리셋 이름을 입력해 주세요");
        return;
      }

      const editingId = state.ui.editingPresetId;

      if (!editingId && store.userPresets.length >= ctx.MAX_USER_PRESETS) {
        ctx.setStatus("프리셋은 최대 " + ctx.MAX_USER_PRESETS + "개까지 저장됩니다");
        return;
      }

      if (editingId) {
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
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            builtin: false,
          };
        });
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
      ctx.setStatus("프리셋 저장 완료");

      const latest = editingId
        ? store.userPresets.find(function (item) { return item.id === editingId; })
        : store.userPresets[store.userPresets.length - 1];

      if (latest) {
        if (state.timer.status === "running") {
          const ok = window.confirm("실행 중입니다. 저장한 프리셋 적용 시 타이머를 초기화합니다. 적용할까요?");
          if (!ok) {
            ctx.storage.persistState();
            return;
          }
        }
        ctx.timer.applySettings(latest, latest.id, latest.name);
        ctx.setStatus("프리셋 적용: " + latest.name);
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
