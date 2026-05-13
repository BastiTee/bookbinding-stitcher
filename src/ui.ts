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
import { el, button } from "./dom-utils";
import { buildPlaybackPanel } from "./playback-ui";
import { openGallery } from "./gallery-ui";
import { buildShortcutsPanel } from "./help-ui";
import { saveAsFile, saveToHandle, openFilePicker } from "./file-io";

const SVG_NS = "http://www.w3.org/2000/svg";

type Mode = "design" | "sewing" | "playback";

export function buildUI(container: HTMLElement, model: GridModel) {
  container.innerHTML = "";
  container.classList.add("app-layout");

  // --- Layout ---
  const leftPanel = el("div", "sidebar left-panel");
  const rightPanel = el("div", "sidebar right-panel");
  const svgPanel = el("div", "svg-panel");
  container.appendChild(leftPanel);
  container.appendChild(svgPanel);
  container.appendChild(rightPanel);

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
  // App header
  // ============================================================
  const appHeader = el("div", "app-header");
  const appIcon = document.createElement("img");
  appIcon.src = import.meta.env.BASE_URL + "favicon.png";
  appIcon.alt = "Stitcher";
  appIcon.className = "app-header-icon";
  const appTitle = document.createElement("span");
  appTitle.className = "app-header-title";
  appTitle.textContent = "Bookbinding Stitcher";
  appHeader.appendChild(appIcon);
  appHeader.appendChild(appTitle);
  leftPanel.appendChild(appHeader);

  // ============================================================
  // Metadata panel
  // ============================================================
  const { getMetadata, setMetadata } = buildMetadataPanel(leftPanel, refresh);

  // ============================================================
  // Mode switcher
  // ============================================================
  const modeSwitcher = el("div", "mode-switcher");
  const btnDesign = document.createElement("button");
  btnDesign.textContent = "Spine Design";
  btnDesign.classList.add("mode-btn", "active");
  const btnSewing = document.createElement("button");
  btnSewing.textContent = "Sewing";
  btnSewing.classList.add("mode-btn");
  const btnPlayback = document.createElement("button");
  btnPlayback.textContent = "Playback";
  btnPlayback.classList.add("mode-btn");
  modeSwitcher.appendChild(btnDesign);
  modeSwitcher.appendChild(btnSewing);
  modeSwitcher.appendChild(btnPlayback);
  rightPanel.appendChild(modeSwitcher);

  // ============================================================
  // Design panel (wrap all design sections)
  // ============================================================
  const designPanel = el("div", "design-panel");
  rightPanel.appendChild(designPanel);

  // --- Spine section ---
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

  const interactionError = el("div", "error-msg");
  designPanel.appendChild(interactionError);

  // ============================================================
  // Sewing panel
  // ============================================================
  const sewingPanelObj = buildSewingPanel(rightPanel, sewingModel, model, svg, svgPanel, refresh);
  const playbackPanelObj = buildPlaybackPanel(rightPanel, sewingModel, model, svg);

  const modeSwitcherHr = document.createElement("hr");
  modeSwitcherHr.className = "mode-switcher-hr";
  rightPanel.appendChild(modeSwitcherHr);
  const shortcutsContainer = el("div", "shortcuts-container");
  shortcutsContainer.appendChild(buildShortcutsPanel("design"));
  rightPanel.appendChild(shortcutsContainer);

  // ============================================================
  // Persistent Export / Import section (always visible)
  // ============================================================
  const persistentPanel = el("div", "persistent-panel");
  leftPanel.appendChild(persistentPanel);

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
    await saveAsFile(exportJson, title + ".json", {
      onSaved: (fileName, handle) => {
        currentFileHandle = handle;
        currentFileName = fileName;
        updateFileNameDisplay();
        if (handle) setSaveEnabled(true);
        const orig = saveAsBtn.textContent;
        saveAsBtn.textContent = "Saved!";
        setTimeout(() => { saveAsBtn.textContent = orig; }, 1200);
      },
      onError: (msg) => { importError.textContent = msg; },
    });
  });

  saveBtn = button("Save", async () => {
    if (!currentFileHandle) {
      saveAsBtn.click();
      return;
    }
    await saveToHandle(exportJson, currentFileHandle, {
      onError: (msg) => { importError.textContent = msg; },
    });
    const orig = saveBtn.textContent;
    saveBtn.textContent = "Saved!";
    setTimeout(() => { saveBtn.textContent = orig; }, 1200);
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
        sewingModel.importThreads(parsed.threads);
      }
    } catch (e) {
      importError.textContent = (e as Error).message;
    }
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";
  fileInput.style.display = "none";
  openFilePicker(
    fileInput,
    (json, fileName) => {
      applyImport(json);
      currentFileName = fileName;
      currentFileHandle = null;
      setSaveEnabled(false);
      updateFileNameDisplay();
      switchToPlayback();
    },
    (msg) => { importError.textContent = msg; },
  );
  persistentPanel.appendChild(fileInput);

  const importBtn = button("Open from file", () => fileInput.click());

  const galleryBtn = button("Open gallery", () => {
    openGallery((json) => {
      currentFileHandle = null;
      currentFileName = null;
      setSaveEnabled(false);
      updateFileNameDisplay();
      applyImport(json);
      switchToPlayback();
    });
  });

  saveBtnRow.appendChild(saveBtn);
  saveBtnRow.appendChild(saveAsBtn);
  galleryBtn.classList.add("gallery-cta");
  importBtnRow.appendChild(importBtn);
  importBtnRow.appendChild(galleryBtn);
  persistentPanel.appendChild(saveBtnRow);
  persistentPanel.appendChild(importBtnRow);

  const fileNameDisplay = el("div", "current-file-name");
  persistentPanel.appendChild(fileNameDisplay);
  persistentPanel.appendChild(importError);

  const sidebarFooter = el("div", "sidebar-footer");
  const footerLink = document.createElement("a");
  footerLink.href = "https://github.com/BastiTee/bookbinding-stitcher";
  footerLink.target = "_blank";
  footerLink.rel = "noopener noreferrer";
  footerLink.className = "sidebar-footer-link";
  const line1 = document.createElement("span");
  line1.textContent = "Made with waxed linen thread";
  const line2 = document.createElement("span");
  line2.textContent = "by Basti Tee";
  footerLink.appendChild(line1);
  footerLink.appendChild(document.createElement("br"));
  footerLink.appendChild(line2);
  sidebarFooter.appendChild(footerLink);
  leftPanel.appendChild(sidebarFooter);

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
    shortcutsContainer.replaceChildren(buildShortcutsPanel("design"));
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
    shortcutsContainer.replaceChildren(buildShortcutsPanel("sewing"));
  }

  function switchToPlayback() {
    if (currentMode === "playback") {
      playbackPanelObj.deactivate();
      playbackPanelObj.activate();
      return;
    }
    currentMode = "playback";
    btnPlayback.classList.add("active");
    btnDesign.classList.remove("active");
    btnSewing.classList.remove("active");
    designPanel.classList.add("hidden");
    sewingPanelObj.deactivate();
    playbackPanelObj.activate();
    shortcutsContainer.replaceChildren(buildShortcutsPanel("playback"));
  }

  btnDesign.addEventListener("click", switchToDesign);
  btnSewing.addEventListener("click", switchToSewing);
  btnPlayback.addEventListener("click", switchToPlayback);

  // Bottom action group (pinned to bottom of right sidebar)
  const bottomPanel = el("div", "bottom-panel");
  const resetThreadsBtn = document.createElement("button");
  resetThreadsBtn.textContent = "Reset Threads";
  resetThreadsBtn.className = "reset-btn";
  resetThreadsBtn.addEventListener("click", () => {
    if (!confirm("Reset threads? This will clear all threads but keep the spine design and metadata.")) return;
    sewingModel.reset();
  });
  bottomPanel.appendChild(resetThreadsBtn);
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset Everything";
  resetBtn.className = "reset-btn";
  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset everything? This will clear all holes, threads, and metadata.")) return;
    setMetadata({});
    model.loadState({ spine: { width: 150, height: 40 }, holes: [] });
  });
  bottomPanel.appendChild(resetBtn);
  rightPanel.appendChild(bottomPanel);

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

  const SIG_PREVIEW_OVERHANG = 6; // must match SIG_OVERHANG in render.ts
  const SIG_BTN_OFFSET = 3;       // must match BTN_OFFSET in render.ts

  function showSigPreview(pos: number, axis: "right" | "bottom", spine: { width: number; height: number }) {
    clearGhost();
    if (!ghostLayer) return;

    const line = document.createElementNS(SVG_NS, "line");
    if (axis === "right") {
      line.setAttribute("x1", String(-SIG_PREVIEW_OVERHANG));
      line.setAttribute("x2", String(spine.width + SIG_PREVIEW_OVERHANG));
      line.setAttribute("y1", String(pos));
      line.setAttribute("y2", String(pos));
    } else {
      line.setAttribute("x1", String(pos));
      line.setAttribute("x2", String(pos));
      line.setAttribute("y1", String(-SIG_PREVIEW_OVERHANG));
      line.setAttribute("y2", String(spine.height + SIG_PREVIEW_OVERHANG));
    }
    line.classList.add("sig-preview-line");
    ghostLayer.appendChild(line);

    const { fontSize } = computeScaleSizes(spine);
    const size = fontSize * 0.8;
    const label = axis === "right" ? `Y: ${pos}` : `X: ${pos}`;
    const textEl = document.createElementNS(SVG_NS, "text");
    textEl.setAttribute("font-size", String(size));
    textEl.classList.add("cursor-tooltip");
    textEl.textContent = label;

    if (axis === "right") {
      // Place label to the right of the locator dot
      textEl.setAttribute("x", String(spine.width + SIG_BTN_OFFSET + size * 0.8 + 2));
      textEl.setAttribute("y", String(pos + size * 0.35));
      textEl.setAttribute("text-anchor", "start");
    } else {
      // Place label below the locator dot
      textEl.setAttribute("x", String(pos));
      textEl.setAttribute("y", String(spine.height + SIG_BTN_OFFSET + size * 1.4 + 2));
      textEl.setAttribute("text-anchor", "middle");
    }
    ghostLayer.appendChild(textEl);
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
    const hovered = e.target as SVGElement;
    if (hovered.classList.contains("sig-button")) {
      const pos = parseInt(hovered.getAttribute("data-sig-pos") ?? "", 10);
      const axis = hovered.getAttribute("data-sig-axis") as "right" | "bottom";
      if (!isNaN(pos) && axis) {
        showSigPreview(pos, axis, model.getState().spine);
        return;
      }
    }
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
          const sigs = model.getState().signatures;
          if (sigs?.positions.includes(pos)) model.removeSignature(pos);
          else model.addSignature(orientation, pos);
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
      if (target.kind === "hole") {
        model.removeHole(target.holeX!, target.holeY!);
      } else if (target.kind === "spine") {
        model.addHole(target.snappedX, target.snappedY);
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

    // Enable/disable sewing button based on whether there are holes
    const hasHoles = state.holes.length > 0;
    btnSewing.disabled = !hasHoles;
    if (!hasHoles && currentMode === "sewing") {
      switchToDesign();
    }

    // Build export JSON — combined grid + threads
    const meta = getMetadata();
    const exportObj: Record<string, unknown> = {};
    if (Object.keys(meta).length > 0) exportObj.metadata = meta;
    exportObj.spine = state.spine;
    exportObj.holes = state.holes;
    if (state.signatures) exportObj.signatures = state.signatures;
    exportObj.threads = sewingModel.exportThreads();
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
  model.subscribeNoReset(refresh);

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

interface Metadata {
  title?: string;
  author?: string;
  description?: string;
  tutorial?: string;
}

function buildMetadataPanel(sidebar: HTMLElement, onChange: () => void): {
  getMetadata: () => Metadata;
  setMetadata: (m: Metadata) => void;
} {
  const panel = el("div", "metadata-panel");

  // View mode container (shown by default)
  const metadataView = el("div", "metadata-view");
  const viewTitle = document.createElement("p");
  viewTitle.className = "meta-view-title";
  const viewAuthor = document.createElement("p");
  viewAuthor.className = "meta-view-author";
  const viewDesc = document.createElement("p");
  viewDesc.className = "meta-view-desc";
  const viewTutorialBtn = document.createElement("button");
  viewTutorialBtn.textContent = "Open tutorial";
  viewTutorialBtn.style.display = "none";
  viewTutorialBtn.addEventListener("click", () => {
    const url = tutorialInput.value.trim();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });
  metadataView.appendChild(viewTitle);
  metadataView.appendChild(viewAuthor);
  metadataView.appendChild(viewDesc);
  metadataView.appendChild(viewTutorialBtn);
  panel.appendChild(metadataView);

  // Edit mode container (hidden by default)
  const metadataEdit = el("div", "metadata-edit hidden");

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.maxLength = 50;
  titleInput.placeholder = "Title";
  titleInput.className = "metadata-input";
  titleInput.addEventListener("input", onChange);
  metadataEdit.appendChild(titleInput);

  const authorInput = document.createElement("input");
  authorInput.type = "text";
  authorInput.maxLength = 50;
  authorInput.placeholder = "Author";
  authorInput.className = "metadata-input";
  authorInput.addEventListener("input", onChange);
  metadataEdit.appendChild(authorInput);

  const descTextarea = document.createElement("textarea");
  descTextarea.maxLength = 1000;
  descTextarea.placeholder = "Description…";
  descTextarea.className = "metadata-textarea";
  metadataEdit.appendChild(descTextarea);

  const charCount = document.createElement("span");
  charCount.className = "char-count";
  charCount.textContent = "0 / 1000";
  metadataEdit.appendChild(charCount);

  descTextarea.addEventListener("input", () => {
    charCount.textContent = `${descTextarea.value.length} / 1000`;
    onChange();
  });

  const tutorialInput = document.createElement("input");
  tutorialInput.type = "text";
  tutorialInput.maxLength = 500;
  tutorialInput.placeholder = "Tutorial URL";
  tutorialInput.className = "metadata-input";
  metadataEdit.appendChild(tutorialInput);

  tutorialInput.addEventListener("input", onChange);

  panel.appendChild(metadataEdit);
  sidebar.appendChild(panel);

  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit metadata";
  sidebar.appendChild(editBtn);

  function updateView() {
    const t = titleInput.value.trim();
    viewTitle.textContent = t || "Untitled";
    viewTitle.classList.toggle("meta-view-empty", !t);
    const a = authorInput.value.trim();
    viewAuthor.textContent = a ? `by ${a}` : "";
    viewAuthor.hidden = !a;
    const d = descTextarea.value.trim();
    viewDesc.textContent = d;
    viewDesc.hidden = !d;
    const url = tutorialInput.value.trim();
    viewTutorialBtn.style.display = url ? "" : "none";
  }

  let isEditing = false;
  editBtn.addEventListener("click", () => {
    isEditing = !isEditing;
    editBtn.textContent = isEditing ? "Done" : "Edit metadata";
    metadataEdit.classList.toggle("hidden", !isEditing);
    metadataView.classList.toggle("hidden", isEditing);
    if (isEditing) titleInput.focus();
    else { updateView(); onChange(); }
  });

  metadataEdit.addEventListener("focusout", (e: FocusEvent) => {
    if (!isEditing) return;
    const next = e.relatedTarget as Node | null;
    if (next && metadataEdit.contains(next)) return;
    isEditing = false;
    editBtn.textContent = "Edit metadata";
    metadataEdit.classList.add("hidden");
    metadataView.classList.remove("hidden");
    updateView();
    onChange();
  });

  updateView();

  function getMetadata(): Metadata {
    const meta: Metadata = {};
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    const description = descTextarea.value.trim();
    const tutorial = tutorialInput.value.trim();
    if (title) meta.title = title;
    if (author) meta.author = author;
    if (description) meta.description = description;
    if (tutorial) meta.tutorial = tutorial;
    return meta;
  }

  function setMetadata(m: Metadata) {
    titleInput.value = m.title ?? "";
    authorInput.value = m.author ?? "";
    descTextarea.value = m.description ?? "";
    charCount.textContent = `${descTextarea.value.length} / 1000`;
    tutorialInput.value = m.tutorial ?? "";
    isEditing = false;
    editBtn.textContent = "Edit metadata";
    metadataEdit.classList.add("hidden");
    metadataView.classList.remove("hidden");
    updateView();
  }

  return { getMetadata, setMetadata };
}

