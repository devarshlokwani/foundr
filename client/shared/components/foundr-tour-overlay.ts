import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gsap } from "gsap";
import { TOUR_STEPS, TOUR_CHANGE_EVENT, type TourStep, getActiveTourStep, goToTourStep, endTour } from "../lib/tour";

const TOOLTIP_WIDTH = 340;
const RING_PADDING = 8;

/**
 * <foundr-tour-overlay>
 * Mounted on every page the tour visits (dashboard, transactions, margins,
 * business, settings) — inert unless a tour is active and the current
 * step belongs to this page. Finds the real target element by piercing
 * one level into the page component's own Shadow DOM (every step's
 * target lives directly in its page's shadow root — see tour.ts), draws
 * a glowing ring around it, and shows an explanatory tooltip using the
 * same card/icon/dots/nav-btn language as the onboarding wizard.
 *
 * Several targets (the KPI grid, the entries list, the margins tabs)
 * only render once there's real data — a founder can launch the tour
 * before adding anything. When a target can't be found after a short
 * retry window, the step still shows as a centered card with the same
 * text, just without a highlight, rather than silently skipping it.
 */
@customElement("foundr-tour-overlay")
export class FoundrTourOverlay extends LitElement {
  @state() private stepIndex = -1;
  @state() private rect: DOMRect | null = null;
  @state() private ready = false;

  private _pollTimer: number | null = null;
  private _ringPositioned = false;
  /** Bumped on every _locate() call; async continuations bail out if a newer call has since superseded them — otherwise a stale poll or rAF callback from a previous step can overwrite the current one's highlight (the intermittent "highlight doesn't show" bug). */
  private _locateGen = 0;

  private readonly _onResize = (): void => this._measure();
  private readonly _onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.stepIndex !== -1) this._end();
  };
  /**
   * The single source of truth for what this instance shows. Re-run on
   * connect AND whenever TOUR_CHANGE_EVENT fires — writing to
   * sessionStorage alone doesn't wake up an already-mounted instance (see
   * tour.ts), so without this, starting or advancing the tour from the
   * page it's already showing would silently do nothing until a reload.
   */
  private readonly _onTourChange = (): void => this._sync();

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(TOUR_CHANGE_EVENT, this._onTourChange);
    window.addEventListener("resize", this._onResize);
    window.addEventListener("keydown", this._onKeydown);
    this._sync();
  }

  disconnectedCallback(): void {
    window.removeEventListener(TOUR_CHANGE_EVENT, this._onTourChange);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._onKeydown);
    if (this._pollTimer !== null) clearTimeout(this._pollTimer);
    super.disconnectedCallback();
  }

  private _sync(): void {
    const step = getActiveTourStep();
    const matches = step && step.path === window.location.pathname;
    if (!matches) {
      if (this.stepIndex !== -1) {
        this.stepIndex = -1;
        this._ringPositioned = false;
      }
      return;
    }
    const idx = TOUR_STEPS.indexOf(step);
    if (idx === this.stepIndex) return;
    this.stepIndex = idx;
    this._locate();
  }

  private get _step(): TourStep | null {
    return this.stepIndex >= 0 ? TOUR_STEPS[this.stepIndex] : null;
  }

  private _resolveTarget(step: TourStep): Element | null {
    if (!step.host || !step.selector) return null;
    const host = document.querySelector(step.host) as (Element & { shadowRoot?: ShadowRoot | null }) | null;
    return host?.shadowRoot?.querySelector(step.selector) ?? null;
  }

  /**
   * Finds the target and highlights it. On a same-page step change the
   * target already exists, so this resolves within a tick. On a fresh
   * cross-page navigation it can take real time to appear — Clerk
   * re-initialises, then the page's own auth check, business resolve, and
   * data fetch all run sequentially before the element ever renders — so
   * this polls for up to 8s rather than giving up early.
   *
   * Nothing renders (the overlay stays fully invisible) until the target
   * is actually found — no centered placeholder while waiting. Showing
   * one and then relocating it once the real position is known reads as
   * a glitch; better to just wait, however long that takes, and appear
   * once in the right place. The centered "untargeted" card is still the
   * fallback if the target genuinely never appears (e.g. an empty
   * dashboard with no KPI grid to show at all) — that's a real absence,
   * not a loading delay, so it still needs to say something once the
   * full window is exhausted.
   */
  private _locate(): void {
    const gen = ++this._locateGen;
    if (this._pollTimer !== null) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    this.ready = false;
    this.rect = null;
    const step = this._step;
    if (!step?.selector) {
      this.ready = true;
      return;
    }

    const deadline = Date.now() + 8000;
    const tryFind = (): void => {
      if (gen !== this._locateGen) return; // superseded by a newer _locate() call
      const el = this._resolveTarget(step);
      if (el) {
        el.scrollIntoView({ block: "center" });
        requestAnimationFrame(() => {
          if (gen !== this._locateGen) return;
          this.rect = el.getBoundingClientRect();
          this.ready = true;
        });
        return;
      }
      if (Date.now() < deadline) {
        this._pollTimer = window.setTimeout(tryFind, 150);
      } else if (gen === this._locateGen) {
        this.rect = null;
        this.ready = true;
      }
    };
    tryFind();
  }

  private _measure(): void {
    const step = this._step;
    if (!step?.selector) return;
    const el = this._resolveTarget(step);
    this.rect = el ? el.getBoundingClientRect() : null;
  }

  /** Just persists + dispatches — _sync() (triggered by the event this fires) is what actually updates this instance, whether it's the same page or a fresh one after navigating. */
  private _go(index: number): void {
    if (index >= TOUR_STEPS.length) {
      endTour();
      return;
    }
    if (index < 0) return;
    goToTourStep(index);
  }

  private readonly _next = (): void => this._go(this.stepIndex + 1);
  private readonly _back = (): void => this._go(this.stepIndex - 1);
  private readonly _end = (): void => endTour();

  static styles = css`
    :host {
      font-family: var(--font-body, "Inter", sans-serif);
      color: var(--ink, #1C1C1C);
    }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-flame:before { content: "\\ec2c"; }
    .ti-pencil-plus:before { content: "\\f1ec"; }
    .ti-list:before { content: "\\eb6b"; }
    .ti-report-money:before { content: "\\eecd"; }
    .ti-building-store:before { content: "\\ea4e"; }
    .ti-adjustments:before { content: "\\ea03"; }
    .ti-compass:before { content: "\\ea79"; }
    .ti-x:before { content: "\\eb55"; }
    .ti-arrow-left:before { content: "\\ea19"; }
    .ti-arrow-right:before { content: "\\ea1f"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .backdrop {
      position: fixed; inset: 0; z-index: 600;
      background: var(--overlay, rgba(28,28,28,0.55)); backdrop-filter: blur(2px);
    }
    .ring {
      position: fixed; z-index: 601; border-radius: 14px; pointer-events: none;
      border: 2px solid var(--sage, #8AAF9A);
      box-shadow: 0 0 0 4px rgba(138,175,154,0.25), 0 0 24px rgba(138,175,154,0.35);
      transition: top 0.3s cubic-bezier(0.4,0,0.2,1), left 0.3s cubic-bezier(0.4,0,0.2,1),
                  width 0.3s cubic-bezier(0.4,0,0.2,1), height 0.3s cubic-bezier(0.4,0,0.2,1);
    }

    .card {
      box-sizing: border-box;
      position: fixed; z-index: 602; width: ${TOOLTIP_WIDTH}px; max-width: calc(100vw - 32px);
      background: var(--surface, #FAFAF7); border-radius: 20px; padding: 18px 20px 20px;
      box-shadow: 0 24px 60px -18px rgba(31,51,41,0.45);
    }
    .card.centered { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); }

    /* Speech-bubble tail — a rotated square, half tucked behind the card
       edge, same fill as the card, so it reads as one connected shape
       pointing at whatever's highlighted rather than a floating block. */
    .tail {
      position: absolute; width: 18px; height: 18px; background: var(--surface, #FAFAF7);
      border-radius: 4px; transform: translateX(-50%) rotate(45deg);
    }
    .tail.point-up { top: -8px; box-shadow: -2px -2px 4px -2px rgba(31,51,41,0.12); }
    .tail.point-down { bottom: -8px; box-shadow: 2px 2px 4px -2px rgba(31,51,41,0.12); }

    .close-btn {
      position: absolute; top: 12px; right: 12px; width: 26px; height: 26px; border-radius: 50%;
      background: transparent; color: var(--ink-soft, #6B6B66); display: grid; place-items: center; font-size: 12px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .close-btn:hover { background: var(--surface-alt, #F2EFE8); color: var(--ink, #1C1C1C); }

    .card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding-right: 22px; }
    .step-icon {
      width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0;
      background: linear-gradient(155deg, var(--forest, #2D4A3E), var(--forest-deep, #1F3329));
      color: #fff; display: grid; place-items: center; font-size: 15px;
      box-shadow: 0 6px 14px -6px rgba(31,51,41,0.55);
    }
    .card h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 18px; margin: 0; }
    .card p { font-size: 13.5px; color: var(--ink-soft, #6B6B66); line-height: 1.55; margin: 0 0 16px; }

    .footer { display: flex; align-items: center; gap: 10px; }
    .dots { flex: 1; display: flex; justify-content: center; gap: 6px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--line, #E2DFD7); border: none; padding: 0; cursor: pointer; transition: background 0.25s ease, width 0.25s ease; }
    .dot.active { background: var(--forest, #2D4A3E); width: 18px; border-radius: 4px; }

    .back-btn, .next-btn {
      width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; flex-shrink: 0;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease, color 0.18s ease, border-color 0.18s ease;
    }
    .back-btn { background: transparent; border: 1px solid var(--line, #E2DFD7); color: var(--ink-soft, #6B6B66); }
    .back-btn:hover:not(:disabled) { background: var(--surface-alt, #F2EFE8); color: var(--ink, #1C1C1C); }
    .back-btn:disabled { opacity: 0; pointer-events: none; }
    .next-btn { background: var(--forest, #2D4A3E); color: #fff; border: none; }
    .next-btn:hover { background: var(--forest-deep, #1F3329); transform: translate(-2px, -2px); box-shadow: 2px 2px 0 var(--sage, #8AAF9A); }
    .next-btn:active { transform: translate(0, 0); box-shadow: none; }
  `;

  private _tooltipPosition(): { top?: string; bottom?: string; left: string; placement: "below" | "above"; tailLeft: number } {
    const rect = this.rect!;
    const margin = 20;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placeBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;

    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - 16));

    const targetCenter = rect.left + rect.width / 2;
    const tailLeft = Math.max(28, Math.min(targetCenter - left, TOOLTIP_WIDTH - 28));

    return placeBelow
      ? { top: `${rect.bottom + margin}px`, left: `${left}px`, placement: "below", tailLeft }
      : { bottom: `${window.innerHeight - rect.top + margin}px`, left: `${left}px`, placement: "above", tailLeft };
  }

  private _renderCard(step: TourStep): TemplateResult {
    const isLast = this.stepIndex === TOUR_STEPS.length - 1;
    const untargeted = !this.rect;
    const pos = untargeted ? null : this._tooltipPosition();
    const style = pos
      ? `top:${pos.top ?? "auto"}; bottom:${pos.bottom ?? "auto"}; left:${pos.left};`
      : "";

    return html`
      <div class="card ${untargeted ? "centered" : ""}" style=${style}>
        ${pos
          ? html`<div class="tail ${pos.placement === "below" ? "point-up" : "point-down"}" style="left:${pos.tailLeft}px;"></div>`
          : ""}
        <button class="close-btn" @click=${this._end} aria-label="Close tour">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
        <div class="card-head">
          <div class="step-icon"><i class="ti ${step.icon}" aria-hidden="true"></i></div>
          <h2>${step.title}</h2>
        </div>
        <p>${step.body}</p>
        <div class="footer">
          <button class="back-btn" @click=${this._back} ?disabled=${this.stepIndex === 0} aria-label="Back">
            <i class="ti ti-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="dots">
            ${TOUR_STEPS.map(
              (_, i) => html`<button class="dot ${i === this.stepIndex ? "active" : ""}" @click=${() => this._go(i)} aria-label="Go to step ${i + 1}"></button>`
            )}
          </div>
          <button class="next-btn" @click=${this._next} aria-label=${isLast ? "Finish" : "Next"}>
            <i class="ti ${isLast ? "ti-compass" : "ti-arrow-right"}" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }

  protected updated(): void {
    if (!this.rect) {
      this._ringPositioned = false;
      return;
    }
    const ring = this.renderRoot.querySelector<HTMLElement>(".ring");
    if (!ring) return;
    const vars = {
      top: this.rect.top - RING_PADDING,
      left: this.rect.left - RING_PADDING,
      width: this.rect.width + RING_PADDING * 2,
      height: this.rect.height + RING_PADDING * 2,
    };
    if (this._ringPositioned) {
      gsap.to(ring, { ...vars, duration: 0.35, ease: "power2.out" });
    } else {
      gsap.set(ring, vars);
      this._ringPositioned = true;
    }
  }

  render(): TemplateResult {
    const step = this._step;
    if (!step || !this.ready) return html``;

    return html`
      <div class="backdrop"></div>
      ${this.rect ? html`<div class="ring"></div>` : ""}
      ${this._renderCard(step)}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-tour-overlay": FoundrTourOverlay;
  }
}
