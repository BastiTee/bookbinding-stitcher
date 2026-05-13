export interface MenuItem {
  label: string;
  icon?: string;
  loadColor?: "positive" | "negative";
  primary?: boolean;
  disabled?: boolean;
  onHover?: () => void;
  onLeave?: () => void;
  onClick: () => void;
}

export class HoverMenu {
  private container: HTMLElement;
  private card: HTMLDivElement | null = null;
  private _isOverMenu = false;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // Convert a hole's SVG coordinates to container-relative pixel coordinates.
  static holeToContainerCoords(
    svg: SVGSVGElement,
    container: HTMLElement,
    hole: { x: number; y: number },
  ): { x: number; y: number } {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const screenX = ctm.a * hole.x + ctm.e;
    const screenY = ctm.d * hole.y + ctm.f;
    const rect = container.getBoundingClientRect();
    return { x: screenX - rect.left, y: screenY - rect.top };
  }

  show(px: number, py: number, items: MenuItem[]): void {
    this.clearDismissTimer();
    this.removeCard();

    const card = document.createElement("div") as HTMLDivElement;
    card.className = "hover-menu";
    this.card = card;

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "hover-menu-item";
      if (item.primary) row.classList.add("hover-menu-item--primary");
      if (item.disabled) row.classList.add("hover-menu-item--disabled");

      if (item.icon) {
        const icon = document.createElement("span");
        icon.className = "hover-menu-icon";
        if (item.loadColor) icon.classList.add(`hover-menu-icon--${item.loadColor}`);
        icon.textContent = item.icon;
        row.appendChild(icon);
      }

      const label = document.createElement("span");
      label.textContent = item.label;
      row.appendChild(label);

      if (!item.disabled) {
        row.addEventListener("mouseenter", () => item.onHover?.());
        row.addEventListener("mouseleave", () => item.onLeave?.());
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          item.onClick();
        });
      }

      card.appendChild(row);
    }

    card.addEventListener("mouseenter", () => {
      this._isOverMenu = true;
      this.clearDismissTimer();
    });
    card.addEventListener("mouseleave", () => {
      this._isOverMenu = false;
      this.scheduleDismiss(200);
    });

    // Initial position: right of and aligned with the hole
    card.style.position = "absolute";
    card.style.left = `${px + 14}px`;
    card.style.top = `${py}px`;
    this.container.appendChild(card);

    // Reposition after measuring to avoid overflow
    const cardRect = card.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    let left = px + 14;
    let top = py + 16;

    if (left + cardRect.width > containerRect.width - 8) {
      left = px - cardRect.width - 14;
    }
    if (top + cardRect.height > containerRect.height - 8) {
      top = py - cardRect.height - 16;
    }
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  isHovering(): boolean {
    return this._isOverMenu;
  }

  scheduleDismiss(delay: number): void {
    this.clearDismissTimer();
    this.dismissTimer = setTimeout(() => this.hide(), delay);
  }

  hide(): void {
    this.clearDismissTimer();
    this.removeCard();
    this._isOverMenu = false;
  }

  destroy(): void {
    this.hide();
  }

  private removeCard(): void {
    if (this.card) {
      this.card.remove();
      this.card = null;
    }
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}
