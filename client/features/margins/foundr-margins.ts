import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { apiGet } from "../../shared/lib/api";
import type { MarginsReport, CategorySlice, BalanceSheet } from "../../shared/lib/types";
import { formatMoney, getCurrency } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";
import { downloadCsv } from "../../shared/lib/csv";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-page-loader";
import "../../shared/components/foundr-mini-loader";

type Section = "margins" | "balance-sheet";

/**
 * <foundr-margins>
 * Financial reports, two views: Margins (a cash-basis income breakdown —
 * revenue by category, expenses by category, net margin) and Balance
 * Sheet (Assets = Liabilities + Equity, made possible by Draws and Debt).
 * Both exportable as CSV with one click.
 *
 * Auth-guarded like the dashboard. Reachable at /margins.
 */
@customElement("foundr-margins")
export class FoundrMargins extends LitElement {
  @state() private loading = true;
  // Two-tier loading feedback: the small mini-loader shows the instant
  // loading starts (no gap, no delay). If it's still going after a couple
  // seconds, that's unexpectedly slow — escalate to the full entrance
  // animation with a reassuring message.
  @state() private escalated = false;
  @state() private loaderVisible = false;
  @state() private error = "";
  @state() private report: MarginsReport | null = null;
  @state() private balanceSheet: BalanceSheet | null = null;
  @state() private section: Section = "margins";

  private _escalateTimer?: ReturnType<typeof setTimeout>;

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

    this._escalateTimer = setTimeout(() => {
      if (this.loading) {
        this.escalated = true;
        this.loaderVisible = true;
      }
    }, 2000);

    await loadSettings();
    await this._load();
    clearTimeout(this._escalateTimer);
  }

  private async _load(): Promise<void> {
    try {
      const [report, balanceSheet] = await Promise.all([
        apiGet<MarginsReport>("/reports/margins"),
        apiGet<BalanceSheet>("/reports/balance-sheet"),
      ]);
      this.report = report;
      this.balanceSheet = balanceSheet;
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your reports.";
    } finally {
      this.loading = false;
    }
  }

  private get isEmpty(): boolean {
    const r = this.report;
    if (!r) return true;
    return r.revenue.length === 0 && r.expenses.length === 0;
  }

  private _money(n: number): string {
    return formatMoney(n);
  }

  private _pct(n: number | null): string {
    if (n === null) return "—";
    return (n >= 0 ? "+" : "") + Math.round(n * 100) + "%";
  }

  private _exportCsv(): void {
    const r = this.report;
    if (!r) return;

    const rows: (string | number)[][] = [
      ["Foundr — Margins report"],
      [`Generated ${new Date().toLocaleDateString()}`, `Currency: ${getCurrency()}`],
      [],
      ["Revenue by category"],
      ["Category", "Amount"],
      ...r.revenue.map((s) => [s.category, s.total]),
      ["Total revenue", r.metrics.totalIncome],
      [],
      ["Expenses by category"],
      ["Category", "Amount"],
      ...r.expenses.map((s) => [s.category, s.total]),
      ["Total expenses", r.metrics.totalExpenses],
      [],
      ["Summary"],
      ["Total revenue", r.metrics.totalIncome],
      ["Total expenses", r.metrics.totalExpenses],
      ["Net margin", r.metrics.totalIncome - r.metrics.totalExpenses],
      ["Gross margin %", r.metrics.grossMargin === null ? "—" : `${Math.round(r.metrics.grossMargin * 100)}%`],
      ["Total invested", r.metrics.totalInvested],
      ["Net position", r.metrics.netPosition],
      ["Cash remaining", r.metrics.cashRemaining],
    ];

    downloadCsv(`foundr-margins-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  private _exportBalanceSheetCsv(): void {
    const b = this.balanceSheet;
    if (!b) return;

    const rows: (string | number)[][] = [
      ["Foundr — Balance sheet"],
      [`Generated ${new Date().toLocaleDateString()}`, `Currency: ${getCurrency()}`],
      [],
      ["Assets"],
      ["Cash remaining", b.assets.cash],
      ["Fixed assets", b.assets.fixedAssets],
      ["Total assets", b.assets.total],
      [],
      ["Liabilities"],
      ["Debt", b.liabilities.debt],
      ["Total liabilities", b.liabilities.total],
      [],
      ["Equity"],
      ["Invested", b.equity.invested],
      ["Draws", -b.equity.draws],
      ["Retained earnings", b.equity.retainedEarnings],
      ["Total equity", b.equity.total],
      [],
      ["Check: Assets = Liabilities + Equity", b.balanced ? "Balanced" : "Not balanced"],
    ];

    downloadCsv(`foundr-balance-sheet-${new Date().toISOString().slice(0, 10)}.csv`, rows);
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
    .ti-download:before { content: "\\ea96"; }
    .ti-report-money:before { content: "\\eecd"; }

    .page { max-width: 1100px; margin: 0 auto; padding: 32px 28px; }
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
    .greeting { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .greeting-sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0; }

    .section-tabs { display: flex; gap: 6px; background: var(--surface-alt, #F2EFE8); padding: 4px; border-radius: var(--radius-pill, 999px); width: fit-content; margin-bottom: 24px; }
    .section-tab {
      padding: 8px 18px; border-radius: var(--radius-pill, 999px); background: transparent; border: none;
      font-size: 13.5px; font-weight: 500; color: var(--ink-soft, #6B6B66); transition: background 0.2s ease, color 0.2s ease;
    }
    .section-tab.active { background: var(--surface, #FAFAF7); color: var(--ink, #1C1C1C); box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18)); }

    button { font-family: inherit; cursor: pointer; border: none; transition: background 0.2s ease; }
    .export-btn {
      background: var(--forest, #2D4A3E); color: #fff; font-size: 14px; font-weight: 500;
      padding: 11px 18px; border-radius: var(--radius-pill, 999px); display: flex; align-items: center; gap: 8px;
      white-space: nowrap; transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .export-btn:hover { background: var(--forest-deep, #1F3329); transform: translate(-5px, -5px); box-shadow: 5px 5px 0 var(--sage, #8AAF9A); }
    .export-btn:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .export-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
    .kpi-grid.three { grid-template-columns: repeat(3, 1fr); }
    .kpi {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      padding: 22px; border: 0.5px solid var(--line, #E2DFD7);
    }
    .kpi.dark { background: var(--forest, #2D4A3E); color: #fff; border: none; }
    .kpi-label {
      font-size: 12px; color: var(--ink-soft, #6B6B66); text-transform: uppercase;
      letter-spacing: 0.04em; margin-bottom: 10px;
    }
    .kpi.dark .kpi-label { color: rgba(255,255,255,0.7); }
    .kpi-value { font-size: 26px; font-weight: 600; letter-spacing: -0.01em; }
    .kpi-hint { font-size: 13px; color: var(--ink-soft, #6B6B66); margin-top: 6px; }
    .kpi.dark .kpi-hint { color: var(--sage, #8AAF9A); }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
    .card {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      padding: 24px; border: 0.5px solid var(--line, #E2DFD7);
    }
    .card h3 { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
    .card .sub { font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 20px; }

    .bs-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; border-bottom: 0.5px solid var(--line, #E2DFD7); }
    .bs-row:last-of-type { border-bottom: none; }

    .bar-row { margin-bottom: 16px; }
    .bar-row:last-child { margin-bottom: 0; }
    .bar-head { display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 6px; gap: 10px; }
    .bar-head .name { color: var(--ink, #1C1C1C); font-weight: 500; }
    .bar-head .val { color: var(--ink-soft, #6B6B66); white-space: nowrap; }
    .bar-track { height: 8px; border-radius: 999px; overflow: hidden; }
    .bar-track.rev { background: var(--sage-soft, #DDE7E0); }
    .bar-track.exp { background: var(--danger-bg, #FBEAE9); }
    .bar-fill { height: 100%; border-radius: 999px; transition: width 0.5s ease; }
    .bar-fill.rev { background: var(--forest, #2D4A3E); }
    .bar-fill.exp { background: var(--danger, #D9534F); }

    .card-total {
      display: flex; justify-content: space-between; font-size: 14px; font-weight: 600;
      margin-top: 18px; padding-top: 16px; border-top: 0.5px solid var(--line, #E2DFD7);
    }

    .state { text-align: center; padding: 80px 20px; }
    .state-icon {
      width: 60px; height: 60px; border-radius: 16px; background: var(--sage-soft, #DDE7E0);
      color: var(--forest, #2D4A3E); display: grid; place-items: center; font-size: 26px; margin: 0 auto 20px;
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
    .loading-hint { font-size: 13px; color: var(--ink-soft, #6B6B66); text-align: center; margin: -8px 0 0; }

    @media (max-width: 880px) {
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }
  `;

  // The header shows immediately — title and subtitle are always static,
  // the tab switcher and export button only make sense once there's
  // something to show/export.
  private _renderHeader(): TemplateResult {
    const ready = !this.loading && !this.error && !this.isEmpty;
    return html`
      <div class="page-head">
        <div>
          <h1 class="greeting">Reports</h1>
          <p class="greeting-sub">Margins and balance sheet, generated automatically from what you track.</p>
        </div>
        ${ready
          ? html`
              <button class="export-btn" @click=${this.section === "margins" ? this._exportCsv : this._exportBalanceSheetCsv}>
                <i class="ti ti-download" aria-hidden="true"></i>Export CSV
              </button>
            `
          : ""}
      </div>
      ${ready
        ? html`
            <div class="section-tabs">
              <button class="section-tab ${this.section === "margins" ? "active" : ""}"
                @click=${() => { this.section = "margins"; }}>Margins</button>
              <button class="section-tab ${this.section === "balance-sheet" ? "active" : ""}"
                @click=${() => { this.section = "balance-sheet"; }}>Balance Sheet</button>
            </div>
          `
        : ""}
    `;
  }

  private _renderEmpty(): TemplateResult {
    return html`
      <div class="state">
        <div class="state-icon"><i class="ti ti-report-money" aria-hidden="true"></i></div>
        <h2>Nothing to break down yet</h2>
        <p>Once you've tracked some revenue and expenses, this page will show your margins by category.</p>
        <a class="btn-primary" href="/dashboard">Go to dashboard</a>
      </div>
    `;
  }

  private _renderCategoryList(slices: CategorySlice[], variant: "rev" | "exp"): TemplateResult {
    if (slices.length === 0) {
      return html`<div class="bar-row"><span class="bar-head"><span class="name">Nothing here yet</span></span></div>`;
    }
    const max = Math.max(...slices.map((s) => s.total));
    return html`
      ${slices.map(
        (s) => html`
          <div class="bar-row">
            <div class="bar-head">
              <span class="name">${s.category}</span>
              <span class="val">${this._money(s.total)}</span>
            </div>
            <div class="bar-track ${variant}">
              <div class="bar-fill ${variant}" style="width: ${max > 0 ? (s.total / max) * 100 : 0}%"></div>
            </div>
          </div>
        `
      )}
    `;
  }

  private _renderReport(r: MarginsReport): TemplateResult {
    const netMargin = r.metrics.totalIncome - r.metrics.totalExpenses;
    return html`
        <div class="kpi-grid">
          <div class="kpi">
            <div class="kpi-label">Total revenue</div>
            <div class="kpi-value">${this._money(r.metrics.totalIncome)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Total expenses</div>
            <div class="kpi-value">${this._money(r.metrics.totalExpenses)}</div>
          </div>
          <div class="kpi dark">
            <div class="kpi-label">Net margin</div>
            <div class="kpi-value">${this._money(netMargin)}</div>
            <div class="kpi-hint">What's left in the business</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Gross margin</div>
            <div class="kpi-value">${this._pct(r.metrics.grossMargin)}</div>
            <div class="kpi-hint">${r.metrics.grossMargin === null ? "Add revenue to calculate" : "Of total revenue"}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Revenue by category</h3>
            <p class="sub">Biggest sources first</p>
            ${this._renderCategoryList(r.revenue, "rev")}
            <div class="card-total"><span>Total revenue</span><span>${this._money(r.metrics.totalIncome)}</span></div>
          </div>
          <div class="card">
            <h3>Expenses by category</h3>
            <p class="sub">Biggest costs first</p>
            ${this._renderCategoryList(r.expenses, "exp")}
            <div class="card-total"><span>Total expenses</span><span>${this._money(r.metrics.totalExpenses)}</span></div>
          </div>
        </div>
    `;
  }

  private _renderBalanceSheet(b: BalanceSheet): TemplateResult {
    return html`
        <div class="kpi-grid three">
          <div class="kpi">
            <div class="kpi-label">Total assets</div>
            <div class="kpi-value">${this._money(b.assets.total)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Total liabilities</div>
            <div class="kpi-value">${this._money(b.liabilities.total)}</div>
          </div>
          <div class="kpi dark">
            <div class="kpi-label">Total equity</div>
            <div class="kpi-value">${this._money(b.equity.total)}</div>
            <div class="kpi-hint">${b.balanced ? "Assets = Liabilities + Equity ✓" : "Doesn't balance — check your entries"}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Assets</h3>
            <p class="sub">What the business owns</p>
            <div class="bs-row"><span>Cash remaining</span><span>${this._money(b.assets.cash)}</span></div>
            <div class="bs-row"><span>Fixed assets</span><span>${this._money(b.assets.fixedAssets)}</span></div>
            <div class="card-total"><span>Total assets</span><span>${this._money(b.assets.total)}</span></div>
          </div>
          <div class="card">
            <h3>Liabilities &amp; Equity</h3>
            <p class="sub">What the business owes, and what's yours</p>
            <div class="bs-row"><span>Debt</span><span>${this._money(b.liabilities.debt)}</span></div>
            <div class="bs-row"><span>Invested</span><span>${this._money(b.equity.invested)}</span></div>
            <div class="bs-row"><span>Draws</span><span>−${this._money(b.equity.draws)}</span></div>
            <div class="bs-row"><span>Retained earnings</span><span>${this._money(b.equity.retainedEarnings)}</span></div>
            <div class="card-total"><span>Total</span><span>${this._money(b.liabilities.total + b.equity.total)}</span></div>
          </div>
        </div>
    `;
  }

  render(): TemplateResult {
    let body: TemplateResult = html``;
    if (!this.loading) {
      if (this.error) body = html`<div class="error-box">${this.error}</div>`;
      else if (this.isEmpty) body = this._renderEmpty();
      else if (this.section === "margins") body = this._renderReport(this.report!);
      else body = this._renderBalanceSheet(this.balanceSheet!);
    }

    return html`
      <foundr-topbar active="margins"></foundr-topbar>
      <div class="page">
        ${this._renderHeader()}
        <div class="page-area">
          ${body}
          ${this.loading && !this.escalated
            ? html`<div class="loader-overlay"><foundr-mini-loader></foundr-mini-loader></div>`
            : ""}
          ${this.loaderVisible
            ? html`
                <div class="loader-overlay">
                  <foundr-page-loader
                    ?done=${!this.loading}
                    @loader-exit-done=${() => { this.loaderVisible = false; }}
                  >
                    <p slot="hint" class="loading-hint">This is taking longer than usual…</p>
                  </foundr-page-loader>
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-margins": FoundrMargins;
  }
}
