import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { signOut } from "../../features/auth/auth.service";

export type TopbarPage = "dashboard" | "transactions" | "margins" | "settings";

/**
 * <foundr-topbar active="dashboard">
 * Shared nav bar for every signed-in app page (dashboard, transactions,
 * margins, settings). One place to keep the four pages' nav links in
 * sync — before this, each page hand-rolled its own topbar and they'd
 * quietly drifted out of sync with each other.
 *
 * Page-specific actions (e.g. the dashboard's "Add entry" button) go in
 * the "actions" slot, rendered before the sign-out button.
 */
@customElement("foundr-topbar")
export class FoundrTopbar extends LitElement {
  @property({ type: String }) active: TopbarPage = "dashboard";

  private async _signOut(): Promise<void> {
    await signOut();
    window.location.href = "/";
  }

  static styles = css`
    :host {
      display: block;
      font-family: var(--font-body, "Inter", sans-serif);
    }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px; border-bottom: 0.5px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7);
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 19px; text-decoration: none; color: var(--ink, #1C1C1C); }
    .brand .mark {
      width: 30px; height: 30px; border-radius: 9px; background: var(--forest, #2D4A3E);
      color: #fff; display: grid; place-items: center; font-family: var(--font-display, serif); font-size: 16px;
    }
    .topbar-right { display: flex; align-items: center; gap: 18px; }
    .nav-link { font-size: 14px; color: var(--ink-soft, #6B6B66); text-decoration: none; }
    .nav-link:hover { color: var(--ink, #1C1C1C); }
    .nav-link.active { color: var(--forest, #2D4A3E); font-weight: 500; }
    button { font-family: inherit; cursor: pointer; border: none; transition: background 0.2s ease; }
    .signout {
      background: transparent; color: var(--ink-soft, #6B6B66); font-size: 14px;
      padding: 8px 14px; border-radius: var(--radius-pill, 999px);
    }
    .signout:hover { background: rgba(45,74,62,0.07); color: var(--ink, #1C1C1C); }

    @media (max-width: 640px) {
      .topbar { padding: 14px 18px; }
      .topbar-right { gap: 10px; }
      .nav-link { display: none; }
    }
  `;

  private _link(page: TopbarPage, href: string, label: string): TemplateResult {
    return html`<a class="nav-link ${this.active === page ? "active" : ""}" href=${href}>${label}</a>`;
  }

  render(): TemplateResult {
    return html`
      <div class="topbar">
        <a class="brand" href="/dashboard"><span class="mark">F</span>Foundr</a>
        <div class="topbar-right">
          ${this._link("dashboard", "/dashboard", "Dashboard")}
          ${this._link("transactions", "/transactions", "All entries")}
          ${this._link("margins", "/margins", "Margins")}
          ${this._link("settings", "/settings", "Settings")}
          <slot name="actions"></slot>
          <button class="signout" @click=${this._signOut}>Sign out</button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-topbar": FoundrTopbar;
  }
}
