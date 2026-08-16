import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import gsap from "gsap";

/**
 * <foundr-mini-loader>
 * A small, quiet, continuously-looping version of the water-fill mark —
 * the instant first-tier loading indicator for in-app pages (dashboard,
 * transactions, margins, settings), so there's never a blank gap before
 * some feedback appears. Shown immediately, removed immediately once data
 * arrives — no scroll-lock, no reveal choreography, no exit fade; that
 * ceremony is reserved for <foundr-page-loader>, which takes over only if
 * loading is unexpectedly slow.
 */
@customElement("foundr-mini-loader")
export class FoundrMiniLoader extends LitElement {
  private _tl?: gsap.core.Timeline;

  firstUpdated(): void {
    const root = this.shadowRoot!;
    const el = (s: string) => root.querySelector(s) as Element;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      gsap.set([el("#waterY"), el("#waterY2")], { y: -14 });
      return;
    }

    gsap.to([el("#surfA"), el("#surfA2")], { x: -14, duration: 0.9, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(el("#surfB"), { x: 14, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" });

    this._tl = gsap.timeline({ repeat: -1, repeatDelay: 0.25 });
    this._tl.fromTo([el("#waterY"), el("#waterY2")], { y: 70 }, { y: -14, duration: 0.85, ease: "power1.inOut" });
    this._tl.to([el("#waterY"), el("#waterY2")], { y: 70, duration: 0.65, ease: "power1.in" }, "+=0.3");
  }

  disconnectedCallback(): void {
    this._tl?.kill();
    super.disconnectedCallback();
  }

  static styles = css`
    :host { display: flex; align-items: center; justify-content: center; }
    .stage { width: var(--loader-size, 56px); height: var(--loader-size, 56px); }
    svg.logo { width: 100%; height: 100%; overflow: visible; display: block; }
  `;

  render(): TemplateResult {
    return html`
      <div class="stage">
        <svg class="logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="miniBoxClip"><rect x="2" y="2" width="60" height="60" rx="16" /></clipPath>
            <clipPath id="miniFClip"><path d="M25 17 h18 v6 h-12 v7 h10 v6 h-10 v12 h-6 z" /></clipPath>
          </defs>

          <rect x="2" y="2" width="60" height="60" rx="16" fill="none" stroke="var(--forest, #2D4A3E)" stroke-width="3" />
          <path d="M25 17 h18 v6 h-12 v7 h10 v6 h-10 v12 h-6 z" fill="var(--sage-soft, #DDE7E0)" opacity="0.5" />

          <g clip-path="url(#miniBoxClip)">
            <g id="waterY">
              <rect x="-40" y="20" width="150" height="120" fill="var(--forest, #2D4A3E)" />
              <path id="surfA" d="M-40 20 q12 -5 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 v8 h-168 z" fill="var(--forest, #2D4A3E)" />
              <path id="surfB" d="M-40 21 q12 5 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 v8 h-168 z" fill="var(--forest-deep, #1F3329)" opacity="0.4" />
            </g>
          </g>

          <g clip-path="url(#miniFClip)">
            <g clip-path="url(#miniBoxClip)">
              <g id="waterY2">
                <rect x="-40" y="20" width="150" height="120" fill="var(--surface, #FAFAF7)" />
                <path id="surfA2" d="M-40 20 q12 -5 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 v8 h-168 z" fill="var(--surface, #FAFAF7)" />
              </g>
            </g>
          </g>
        </svg>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-mini-loader": FoundrMiniLoader;
  }
}
