import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

/**
 * <foundr-loader>
 * Entry animation. A rotated rounded-square shows its green outline; green
 * liquid rises to fill it with a sloshing wavy surface, revealing a white F.
 * When full, the box straightens (locks into place) and a little sweat-drop
 * flies off, then the overlay fades to reveal the site.
 *
 * Self-contained: plays once, REMOVES ITSELF from the DOM (so it can never
 * block clicks afterwards), respects reduced-motion.
 */
@customElement("foundr-loader")
export class FoundrLoader extends LitElement {
  @state() private leaving = false;
  @state() private gone = false;
  @state() private straighten = false;

  connectedCallback(): void {
    super.connectedCallback();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      window.setTimeout(() => { this.leaving = true; }, 200);
      window.setTimeout(() => { this._finish(); }, 850);
      return;
    }

    // Fill runs ~1.9s, then straighten + sweat-drop, then fade out.
    window.setTimeout(() => { this.straighten = true; }, 1950);
    window.setTimeout(() => { this.leaving = true; }, 2600);
    window.setTimeout(() => { this._finish(); }, 3250);
  }

  private _finish(): void {
    this.gone = true;
    this.dispatchEvent(new CustomEvent("loader-done", { bubbles: true, composed: true }));
    this.remove(); // physically remove so nothing intercepts clicks
  }

  static styles = css`
    :host { position: fixed; inset: 0; z-index: 9999; }
    .overlay {
      position: fixed; inset: 0; background: var(--bg, #ECEAE3);
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.6s ease, visibility 0.6s ease;
    }
    .overlay.leaving { opacity: 0; visibility: hidden; pointer-events: none; }
    .overlay.gone { display: none; }

    .logo-wrap { display: flex; flex-direction: column; align-items: center; gap: 20px; }

    /* Box starts tilted, straightens (with a tiny overshoot) when full. */
    .box { width: 92px; height: 92px; transform: rotate(-12deg); transition: transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative; }
    .box.straight { transform: rotate(0deg); }
    svg { width: 100%; height: 100%; overflow: visible; }

    .brand-name {
      font-family: var(--font-display, serif); font-size: 22px; color: var(--forest, #2D4A3E);
      opacity: 0; animation: fadeUp 0.6s ease 1s forwards;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* The whole liquid body rises from below to fill the box. */
    .wave { animation: rise 1.9s cubic-bezier(0.33, 0, 0.2, 1) forwards; }
    @keyframes rise {
      0%   { transform: translateY(72px); }
      100% { transform: translateY(-8px); }
    }

    /* Two surface waves scroll sideways at different speeds so the top
       edge undulates like a sloshing liquid surface. They fade/flatten
       near the end as the liquid "settles". */
    .surface1 { animation: slosh1 1.15s linear infinite; }
    .surface2 { animation: slosh2 0.85s linear infinite; }
    @keyframes slosh1 {
      from { transform: translateX(0); }
      to   { transform: translateX(-40px); }
    }
    @keyframes slosh2 {
      from { transform: translateX(0); }
      to   { transform: translateX(40px); }
    }
    /* Settle: once straightening, calm the surface. */
    .box.straight .surface1, .box.straight .surface2 { animation-play-state: paused; }

    /* Sweat drop: hidden until the box locks, then arcs up-and-off. */
    .drop {
      position: absolute; top: -4px; right: 6px; width: 10px; height: 14px;
      opacity: 0;
    }
    .box.straight .drop { animation: sweat 0.7s ease-out 0.15s forwards; }
    @keyframes sweat {
      0%   { opacity: 0; transform: translate(0, 6px) scale(0.6); }
      25%  { opacity: 1; transform: translate(3px, -10px) scale(1); }
      100% { opacity: 0; transform: translate(12px, 20px) scale(0.9); }
    }

    @media (prefers-reduced-motion: reduce) {
      .wave, .surface1, .surface2 { animation: none; transform: translateY(-8px); }
      .box { transform: rotate(0deg); }
      .brand-name { animation: none; opacity: 1; }
      .drop { display: none; }
    }
  `;

  render(): TemplateResult {
    if (this.gone) return html``;

    return html`
      <div class="overlay ${this.leaving ? "leaving" : ""}">
        <div class="logo-wrap">
          <div class="box ${this.straighten ? "straight" : ""}">
            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <clipPath id="boxClip">
                  <rect x="2" y="2" width="60" height="60" rx="16" />
                </clipPath>
                <clipPath id="fClip">
                  <path d="M25 18 h18 v6 h-12 v7 h10 v6 h-10 v11 h-6 z" />
                </clipPath>
              </defs>

              <!-- Always-visible green outline -->
              <rect x="2" y="2" width="60" height="60" rx="16"
                fill="none" stroke="var(--forest, #2D4A3E)" stroke-width="3" />

              <!-- Faint F before the liquid arrives -->
              <path d="M25 18 h18 v6 h-12 v7 h10 v6 h-10 v11 h-6 z"
                fill="var(--sage-soft, #DDE7E0)" opacity="0.55" />

              <!-- Rising liquid with a wavy surface, clipped to the box -->
              <g clip-path="url(#boxClip)">
                <g class="wave">
                  <!-- body -->
                  <rect x="-30" y="6" width="130" height="90" fill="var(--forest, #2D4A3E)" />
                  <!-- surface wave 1 (a wide, low sine made of overlapping arcs) -->
                  <path class="surface1" d="M-30 6 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v10 h-140 z"
                    fill="var(--forest, #2D4A3E)" />
                  <!-- surface wave 2, lighter, offset -->
                  <path class="surface2" d="M-30 7 q10 6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v10 h-140 z"
                    fill="var(--forest-deep, #1F3329)" opacity="0.45" />
                </g>
              </g>

              <!-- White F, revealed only where the liquid currently is -->
              <g clip-path="url(#fClip)">
                <g clip-path="url(#boxClip)">
                  <g class="wave">
                    <rect x="-30" y="6" width="130" height="90" fill="#FAFAF7" />
                    <path class="surface1" d="M-30 6 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v10 h-140 z" fill="#FAFAF7" />
                  </g>
                </g>
              </g>
            </svg>

            <!-- Cartoon sweat drop -->
            <svg class="drop" viewBox="0 0 10 14" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 0 C5 0 0 7 0 10 a5 5 0 0 0 10 0 C10 7 5 0 5 0 z" fill="var(--sage, #8AAF9A)" opacity="0.9" />
            </svg>
          </div>
          <div class="brand-name">Foundr</div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-loader": FoundrLoader;
  }
}