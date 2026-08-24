/**
 * The virtual tour: a manually-launched, cross-page walkthrough that
 * highlights real UI on Dashboard, All entries, Margins, Startups, and
 * Settings in turn.
 *
 * Foundr's pages are separate full loads (Vite multi-page app, not an
 * SPA), so a step's progress has to survive a real navigation. sessionStorage
 * carries just the step index across that reload; each page's
 * <foundr-tour-overlay> reads it on connect and renders the step if it's
 * the one meant for that page. sessionStorage (not localStorage) is
 * deliberate: a tour is a single-session activity, closing the tab
 * should reset it rather than resuming days later.
 */

export interface TourStep {
  id: string;
  path: string;
  /** Light-DOM tag of the page component to pierce into, e.g. "foundr-dashboard". "" for a step with no target (centered card only). */
  host: string;
  /** Selector inside that host's shadow root. null renders a centered card with no highlight. */
  selector: string | null;
  icon: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "startups",
    path: "/business",
    host: "foundr-business",
    selector: ".grid",
    icon: "ti-building-store",
    title: "This is home base",
    body: "Every startup or side hustle you track lives here, each with its own fully separate dashboard. Numbers never mix between them. Pick one to get started, or add another anytime.",
  },
  {
    id: "kpis",
    path: "/dashboard",
    host: "foundr-dashboard",
    selector: ".kpi-grid",
    icon: "ti-flame",
    title: "Your numbers, at a glance",
    body: "Burn, runway, ROI, and cash left: the four things that matter most, calculated automatically from what you track. No spreadsheet required.",
  },
  {
    id: "add-entry",
    path: "/dashboard",
    host: "foundr-dashboard",
    selector: ".add-btn",
    icon: "ti-pencil-plus",
    title: "Add anything in seconds",
    body: "Expenses, revenue, investments, draws, or debt: one button, a few fields, and your metrics update instantly.",
  },
  {
    id: "entries",
    path: "/transactions",
    host: "foundr-transactions",
    selector: "h1",
    icon: "ti-list",
    title: "Every entry, in one place",
    body: "A single running ledger of everything you've tracked, newest first. Edit the amount or note, or delete anything, right from this list.",
  },
  {
    id: "margins",
    path: "/margins",
    host: "foundr-margins",
    selector: ".section-tabs",
    icon: "ti-report-money",
    title: "Margins and a full balance sheet",
    body: "Switch between a margins breakdown and a real Assets = Liabilities + Equity balance sheet, both generated automatically. Export either as CSV whenever you need it.",
  },
  {
    id: "settings",
    path: "/settings",
    host: "foundr-settings",
    selector: ".settings-nav",
    icon: "ti-adjustments",
    title: "Make it yours",
    body: "Each startup keeps its own currency, your theme applies everywhere, and Security is where recovery email and account protection live.",
  },
  {
    id: "done",
    path: "/settings",
    host: "",
    selector: null,
    icon: "ti-compass",
    title: "That's the tour",
    body: "You can relaunch this anytime from Settings → Startups or the startup switcher. Go build something.",
  },
];

const STATE_KEY = "foundr-tour-state";

/**
 * Fired on `window` whenever the tour's state changes (start, step, end).
 * Writing to sessionStorage alone doesn't wake up an already-mounted
 * <foundr-tour-overlay>: the tab's own writes never fire the native
 * `storage` event (that only fires in *other* tabs), so launching the
 * tour from a page it's already showing needs this to take effect
 * immediately instead of only after a reload.
 */
export const TOUR_CHANGE_EVENT = "foundr-tour-change";

interface TourState {
  stepIndex: number;
}

function readState(): TourState | null {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TourState>;
    if (typeof parsed.stepIndex !== "number" || parsed.stepIndex < 0 || parsed.stepIndex >= TOUR_STEPS.length) {
      return null;
    }
    return parsed as TourState;
  } catch {
    return null;
  }
}

function writeState(stepIndex: number): void {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ stepIndex }));
  } catch {
    // Storage unavailable (private browsing); the tour just can't be enforced this session.
  }
  window.dispatchEvent(new CustomEvent(TOUR_CHANGE_EVENT));
}

/** The active step, if a tour is in progress. */
export function getActiveTourStep(): TourStep | null {
  const state = readState();
  return state ? TOUR_STEPS[state.stepIndex] : null;
}

/** Starts the tour from the first step, navigating there if needed. */
export function startTour(): void {
  goToTourStep(0);
}

/** Ends the tour early (skip / close). */
export function endTour(): void {
  try {
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(TOUR_CHANGE_EVENT));
}

/**
 * Advances to a specific step (by index; dots and Back/Next both use
 * this). Navigates to that step's page if it isn't the current one;
 * otherwise just persists the index so the current page's overlay
 * re-renders in place.
 */
export function goToTourStep(index: number): void {
  if (index < 0 || index >= TOUR_STEPS.length) {
    endTour();
    return;
  }
  const step = TOUR_STEPS[index];
  writeState(index);
  if (step.path !== window.location.pathname) {
    window.location.href = step.path;
  }
}
