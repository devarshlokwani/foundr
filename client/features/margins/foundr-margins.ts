import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { apiGet } from "../../shared/lib/api";
import type { MarginsReport, CategorySlice, BalanceSheet } from "../../shared/lib/types";
import { formatMoney, getCurrency } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";
import { resolveActiveBusiness } from "../../shared/lib/business";
import { checkSessionFreshness } from "../../shared/lib/session-guard";
import { downloadCsv } from "../../shared/lib/csv";
import "../../shared/components/foundr-topbar";
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
  @state() private error = "";
  @state() private report: MarginsReport | null = null;
  @state() private balanceSheet: BalanceSheet | null = null;
  @state() private section: Section = "margins";
  @state() private businessName = "";
  @state() private businessId = "";

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
    try {
      const { businesses, activeId } = await resolveActiveBusiness(settings?.activeBusinessId ?? "");
      this.businessId = activeId;
      this.businessName = businesses.find((b) => b._id === activeId)?.name || "Your Business";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your businesses.";
      this.loading = false;
      return;
    }
    await this._load();
  }

  private async _load(): Promise<void> {
    if (!this.businessId) {
      this.loading = false;
      return;
    }
    try {
      const [report, balanceSheet] = await Promise.all([
        apiGet<MarginsReport>(`/reports/margins?businessId=${this.businessId}`),
        apiGet<BalanceSheet>(`/reports/balance-sheet?businessId=${this.businessId}`),
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

  /** A / B as "x.xx", or "—" when B is zero (nothing to divide by yet). */
  private _ratio(a: number, b: number): string {
    if (b === 0) return "—";
    return (a / b).toFixed(2);
  }

  private _today(): string {
    return new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
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
    const liabEquityTotal = b.liabilities.total + b.equity.total;

    const rows: (string | number)[][] = [
      [`${this.businessName} — Balance Sheet`],
      [`As of ${this._today()}`, `Currency: ${getCurrency()}`],
      [],
      ["ASSETS"],
      ["Current Assets"],
      ["Cash", b.assets.cash],
      ["Total Current Assets", b.assets.cash],
      ["Fixed Assets"],
      ["Equipment & Tools", b.assets.fixedAssets],
      ["Total Fixed Assets", b.assets.fixedAssets],
      ["TOTAL ASSETS", b.assets.total],
      [],
      ["LIABILITIES AND OWNER'S EQUITY"],
      ["Liabilities"],
      ["Loans & Debt", b.liabilities.debt],
      ["Total Liabilities", b.liabilities.total],
      ["Owner's Equity"],
      ["Owner's Investment", b.equity.invested],
      ["Owner's Draws", -b.equity.draws],
      ["Retained Earnings", b.equity.retainedEarnings],
      ["Total Owner's Equity", b.equity.total],
      ["TOTAL LIABILITIES AND OWNER'S EQUITY", liabEquityTotal],
      [],
      ["Check: Assets = Liabilities + Equity", b.balanced ? "Balanced" : "Not balanced"],
      [],
      ["FINANCIAL RATIOS", "(debt treated as short-term)"],
      ["Debt Ratio", this._ratio(b.liabilities.total, b.assets.total)],
      ["Current Ratio", this._ratio(b.assets.cash, b.liabilities.debt)],
      ["Working Capital", b.assets.cash - b.liabilities.debt],
      ["Assets-to-Equity Ratio", this._ratio(b.assets.total, b.equity.total)],
      ["Debt-to-Equity Ratio", this._ratio(b.liabilities.total, b.equity.total)],
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

    .section-tabs {
      position: relative; display: flex; background: var(--surface-alt, #F2EFE8);
      padding: 4px; border-radius: var(--radius-pill, 999px); width: fit-content; margin-bottom: 24px;
    }
    .section-indicator {
      position: absolute; top: 4px; left: 4px; bottom: 4px; width: var(--tab-w, 150px);
      background: var(--surface, #FAFAF7); border-radius: var(--radius-pill, 999px);
      box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18));
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 0;
    }
    .section-tab {
      position: relative; z-index: 1; width: var(--tab-w, 150px); padding: 8px 0; text-align: center;
      border-radius: var(--radius-pill, 999px); background: transparent; border: none;
      font-size: 13.5px; font-weight: 500; color: var(--ink-soft, #6B6B66); transition: color 0.25s ease;
    }
    .section-tab.active { color: var(--ink, #1C1C1C); }

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

    /* Formal statement — deliberately more "official document" than the
       rest of the app's soft rounded cards, since this is the one thing a
       founder might actually print or hand to a bank/accountant. */
    .statement {
      background: var(--surface, #FAFAF7); border: 1.5px solid var(--ink, #1C1C1C);
      border-radius: 16px; padding: 32px; margin-top: 16px;
    }
    .statement-head {
      display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap;
      padding-bottom: 18px; margin-bottom: 24px; border-bottom: 2px solid var(--ink, #1C1C1C);
    }
    .statement-title { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; letter-spacing: 0.02em; margin: 0; }
    .statement-sub { font-size: 14px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .statement-date { font-size: 13px; color: var(--ink-soft, #6B6B66); white-space: nowrap; }

    .statement-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .col-title {
      font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
      margin: 0 0 16px; color: var(--forest, #2D4A3E);
    }
    .section-label {
      font-size: 11.5px; font-weight: 600; color: var(--ink-soft, #6B6B66);
      text-transform: uppercase; letter-spacing: 0.03em; margin: 16px 0 6px;
    }
    .section-label:first-of-type { margin-top: 0; }
    .stmt-line { display: flex; justify-content: space-between; font-size: 14px; padding: 5px 0 5px 10px; }
    .stmt-subtotal {
      display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600;
      padding: 6px 0; margin-top: 2px; border-top: 0.5px solid var(--line, #E2DFD7); color: var(--ink-soft, #6B6B66);
    }
    .stmt-total {
      display: flex; justify-content: space-between; font-size: 15px; font-weight: 700;
      padding-top: 12px; margin-top: 16px; border-top: 2px solid var(--ink, #1C1C1C);
    }

    .balance-check {
      margin-top: 26px; padding-top: 16px; border-top: 1px dashed var(--line, #E2DFD7);
      text-align: center; font-size: 13px; font-weight: 500;
    }
    .balance-check.ok { color: var(--positive, #4F8A6B); }
    .balance-check.bad { color: var(--danger, #A8302B); }

    .ratios-card {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      border: 0.5px solid var(--line, #E2DFD7); padding: 24px; margin-top: 16px;
    }
    .ratios-card h3 { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
    .ratios-card .sub { font-size: 12px; color: var(--ink-soft, #6B6B66); margin: 0 0 16px; }
    .ratio-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; }
    .ratio-row {
      display: flex; justify-content: space-between; font-size: 13.5px;
      padding: 9px 0; border-bottom: 0.5px solid var(--line, #E2DFD7);
    }

    @media (max-width: 880px) {
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .grid { grid-template-columns: 1fr; }
      .statement-grid { grid-template-columns: 1fr; gap: 8px; }
      .ratio-grid { grid-template-columns: 1fr; }
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
            <div class="section-tabs" style="--tab-w: 150px">
              <div class="section-indicator" style="transform: translateX(${this.section === "margins" ? 0 : 150}px)"></div>
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
    const liabEquityTotal = b.liabilities.total + b.equity.total;
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

        <div class="statement">
          <div class="statement-head">
            <div>
              <h2 class="statement-title">Balance Sheet</h2>
              <div class="statement-sub">${this.businessName}</div>
            </div>
            <div class="statement-date">As of ${this._today()}</div>
          </div>

          <div class="statement-grid">
            <div>
              <div class="col-title">Assets</div>

              <div class="section-label">Current Assets</div>
              <div class="stmt-line"><span>Cash</span><span>${this._money(b.assets.cash)}</span></div>
              <div class="stmt-subtotal"><span>Total Current Assets</span><span>${this._money(b.assets.cash)}</span></div>

              <div class="section-label">Fixed Assets</div>
              <div class="stmt-line"><span>Equipment &amp; Tools</span><span>${this._money(b.assets.fixedAssets)}</span></div>
              <div class="stmt-subtotal"><span>Total Fixed Assets</span><span>${this._money(b.assets.fixedAssets)}</span></div>

              <div class="stmt-total"><span>Total Assets</span><span>${this._money(b.assets.total)}</span></div>
            </div>

            <div>
              <div class="col-title">Liabilities &amp; Owner's Equity</div>

              <div class="section-label">Liabilities</div>
              <div class="stmt-line"><span>Loans &amp; Debt</span><span>${this._money(b.liabilities.debt)}</span></div>
              <div class="stmt-subtotal"><span>Total Liabilities</span><span>${this._money(b.liabilities.total)}</span></div>

              <div class="section-label">Owner's Equity</div>
              <div class="stmt-line"><span>Owner's Investment</span><span>${this._money(b.equity.invested)}</span></div>
              <div class="stmt-line"><span>Owner's Draws</span><span>−${this._money(b.equity.draws)}</span></div>
              <div class="stmt-line"><span>Retained Earnings</span><span>${this._money(b.equity.retainedEarnings)}</span></div>
              <div class="stmt-subtotal"><span>Total Owner's Equity</span><span>${this._money(b.equity.total)}</span></div>

              <div class="stmt-total"><span>Total Liabilities &amp; Equity</span><span>${this._money(liabEquityTotal)}</span></div>
            </div>
          </div>

          <div class="balance-check ${b.balanced ? "ok" : "bad"}">
            ${b.balanced ? "Assets = Liabilities + Equity — balanced ✓" : "Doesn't balance — check your entries"}
          </div>
        </div>

        <div class="ratios-card">
          <h3>Financial ratios</h3>
          <p class="sub">Recorded debt is treated as short-term, typical for solo-founder borrowing.</p>
          <div class="ratio-grid">
            <div class="ratio-row"><span>Debt ratio</span><span>${this._ratio(b.liabilities.total, b.assets.total)}</span></div>
            <div class="ratio-row"><span>Current ratio</span><span>${this._ratio(b.assets.cash, b.liabilities.debt)}</span></div>
            <div class="ratio-row"><span>Working capital</span><span>${this._money(b.assets.cash - b.liabilities.debt)}</span></div>
            <div class="ratio-row"><span>Assets-to-equity ratio</span><span>${this._ratio(b.assets.total, b.equity.total)}</span></div>
            <div class="ratio-row"><span>Debt-to-equity ratio</span><span>${this._ratio(b.liabilities.total, b.equity.total)}</span></div>
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
      <foundr-topbar active="margins" businessName=${this.businessName}></foundr-topbar>
      <div class="page">
        ${this._renderHeader()}
        <div class="page-area">
          ${body}
          ${this.loading
            ? html`<div class="loader-overlay"><foundr-mini-loader></foundr-mini-loader></div>`
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
