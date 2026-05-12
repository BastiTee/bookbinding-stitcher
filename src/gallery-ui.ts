import { el, createModal } from "./dom-utils";

const rawModules = import.meta.glob("/examples/**/*.json", {
  eager: true,
}) as Record<string, { default: Record<string, unknown> }>;

interface GalleryEntry {
  title: string;
  author: string;
  description: string;
  json: string;
}

function toTitleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function folderToSectionTitle(folder: string): string {
  return toTitleCase(folder.replace(/^\d+-/, ""));
}

function filenameToTitle(path: string): string {
  return toTitleCase(path.split("/").pop()!.replace(".json", ""));
}

const SECTIONS: { title: string; entries: GalleryEntry[] }[] = (() => {
  const sectionMap = new Map<string, GalleryEntry[]>();

  for (const [path, mod] of Object.entries(rawModules).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const parts = path.split("/");
    const folder = parts[parts.length - 2];
    const sectionTitle = folderToSectionTitle(folder);

    const data = mod.default;
    const meta = (data.metadata as Record<string, string | null> | undefined) ?? {};
    const entry: GalleryEntry = {
      title: meta.title || filenameToTitle(path),
      author: meta.author || "",
      description: meta.description || "",
      json: JSON.stringify(data, null, 2),
    };

    let section = sectionMap.get(sectionTitle);
    if (!section) { section = []; sectionMap.set(sectionTitle, section); }
    section.push(entry);
  }

  return Array.from(sectionMap.entries()).map(([title, entries]) => ({
    title,
    entries,
  }));
})();

export function openGallery(onSelect: (json: string) => void): void {
  if (document.querySelector(".gallery-backdrop")) return;

  const { modal, close } = createModal("Pattern Gallery", "Close gallery");
  const content = el("div", "gallery-content");

  for (const section of SECTIONS) {
    const sectionEl = el("div", "gallery-section");

    const sectionTitle = el("div", "gallery-section-title");
    sectionTitle.textContent = section.title;
    sectionEl.appendChild(sectionTitle);

    const grid = el("div", "gallery-grid");

    for (const entry of section.entries) {
      const card = el("div", "gallery-card");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Load pattern: ${entry.title}`);

      const cardTitle = el("div", "gallery-card-title");
      cardTitle.textContent = entry.title;
      card.appendChild(cardTitle);

      if (entry.author) {
        const cardAuthor = el("div", "gallery-card-author");
        cardAuthor.textContent = `by ${entry.author}`;
        card.appendChild(cardAuthor);
      }

      const cardDesc = el("div", "gallery-card-desc");
      cardDesc.textContent = entry.description || "No description.";
      if (!entry.description) cardDesc.classList.add("gallery-card-desc--empty");
      card.appendChild(cardDesc);

      function selectEntry() {
        onSelect(entry.json);
        close();
      }

      card.addEventListener("click", selectEntry);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectEntry();
        }
      });

      grid.appendChild(card);
    }

    sectionEl.appendChild(grid);
    content.appendChild(sectionEl);
  }

  modal.appendChild(content);
}
