import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { loadSettings } from "../../shared/lib/settings";
import { fetchBusinesses, createBusiness, setActiveBusiness, deleteBusiness, deleteBlockedReason } from "../../shared/lib/business";
import { checkSessionFreshness } from "../../shared/lib/session-guard";
import { startTour } from "../../shared/lib/tour";
import type { Business } from "../../shared/lib/types";
import "../../shared/components/foundr-mini-loader";
import "../../shared/components/foundr-profile-menu";
import "../../shared/components/foundr-tour-overlay";

/**
 * <foundr-business>
 * The business switcher — a folder grid of everything a founder tracks on
 * Foundr. Every side hustle gets its own card here; clicking one makes it
 * active and heads to the dashboard, keeping that startup's numbers fully
 * separate from any other. Reachable at /business.
 *
 * This page sits a level above any one startup, so it deliberately skips
 * the full app nav (Dashboard / All entries / Margins / Settings) — that
 * only makes sense once you're inside a specific business. Just the brand
 * mark and an account menu here instead.
 */
@customElement("foundr-business")
export class FoundrBusiness extends LitElement {
  @state() private loading = true;
  @state() private businesses: Business[] = [];
  @state() private activeBusinessId = "";
  @state() private switchingId: string | null = null;
  @state() private addingOpen = false;
  @state() private newName = "";
  @state() private saving = false;
  @state() private error = "";
  @state() private editMode = false;
  @state() private deletingId: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this._init();
  }

  private async _init(): Promise<void> {
    const clerk = await getClerk();
    if (!clerk || !clerk.user) {
      window.location.href = "/sign-in";
      return;
    }
    if (!(await checkSessionFreshness(clerk))) {
      window.location.href = "/sign-in";
      return;
    }

    const settings = await loadSettings();
    if (settings && !settings.onboarded) {
      window.location.href = "/dashboard";
      return;
    }
    this.activeBusinessId = settings?.activeBusinessId ?? "";
    try {
      this.businesses = await fetchBusinesses();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your startups.";
    } finally {
      this.loading = false;
    }
  }

  private async _select(b: Business): Promise<void> {
    this.switchingId = b._id;
    try {
      await setActiveBusiness(b._id);
      window.location.href = "/dashboard";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't switch startups.";
      this.switchingId = null;
    }
  }

  /** Empty businesses only — the backend refuses if it still has tracked entries. */
  private async _deleteFolder(b: Business): Promise<void> {
    if (deleteBlockedReason(this.businesses, b._id, this.activeBusinessId)) return;
    if (!confirm(`Delete "${b.name}"? This can't be undone.`)) return;

    this.deletingId = b._id;
    this.error = "";
    try {
      await deleteBusiness(b._id);
      this.businesses = this.businesses.filter((x) => x._id !== b._id);
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't delete that startup.";
    } finally {
      this.deletingId = null;
    }
  }

  private async _addStartup(e: Event): Promise<void> {
    e.preventDefault();
    const name = this.newName.trim();
    if (!name) {
      this.error = "Give your startup a name.";
      return;
    }
    this.saving = true;
    this.error = "";
    try {
      const business = await createBusiness(name);
      await setActiveBusiness(business._id);
      window.location.href = "/dashboard";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't create that startup.";
      this.saving = false;
    }
  }

  private _date(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  static styles = css`
    :host {
      display: block; min-height: 100vh; background: var(--bg, #ECEAE3);
      color: var(--ink, #1C1C1C); font-family: var(--font-body, "Inter", sans-serif);
      -webkit-font-smoothing: antialiased;
    }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-building-store:before { content: "\\ea4e"; }
    .ti-plus:before { content: "\\eb0b"; }
    .ti-compass:before { content: "\\ea79"; }
    .ti-pencil:before { content: "\\eb04"; }
    .ti-check:before { content: "\\ea5e"; }
    .ti-trash:before { content: "\\eb41"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px; border-bottom: 0.5px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7);
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 19px; text-decoration: none; color: var(--ink, #1C1C1C); }
    .brand .mark {
      width: 30px; height: 30px; border-radius: 9px; background: var(--forest, #2D4A3E);
      color: #fff; display: grid; place-items: center; font-family: var(--font-display, serif); font-size: 16px;
    }

    .page { max-width: 1000px; margin: 0 auto; padding: 32px 28px; }
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 28px; }

    .edit-toggle {
      width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; margin-top: 2px;
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7); color: var(--ink-soft, #6B6B66);
      display: grid; place-items: center; font-size: 17px; transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
    }
    .edit-toggle:hover { background: var(--surface-alt, #F2EFE8); color: var(--ink, #1C1C1C); }
    .edit-toggle.active { background: var(--forest, #2D4A3E); border-color: var(--forest, #2D4A3E); color: #fff; }

    .page-area { position: relative; min-height: 320px; }
    .loader-overlay {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: var(--bg, #ECEAE3); z-index: 5;
    }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
    .folder {
      position: relative; background: var(--surface, #FAFAF7); border: 0.5px solid var(--line, #E2DFD7);
      border-radius: var(--radius-card, 24px); transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.15s ease;
    }
    .folder:hover { transform: translate(-4px, -4px); box-shadow: 4px 4px 0 var(--sage, #8AAF9A); border-color: var(--forest, #2D4A3E); }
    .folder.active { border-color: var(--forest, #2D4A3E); }
    .folder.editing:hover { transform: none; box-shadow: none; }
    .folder-select {
      width: 100%; background: transparent; border: none; padding: 22px; text-align: left;
      display: flex; flex-direction: column; gap: 14px;
    }
    .folder-select:disabled { opacity: 0.6; cursor: not-allowed; }
    .folder-icon {
      width: 44px; height: 44px; border-radius: 12px; background: var(--sage-soft, #DDE7E0);
      color: var(--forest, #2D4A3E); display: grid; place-items: center; font-size: 20px;
    }
    .folder-name { font-size: 16px; font-weight: 600; }
    .folder-meta { font-size: 12.5px; color: var(--ink-soft, #6B6B66); }
    .folder-badge {
      font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      background: var(--forest, #2D4A3E); color: #fff; padding: 3px 9px; border-radius: 999px; width: fit-content;
    }
    .folder-delete {
      position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%;
      background: var(--surface, #FAFAF7); border: 1px solid var(--danger-border, #F0C5C3); color: var(--danger, #A8302B);
      display: grid; place-items: center; font-size: 14px; transition: background 0.15s ease;
    }
    .folder-delete:hover:not(:disabled) { background: var(--danger-bg, #FBEAE9); }
    .folder-delete:disabled { opacity: 0.4; cursor: not-allowed; }

    .add-folder {
      background: transparent; border: 1.5px dashed var(--line, #E2DFD7);
      border-radius: var(--radius-card, 24px); padding: 22px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
      color: var(--ink-soft, #6B6B66); min-height: 148px; transition: border-color 0.15s ease, color 0.15s ease;
    }
    .add-folder:hover { border-color: var(--forest, #2D4A3E); color: var(--forest, #2D4A3E); }

    .tour-section { margin-top: 16px; }
    .tour-card { width: 100%; min-height: 84px; flex-direction: row; gap: 12px; }
    .tour-card i { font-size: 20px; }
    .tour-card span { font-size: 14.5px; font-weight: 500; }

    .add-form {
      background: var(--surface, #FAFAF7); border: 0.5px solid var(--line, #E2DFD7);
      border-radius: var(--radius-card, 24px); padding: 22px; display: flex; flex-direction: column; gap: 12px;
    }
    .add-form input {
      width: 100%; box-sizing: border-box; padding: 11px 14px; font-size: 14.5px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
    }
    .add-form input:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .form-actions { display: flex; gap: 8px; }
    .btn-save-form {
      background: var(--forest, #2D4A3E); color: #fff; padding: 10px 18px;
      border-radius: var(--radius-pill, 999px); font-size: 13.5px; font-weight: 500;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .btn-save-form:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    .btn-save-form:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-cancel { background: transparent; border: 1px solid var(--line, #E2DFD7); color: var(--ink, #1C1C1C); padding: 10px 18px; border-radius: var(--radius-pill, 999px); font-size: 13.5px; }

    .error-box {
      background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border: 1px solid var(--danger-border, #F0C5C3);
      border-radius: 12px; padding: 12px 16px; font-size: 14px; margin-bottom: 16px;
    }
  `;

  private _renderFolder(b: Business): TemplateResult {
    const isActive = b._id === this.activeBusinessId;
    const blocked = deleteBlockedReason(this.businesses, b._id, this.activeBusinessId);
    return html`
      <div class="folder ${isActive ? "active" : ""} ${this.editMode ? "editing" : ""}">
        <button
          class="folder-select"
          ?disabled=${this.switchingId === b._id || this.editMode}
          @click=${() => this._select(b)}
        >
          <div class="folder-icon"><i class="ti ti-building-store" aria-hidden="true"></i></div>
          <div>
            <div class="folder-name">${b.name}</div>
            <div class="folder-meta">Created ${this._date(b.createdAt)}</div>
          </div>
          ${isActive ? html`<span class="folder-badge">Active</span>` : ""}
        </button>
        ${this.editMode
          ? html`
              <button
                class="folder-delete"
                title=${blocked || "Delete"}
                ?disabled=${Boolean(blocked) || this.deletingId === b._id}
                @click=${() => this._deleteFolder(b)}
              >
                <i class="ti ti-trash" aria-hidden="true"></i>
              </button>
            `
          : ""}
      </div>
    `;
  }

  private _renderAddForm(): TemplateResult {
    return html`
      <form class="add-form" @submit=${this._addStartup}>
        <input
          type="text"
          placeholder="e.g. My Second Startup"
          .value=${this.newName}
          @input=${(e: Event) => { this.newName = (e.target as HTMLInputElement).value; }}
          ?disabled=${this.saving}
        />
        <div class="form-actions">
          <button type="submit" class="btn-save-form" ?disabled=${this.saving}>${this.saving ? "Creating…" : "Create startup"}</button>
          <button type="button" class="btn-cancel" @click=${() => { this.addingOpen = false; this.newName = ""; }} ?disabled=${this.saving}>Cancel</button>
        </div>
      </form>
    `;
  }

  render(): TemplateResult {
    return html`
      <div class="header">
        <span class="brand"><span class="mark">F</span>Foundr</span>
        <foundr-profile-menu></foundr-profile-menu>
      </div>
      <div class="page">
        <div class="page-head">
          <div>
            <h1>Your startups</h1>
            <p class="sub">Every side hustle you track on Foundr — each with its own fully separate dashboard.</p>
          </div>
          ${!this.loading && this.businesses.length > 0
            ? html`
                <button
                  class="edit-toggle ${this.editMode ? "active" : ""}"
                  @click=${() => { this.editMode = !this.editMode; }}
                  title=${this.editMode ? "Done" : "Manage startups"}
                  aria-label=${this.editMode ? "Done managing startups" : "Manage startups"}
                >
                  <i class="ti ${this.editMode ? "ti-check" : "ti-pencil"}" aria-hidden="true"></i>
                </button>
              `
            : ""}
        </div>

        ${this.error ? html`<div class="error-box">${this.error}</div>` : ""}

        <div class="page-area">
          ${!this.loading
            ? html`
                <div class="grid">
                  ${this.businesses.map((b) => this._renderFolder(b))}
                  ${this.addingOpen
                    ? this._renderAddForm()
                    : html`
                        <button class="add-folder" @click=${() => { this.addingOpen = true; }}>
                          <i class="ti ti-plus" aria-hidden="true"></i>
                          <span>Add a startup</span>
                        </button>
                      `}
                </div>
                <div class="tour-section">
                  <button class="add-folder tour-card" @click=${() => startTour()}>
                    <i class="ti ti-compass" aria-hidden="true"></i>
                    <span>Start your virtual tour</span>
                  </button>
                </div>
              `
            : ""}
          ${this.loading
            ? html`<div class="loader-overlay"><foundr-mini-loader></foundr-mini-loader></div>`
            : ""}
        </div>
      </div>
      <foundr-tour-overlay></foundr-tour-overlay>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-business": FoundrBusiness;
  }
}
