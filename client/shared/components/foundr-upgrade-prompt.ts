import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * <foundr-upgrade-prompt open reason="...">
 * Shown when a founder runs into a plan limit.
 *
 * Deliberately not styled as an error. Hitting a limit means the product
 * worked and they used it, so the tone is "here's what's next" rather than
 * "something went wrong": no red, no warning triangle, and the message
 * always says when the allowance comes back, so staying on the free plan
 * reads as a real option rather than a dead end.
 *
 * The copy comes from the server, which owns the actual numbers, so this
 * component never has to guess what the limit was.
 */
@customElement("foundr-upgrade-prompt")
export class FoundrUpgradePrompt extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  /** Server-supplied explanation of which limit was reached. */
  @property({ type: String }) reason = "";
  @property({ type: String }) heading = "You've hit your monthly limit";

  private _close(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  private _upgrade(): void {
    this.dispatchEvent(new CustomEvent("upgrade", { bubbles: true, composed: true }));
  }

  static styles = css`
    :host { display: none; }
    :host([open]) { display: block; }

    .overlay {
      position: fixed; inset: 0; background: var(--overlay, rgba(28,28,28,0.5));
      display: flex; align-items: center; justify-content: center; z-index: 300; padding: 20px;
    }
    .modal {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      padding: 30px 28px 26px; max-width: 420px; width: 100%;
      box-shadow: var(--shadow-soft, 0 18px 50px -20px rgba(31,51,41,0.25));
      font-family: var(--font-body, "Inter", sans-serif); color: var(--ink, #1C1C1C);
    }
    .ti {
      font-family: "tabler-icons" !important; font-style: normal; font-weight: normal;
      line-height: 1; -webkit-font-smoothing: antialiased;
    }
    .ti-sparkles:before { content: "\\f6d7"; }
    .ti-arrow-right:before { content: "\\ea1f"; }

    .badge {
      width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E);
      font-size: 20px; margin-bottom: 16px;
    }
    h3 {
      font-family: var(--font-display, Georgia, serif); font-weight: 400;
      font-size: 23px; margin: 0 0 9px; line-height: 1.2;
    }
    p { font-size: 14.5px; line-height: 1.6; color: var(--ink-soft, #6B6B66); margin: 0 0 22px; }

    .actions { display: flex; gap: 10px; align-items: center; }
    button { font-family: inherit; cursor: pointer; border: none; }
    .btn-upgrade {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      background: var(--forest, #2D4A3E); color: #fff; font-size: 14.5px; font-weight: 500;
      padding: 13px 20px; border-radius: var(--radius-input, 14px);
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .btn-upgrade:hover { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    .btn-upgrade:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .btn-later {
      background: transparent; color: var(--ink-soft, #6B6B66); font-size: 14px;
      padding: 13px 16px; border-radius: var(--radius-input, 14px);
      transition: color 0.15s ease, background 0.15s ease;
    }
    .btn-later:hover { color: var(--ink, #1C1C1C); background: var(--surface-alt, #F2EFE8); }
  `;

  render(): TemplateResult {
    if (!this.open) return html``;
    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal" role="dialog" aria-modal="true">
          <div class="badge"><i class="ti ti-sparkles" aria-hidden="true"></i></div>
          <h3>${this.heading}</h3>
          <p>${this.reason}</p>
          <div class="actions">
            <button class="btn-upgrade" @click=${this._upgrade}>
              See Premium<i class="ti ti-arrow-right" aria-hidden="true"></i>
            </button>
            <button class="btn-later" @click=${this._close}>Not now</button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-upgrade-prompt": FoundrUpgradePrompt;
  }
}
