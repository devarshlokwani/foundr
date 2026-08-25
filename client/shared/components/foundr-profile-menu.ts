import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk, signOut } from "../../features/auth/auth.service";
import { saveTheme } from "../lib/settings";
import { THEME_OPTIONS, getStoredTheme, type ThemeCode } from "../lib/theme";
import { startTour } from "../lib/tour";
import "./foundr-coming-soon-modal";

type View = "main" | "theme";

/**
 * <foundr-profile-menu>
 * A small account control: avatar button that opens a popover with the
 * founder's name, email, and quick links into the account-level things
 * that live elsewhere in the app (plan, security, settings, theme, the
 * tour) plus sign-out. Used wherever a page deliberately doesn't show the
 * full app nav (e.g. the business switcher, which sits a level above any
 * one startup's dashboard); these still need to be reachable from there.
 *
 * Every item here routes into a real page/feature rather than duplicating
 * its logic: "Settings" lands on Settings → General, "Account security"
 * on Settings → Security, "Upgrade plan" opens the same coming-soon
 * modal Settings → General's own Upgrade button opens (there's no
 * billing/plan system yet), "Take the tour" calls the same startTour()
 * the Settings → Startups launcher uses. There's no "Manage users" here
 * the way a team-based SaaS profile menu would have one; Foundr is
 * single-user per business, so it's left out rather than
 * added just to pad the list out.
 *
 * The avatar only shows Clerk's `imageUrl` when `hasImage` is true; that
 * field is real (a Google photo if signed in with "Continue with Google",
 * or an uploaded one) only when the founder actually has one; otherwise
 * Clerk returns its own generic placeholder graphic, which we replace
 * with a branded initial instead of showing an unfamiliar stock icon.
 */
@customElement("foundr-profile-menu")
export class FoundrProfileMenu extends LitElement {
  @state() private open = false;
  @state() private view: View = "main";
  @state() private name = "";
  @state() private email = "";
  @state() private avatarUrl = "";
  @state() private theme: ThemeCode = getStoredTheme();
  @state() private comingSoonOpen = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
    document.addEventListener("click", this._onDocClick);
  }

  disconnectedCallback(): void {
    document.removeEventListener("click", this._onDocClick);
    super.disconnectedCallback();
  }

  private _onDocClick = (e: MouseEvent): void => {
    if (!this.contains(e.target as Node)) {
      this.open = false;
      this.view = "main";
    }
  };

  private async _load(): Promise<void> {
    const clerk = await getClerk();
    const user = clerk?.user;
    if (!user) return;
    this.name = user.fullName || user.firstName || "Founder";
    this.email = user.primaryEmailAddress?.emailAddress ?? "";
    this.avatarUrl = user.hasImage ? user.imageUrl : "";
  }

  private _toggle(e: Event): void {
    e.stopPropagation();
    this.open = !this.open;
    this.view = "main";
  }

  private async _onThemeChange(next: ThemeCode): Promise<void> {
    if (next === this.theme) return;
    this.theme = next;
    try {
      await saveTheme(next);
    } catch {
      // Theme still applies locally even if the save fails silently here;
      // it'll reconcile with the backend next time settings load.
    }
  }

  private _takeTour(e: Event): void {
    e.stopPropagation();
    this.open = false;
    startTour();
  }

  private async _signOut(): Promise<void> {
    await signOut();
    window.location.href = "/";
  }

  private get _initial(): string {
    return (this.name || "F").charAt(0).toUpperCase();
  }

  static styles = css`
    /* Without this, width: 100% + padding on .menu-item (below) adds the
       padding on top of the 100%, so the hovered row's background was
       rendering wider than the card and poking out past its rounded
       right edge instead of staying inset with it. */
    :host, :host * { box-sizing: border-box; }
    :host {
      display: block;
      position: relative;
      font-family: var(--font-body, "Inter", sans-serif);
    }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-logout:before { content: "\\eba8"; }
    .ti-palette:before { content: "\\eb01"; }
    .ti-chevron-right:before { content: "\\ea61"; }
    .ti-chevron-left:before { content: "\\ea60"; }
    .ti-crown:before { content: "\\ed12"; }
    .ti-shield-check:before { content: "\\eb22"; }
    .ti-settings:before { content: "\\eb20"; }
    .ti-compass:before { content: "\\ea79"; }
    a, button { font-family: inherit; cursor: pointer; border: none; text-decoration: none; }

    .avatar-btn {
      width: 38px; height: 38px; border-radius: 50%; overflow: hidden; padding: 0;
      background: var(--forest, #2D4A3E); display: grid; place-items: center;
      border: 2px solid transparent; transition: border-color 0.15s ease;
    }
    .avatar-btn:hover { border-color: var(--sage, #8AAF9A); }
    .avatar-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .avatar-fallback { color: #fff; font-size: 15px; font-weight: 600; font-family: var(--font-display, serif); }

    .menu {
      position: absolute; top: calc(100% + 10px); right: 0; width: 290px;
      background: var(--surface, #FAFAF7); border: 0.5px solid var(--line, #E2DFD7);
      border-radius: var(--radius-card, 20px); box-shadow: 0 20px 50px -16px rgba(31,51,41,0.35);
      padding: 8px; z-index: 50;
    }
    .menu-head { display: flex; align-items: flex-start; gap: 12px; padding: 12px 10px 10px; }
    .menu-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .menu-avatar-fallback {
      width: 44px; height: 44px; border-radius: 50%; background: var(--forest, #2D4A3E); color: #fff;
      display: grid; place-items: center; font-size: 18px; font-weight: 600; font-family: var(--font-display, serif);
      flex-shrink: 0;
    }
    .menu-identity { flex: 1; min-width: 0; }
    .menu-name { font-size: 14.5px; font-weight: 600; color: var(--ink, #1C1C1C); }
    .menu-email { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-top: 1px; word-break: break-all; }
    .edit-btn {
      flex-shrink: 0; font-size: 11px; font-weight: 500; color: var(--forest, #2D4A3E);
      background: var(--sage-soft, #DDE7E0); padding: 5px 10px; border-radius: var(--radius-pill, 999px);
      transition: background 0.15s ease;
    }
    .edit-btn:hover { background: var(--sage, #8AAF9A); color: #fff; }

    .menu-sep { height: 0.5px; background: var(--line, #E2DFD7); margin: 4px 6px; }
    .menu-item {
      width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
      background: transparent; padding: 10px; border-radius: 12px; font-size: 14px;
      color: var(--ink, #1C1C1C); transition: background 0.15s ease;
    }
    .menu-item:hover { background: var(--surface-alt, #F2EFE8); }
    .menu-item .ti { font-size: 16px; color: var(--ink-soft, #6B6B66); flex-shrink: 0; }
    .menu-item .chev { margin-left: auto; font-size: 14px; }
    .plan-badge {
      margin-left: auto; font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase;
      color: var(--forest, #2D4A3E); background: var(--sage-soft, #DDE7E0); padding: 3px 9px; border-radius: var(--radius-pill, 999px);
    }

    .logout-btn {
      width: 100%; margin-top: 4px; padding: 11px; border-radius: var(--radius-pill, 999px);
      background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); font-size: 14px; font-weight: 600;
      text-align: center; transition: background 0.15s ease;
    }
    .logout-btn:hover { background: var(--danger-border, #F0C5C3); }

    .theme-head { display: flex; align-items: center; gap: 8px; padding: 8px 6px 10px; }
    .back-btn {
      width: 26px; height: 26px; border-radius: 8px; background: transparent; display: grid; place-items: center;
      color: var(--ink-soft, #6B6B66); flex-shrink: 0;
    }
    .back-btn:hover { background: var(--surface-alt, #F2EFE8); }
    .theme-title { font-size: 13.5px; font-weight: 600; color: var(--ink, #1C1C1C); }
    .theme-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 4px 4px; }
    .theme-option {
      border: 2px solid var(--line, #E2DFD7); border-radius: 12px; padding: 6px; background: transparent;
      transition: border-color 0.15s ease;
    }
    .theme-option:hover { border-color: var(--sage, #8AAF9A); }
    .theme-option.active { border-color: var(--forest, #2D4A3E); }
    .theme-swatch { display: flex; height: 20px; border-radius: 6px; overflow: hidden; margin-bottom: 5px; }
    .theme-swatch span { flex: 1; }
    .theme-option .name { font-size: 10.5px; font-weight: 500; color: var(--ink, #1C1C1C); }
  `;

  private _renderMain(): TemplateResult {
    return html`
      <div class="menu-head">
        ${this.avatarUrl
          ? html`<img class="menu-avatar" src=${this.avatarUrl} alt="" />`
          : html`<span class="menu-avatar-fallback">${this._initial}</span>`}
        <div class="menu-identity">
          <div class="menu-name">${this.name}</div>
          <div class="menu-email">${this.email}</div>
        </div>
        <a class="edit-btn" href="/settings?section=profile" @click=${(e: Event) => e.stopPropagation()}>Edit profile</a>
      </div>
      <div class="menu-sep"></div>

      <button class="menu-item" @click=${(e: Event) => { e.stopPropagation(); this.open = false; this.comingSoonOpen = true; }}>
        <i class="ti ti-crown" aria-hidden="true"></i>Upgrade plan
        <span class="plan-badge">Free</span>
      </button>
      <a class="menu-item" href="/settings?section=security">
        <i class="ti ti-shield-check" aria-hidden="true"></i>Account security
      </a>
      <a class="menu-item" href="/settings">
        <i class="ti ti-settings" aria-hidden="true"></i>Settings
      </a>
      <button class="menu-item" @click=${(e: Event) => { e.stopPropagation(); this.view = "theme"; }}>
        <i class="ti ti-palette" aria-hidden="true"></i>Change theme
        <i class="ti ti-chevron-right chev" aria-hidden="true"></i>
      </button>
      <button class="menu-item" @click=${this._takeTour}>
        <i class="ti ti-compass" aria-hidden="true"></i>Take the tour
      </button>

      <div class="menu-sep"></div>
      <button class="logout-btn" @click=${this._signOut}>Log out</button>
    `;
  }

  private _renderTheme(): TemplateResult {
    return html`
      <div class="theme-head">
        <button class="back-btn" @click=${(e: Event) => { e.stopPropagation(); this.view = "main"; }} aria-label="Back">
          <i class="ti ti-chevron-left" aria-hidden="true"></i>
        </button>
        <span class="theme-title">Change theme</span>
      </div>
      <div class="theme-grid">
        ${THEME_OPTIONS.map(
          (t) => html`
            <button
              class="theme-option ${this.theme === t.code ? "active" : ""}"
              @click=${(e: Event) => { e.stopPropagation(); void this._onThemeChange(t.code); }}
            >
              <div class="theme-swatch">
                <span style="background:${t.swatch[0]}"></span>
                <span style="background:${t.swatch[1]}"></span>
                <span style="background:${t.swatch[2]}"></span>
              </div>
              <div class="name">${t.label}</div>
            </button>
          `
        )}
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <button class="avatar-btn" @click=${this._toggle} aria-label="Account menu">
        ${this.avatarUrl
          ? html`<img src=${this.avatarUrl} alt="" />`
          : html`<span class="avatar-fallback">${this._initial}</span>`}
      </button>
      ${this.open
        ? html`<div class="menu">${this.view === "main" ? this._renderMain() : this._renderTheme()}</div>`
        : ""}
      <foundr-coming-soon-modal
        ?open=${this.comingSoonOpen}
        @close=${() => { this.comingSoonOpen = false; }}
      ></foundr-coming-soon-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-profile-menu": FoundrProfileMenu;
  }
}
