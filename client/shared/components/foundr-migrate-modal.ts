import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./foundr-import-panel";

/**
 * <foundr-migrate-modal ?open=${...} businessId=${...} @close=${...}>
 * Opens the migrate/import wizard (see foundr-import-panel.ts) as an
 * overlay instead of a page navigation. Triggered from
 * foundr-page-actions, it opens right over whichever page the founder was
 * on (Dashboard or All Entries) and closing it returns them exactly where
 * they were, rather than a round trip out to Settings and back.
 */
@customElement("foundr-migrate-modal")
export class FoundrMigrateModal extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: String }) businessId = "";

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
    .ti-x:before { content: "\\eb55"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .overlay {
      position: fixed; inset: 0; background: var(--overlay, rgba(28,28,28,0.5));
      display: flex; align-items: flex-start; justify-content: center; z-index: 300;
      padding: 40px 20px; overflow-y: auto;
    }
    .modal {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      width: 100%; max-width: 900px; padding: 24px; box-shadow: 0 24px 60px -20px rgba(31,51,41,0.4);
      font-family: var(--font-body, "Inter", sans-serif); color: var(--ink, #1C1C1C);
    }
    .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .modal-head h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; margin: 0; }
    .modal-head p { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 3px 0 0; }
    .close-x {
      background: none; border: none; cursor: pointer; font-size: 15px; color: var(--ink-soft, #6B6B66);
      width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0;
    }
    .close-x:hover { background: rgba(45,74,62,0.07); color: var(--ink, #1C1C1C); }
  `;

  render(): TemplateResult {
    if (!this.open) return html``;

    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal">
          <div class="modal-head">
            <div>
              <h2>Migrate your data</h2>
              <p>Bring in records from wherever you were tracking things before.</p>
            </div>
            <button class="close-x" @click=${this._close} aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>
          </div>
          <foundr-import-panel businessId=${this.businessId}></foundr-import-panel>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-migrate-modal": FoundrMigrateModal;
  }
}
