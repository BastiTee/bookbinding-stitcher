import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export interface TourDeps {
  loadPattern: (json: string) => void;
  switchToDesign: () => void;
  switchToSewing: () => void;
  switchToPlayback: () => void;
}

// Captured before ui.ts clears the hash after loading a shared-URL pattern
const PAGE_LOAD_HASH = window.location.hash;

const rawExamples = import.meta.glob("/examples/**/*.json", { eager: true }) as Record<
  string,
  { default: unknown }
>;

const FIRST_EXAMPLE_JSON: string = (() => {
  const sorted = Object.entries(rawExamples).sort(([a], [b]) => a.localeCompare(b));
  return sorted.length > 0 ? JSON.stringify(sorted[0][1].default) : "";
})();

function shouldShowTour(): boolean {
  if (PAGE_LOAD_HASH.length > 0) return false;
  return localStorage.getItem("bookbinding-tour-v1") === null;
}

export function startTour(deps: TourDeps): void {
  if (!shouldShowTour()) return;

  if (FIRST_EXAMPLE_JSON) deps.loadPattern(FIRST_EXAMPLE_JSON);

  const driverObj = driver({
    showProgress: true,
    allowClose: true,
    onDestroyed: () => {
      localStorage.setItem("bookbinding-tour-v1", "1");
    },
    steps: [
      {
        element: ".gallery-cta",
        popover: {
          title: "Browse example patterns",
          description:
            "Open the gallery to load any bundled example pattern. " +
            "We've pre-loaded one for this tour so all features are ready to explore.",
          side: "right",
          align: "start",
        },
      },
      {
        element: ".metadata-panel",
        popover: {
          title: "Pattern metadata",
          description:
            "View and edit your pattern's title, author, and description. " +
            "These are saved with the file and shown in the gallery.",
          side: "right",
          align: "start",
        },
      },
      {
        element: "#btn-mode-playback",
        popover: {
          title: "Playback mode",
          description:
            "Replay the stitch sequence step by step. Use the playback controls " +
            "to walk through each edge of the thread path.",
          side: "bottom",
          align: "center",
        },
        onHighlightStarted: () => deps.switchToPlayback(),
      },
      {
        element: ".bottom-panel",
        popover: {
          title: "Reset controls",
          description:
            "Clear threads while keeping your spine design, or reset everything " +
            "to start a completely fresh pattern.",
          side: "top",
          align: "center",
        },
      },
      {
        element: ".design-panel",
        popover: {
          title: "Design your spine",
          description:
            "Set the spine dimensions, then click the canvas to place or remove holes. " +
            "All stitching starts from the hole positions you define here.",
          side: "left",
          align: "start",
        },
        onHighlightStarted: () => deps.switchToDesign(),
      },
      {
        element: ".sewing-panel",
        popover: {
          title: "Sewing mode",
          description:
            "Thread through holes one click at a time. Each pass automatically " +
            "alternates between outside the spine and inside the signature.",
          side: "left",
          align: "start",
        },
        onHighlightStarted: () => deps.switchToSewing(),
      },
      {
        element: ".undo-redo-row",
        popover: {
          title: "Undo and redo",
          description:
            "Experiment freely — every stitching action can be undone. " +
            "Use Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z as keyboard shortcuts.",
          side: "left",
          align: "start",
        },
      },
      {
        element: "#export-section",
        popover: {
          title: "Save and share",
          description:
            "Save your pattern to a local file, or copy a shareable link. " +
            "The full pattern is encoded in the URL — no server needed.",
          side: "right",
          align: "start",
        },
      },
      {
        element: ".sidebar-footer",
        popover: {
          title: "Open source",
          description:
            "The source is on GitHub. Report issues, request features, " +
            "or contribute your own stitch patterns.",
          side: "top",
          align: "center",
        },
      },
    ],
  });

  driverObj.drive();
}
