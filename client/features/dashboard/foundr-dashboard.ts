import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { getClerk, signOut } from "../auth/auth.service";
import { apiGet } from "../../shared/lib/api";
import type { DashboardMetrics } from "../../shared/lib/types";
import "./foundr-add-entry";
import "./foundr-insights";
import type { FoundrInsights } from "./foundr-insights";
import { formatMoney } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";

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
    @query("foundr-insights") private insightsEl?: FoundrInsights;

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

    this.userName = clerk.user.firstName || "founder";
    await loadSettings();
    await this._loadMetrics();
  }

  private async _loadMetrics(): Promise<void> {
    try {
      this.metrics = await apiGet<DashboardMetrics>("/metrics");
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your metrics.";
    } finally {
      this.loading = false;
    }
  }

  private _openModal(): void {
    this.modalOpen = true;
  }

  private _closeModal(): void {
    this.modalOpen = false;
  }

  // After a new entry is saved, refresh the metrics so the dashboard updates.
 private async _onEntryAdded(): Promise<void> {
    await this._loadMetrics();
    await this.insightsEl?.refresh();
  }

  private async _signOut(): Promise<void> {
    await signOut();
    window.location.href = "/";
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
    if (n === null) return "—";
    return (n >= 0 ? "+" : "") + Math.round(n * 100) + "%";
  }

  private _runway(n: number | null): string {
    if (n === null) return "—";
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
    .ti-plus:before { content: "\\eb0b"; }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px; border-bottom: 0.5px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7);
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 19px; }
    .brand .mark {
      width: 30px; height: 30px; border-radius: 9px; background: var(--forest, #2D4A3E);
      color: #fff; display: grid; place-items: center; font-family: var(--font-display, serif); font-size: 16px;
    }
    .topbar-right { display: flex; align-items: center; gap: 14px; }
    .nav-link { font-size: 14px; color: var(--ink-soft, #6B6B66); text-decoration: none; }
    .nav-link:hover { color: var(--ink, #1C1C1C); }
    .add-btn {
      background: var(--forest, #2D4A3E); color: #fff; font-size: 14px; font-weight: 500;
      padding: 9px 16px; border-radius: var(--radius-pill, 999px); display: flex; align-items: center; gap: 6px;
    }
    .add-btn:hover { background: var(--forest-deep, #1F3329); }
    button { font-family: inherit; cursor: pointer; border: none; transition: background 0.2s ease; }
    .signout {
      background: transparent; color: var(--ink-soft, #6B6B66); font-size: 14px;
      padding: 8px 14px; border-radius: var(--radius-pill, 999px);
    }
    .signout:hover { background: rgba(45,74,62,0.07); color: var(--ink, #1C1C1C); }

    .page { max-width: 1100px; margin: 0 auto; padding: 32px 28px; }
    .greeting { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .greeting-sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 28px; }

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
    }
    .btn-primary:hover { background: var(--forest-deep, #1F3329); }
    .error-box {
      background: #FBEAE9; color: #A8302B; border: 1px solid #F0C5C3;
      border-radius: 12px; padding: 14px 18px; font-size: 14px;
    }
    .skeleton {
      background: linear-gradient(90deg, #EDEBE4 25%, #F4F2EC 50%, #EDEBE4 75%);
      background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: var(--radius-card, 24px);
      height: 120px;
    }
    @keyframes shimmer { to { background-position: -200% 0; } }

    @media (max-width: 880px) {
      .kpi-grid, .secondary-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 560px) {
      .kpi-grid, .secondary-grid { grid-template-columns: 1fr; }
    }
  `;

  private _renderTopbar(): TemplateResult {
    return html`
      <div class="topbar">
        <a class="brand" href="/" style="text-decoration:none;color:inherit">
          <span class="mark">F</span>Foundr
        </a>
        <div class="topbar-right">
          <a class="nav-link" href="/transactions">All entries</a>
          <a class="nav-link" href="/settings">Settings</a>
          <button class="add-btn" @click=${this._openModal}><i class="ti ti-plus" aria-hidden="true"></i>Add entry</button>
          <button class="signout" @click=${this._signOut}>Sign out</button>
        </div>
      </div>
    `;
  }

  private _renderLoading(): TemplateResult {
    return html`
      <div class="page">
        <div class="kpi-grid">
          <div class="skeleton"></div><div class="skeleton"></div>
          <div class="skeleton"></div><div class="skeleton"></div>
        </div>
      </div>
    `;
  }

  private _renderEmpty(): TemplateResult {
    return html`
      <div class="page">
        <h1 class="greeting">Welcome, ${this.userName}.</h1>
        <p class="greeting-sub">Let's get your first numbers in.</p>
        <div class="state">
          <div class="state-icon"><i class="ti ti-pencil-plus" aria-hidden="true"></i></div>
          <h2>Nothing tracked yet</h2>
          <p>Add your first expense or the money you've put into the business, and your metrics will appear here automatically.</p>
          <button class="btn-primary" @click=${this._openModal}>
            Add your first entry
          </button>
        </div>
      </div>
    `;
  }

  private _renderMetrics(m: DashboardMetrics): TemplateResult {
    return html`
      <div class="page">
        <h1 class="greeting">Hello, ${this.userName}.</h1>
        <p class="greeting-sub">Here's where your business stands today.</p>

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
            <div class="card-value">${m.grossMargin === null ? "—" : this._pct(m.grossMargin)}</div>
          </div>
        </div>

        <foundr-insights></foundr-insights>
      </div>
    `;
  }

  render(): TemplateResult {
    let body: TemplateResult;
    if (this.loading) body = this._renderLoading();
    else if (this.error) body = html`<div class="page"><div class="error-box">${this.error}</div></div>`;
    else if (this.isEmpty) body = this._renderEmpty();
    else body = this._renderMetrics(this.metrics!);

    return html`
      ${this._renderTopbar()}
      ${body}
      <foundr-add-entry
        .open=${this.modalOpen}
        @close=${this._closeModal}
        @entry-added=${this._onEntryAdded}
      ></foundr-add-entry>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-dashboard": FoundrDashboard;
  }
}