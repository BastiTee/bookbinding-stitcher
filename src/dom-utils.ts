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
