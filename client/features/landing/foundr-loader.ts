import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import gsap from "gsap";
import { resetScrollToTop, lockScroll, unlockScroll } from "../../shared/lib/animations";

@customElement("foundr-loader")
export class FoundrLoader extends LitElement {
  firstUpdated(): void {
    const root = this.shadowRoot!;
    const el = (s: string) => root.querySelector(s) as Element;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Force page to top (defeats browser scroll restoration on reload) and
    // freeze scrolling while the intro plays.
    resetScrollToTop();
    lockScroll();

    const finish = () => {
      unlockScroll();
      this.dispatchEvent(new CustomEvent("loader-done", { bubbles: true, composed: true }));
      this.remove();
    };
    
    const dropSVG =
      '<svg viewBox="0 0 9 13"><path d="M4.5 0 C4.5 0 0 6 0 8.7 a4.5 4.5 0 0 0 9 0 C9 6 4.5 0 4.5 0 z" fill="var(--forest, #2D4A3E)"/></svg>';
    const drops = [
      { sx: 56, sy: -14, ex: 88, ey: -34 },
      { sx: 52, sy: 40, ex: 80, ey: 70 },
      { sx: -52, sy: 40, ex: -80, ey: 70 },
      { sx: -56, sy: -14, ex: -88, ey: -34 },
    ];
    const launch = () => {
      const boxrot = el("#boxrot") as HTMLElement;
      drops.forEach((d, i) => {
        const dEl = document.createElement("div");
        dEl.className = "drop";
        dEl.innerHTML = dropSVG;
        boxrot.appendChild(dEl);
        const peakY = Math.min(d.sy, d.ey) - 24;
        gsap.timeline({ delay: i * 0.06 })
          .set(dEl, { x: d.sx, y: d.sy, opacity: 1, scale: 0.5, rotation: gsap.utils.random(-25, 25) })
          .to(dEl, { x: (d.sx + d.ex) / 2, y: peakY, scale: 1, duration: 0.28, ease: "power2.out" })
          .to(dEl, { x: d.ex, y: d.ey, duration: 0.34, ease: "power1.in" })
          .to(dEl, { opacity: 0, duration: 0.18 }, "-=0.18");
      });
    };

     if (reduce) {
      gsap.set([el("#waterY"), el("#waterY2")], { y: -14 });
      gsap.set(el("#boxrot"), { rotation: 0 });
      gsap.set([el("#waterRotG"), el("#waterRotG2")], { rotation: 0, svgOrigin: "32 32" });
      gsap.set(el("#name"), { opacity: 1 });
      gsap.to(el(".overlay"), { opacity: 0, duration: 0.5, delay: 0.5, onComplete: finish });
      return;
    }

    gsap.to([el("#surfA"), el("#surfA2")], { x: -24, duration: 1.1, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(el("#surfB"), { x: 24, duration: 0.85, repeat: -1, yoyo: true, ease: "sine.inOut" });

    const tl = gsap.timeline({ onComplete: finish });
    tl.fromTo([el("#waterY"), el("#waterY2")], { y: 70 }, { y: -14, duration: 1.9, ease: "power1.inOut" }, 0);
    tl.to(el("#name"), { opacity: 1, y: 0, duration: 0.5 }, 1.0);
    tl.to(el("#boxrot"), { rotation: 0, duration: 0.6, ease: "back.out(1.7)" }, 1.95);
    tl.to(el("#waterRotG"), { rotation: 0, duration: 0.6, ease: "back.out(1.7)", svgOrigin: "32 32" }, 1.95);
    tl.to(el("#waterRotG2"), { rotation: 0, duration: 0.6, ease: "back.out(1.7)", svgOrigin: "32 32" }, 1.95);
    tl.call(launch, undefined, 2.1);
    tl.to(el(".overlay"), { opacity: 0, duration: 0.55, ease: "power1.inOut" }, 3.0);
  }

  static styles = css`
    /* pointer-events: none so this purely decorative intro overlay never
       swallows a real click meant for the page underneath (e.g. a founder
       clicking "Sign in" before the ~3.5s animation finishes was landing
       on this overlay instead of the button, and the click just did
       nothing). Nothing inside the loader itself needs to be clickable. */
    :host { position: fixed; inset: 0; z-index: 9999; pointer-events: none; }
    .overlay {
      position: fixed; inset: 0; background: var(--bg, #ECEAE3);
      display: flex; align-items: center; justify-content: center;
    }
    .wrap { display: flex; flex-direction: column; align-items: center; gap: 20px; position: relative; }
    .stage { width: 104px; height: 104px; position: relative; display: flex; align-items: center; justify-content: center; }
    .boxrot { width: 100%; height: 100%; position: relative; transform: rotate(-12deg); }
    svg.logo { width: 100%; height: 100%; overflow: visible; display: block; }
    .drop { position: absolute; top: 50%; left: 50%; width: 9px; height: 13px; opacity: 0; pointer-events: none; }
    .name { font-family: var(--font-display, serif); font-size: 22px; color: var(--forest, #2D4A3E); opacity: 0; text-align: center; width: 100%; }
  `;

  render(): TemplateResult {
    return html`
      <div class="overlay">
        <div class="wrap">
          <div class="stage">
            <div class="boxrot" id="boxrot">
              <svg class="logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <clipPath id="boxClip"><rect x="2" y="2" width="60" height="60" rx="16" /></clipPath>
                  <clipPath id="fClip"><path d="M25 17 h18 v6 h-12 v7 h10 v6 h-10 v12 h-6 z" /></clipPath>
                </defs>

                <rect x="2" y="2" width="60" height="60" rx="16" fill="none" stroke="var(--forest, #2D4A3E)" stroke-width="3" />
                <path d="M25 17 h18 v6 h-12 v7 h10 v6 h-10 v12 h-6 z" fill="var(--sage-soft, #DDE7E0)" opacity="0.5" />

                <g clip-path="url(#boxClip)">
                  <g id="waterRotG" transform="rotate(12 32 32)">
                    <g id="waterY">
                      <rect x="-40" y="20" width="150" height="120" fill="var(--forest, #2D4A3E)" />
                      <path id="surfA" d="M-40 20 q12 -5 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 v8 h-168 z" fill="var(--forest, #2D4A3E)" />
                      <path id="surfB" d="M-40 21 q12 5 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 v8 h-168 z" fill="var(--forest-deep, #1F3329)" opacity="0.4" />
                    </g>
                  </g>
                </g>

                <g clip-path="url(#fClip)">
                  <g clip-path="url(#boxClip)">
                    <g id="waterRotG2" transform="rotate(12 32 32)">
                      <g id="waterY2">
                        <rect x="-40" y="20" width="150" height="120" fill="var(--surface, #FAFAF7)" />
                        <path id="surfA2" d="M-40 20 q12 -5 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 v8 h-168 z" fill="var(--surface, #FAFAF7)" />
                      </g>
                    </g>
                  </g>
                </g>
              </svg>

              <svg class="drop" id="drop" viewBox="0 0 11 15" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.5 0 C5.5 0 0 7.5 0 10.5 a5.5 5.5 0 0 0 11 0 C11 7.5 5.5 0 5.5 0 z" fill="var(--sage, #8AAF9A)" />
              </svg>
            </div>
          </div>
          <div class="name" id="name">Foundr</div>
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