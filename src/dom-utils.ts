export function el(tag: string, className?: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement;
  if (className) e.className = className;
  return e;
}

export function sectionTitle(text: string): HTMLElement {
  const h = document.createElement("h3");
  h.className = "section-title";
  h.textContent = text;
  return h;
}

export function createModal(
  titleText: string,
  closeAriaLabel: string,
  extraClass?: string,
): { modal: HTMLDivElement; close: () => void } {
  const backdrop = el("div", "gallery-backdrop");

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

  const modal = el("div", extraClass ? `gallery-modal ${extraClass}` : "gallery-modal");
  const header = el("div", "gallery-header");

  const titleEl = document.createElement("h2");
  titleEl.className = "gallery-title";
  titleEl.textContent = titleText;

  const closeBtn = document.createElement("button");
  closeBtn.className = "gallery-close-btn";
  closeBtn.setAttribute("aria-label", closeAriaLabel);
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", close);

  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  modal.appendChild(header);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  closeBtn.focus();

  return { modal, close };
}
