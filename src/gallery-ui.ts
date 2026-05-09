import { el, createModal } from "./dom-utils";

const rawModules = import.meta.glob("/examples/*.json", {
  eager: true,
}) as Record<string, { default: Record<string, unknown> }>;

interface GalleryEntry {
  title: string;
  author: string;
  description: string;
  json: string;
}

function filenameToTitle(path: string): string {
  const base = path.split("/").pop()!.replace(".json", "");
  return base.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ENTRIES: GalleryEntry[] = Object.entries(rawModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, mod]) => {
    const data = mod.default;
    const meta = (data.metadata as Record<string, string | null> | undefined) ?? {};
    return {
      title: meta.title || filenameToTitle(path),
      author: meta.author || "",
      description: meta.description || "",
      json: JSON.stringify(data, null, 2),
    };
  });

export function openGallery(onSelect: (json: string) => void): void {
  if (document.querySelector(".gallery-backdrop")) return;

  const { modal, close } = createModal("Pattern Gallery", "Close gallery");
  const grid = el("div", "gallery-grid");

  for (const entry of ENTRIES) {
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

  modal.appendChild(grid);
}
