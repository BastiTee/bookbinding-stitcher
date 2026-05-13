import { el } from "./dom-utils";

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

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const CTRL = isMac ? "⌘" : "Ctrl";

// Keep these shortcut labels in sync with the actual handlers in sewing-ui.ts (onKeyDown, onClick).
const SECTIONS: Section[] = [
  {
    mode: "design",
    title: "Spine Design",
    shortcuts: [
      { key: "Click", description: "Add / remove hole from spine" },
      { key: "Click •", description: "Toggle signature location" },
    ],
  },
  {
    mode: "sewing",
    title: "Sewing",
    shortcuts: [
      { key: "Hover hole", description: "See available actions at that hole" },
      { key: "Click hole", description: "Draw edge to that hole (fast path)" },
      { key: `${CTRL}+Z`, description: "Undo" },
      { key: `${CTRL}+Shift+Z`, description: "Redo" },
    ],
  },
  {
    mode: "playback",
    title: "Playback",
    shortcuts: [],
  },
];

export function buildShortcutsPanel(mode: Mode): HTMLElement {
  const section = SECTIONS.find(s => s.mode === mode)!;
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
  return list;
}
