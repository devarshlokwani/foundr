import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk, signOut } from "../auth/auth.service";
import { loadSettings, saveCurrency } from "../../shared/lib/settings";
import { CURRENCIES, formatMoney, type CurrencyCode } from "../../shared/lib/format";

/**
 * <foundr-settings>
 * The founder's settings page. Currency is the first setting: a dropdown of
 * supported currencies, defaulting to their saved choice. Saving applies it
 * immediately and persists to the backend.
 */
@customElement("foundr-settings")
export class FoundrSettings extends LitElement {
  @state() private loading = true;
  @state() private currency: CurrencyCode = "AUD";
  @state() private saving = false;
  @state() private saved = false;
  @state() private error = "";

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
    const settings = await loadSettings();
    if (settings) this.currency = settings.currency as CurrencyCode;
    this.loading = false;
  }

  private async _onCurrencyChange(e: Event): Promise<void> {
    const next = (e.target as HTMLSelectElement).value as CurrencyCode;
    this.currency = next;
    this.saving = true;
    this.saved = false;
    this.error = "";
    try {
      await saveCurrency(next);
      this.saved = true;
      setTimeout(() => { this.saved = false; }, 2000);
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't save.";
    } finally {
      this.saving = false;
    }
  }

  private async _signOut(): Promise<void> {
    await signOut();
    window.location.href = "/";
  }

  static styles = css`
    :host {
      display: block; min-height: 100vh; background: var(--bg, #ECEAE3);
      color: var(--ink, #1C1C1C); font-family: var(--font-body, "Inter", sans-serif);
      -webkit-font-smoothing: antialiased;
    }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px; border-bottom: 0.5px solid var(--line, #E2DFD7); background: var(--surface, #FAFAF7);
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 19px; text-decoration: none; color: inherit; }
    .brand .mark { width: 30px; height: 30px; border-radius: 9px; background: var(--forest, #2D4A3E); color: #fff; display: grid; place-items: center; font-family: var(--font-display, serif); font-size: 16px; }
    .nav { display: flex; align-items: center; gap: 18px; }
    .nav a { font-size: 14px; color: var(--ink-soft, #6B6B66); text-decoration: none; }
    .nav a:hover { color: var(--ink, #1C1C1C); }
    button { font-family: inherit; cursor: pointer; border: none; }
    .signout { background: transparent; color: var(--ink-soft, #6B6B66); font-size: 14px; padding: 8px 14px; border-radius: var(--radius-pill, 999px); }
    .signout:hover { background: rgba(45,74,62,0.07); color: var(--ink, #1C1C1C); }

    .page { max-width: 620px; margin: 0 auto; padding: 32px 28px; }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 28px; }

    .card { background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px); padding: 24px; border: 0.5px solid var(--line, #E2DFD7); }
    .setting { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .setting-info .label { font-size: 15px; font-weight: 500; }
    .setting-info .desc { font-size: 13px; color: var(--ink-soft, #6B6B66); margin-top: 3px; }
    select {
      font-family: inherit; font-size: 15px; padding: 10px 14px; border-radius: var(--radius-input, 14px);
      border: 1px solid var(--line, #E2DFD7); background: #fff; color: var(--ink, #1C1C1C); cursor: pointer; min-width: 200px;
    }
    select:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .status { font-size: 13px; margin-top: 14px; height: 18px; }
    .status.ok { color: var(--forest, #2D4A3E); }
    .status.err { color: #A8302B; }
    .preview { margin-top: 18px; padding-top: 18px; border-top: 0.5px solid var(--line, #E2DFD7); font-size: 14px; color: var(--ink-soft, #6B6B66); }
    .preview strong { color: var(--ink, #1C1C1C); }
  `;

  render(): TemplateResult {
    if (this.loading) return html``;

    return html`
      <div class="topbar">
        <a class="brand" href="/dashboard"><span class="mark">F</span>Foundr</a>
        <div class="nav">
          <a href="/dashboard">Dashboard</a>
          <a href="/transactions">All entries</a>
          <button class="signout" @click=${this._signOut}>Sign out</button>
        </div>
      </div>

      <div class="page">
        <h1>Settings</h1>
        <p class="sub">Manage how Foundr works for you.</p>

        <div class="card">
          <div class="setting">
            <div class="setting-info">
              <div class="label">Currency</div>
              <div class="desc">How amounts are shown across Foundr. We set a default from your region — change it anytime.</div>
            </div>
            <select @change=${this._onCurrencyChange} ?disabled=${this.saving} .value=${this.currency}>
              ${CURRENCIES.map(
                (c) => html`<option value=${c.code} ?selected=${c.code === this.currency}>${c.code} · ${c.label}</option>`
              )}
            </select>
          </div>

          <div class="status ${this.error ? "err" : "ok"}">
            ${this.error ? this.error : this.saving ? "Saving…" : this.saved ? "Saved ✓" : ""}
          </div>

          <div class="preview">
            Example: a $50,000 entry shows as <strong>${formatMoney(50000)}</strong>.
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-settings": FoundrSettings;
  }
}