import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { apiGet } from "../../shared/lib/api";
import type { DashboardMetrics } from "../../shared/lib/types";
import "../../shared/components/foundr-add-entry";
import "../../shared/components/foundr-upgrade-prompt";
import "../../shared/components/foundr-coming-soon-modal";
import "./foundr-insights";
import "../onboarding/foundr-onboarding";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-mini-loader";
import "../../shared/components/foundr-activity-feed";
import "../../shared/components/foundr-page-actions";
import "../../shared/components/foundr-migrate-modal";
import type { FoundrInsights } from "./foundr-insights";
import type { FoundrActivityFeed } from "../../shared/components/foundr-activity-feed";
import { formatMoney } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";
import { resolveActiveBusiness } from "../../shared/lib/business";
import { checkSessionFreshness } from "../../shared/lib/session-guard";
import { RANGE_PRESETS, getStoredRangePreset, setStoredRangePreset, rangeQueryParams, type RangePreset } from "../../shared/lib/dateRange";
import "../../shared/components/foundr-tour-overlay";

/**
 * <foundr-dashboard>
 * The signed-in home screen. Confirms the user is authenticated, fetches
 * their live metrics from the backend (with the Clerk token attached via
 * the api helper), and shows burn, runway, ROI, margins, and cash.
 *
 * States handled: loading, signed-out (redirect), error, empty (new user
 * with no data yet), and populated.
 */
@customElement("foundr-dashboard")
export class FoundrDashboard extends LitElement {
  @state() private loading = true;
  @state() private error = "";
  @state() private metrics: DashboardMetrics | null = null;
  @state() private userName = "founder";
  @state() private modalOpen = false;
  @state() private migrateOpen = false;
  @state() private quotaPromptOpen = false;
  @state() private quotaReason = "";
  @state() private comingSoonOpen = false;
  @state() private needsOnboarding = false;
  @state() private businessId = "";
  @state() private businessLabel = "";
  @state() private range: RangePreset = getStoredRangePreset();
    @query("foundr-insights") private insightsEl?: FoundrInsights;
    @query("foundr-activity-feed") private activityEl?: FoundrActivityFeed;

  connectedCallback(): void {
    super.connectedCallback();
    void this._init();
  }

  private async _init(): Promise<void> {
    const clerk = await getClerk();

    // Not configured or not signed in → send to sign-in.
    if (!clerk || !clerk.user) {
      window.location.href = "/sign-in";
      return;
    }
    // Signed in, but was this tab closed longer than the grace period?
    // If so, checkSessionFreshness already signed them out.
    if (!(await checkSessionFreshness(clerk))) {
      window.location.href = "/sign-in";
      return;
    }

    this.userName = clerk.user.firstName || "founder";

    const settings = await loadSettings();
    if (settings && !settings.onboarded) {
      this.needsOnboarding = true;
      this.loading = false;
      return;
    }

    await this._loadBusinessAndMetrics(settings?.activeBusinessId ?? "");
  }

  private async _loadBusinessAndMetrics(settingsActiveId: string): Promise<void> {
    try {
      const { businesses, activeId } = await resolveActiveBusiness(settingsActiveId);
      this.businessId = activeId;
      this.businessLabel = businesses.find((b) => b._id === activeId)?.name ?? "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your businesses.";
      this.loading = false;
      return;
    }
    await this._loadMetrics();
  }

  // Recovery email (if any) is already added inline by the wizard now, so
  // there's no separate "finish in Settings" trip. Land on the startup
  // switcher instead of jumping straight into the dashboard, the founder
  // just created their first business, so confirming/seeing it there
  // reads better than skipping past it.
  private _onOnboardingDone(): void {
    window.location.href = "/business";
  }

  private async _loadMetrics(): Promise<void> {
    if (!this.businessId) {
      this.loading = false;
      return;
    }
    try {
      this.metrics = await apiGet<DashboardMetrics>(
        `/metrics?businessId=${this.businessId}${rangeQueryParams(this.range)}`
      );
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your metrics.";
    } finally {
      this.loading = false;
    }
  }

  private async _onRangeChange(e: Event): Promise<void> {
    const preset = (e.target as HTMLSelectElement).value as RangePreset;
    this.range = preset;
    setStoredRangePreset(preset);
    if (this.insightsEl) this.insightsEl.range = preset;
    await this._loadMetrics();
    await this.insightsEl?.refresh();
  }

  private _openModal(): void {
    this.modalOpen = true;
  }

  private _closeModal(): void {
    this.modalOpen = false;
  }

  /**
   * A plan limit was reached while saving. The add-entry modal has already
   * closed itself, so this only has to explain what happened, using the
   * server's own wording since it owns the actual numbers.
   */
  private _onQuotaReached(e: Event): void {
    this.quotaReason = (e as CustomEvent<{ reason: string }>).detail?.reason ?? "";
    this.quotaPromptOpen = true;
  }

  private _onUpgradeRequested(): void {
    this.quotaPromptOpen = false;
    this.comingSoonOpen = true;
  }

  private _openMigrate(): void {
    this.migrateOpen = true;
  }

  private _closeMigrate(): void {
    this.migrateOpen = false;
  }

  // After a new entry is saved, refresh the metrics so the dashboard updates.
 private async _onEntryAdded(): Promise<void> {
    await this._loadMetrics();
    await this.insightsEl?.refresh();
    await this.activityEl?.refresh();
  }

  // Has the founder entered anything yet?
  private get isEmpty(): boolean {
    const m = this.metrics;
    if (!m) return true;
    return m.totalExpenses === 0 && m.totalIncome === 0 && m.totalInvested === 0;
  }

  private _money(n: number): string {
    return formatMoney(n);
  }

  private _pct(n: number | null): string {
    if (n === null) return "-";
    return (n >= 0 ? "+" : "") + Math.round(n * 100) + "%";
  }

  private _runway(n: number | null): string {
    if (n === null) return "-";
    return n.toFixed(1) + " mo";
  }

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--bg, #ECEAE3);
      color: var(--ink, #1C1C1C);
      font-family: var(--font-body, "Inter", sans-serif);
      -webkit-font-smoothing: antialiased;
    }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-flame:before { content: "\\ec2c"; }
    .ti-clock:before { content: "\\ea70"; }
    .ti-trending-up:before { content: "\\eb43"; }
    .ti-wallet:before { content: "\\eb75"; }
    .ti-pencil-plus:before { content: "\\f1ec"; }
    button { font-family: inherit; cursor: pointer; border: none; transition: background 0.2s ease; }

    .page { max-width: 1100px; margin: 0 auto; padding: 32px 28px; }
    .header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
    .greeting { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .greeting-sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 28px; }
    /* Elevated "shadow, not just a border" treatment, matching Margins'
       range-select for consistency between the two pages. */
    .range-select {
      font-family: inherit; font-size: 13.5px; font-weight: 600; color: var(--ink, #1C1C1C);
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); padding: 11px 40px 11px 16px; cursor: pointer;
      box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18));
      appearance: none; -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B6B66' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 16px center;
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .range-select:hover { border-color: var(--sage, #8AAF9A); }
    .range-select:focus {
      outline: none; border-color: var(--forest, #2D4A3E);
      box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18)), 0 0 0 3px rgba(45,74,62,0.1);
    }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
    .kpi {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      padding: 22px; border: 0.5px solid var(--line, #E2DFD7);
    }
    .kpi.dark { background: var(--forest, #2D4A3E); color: #fff; border: none; }
    .kpi-label {
      font-size: 12px; color: var(--ink-soft, #6B6B66); text-transform: uppercase;
      letter-spacing: 0.04em; margin-bottom: 10px; display: flex; align-items: center; gap: 7px;
    }
    .kpi.dark .kpi-label { color: rgba(255,255,255,0.7); }
    .kpi-value { font-size: 28px; font-weight: 600; letter-spacing: -0.01em; }
    .kpi-hint { font-size: 13px; color: var(--ink-soft, #6B6B66); margin-top: 6px; }
    .kpi.dark .kpi-hint { color: var(--sage, #8AAF9A); }

    .secondary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      padding: 22px; border: 0.5px solid var(--line, #E2DFD7);
    }
    .card-label { font-size: 13px; color: var(--ink-soft, #6B6B66); margin-bottom: 8px; }
    .card-value { font-size: 22px; font-weight: 600; }

    .state { text-align: center; padding: 80px 20px; }
    .state-icon {
      width: 60px; height: 60px; border-radius: 16px; background: var(--sage-soft, #DDE7E0);
      color: var(--forest, #2D4A3E); display: grid; place-items: center; font-size: 28px; margin: 0 auto 20px;
    }
    .state h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 26px; margin: 0 0 10px; }
    .state p { font-size: 16px; color: var(--ink-soft, #6B6B66); max-width: 420px; margin: 0 auto 24px; line-height: 1.6; }
    .btn-primary {
      background: var(--forest, #2D4A3E); color: #fff; padding: 13px 24px;
      border-radius: var(--radius-pill, 999px); font-size: 15px; font-weight: 500;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .btn-primary:hover { background: var(--forest-deep, #1F3329); transform: translate(-5px, -5px); box-shadow: 5px 5px 0 var(--sage, #8AAF9A); }
    .btn-primary:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .error-box {
      background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border: 1px solid var(--danger-border, #F0C5C3);
      border-radius: 12px; padding: 14px 18px; font-size: 14px;
    }
    .page-area { position: relative; min-height: 420px; }
    .loader-overlay {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: var(--bg, #ECEAE3); z-index: 5;
    }

    @media (max-width: 880px) {
      .kpi-grid, .secondary-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 560px) {
      .kpi-grid, .secondary-grid { grid-template-columns: 1fr; }
    }
  `;

  private _renderTopbar(): TemplateResult {
    return html`
      <foundr-topbar active="dashboard" businessName=${this.businessLabel}>
        <foundr-page-actions
          slot="actions"
          @open-add-entry=${this._openModal}
          @open-migrate=${this._openMigrate}
        ></foundr-page-actions>
      </foundr-topbar>
    `;
  }

  // The header shows immediately (userName is known before metrics load);
  // isEmpty defaults to true while loading, so this reads naturally as the
  // first-time-user copy until real data says otherwise.
  private _renderHeader(): TemplateResult {
    const showRange = !this.loading && !this.error && !this.isEmpty;
    return html`
      <div class="header-row">
        <div>
          ${this.isEmpty
            ? html`
                <h1 class="greeting">Welcome, ${this.userName}.</h1>
                <p class="greeting-sub">Let's get your first numbers in.</p>
              `
            : html`
                <h1 class="greeting">Hello, ${this.userName}.</h1>
                <p class="greeting-sub">Here's where your business stands today.</p>
              `}
        </div>
        ${showRange
          ? html`
              <select class="range-select" .value=${this.range} @change=${this._onRangeChange}>
                ${RANGE_PRESETS.map((r) => html`<option value=${r.code}>${r.label}</option>`)}
              </select>
            `
          : ""}
      </div>
    `;
  }

  private _renderEmpty(): TemplateResult {
    return html`
      <div class="state">
        <div class="state-icon"><i class="ti ti-pencil-plus" aria-hidden="true"></i></div>
        <h2>Nothing tracked yet</h2>
        <p>Add your first expense or the money you've put into the business, and your metrics will appear here automatically.</p>
        <button class="btn-primary" @click=${this._openModal}>
          Add your first entry
        </button>
      </div>
    `;
  }

  private _renderMetrics(m: DashboardMetrics): TemplateResult {
    return html`
      <div class="kpi-grid">
          <div class="kpi">
            <div class="kpi-label"><i class="ti ti-flame" aria-hidden="true"></i>Monthly burn</div>
            <div class="kpi-value">${this._money(m.monthlyBurn)}</div>
            <div class="kpi-hint">Average net spend / month</div>
          </div>
          <div class="kpi dark">
            <div class="kpi-label"><i class="ti ti-clock" aria-hidden="true"></i>Runway</div>
            <div class="kpi-value">${this._runway(m.runwayMonths)}</div>
            <div class="kpi-hint">${m.runwayMonths === null ? "Not burning cash" : "At current burn"}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label"><i class="ti ti-trending-up" aria-hidden="true"></i>Personal ROI</div>
            <div class="kpi-value">${this._pct(m.personalRoi)}</div>
            <div class="kpi-hint">${m.personalRoi === null ? "Add an investment" : "On your invested money"}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label"><i class="ti ti-wallet" aria-hidden="true"></i>Cash left</div>
            <div class="kpi-value">${this._money(m.cashRemaining)}</div>
            <div class="kpi-hint">${m.totalInvested > 0 ? `of ${this._money(m.totalInvested)} invested` : "from revenue so far"}</div>
          </div>
        </div>

        <div class="secondary-grid">
          <div class="card">
            <div class="card-label">Total income</div>
            <div class="card-value">${this._money(m.totalIncome)}</div>
          </div>
          <div class="card">
            <div class="card-label">Total expenses</div>
            <div class="card-value">${this._money(m.totalExpenses)}</div>
          </div>
          <div class="card">
            <div class="card-label">Gross margin</div>
            <div class="card-value">${m.grossMargin === null ? "-" : this._pct(m.grossMargin)}</div>
          </div>
        </div>

        <foundr-insights businessId=${this.businessId} range=${this.range}></foundr-insights>
        <foundr-activity-feed businessId=${this.businessId} @changed=${this._onEntryAdded}></foundr-activity-feed>
      </div>
    `;
  }

  render(): TemplateResult {
    if (this.needsOnboarding) {
      return html`<foundr-onboarding @onboarding-done=${this._onOnboardingDone}></foundr-onboarding>`;
    }

    let body: TemplateResult = html``;
    if (!this.loading) {
      if (this.error) body = html`<div class="error-box">${this.error}</div>`;
      else if (this.isEmpty) body = this._renderEmpty();
      else body = this._renderMetrics(this.metrics!);
    }

    return html`
      ${this._renderTopbar()}
      <div class="page">
        ${this._renderHeader()}
        <div class="page-area">
          ${body}
          ${this.loading
            ? html`<div class="loader-overlay"><foundr-mini-loader></foundr-mini-loader></div>`
            : ""}
        </div>
      </div>
      <foundr-add-entry
        .open=${this.modalOpen}
        businessId=${this.businessId}
        @close=${this._closeModal}
        @entry-added=${this._onEntryAdded}
        @quota-reached=${this._onQuotaReached}
      ></foundr-add-entry>
      <foundr-upgrade-prompt
        ?open=${this.quotaPromptOpen}
        reason=${this.quotaReason}
        @close=${() => { this.quotaPromptOpen = false; }}
        @upgrade=${this._onUpgradeRequested}
      ></foundr-upgrade-prompt>
      <foundr-coming-soon-modal
        ?open=${this.comingSoonOpen}
        @close=${() => { this.comingSoonOpen = false; }}
      ></foundr-coming-soon-modal>
      <foundr-migrate-modal
        .open=${this.migrateOpen}
        businessId=${this.businessId}
        @close=${this._closeMigrate}
        @imported=${this._onEntryAdded}
      ></foundr-migrate-modal>
      <foundr-tour-overlay></foundr-tour-overlay>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-dashboard": FoundrDashboard;
  }
}