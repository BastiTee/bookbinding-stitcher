type Mode = "design" | "sewing" | "playback";

interface Shortcut {
  key: string;
  description: string;
}

interface Section {
  mode: Mode;
  title: string;
  shortcuts: Shortcut[];
}

const SECTIONS: Section[] = [
  {
    mode: "design",
    title: "Grid Design",
    shortcuts: [
      { key: "Click", description: "Add hole" },
      { key: "Shift+Click", description: "Remove hole" },
      { key: "Click ▶", description: "Add signature at column" },
      { key: "Shift+Click ▶", description: "Remove signature" },
    ],
  },
  {
    mode: "sewing",
    title: "Sewing",
    shortcuts: [
      { key: "Click", description: "Set start point / draw edge" },
      { key: "Shift+Click", description: "Delete last edge or chain stitch" },
      { key: "Alt+Click", description: "Add anchor loop at current endpoint" },
      { key: "Ctrl/⌘+Click", description: "Place chain stitch at highlighted hole" },
      { key: "Ctrl/⌘+Z", description: "Undo" },
      { key: "Ctrl/⌘+Shift+Z", description: "Redo" },
    ],
  },
  {
    mode: "playback",
    title: "Playback",
    shortcuts: [
      { key: "→", description: "Next step" },
      { key: "←", description: "Previous step" },
      { key: "Shift+→", description: "Jump to end" },
      { key: "Shift+←", description: "Jump to start" },
      { key: "↑ / ↓", description: "Toggle view: Front & Back / Spine Only" },
    ],
  },
];

export function openHelp(currentMode: Mode): void {
  const backdrop = document.createElement("div");
  backdrop.className = "gallery-backdrop";

  function close() {
    if (backdrop.parentNode) document.body.removeChild(backdrop);
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  const modal = document.createElement("div");
  modal.className = "gallery-modal help-modal";

  const header = document.createElement("div");
  header.className = "gallery-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "gallery-title";
  titleEl.textContent = "Keyboard & Mouse Controls";

  const closeBtn = document.createElement("button");
  closeBtn.className = "gallery-close-btn";
  closeBtn.setAttribute("aria-label", "Close help");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", close);

  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const content = document.createElement("div");
  content.className = "help-content";

  for (const section of SECTIONS) {
    const sectionEl = document.createElement("div");
    sectionEl.className = "help-section";
    if (section.mode === currentMode) {
      sectionEl.classList.add("help-section--active");
    }

    const sectionTitle = document.createElement("h3");
    sectionTitle.className = "help-section-title";
    sectionTitle.textContent = section.title;
    if (section.mode === currentMode) {
      const badge = document.createElement("span");
      badge.className = "help-section-badge";
      badge.textContent = "current";
      sectionTitle.appendChild(badge);
    }
    sectionEl.appendChild(sectionTitle);

    const list = document.createElement("div");
    list.className = "help-shortcut-list";

    for (const shortcut of section.shortcuts) {
      const row = document.createElement("div");
      row.className = "help-shortcut-row";

      const keyEl = document.createElement("span");
      keyEl.className = "help-key";
      keyEl.textContent = shortcut.key;

      const descEl = document.createElement("span");
      descEl.className = "help-shortcut-desc";
      descEl.textContent = shortcut.description;

      row.appendChild(keyEl);
      row.appendChild(descEl);
      list.appendChild(row);
    }

    sectionEl.appendChild(list);
    content.appendChild(sectionEl);
  }

  modal.appendChild(content);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  closeBtn.focus();
}
