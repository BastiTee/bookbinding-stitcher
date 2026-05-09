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

function buildEntries(): GalleryEntry[] {
  return Object.entries(rawModules)
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
}

export function openGallery(onSelect: (json: string) => void): void {
  const entries = buildEntries();

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
  modal.className = "gallery-modal";

  const header = document.createElement("div");
  header.className = "gallery-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "gallery-title";
  titleEl.textContent = "Pattern Gallery";

  const closeBtn = document.createElement("button");
  closeBtn.className = "gallery-close-btn";
  closeBtn.setAttribute("aria-label", "Close gallery");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", close);

  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "gallery-grid";

  for (const entry of entries) {
    const card = document.createElement("div");
    card.className = "gallery-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Load pattern: ${entry.title}`);

    const cardTitle = document.createElement("div");
    cardTitle.className = "gallery-card-title";
    cardTitle.textContent = entry.title;

    card.appendChild(cardTitle);

    if (entry.author) {
      const cardAuthor = document.createElement("div");
      cardAuthor.className = "gallery-card-author";
      cardAuthor.textContent = `by ${entry.author}`;
      card.appendChild(cardAuthor);
    }

    const cardDesc = document.createElement("div");
    cardDesc.className = "gallery-card-desc";
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
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  closeBtn.focus();
}
