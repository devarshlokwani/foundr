import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

/**
 * <foundr-page-actions>
 * The single "Actions" entry point for things a founder does across pages
 * — adding an entry, migrating old data in. Lives in the topbar's actions
 * slot on Dashboard and All Entries only (Margins is for reading reports,
 * Settings has its own controls, so neither page mounts this) — one
 * consistent control in one consistent spot, instead of separate buttons
 * that appear/disappear differently as you move between pages.
 *
 * Doesn't own any modal itself — clicking an item dispatches a bubbling,
 * composed event (`open-add-entry` / `open-migrate`) so whichever page
 * mounted this decides what opens, same click-outside-to-close pattern as
 * foundr-profile-menu.
 */
@customElement("foundr-page-actions")
export class FoundrPageActions extends LitElement {
  @state() private open = false;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this._onDocClick);
  }

  disconnectedCallback(): void {
    document.removeEventListener("click", this._onDocClick);
    super.disconnectedCallback();
  }

  private _onDocClick = (e: MouseEvent): void => {
    if (!this.contains(e.target as Node)) this.open = false;
  };

  private _toggle(e: Event): void {
    e.stopPropagation();
    this.open = !this.open;
  }

  private _emit(name: string): void {
    this.open = false;
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  static styles = css`
    :host { display: block; position: relative; font-family: var(--font-body, "Inter", sans-serif); }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-plus:before { content: "\\eb0b"; }
    .ti-chevron-down:before { content: "\\ea5f"; }
    .ti-pencil-plus:before { content: "\\f1ec"; }
    .ti-upload:before { content: "\\eb47"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .trigger {
      display: flex; align-items: center; gap: 6px; padding: 9px 16px 9px 14px;
      background: var(--forest, #2D4A3E); color: #fff; border-radius: var(--radius-pill, 999px);
      font-size: 14px; font-weight: 500; transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .trigger:hover { background: var(--forest-deep, #1F3329); transform: translate(-2px, -2px); box-shadow: 2px 2px 0 var(--sage, #8AAF9A); }
    .trigger:active { transform: translate(0, 0); box-shadow: none; }
    .trigger .ti-chevron-down { font-size: 13px; transition: transform 0.18s ease; }
    .trigger.is-open .ti-chevron-down { transform: rotate(180deg); }

    .menu {
      position: absolute; top: calc(100% + 10px); right: 0; width: 230px;
      background: var(--surface, #FAFAF7); border: 0.5px solid var(--line, #E2DFD7);
      border-radius: var(--radius-card, 18px); box-shadow: 0 20px 50px -16px rgba(31,51,41,0.35);
      padding: 8px; z-index: 50;
    }
    .menu-item {
      width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
      background: transparent; padding: 11px 10px; border-radius: 12px; font-size: 14px;
      color: var(--ink, #1C1C1C); transition: background 0.15s ease;
    }
    .menu-item:hover { background: var(--surface-alt, #F2EFE8); }
    .menu-item .icon {
      width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0; display: grid; place-items: center;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); font-size: 15px;
    }
    .menu-item .text .t { font-weight: 500; }
    .menu-item .text .d { font-size: 11.5px; color: var(--ink-soft, #6B6B66); margin-top: 1px; }
  `;

  render(): TemplateResult {
    return html`
      <button class="trigger ${this.open ? "is-open" : ""}" @click=${this._toggle}>
        <i class="ti ti-plus" aria-hidden="true"></i>Actions
        <i class="ti ti-chevron-down" aria-hidden="true"></i>
      </button>
      ${this.open
        ? html`
            <div class="menu">
              <button class="menu-item" @click=${() => this._emit("open-add-entry")}>
                <span class="icon"><i class="ti ti-pencil-plus" aria-hidden="true"></i></span>
                <span class="text">
                  <div class="t">Add entry</div>
                  <div class="d">Log an expense, revenue, or more</div>
                </span>
              </button>
              <button class="menu-item" @click=${() => this._emit("open-migrate")}>
                <span class="icon"><i class="ti ti-upload" aria-hidden="true"></i></span>
                <span class="text">
                  <div class="t">Migrate</div>
                  <div class="d">Bring in data from elsewhere</div>
                </span>
              </button>
            </div>
          `
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-page-actions": FoundrPageActions;
  }
}
