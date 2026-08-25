import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { signOut } from "../../features/auth/auth.service";

export type TopbarPage = "dashboard" | "transactions" | "margins" | "settings" | "business";

/**
 * <foundr-topbar active="dashboard" businessName="My Startup">
 * Shared nav bar for every signed-in app page (dashboard, transactions,
 * margins, settings). One place to keep the four pages' nav links in
 * sync. Before this, each page hand-rolled its own topbar and they'd
 * quietly drifted out of sync with each other.
 *
 * `businessName`, when set, shows the active business next to the brand
 * mark, linking to /business: the switcher for founders running more
 * than one startup on Foundr.
 *
 * Page-specific actions (e.g. the dashboard's "Add entry" button) go in
 * the "actions" slot, rendered before the sign-out button.
 */
@customElement("foundr-topbar")
export class FoundrTopbar extends LitElement {
  @property({ type: String }) active: TopbarPage = "dashboard";
  @property({ type: String }) businessName = "";

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
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-building-store:before { content: "\\ea4e"; }
    .ti-settings:before { content: "\\eb20"; }
    .ti-logout:before { content: "\\eba8"; }
    .brand-group { display: flex; align-items: center; gap: 14px; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 19px; text-decoration: none; color: var(--ink, #1C1C1C); }
    .brand .mark {
      width: 30px; height: 30px; border-radius: 9px; background: var(--forest, #2D4A3E);
      color: #fff; display: grid; place-items: center; font-family: var(--font-display, serif); font-size: 16px;
    }
    .business-pill {
      display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500;
      color: var(--ink-soft, #6B6B66); text-decoration: none; padding: 6px 12px;
      background: var(--surface-alt, #F2EFE8); border-radius: var(--radius-pill, 999px);
      transition: background 0.15s ease, color 0.15s ease;
    }
    .business-pill:hover { background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); }
    .topbar-right { display: flex; align-items: center; gap: 18px; }
    /* Same sliding-underline hover as the landing page's nav: a bar that
       scales in from the left on hover (and stays fully shown, no
       animation needed since it's already scaleX(1), for whichever page
       is active). */
    .nav-link { font-size: 14px; color: var(--ink-soft, #6B6B66); text-decoration: none; position: relative; transition: color 0.2s ease; }
    .nav-link::after {
      content: ""; position: absolute; left: 0; bottom: -4px; height: 2px; width: 100%;
      background: var(--forest, #2D4A3E); border-radius: 2px;
      transform: scaleX(0); transform-origin: right; transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
    }
    .nav-link:hover { color: var(--ink, #1C1C1C); }
    .nav-link:hover::after { transform: scaleX(1); transform-origin: left; }
    .nav-link.active { color: var(--forest, #2D4A3E); font-weight: 500; }
    .nav-link.active::after { transform: scaleX(1); }
    button { font-family: inherit; cursor: pointer; border: none; transition: background 0.2s ease; }
    .icon-link {
      display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--radius-pill, 999px);
      color: var(--ink-soft, #6B6B66); text-decoration: none; font-size: 18px; background: transparent;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .icon-link:hover { background: rgba(45,74,62,0.07); color: var(--ink, #1C1C1C); }
    .icon-link.active { color: var(--forest, #2D4A3E); background: var(--sage-soft, #DDE7E0); }
    /* Settings gear gives a little spin on hover and eases back on its
       own once the pointer leaves, since :hover toggling off just runs
       the same transition in reverse. */
    .icon-link .spin-icon { display: inline-block; transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .icon-link:hover .spin-icon { transform: rotate(75deg); }
    @media (prefers-reduced-motion: reduce) {
      .icon-link .spin-icon { transition: none; }
    }
    .signout {
      background: transparent; color: var(--ink-soft, #6B6B66);
    }

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
        <div class="brand-group">
          <a class="brand" href="/dashboard"><span class="mark">F</span>Foundr</a>
          ${this.businessName
            ? html`<a class="business-pill" href="/business"><i class="ti ti-building-store" aria-hidden="true"></i>${this.businessName}</a>`
            : ""}
        </div>
        <div class="topbar-right">
          ${this._link("dashboard", "/dashboard", "Dashboard")}
          ${this._link("transactions", "/transactions", "All entries")}
          ${this._link("margins", "/margins", "Margins")}
          <slot name="actions"></slot>
          <a class="icon-link ${this.active === "settings" ? "active" : ""}" href="/settings" aria-label="Settings" title="Settings">
            <i class="ti ti-settings spin-icon" aria-hidden="true"></i>
          </a>
          <button class="icon-link signout" @click=${this._signOut} aria-label="Sign out" title="Sign out">
            <i class="ti ti-logout" aria-hidden="true"></i>
          </button>
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
