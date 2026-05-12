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
const ALT = isMac ? "Option" : "Alt";

const SECTIONS: Section[] = [
  {
    mode: "design",
    title: "Spine Design",
    shortcuts: [
      { key: "Click", description: "Add hole" },
      { key: "Shift+Click", description: "Remove hole" },
      { key: "Click ▶", description: "Toggle signature at column" },
    ],
  },
  {
    mode: "sewing",
    title: "Sewing",
    shortcuts: [
      { key: "Click", description: "Set start point / draw edge" },
      { key: "Shift+Click", description: "Place chain stitch at highlighted hole" },
      { key: `${ALT}+Click`, description: "Add anchor loop at current endpoint" },
      { key: `${CTRL}+Click`, description: "Place negative hidden link (ends inside; skips outside pass)" },
      { key: `Shift+${CTRL}+Click`, description: "Place positive hidden link (continues outside pass at new hole)" },
      { key: `${CTRL}+Z`, description: "Undo" },
      { key: `${CTRL}+Shift+Z`, description: "Redo" },
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
