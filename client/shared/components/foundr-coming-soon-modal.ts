import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * <foundr-coming-soon-modal ?open=${...} @close=${...}>
 * Shared "not built yet" messaging. Defaults to the "paid plan" copy used
 * from both the app (Settings → General's Upgrade button) and the
 * marketing site (the landing page's paid-plan CTA). There's no billing
 * or plan-gating system yet, so this sets honest expectations instead of
 * pretending a purchase would work. Other not-yet-built affordances (like
 * the virtual tour launcher in Settings → Startups) override the text
 * props instead of duplicating this component.
 */
@customElement("foundr-coming-soon-modal")
export class FoundrComingSoonModal extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: String }) heading = "Coming soon";
  @property({ type: String }) body =
    "Paid features are currently in development and will be here soon! For now, dive into everything the free plan already offers.";
  @property({ type: String }) cta = "Continue with the free plan";

  private _close(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  static styles = css`
    :host { display: contents; }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-rocket:before { content: "\\ec45"; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay, rgba(28,28,28,0.5));
      display: flex; align-items: center; justify-content: center; z-index: 300; padding: 20px;
    }
    .modal {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      width: 100%; max-width: 400px; padding: 32px; box-shadow: 0 24px 60px -20px rgba(31,51,41,0.4);
      font-family: var(--font-body, "Inter", sans-serif); color: var(--ink, #1C1C1C); text-align: center;
    }
    .icon {
      width: 52px; height: 52px; border-radius: 14px; background: var(--sage-soft, #DDE7E0);
      color: var(--forest, #2D4A3E); display: grid; place-items: center; margin: 0 auto 18px; font-size: 22px;
    }
    h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 24px; margin: 0 0 8px; }
    p { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 24px; line-height: 1.55; }
    button { font-family: inherit; cursor: pointer; border: none; }
    .primary {
      width: 100%; background: var(--forest, #2D4A3E); color: #fff; padding: 14px;
      border-radius: var(--radius-input, 14px); font-size: 15px; font-weight: 500;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .primary:hover { background: var(--forest-deep, #1F3329); transform: translate(-5px, -5px); box-shadow: 5px 5px 0 var(--sage, #8AAF9A); }
    .primary:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
  `;

  render(): TemplateResult {
    if (!this.open) return html``;

    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal">
          <div class="icon"><i class="ti ti-rocket" aria-hidden="true"></i></div>
          <h2>${this.heading}</h2>
          <p>${this.body}</p>
          <button class="primary" @click=${this._close}>${this.cta}</button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-coming-soon-modal": FoundrComingSoonModal;
  }
}
