import { GridModel } from "./model";
import { renderGrid, computeScaleSizes, PADDING, type HighlightState } from "./render";
import {
  screenToSvg,
  resolveTarget,
  type InteractionTarget,
} from "./interaction";
import { SewingModel } from "./sewing-model";
import { renderSewing } from "./sewing-render";
import { buildSewingPanel } from "./sewing-ui";
import { el, sectionTitle } from "./dom-utils";
import { buildPlaybackPanel } from "./playback-ui";
import { openGallery } from "./gallery-ui";

const SVG_NS = "http://www.w3.org/2000/svg";

type Mode = "design" | "sewing" | "playback";

export function buildUI(container: HTMLElement, model: GridModel) {
  container.innerHTML = "";
  container.classList.add("app-layout");

  // --- Layout ---
  const sidebar = el("div", "sidebar");
  const svgPanel = el("div", "svg-panel");
  container.appendChild(sidebar);
  container.appendChild(svgPanel);

  // SVG element
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgPanel.appendChild(svg);

  // Sewing model
  const sewingModel = new SewingModel();

  // Local UI state
  const highlight: HighlightState = {
    selectedHole: null,
  };

  let currentMode: Mode = "design";
  let currentFileHandle: FileSystemFileHandle | null = null;
  let currentFileName: string | null = null;

  // ============================================================
  // Metadata panel
  // ============================================================
  const { getMetadata, setMetadata } = buildMetadataPanel(sidebar, refresh, () => {
    model.loadState({ spine: { width: 150, height: 40 }, holes: [] });
  });

  // ============================================================
  // Mode switcher
  // ============================================================
  const modeSwitcher = el("div", "mode-switcher");
  const btnDesign = document.createElement("button");
  btnDesign.textContent = "Grid Design";
  btnDesign.classList.add("mode-btn", "active");
  const btnSewing = document.createElement("button");
  btnSewing.textContent = "Sewing";
  btnSewing.classList.add("mode-btn");
  const btnPlayback = document.createElement("button");
  btnPlayback.textContent = "Playback";
  btnPlayback.classList.add("mode-btn");
  btnPlayback.disabled = true;
  modeSwitcher.appendChild(btnDesign);
  modeSwitcher.appendChild(btnSewing);
  modeSwitcher.appendChild(btnPlayback);
  sidebar.appendChild(modeSwitcher);

  // ============================================================
  // Design panel (wrap all design sections)
  // ============================================================
  const designPanel = el("div", "design-panel");
  sidebar.appendChild(designPanel);

  // --- Spine section ---
  designPanel.appendChild(sectionTitle("Spine"));
  const spineError = el("div", "error-msg");
  const spineWidthInput = numberInput("Width (mm)");
  const spineHeightInput = numberInput("Height (mm)");
  const spineBtn = button("Update", () => {
    spineError.textContent = "";
    try {
      model.setSpine(
        parseInt(spineWidthInput.input.value),
        parseInt(spineHeightInput.input.value),
      );
    } catch (e) {
      spineError.textContent = (e as Error).message;
    }
  });
  designPanel.appendChild(spineWidthInput.wrapper);
  designPanel.appendChild(spineHeightInput.wrapper);
  designPanel.appendChild(spineBtn);
  designPanel.appendChild(spineError);

  // --- Controls reference ---
  designPanel.appendChild(sectionTitle("Controls"));
  const controlsList = el("dl", "controls-list");
  controlsList.innerHTML =
    "<dt>Click</dt><dd>Add hole</dd>" +
    "<dt>Shift+Click</dt><dd>Delete hole</dd>";
  designPanel.appendChild(controlsList);

  const interactionError = el("div", "error-msg");
  designPanel.appendChild(interactionError);

  // ============================================================
  // Sewing panel
  // ============================================================
  const sewingPanelObj = buildSewingPanel(sidebar, sewingModel, model, svg, refresh);
  const playbackPanelObj = buildPlaybackPanel(sidebar, sewingModel, model, svg);

  // ============================================================
  // Persistent Export / Import section (always visible)
  // ============================================================
  const persistentPanel = el("div", "persistent-panel");
  sidebar.appendChild(persistentPanel);

  persistentPanel.appendChild(sectionTitle("Load / Save"));

  let exportJson = "";

  const saveBtnRow = el("div", "export-btn-row");
  const importBtnRow = el("div", "export-btn-row");

  let saveBtn: HTMLButtonElement;

  function setSaveEnabled(enabled: boolean) {
    if (enabled) {
      saveBtn.classList.remove("save-disabled");
    } else {
      saveBtn.classList.add("save-disabled");
    }
  }

  const saveAsBtn = button("Save as...", async () => {
    const title = getMetadata().title?.trim() || "pattern";
    const suggestedName = title + ".json";
    const text = exportJson;

    if (typeof (window as any).showSaveFilePicker === "function") {
      try {
        const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        currentFileHandle = handle;
        currentFileName = handle.name;
        updateFileNameDisplay();
        setSaveEnabled(true);
        const orig = saveAsBtn.textContent;
        saveAsBtn.textContent = "Saved!";
        setTimeout(() => { saveAsBtn.textContent = orig; }, 1200);
      } catch (e) {
        if ((e as DOMException).name !== "AbortError") {
          importError.textContent = (e as Error).message;
        }
      }
    } else {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedName;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  saveBtn = button("Save", async () => {
    if (!currentFileHandle) {
      saveAsBtn.click();
      return;
    }
    const text = exportJson;
    try {
      const writable = await currentFileHandle.createWritable();
      await writable.write(text);
      await writable.close();
      const orig = saveBtn.textContent;
      saveBtn.textContent = "Saved!";
      setTimeout(() => { saveBtn.textContent = orig; }, 1200);
    } catch (e) {
      importError.textContent = (e as Error).message;
    }
  });
  saveBtn.classList.add("save-disabled");

  const importError = el("div", "error-msg");

  function applyImport(json: string) {
    importError.textContent = "";
    try {
      const parsed = JSON.parse(json);
      model.loadState(parsed);
      setMetadata(parsed.metadata ?? {});
      if (Array.isArray(parsed.threads) && parsed.threads.length > 0) {
        sewingModel.loadThreads(parsed.threads.map((t: {
          threadStart: { side: unknown; hole: unknown };
          threadEnd?: { type?: unknown };
          edges: Array<Record<string, unknown>>;
          anchorLoops?: unknown[];
        }) => {
          const chainStitches: Array<Record<string, unknown>> = [];
          const normalizedEdges = (t.edges ?? []).map((e, i) => {
            if (e.chainedVia != null) {
              chainStitches.push({ hole: e.chainedVia, side: e.load, afterEdge: i });
              const { chainedVia, ...rest } = e;
              return { ...rest, from: chainedVia };
            }
            return e;
          });
          const anchorLoops = (t.anchorLoops ?? []).map((al: any) => ({
            hole: al.hole,
            side: al.side,
            afterEdge: al.afterEdge,
          }));
          return {
            startSide: t.threadStart?.side,
            startHole: t.threadStart?.hole,
            edges: normalizedEdges,
            completed: true,
            endType: t.threadEnd?.type === "knot" ? "knot" : "loose",
            anchorLoops,
            chainStitches,
          };
        }));
      }
    } catch (e) {
      importError.textContent = (e as Error).message;
    }
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      applyImport(reader.result as string);
      currentFileName = file.name;
      currentFileHandle = null;
      setSaveEnabled(false);
      updateFileNameDisplay();
    };
    reader.onerror = () => { importError.textContent = "Failed to read file."; };
    reader.readAsText(file);
    fileInput.value = "";
  });
  persistentPanel.appendChild(fileInput);

  const importBtn = button("Import from file", () => fileInput.click());

  const galleryBtn = button("Import from gallery", () => {
    openGallery((json) => {
      currentFileHandle = null;
      currentFileName = null;
      setSaveEnabled(false);
      updateFileNameDisplay();
      applyImport(json);
    });
  });

  saveBtnRow.appendChild(saveBtn);
  saveBtnRow.appendChild(saveAsBtn);
  importBtnRow.appendChild(importBtn);
  importBtnRow.appendChild(galleryBtn);
  persistentPanel.appendChild(saveBtnRow);
  persistentPanel.appendChild(importBtnRow);

  const fileNameDisplay = el("div", "current-file-name");
  persistentPanel.appendChild(fileNameDisplay);
  persistentPanel.appendChild(importError);

  function updateFileNameDisplay() {
    fileNameDisplay.textContent = currentFileName ?? "";
  }

  // ============================================================
  // Mode switching logic
  // ============================================================
  function switchToDesign() {
    currentMode = "design";
    btnDesign.classList.add("active");
    btnSewing.classList.remove("active");
    btnPlayback.classList.remove("active");
    designPanel.classList.remove("hidden");
    sewingPanelObj.deactivate();
    playbackPanelObj.deactivate();
    refresh();
  }

  function switchToSewing() {
    currentMode = "sewing";
    btnSewing.classList.add("active");
    btnDesign.classList.remove("active");
    btnPlayback.classList.remove("active");
    designPanel.classList.add("hidden");
    sewingPanelObj.activate();
    playbackPanelObj.deactivate();
  }

  function switchToPlayback() {
    currentMode = "playback";
    btnPlayback.classList.add("active");
    btnDesign.classList.remove("active");
    btnSewing.classList.remove("active");
    designPanel.classList.add("hidden");
    sewingPanelObj.deactivate();
    playbackPanelObj.activate();
  }

  btnDesign.addEventListener("click", switchToDesign);
  btnSewing.addEventListener("click", switchToSewing);
  btnPlayback.addEventListener("click", switchToPlayback);

  // ============================================================
  // Ghost layer management
  // ============================================================
  let ghostLayer: SVGGElement | null = null;

  function ensureGhostLayer() {
    ghostLayer = document.createElementNS(SVG_NS, "g");
    ghostLayer.classList.add("ghost-layer");
    svg.appendChild(ghostLayer);
  }

  function clearGhost() {
    if (ghostLayer) ghostLayer.innerHTML = "";
  }

  function showHoleGhost(x: number, y: number, radius: number) {
    clearGhost();
    if (!ghostLayer) return;
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", String(radius));
    circle.classList.add("ghost-hole-dot");
    ghostLayer.appendChild(circle);
  }

  function showCursorTooltip(
    x: number,
    y: number,
    text: string,
    spine: { width: number; height: number },
  ) {
    if (!ghostLayer) return;
    const { fontSize } = computeScaleSizes(spine);
    const size = fontSize * 0.8;
    const offset = size * 1.2;

    const tx = x + spine.width * 0.5 < spine.width ? x + offset : x - offset;
    const ty = y > spine.height * 0.15 ? y - offset : y + offset + size;
    const anchor = x + spine.width * 0.5 < spine.width ? "start" : "end";

    const textEl = document.createElementNS(SVG_NS, "text");
    textEl.setAttribute("x", String(tx));
    textEl.setAttribute("y", String(ty));
    textEl.setAttribute("font-size", String(size));
    textEl.setAttribute("text-anchor", anchor);
    textEl.classList.add("cursor-tooltip");
    textEl.textContent = text;
    ghostLayer.appendChild(textEl);
  }

  function showCrosshair(x: number, y: number, spine: { width: number; height: number }) {
    if (!ghostLayer) return;
    const vLine = document.createElementNS(SVG_NS, "line");
    vLine.setAttribute("x1", String(x));
    vLine.setAttribute("x2", String(x));
    vLine.setAttribute("y1", String(-PADDING));
    vLine.setAttribute("y2", String(spine.height));
    vLine.classList.add("ruler-crosshair");
    ghostLayer.appendChild(vLine);

    const hLine = document.createElementNS(SVG_NS, "line");
    hLine.setAttribute("y1", String(y));
    hLine.setAttribute("y2", String(y));
    hLine.setAttribute("x1", String(-PADDING));
    hLine.setAttribute("x2", String(spine.width));
    hLine.classList.add("ruler-crosshair");
    ghostLayer.appendChild(hLine);
  }

  // ============================================================
  // SVG interaction handlers (design mode only)
  // ============================================================
  function updateGhostAndStatus(target: InteractionTarget) {
    const state = model.getState();
    const { dotRadius } = computeScaleSizes(state.spine);
    const label = `X: ${target.snappedX}  Y: ${target.snappedY}`;

    switch (target.kind) {
      case "spine":
        showHoleGhost(target.snappedX, target.snappedY, dotRadius);
        showCursorTooltip(target.snappedX, target.snappedY, label, state.spine);
        showCrosshair(target.snappedX, target.snappedY, state.spine);
        break;
      case "hole":
        clearGhost();
        showCursorTooltip(target.holeX!, target.holeY!, label, state.spine);
        showCrosshair(target.holeX!, target.holeY!, state.spine);
        break;
      case "outside":
        clearGhost();
        break;
    }
  }

  svg.addEventListener("mousemove", (e) => {
    if (currentMode !== "design") return;
    const coord = screenToSvg(svg, e);
    const state = model.getState();
    const target = resolveTarget(svg, coord, state);
    updateGhostAndStatus(target);
  });

  svg.addEventListener("click", (e) => {
    if (currentMode !== "design") return;
    interactionError.textContent = "";

    // Signature margin buttons
    const clicked = e.target as SVGElement;
    if (clicked.classList.contains("sig-button")) {
      const pos = parseInt(clicked.getAttribute("data-sig-pos") ?? "", 10);
      const axis = clicked.getAttribute("data-sig-axis") as "right" | "bottom";
      if (!isNaN(pos) && axis) {
        const orientation = axis === "right" ? "horizontal" : "vertical";
        try {
          if (e.shiftKey) model.removeSignature(pos);
          else             model.addSignature(orientation, pos);
        } catch (err) {
          interactionError.textContent = (err as Error).message;
        }
        return;
      }
    }

    const coord = screenToSvg(svg, e);
    const state = model.getState();
    const target = resolveTarget(svg, coord, state);

    try {
      if (e.shiftKey) {
        if (target.kind === "hole") {
          model.removeHole(target.holeX!, target.holeY!);
        }
      } else {
        if (target.kind === "spine") {
          model.addHole(target.snappedX, target.snappedY);
        }
      }
    } catch (err) {
      interactionError.textContent = (err as Error).message;
    }
  });

  svg.addEventListener("mouseleave", () => {
    if (currentMode !== "design") return;
    clearGhost();
  });

  // ============================================================
  // Render cycle
  // ============================================================
  function refresh() {
    const state = model.getState();

    // Update spine inputs
    spineWidthInput.input.value = String(state.spine.width);
    spineHeightInput.input.value = String(state.spine.height);

    // Validate highlight still exists
    if (
      highlight.selectedHole !== null &&
      !state.holes.some((h) => h.x === highlight.selectedHole!.x && h.y === highlight.selectedHole!.y)
    ) {
      highlight.selectedHole = null;
    }

    // Enable/disable playback button based on whether there are completed threads with edges
    const hasPattern = sewingModel.getState().threads.some(t => t.edges.length > 0);
    btnPlayback.disabled = !hasPattern;
    if (!hasPattern && currentMode === "playback") {
      switchToDesign();
    }

    // Build export JSON — combined grid + threads
    const sewingState = sewingModel.getState();
    const meta = getMetadata();
    const exportObj: Record<string, unknown> = { ...state };
    if (Object.keys(meta).length > 0) exportObj.metadata = meta;
    exportObj.threads = sewingState.threads.map(t => {
      const lastEdge = t.edges.length > 0 ? t.edges[t.edges.length - 1] : null;
      const lastLoad = lastEdge ? lastEdge.load : t.startSide;
      // Merge chain stitches into their corresponding edges as chainedVia.
      const sortedCS = [...(t.chainStitches ?? [])].sort((a, b) => a.afterEdge - b.afterEdge);
      let csIdx = 0;
      const exportEdges = t.edges.map((edge, i) => {
        if (csIdx < sortedCS.length && sortedCS[csIdx].afterEdge === i) {
          const cs = sortedCS[csIdx++];
          const prevTo = i > 0 ? t.edges[i - 1].to : t.startHole;
          return { ...edge, from: prevTo, chainedVia: cs.hole };
        }
        return edge;
      });
      return {
        threadStart: { side: t.startSide, hole: t.startHole },
        threadEnd: {
          type: t.endType ?? "loose",
          side: lastLoad === "positive" ? "negative" : "positive",
          hole: lastEdge ? lastEdge.to : t.startHole,
        },
        edges: exportEdges,
        anchorLoops: (t.anchorLoops ?? []).map(al => ({ hole: al.hole, side: al.side, afterEdge: al.afterEdge })),
      };
    });
    exportJson = JSON.stringify(exportObj, null, 2);

    // SVG render (clears innerHTML, so ghost layer must be re-added)
    renderGrid(svg, state, highlight);
    ensureGhostLayer();

    // Draw sewing threads on top
    const sizes = computeScaleSizes(state.spine);
    renderSewing(svg, sewingModel.getState(), sizes, state.spine);
  }

  // When grid changes, reset sewing threads (which triggers refresh via sewingModel subscriber)
  model.subscribe(() => {
    sewingModel.reset();
  });

  // Signature changes only need a render refresh, not a sewing reset
  model.subscribeSignatures(refresh);

  sewingModel.subscribe(refresh);

  refresh();
}

// --- Helpers ---

function numberInput(placeholder: string): {
  wrapper: HTMLDivElement;
  input: HTMLInputElement;
} {
  const wrapper = document.createElement("div");
  wrapper.className = "input-group";
  const input = document.createElement("input");
  input.type = "number";
  input.placeholder = placeholder;
  input.step = "1";
  const label = document.createElement("label");
  label.textContent = placeholder;
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return { wrapper, input };
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

interface Metadata {
  title?: string;
  author?: string;
  description?: string;
}

function buildMetadataPanel(sidebar: HTMLElement, onChange: () => void, onReset: () => void): {
  getMetadata: () => Metadata;
  setMetadata: (m: Metadata) => void;
} {
  const panel = el("div", "metadata-panel");

  panel.appendChild(sectionTitle("Stitch Pattern"));

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.maxLength = 50;
  titleInput.placeholder = "Title";
  titleInput.className = "metadata-input";
  titleInput.addEventListener("input", onChange);
  panel.appendChild(titleInput);

  const authorInput = document.createElement("input");
  authorInput.type = "text";
  authorInput.maxLength = 50;
  authorInput.placeholder = "Author";
  authorInput.className = "metadata-input";
  authorInput.addEventListener("input", onChange);
  panel.appendChild(authorInput);

  const descTextarea = document.createElement("textarea");
  descTextarea.maxLength = 500;
  descTextarea.placeholder = "Description\u2026";
  descTextarea.className = "metadata-textarea";
  panel.appendChild(descTextarea);

  const charCount = document.createElement("span");
  charCount.className = "char-count";
  charCount.textContent = "0 / 500";
  panel.appendChild(charCount);

  descTextarea.addEventListener("input", () => {
    charCount.textContent = `${descTextarea.value.length} / 500`;
    onChange();
  });

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  resetBtn.className = "reset-btn";
  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset everything? This will clear all holes, threads, and metadata.")) return;
    titleInput.value = "";
    authorInput.value = "";
    descTextarea.value = "";
    charCount.textContent = "0 / 500";
    onReset();
  });
  panel.appendChild(resetBtn);

  sidebar.appendChild(panel);

  function getMetadata(): Metadata {
    const meta: Metadata = {};
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    const description = descTextarea.value.trim();
    if (title) meta.title = title;
    if (author) meta.author = author;
    if (description) meta.description = description;
    return meta;
  }

  function setMetadata(m: Metadata) {
    titleInput.value = m.title ?? "";
    authorInput.value = m.author ?? "";
    descTextarea.value = m.description ?? "";
    charCount.textContent = `${descTextarea.value.length} / 500`;
  }

  return { getMetadata, setMetadata };
}
