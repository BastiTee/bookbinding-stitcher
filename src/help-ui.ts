import { el, createModal } from "./dom-utils";

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
    title: "Spine Design",
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
  if (document.querySelector(".gallery-backdrop")) return;

  const { modal } = createModal("Keyboard & Mouse Controls", "Close help", "help-modal");
  const content = el("div", "help-content");

  for (const section of SECTIONS) {
    const isActive = section.mode === currentMode;
    const sectionEl = el("div", isActive ? "help-section help-section--active" : "help-section");

    const titleEl = document.createElement("h3");
    titleEl.className = "help-section-title";
    titleEl.textContent = section.title;
    if (isActive) {
      const badge = el("span", "help-section-badge");
      badge.textContent = "current";
      titleEl.appendChild(badge);
    }
    sectionEl.appendChild(titleEl);

    const list = el("div", "help-shortcut-list");
    for (const shortcut of section.shortcuts) {
      const row = el("div", "help-shortcut-row");
      const keyEl = el("span", "help-key");
      keyEl.textContent = shortcut.key;
      const descEl = el("span", "help-shortcut-desc");
      descEl.textContent = shortcut.description;
      row.appendChild(keyEl);
      row.appendChild(descEl);
      list.appendChild(row);
    }

    sectionEl.appendChild(list);
    content.appendChild(sectionEl);
  }

  modal.appendChild(content);
}
