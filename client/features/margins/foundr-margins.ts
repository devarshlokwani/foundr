import { LitElement, html, css, svg, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { apiGet } from "../../shared/lib/api";
import type { MarginsReport, CategorySlice, BalanceSheet, DashboardInsights, MonthlyPoint } from "../../shared/lib/types";
import { formatMoney, getCurrency } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";
import { resolveActiveBusiness } from "../../shared/lib/business";
import { checkSessionFreshness } from "../../shared/lib/session-guard";
import { downloadCsv } from "../../shared/lib/csv";
import { RANGE_PRESETS, getStoredRangePreset, setStoredRangePreset, rangeQueryParams, type RangePreset } from "../../shared/lib/dateRange";
import { GRANULARITY_OPTIONS, getStoredGranularity, setStoredGranularity, type Granularity } from "../../shared/lib/granularity";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-mini-loader";
import "../../shared/components/foundr-tour-overlay";

type Section = "margins" | "trends" | "balance-sheet";

/** Categorical palette for the donut chart — the accent colour from each
 * of the app's own themes, so the chart reads as branded, not generic. */
const DONUT_COLORS = ["#2D4A3E", "#4C8267", "#4B2E83", "#1F5A6E", "#B5502E", "#5B7A99", "#8AAF9A"];

/**
 * <foundr-margins>
 * Financial reports, three views: Margins (a cash-basis income breakdown —
 * revenue by category, expenses by category, net margin), Trends (revenue
 * vs. expense over time, month-over-month net, category donut), and
 * Balance Sheet (Assets = Liabilities + Equity, made possible by Draws
 * and Debt). Margins and Balance Sheet are exportable as CSV.
 *
 * Auth-guarded like the dashboard. Reachable at /margins.
 */
@customElement("foundr-margins")
export class FoundrMargins extends LitElement {
  @state() private loading = true;
  @state() private error = "";
  @state() private report: MarginsReport | null = null;
  @state() private balanceSheet: BalanceSheet | null = null;
  @state() private insights: DashboardInsights | null = null;
  @state() private section: Section = "margins";
  @state() private businessName = "";
  @state() private businessId = "";
  @state() private hoveredMonth: number | null = null;
  @state() private range: RangePreset = getStoredRangePreset();
  // Trend-chart-only granularity — month-over-month always stays monthly
  // (its whole point is a monthly comparison), so it keeps its own series
  // fetched at "month" regardless of what the trend chart is set to.
  @state() private trendGranularity: Granularity = getStoredGranularity();
  @state() private momSeries: MonthlyPoint[] = [];

  // Above this many points (daily granularity over a few months), skip the
  // per-point markers so the line doesn't turn into a wall of dots.
  private static readonly MAX_DOTS = 60;

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
      const [report, balanceSheet, insights] = await Promise.all([
        apiGet<MarginsReport>(`/reports/margins?businessId=${this.businessId}${rangeQueryParams(this.range)}`),
        apiGet<BalanceSheet>(`/reports/balance-sheet?businessId=${this.businessId}`),
        apiGet<DashboardInsights>(`/insights?businessId=${this.businessId}${rangeQueryParams(this.range)}&granularity=${this.trendGranularity}`),
      ]);
      this.report = report;
      this.balanceSheet = balanceSheet;
      this.insights = insights;
      this.momSeries = this.trendGranularity === "month" ? insights.monthlySeries : await this._fetchMonthlySeries("month");
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your reports.";
    } finally {
      this.loading = false;
    }
  }

  private async _fetchMonthlySeries(granularity: Granularity): Promise<MonthlyPoint[]> {
    const res = await apiGet<DashboardInsights>(
      `/insights?businessId=${this.businessId}${rangeQueryParams(this.range)}&granularity=${granularity}`
    );
    return res.monthlySeries;
  }

  private async _onTrendGranularityChange(e: Event): Promise<void> {
    const next = (e.target as HTMLSelectElement).value as Granularity;
    this.trendGranularity = next;
    setStoredGranularity(next);
    this.loading = true;
    await this._load();
  }

  private async _onRangeChange(e: Event): Promise<void> {
    const preset = (e.target as HTMLSelectElement).value as RangePreset;
    this.range = preset;
    setStoredRangePreset(preset);
    this.loading = true;
    await this._load();
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

  // Zero new dependencies: the browser's own print dialog doubles as
  // "Save as PDF" everywhere that matters, and the @media print rules
  // below hide everything except whichever report is currently on
  // screen — margins or balance sheet, whichever tab is open.
  private _exportPdf(): void {
    window.print();
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
    .ti-file-type-pdf:before { content: "\\fb10"; }
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
    .head-actions { display: flex; align-items: center; gap: 10px; }
    .range-select {
      font-family: inherit; font-size: 13.5px; font-weight: 500; color: var(--ink, #1C1C1C);
      background: var(--surface, #FAFAF7); border: 0.5px solid var(--line, #E2DFD7);
      border-radius: var(--radius-pill, 999px); padding: 9px 16px; cursor: pointer;
      appearance: none; -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B6B66' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 14px center; padding-right: 32px;
    }
    .card-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .granularity-select {
      font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--ink, #1C1C1C);
      background: var(--surface-alt, #F2EFE8); border: 0.5px solid var(--line, #E2DFD7);
      border-radius: var(--radius-pill, 999px); padding: 6px 12px; cursor: pointer; flex-shrink: 0;
      appearance: none; -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B6B66' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 10px center; padding-right: 26px;
    }
    .export-btn {
      background: var(--forest, #2D4A3E); color: #fff; font-size: 14px; font-weight: 500;
      padding: 11px 18px; border-radius: var(--radius-pill, 999px); display: flex; align-items: center; gap: 8px;
      white-space: nowrap; transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .export-btn:hover { background: var(--forest-deep, #1F3329); transform: translate(-5px, -5px); box-shadow: 5px 5px 0 var(--sage, #8AAF9A); }
    .export-btn:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .export-btn.outline {
      background: transparent; color: var(--ink, #1C1C1C); border: 1px solid var(--line, #E2DFD7);
    }
    .export-btn.outline:hover { background: rgba(45,74,62,0.05); box-shadow: none; transform: none; }

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

    .bar-row { position: relative; margin-bottom: 16px; }
    .bar-row:last-child { margin-bottom: 0; }
    .bar-head { display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 6px; gap: 10px; }
    .bar-head .name { color: var(--ink, #1C1C1C); font-weight: 500; }
    .bar-head .val { color: var(--ink-soft, #6B6B66); white-space: nowrap; }
    .bar-track { height: 8px; border-radius: 999px; overflow: hidden; cursor: default; }
    .bar-track.rev { background: var(--sage-soft, #DDE7E0); }
    .bar-track.exp { background: var(--danger-bg, #FBEAE9); }
    .bar-fill { height: 100%; border-radius: 999px; transition: width 0.5s ease; }
    .bar-fill.rev { background: var(--forest, #2D4A3E); }
    .bar-tooltip {
      position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
      background: var(--ink, #1C1C1C); color: #fff; font-size: 11.5px; font-weight: 500;
      padding: 5px 10px; border-radius: 8px; white-space: nowrap;
      opacity: 0; pointer-events: none; transition: opacity 0.15s ease; z-index: 2;
    }
    .bar-row:hover .bar-tooltip { opacity: 1; }
    .bar-fill.exp { background: var(--danger, #D9534F); }

    .card-total {
      display: flex; justify-content: space-between; font-size: 14px; font-weight: 600;
      margin-top: 18px; padding-top: 16px; border-top: 0.5px solid var(--line, #E2DFD7);
    }

    /* Trends tab — charts */
    .trends-grid { margin-top: 16px; }
    .chart-empty { font-size: 13px; color: var(--ink-soft, #6B6B66); padding: 30px 0; text-align: center; }
    svg { display: block; width: 100%; height: auto; }
    .axis-label { font-size: 10px; fill: var(--ink-soft, #6B6B66); font-family: var(--font-body, sans-serif); }
    .chart-hit-area { fill: transparent; cursor: crosshair; }
    .guide-line { stroke: var(--ink-soft, #6B6B66); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.5; pointer-events: none; }
    .hover-point { stroke: var(--surface, #FAFAF7); stroke-width: 2; pointer-events: none; }
    .hover-point.rev { fill: var(--forest, #2D4A3E); }
    .hover-point.exp { fill: var(--danger, #D9534F); }
    .tooltip-box { fill: var(--ink, #1C1C1C); pointer-events: none; }
    .tooltip-text { fill: #fff; font-family: var(--font-body, sans-serif); pointer-events: none; }
    .tooltip-text.label { font-size: 9px; opacity: 0.75; }
    .tooltip-text.value { font-size: 10.5px; font-weight: 600; }
    .tooltip-text.value.rev { fill: var(--sage, #8AAF9A); }
    .tooltip-text.value.exp { fill: #E8A6A2; }
    .mom-value { font-size: 10px; font-weight: 600; fill: var(--ink, #1C1C1C); font-family: var(--font-body, sans-serif); }

    .chart-legend { display: flex; gap: 18px; margin-bottom: 10px; font-size: 12.5px; color: var(--ink-soft, #6B6B66); }
    .chart-legend .dot, .donut-legend-row .dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px;
    }
    .chart-legend .dot.rev { background: var(--forest, #2D4A3E); }
    .chart-legend .dot.exp { background: var(--danger, #D9534F); }

    .donut-wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .donut-wrap svg { width: 150px; height: 150px; flex-shrink: 0; }
    .donut-legend { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 8px; }
    .donut-legend-row { display: flex; align-items: center; font-size: 13px; }
    .donut-legend-row .name { flex: 1; min-width: 0; color: var(--ink, #1C1C1C); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .donut-legend-row .pct { color: var(--ink-soft, #6B6B66); font-weight: 500; }

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

    /* Export PDF (window.print()) — only the current report should print,
       none of the app chrome around it. Whichever section is active is
       already the only one in the DOM (see render()), so this just needs
       to strip navigation/tabs/buttons and let the content fill the page. */
    @media print {
      foundr-topbar, .section-tabs, .head-actions, .loader-overlay, foundr-tour-overlay { display: none !important; }
      :host { min-height: 0; background: #fff; }
      .page { max-width: none; padding: 0; }
      .kpi.dark { background: #fff !important; color: var(--ink, #1C1C1C) !important; border: 1px solid var(--line, #E2DFD7) !important; }
      .kpi.dark .kpi-hint { color: var(--ink-soft, #6B6B66) !important; }
      .statement { border-color: #000; box-shadow: none; }
      .card, .ratios-card { box-shadow: none; border: 1px solid var(--line, #E2DFD7); break-inside: avoid; }
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
              <div class="head-actions">
                ${this.section !== "balance-sheet"
                  ? html`
                      <select class="range-select" .value=${this.range} @change=${this._onRangeChange}>
                        ${RANGE_PRESETS.map((r) => html`<option value=${r.code}>${r.label}</option>`)}
                      </select>
                    `
                  : ""}
                ${this.section !== "trends"
                  ? html`
                      <button class="export-btn" @click=${this.section === "margins" ? this._exportCsv : this._exportBalanceSheetCsv}>
                        <i class="ti ti-download" aria-hidden="true"></i>Export CSV
                      </button>
                      <button class="export-btn outline" @click=${this._exportPdf}>
                        <i class="ti ti-file-type-pdf" aria-hidden="true"></i>Export PDF
                      </button>
                    `
                  : ""}
              </div>
            `
          : ""}
      </div>
      ${ready
        ? html`
            <div class="section-tabs" style="--tab-w: 130px">
              <div class="section-indicator" style="transform: translateX(${this._sectionIndex * 130}px)"></div>
              <button class="section-tab ${this.section === "margins" ? "active" : ""}"
                @click=${() => { this.section = "margins"; }}>Margins</button>
              <button class="section-tab ${this.section === "trends" ? "active" : ""}"
                @click=${() => { this.section = "trends"; }}>Trends</button>
              <button class="section-tab ${this.section === "balance-sheet" ? "active" : ""}"
                @click=${() => { this.section = "balance-sheet"; }}>Balance Sheet</button>
            </div>
          `
        : ""}
    `;
  }

  private get _sectionIndex(): number {
    return this.section === "margins" ? 0 : this.section === "trends" ? 1 : 2;
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
    const grandTotal = slices.reduce((sum, s) => sum + s.total, 0);
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
            <div class="bar-tooltip">
              ${this._money(s.total)} · ${grandTotal > 0 ? Math.round((s.total / grandTotal) * 100) : 0}% of total
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

  private _periodLabel(key: string): string {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const parts = key.split("-").map(Number);
    if (parts.length === 2) {
      const [y, m] = parts;
      return `${months[m - 1]} ${String(y).slice(2)}`;
    }
    const [, m, d] = parts;
    return `${d} ${months[m - 1]}`;
  }

  private _renderTrends(): TemplateResult {
    const series = this.insights?.monthlySeries ?? [];
    const expenseSlices = this.report?.expenses ?? [];
    return html`
      <div class="card">
        <div class="card-head-row">
          <div>
            <h3>Revenue vs. expenses</h3>
            <p class="sub">Where the two lines cross is where you stopped losing money</p>
          </div>
          <select class="granularity-select" .value=${this.trendGranularity} @change=${this._onTrendGranularityChange}>
            ${GRANULARITY_OPTIONS.map((o) => html`<option value=${o.code} ?selected=${o.code === this.trendGranularity}>${o.label}</option>`)}
          </select>
        </div>
        ${this._renderTrendChart(series)}
      </div>
      <div class="grid trends-grid">
        <div class="card">
          <h3>Net by month</h3>
          <p class="sub">Income minus expenses, per month</p>
          ${this._renderMonthOverMonth(this.momSeries)}
        </div>
        <div class="card">
          <h3>Where it went</h3>
          <p class="sub">Expense categories, as a share of the whole</p>
          ${this._renderDonut(expenseSlices)}
        </div>
      </div>
    `;
  }

  // ---- Revenue vs. expense trend (dual line, same hover pattern as foundr-insights.ts's cash chart) ----

  private _renderTrendChart(series: MonthlyPoint[]): TemplateResult {
    if (series.length < 2) {
      return html`<div class="chart-empty">Add entries across more than one month to see a trend.</div>`;
    }

    const W = 680, H = 200, padL = 36, padR = 20, padT = 16, padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const allVals = series.flatMap((p) => [p.income, p.expenses]);
    const maxV = Math.max(...allVals, 0);

    const x = (i: number) => padL + (i / (series.length - 1)) * innerW;
    const y = (v: number) => padT + innerH - (maxV > 0 ? (v / maxV) * innerH : 0);

    const incomeLine = series.map((p, i) => `${x(i)},${y(p.income)}`).join(" ");
    const expenseLine = series.map((p, i) => `${x(i)},${y(p.expenses)}`).join(" ");

    const hover = this.hoveredMonth !== null ? series[this.hoveredMonth] : null;
    const hoverX = this.hoveredMonth !== null ? x(this.hoveredMonth) : 0;
    const boxW = 96, boxH = 44;
    const boxX = Math.max(padL, Math.min(hoverX - boxW / 2, W - padR - boxW));

    return html`
      <div class="chart-legend">
        <span><i class="dot rev"></i>Revenue</span>
        <span><i class="dot exp"></i>Expenses</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue vs expenses by month">
        <polyline points=${incomeLine} fill="none" stroke="var(--forest, #2D4A3E)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        <polyline points=${expenseLine} fill="none" stroke="var(--danger, #D9534F)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        ${series.length <= FoundrMargins.MAX_DOTS
          ? series.map((p, i) => svg`<circle cx=${x(i)} cy=${y(p.income)} r="3" fill="var(--forest, #2D4A3E)" />`)
          : ""}
        ${series.length <= FoundrMargins.MAX_DOTS
          ? series.map((p, i) => svg`<circle cx=${x(i)} cy=${y(p.expenses)} r="3" fill="var(--danger, #D9534F)" />`)
          : ""}
        ${series.map((p, i) => {
          const show = series.length <= 6 || i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2);
          return show
            ? svg`<text x=${x(i)} y=${H - 8} text-anchor="middle" class="axis-label">${this._periodLabel(p.key)}</text>`
            : "";
        })}
        ${hover
          ? svg`
              <line class="guide-line" x1=${hoverX} y1=${padT} x2=${hoverX} y2=${H - padB} />
              <circle class="hover-point rev" cx=${hoverX} cy=${y(hover.income)} r="5" />
              <circle class="hover-point exp" cx=${hoverX} cy=${y(hover.expenses)} r="5" />
              <rect class="tooltip-box" x=${boxX} y=${padT} width=${boxW} height=${boxH} rx="6" />
              <text class="tooltip-text label" x=${boxX + boxW / 2} y=${padT + 12} text-anchor="middle">${this._periodLabel(hover.key)}</text>
              <text class="tooltip-text value rev" x=${boxX + boxW / 2} y=${padT + 26} text-anchor="middle">${this._money(hover.income)}</text>
              <text class="tooltip-text value exp" x=${boxX + boxW / 2} y=${padT + 39} text-anchor="middle">${this._money(hover.expenses)}</text>
            `
          : ""}
        <rect class="chart-hit-area" x="0" y="0" width=${W} height=${H}
          @mousemove=${(e: MouseEvent) => this._onTrendHover(e, series, W, padL, padR)}
          @mouseleave=${() => { this.hoveredMonth = null; }}
        />
      </svg>
    `;
  }

  private _onTrendHover(e: MouseEvent, series: MonthlyPoint[], W: number, padL: number, padR: number): void {
    const svgEl = (e.currentTarget as SVGElement).ownerSVGElement;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const innerW = W - padL - padR;
    const t = (svgX - padL) / innerW;
    const idx = Math.round(t * (series.length - 1));
    this.hoveredMonth = Math.max(0, Math.min(series.length - 1, idx));
  }

  // ---- Month-over-month net (single bar per month, colour by sign) ----

  private _renderMonthOverMonth(series: MonthlyPoint[]): TemplateResult {
    if (series.length === 0) {
      return html`<div class="chart-empty">Nothing tracked yet.</div>`;
    }
    const nets = series.map((p) => p.income - p.expenses);
    const maxAbs = Math.max(...nets.map((n) => Math.abs(n)), 1);

    const W = 320, H = 190, padL = 10, padR = 10, padT = 20, padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const zeroY = padT + innerH / 2;
    const barW = Math.min(36, (innerW / series.length) * 0.55);

    const x = (i: number) => padL + (innerW / series.length) * (i + 0.5);
    const barHeight = (n: number) => (Math.abs(n) / maxAbs) * (innerH / 2);

    return html`
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net profit or loss by month">
        <line x1=${padL} y1=${zeroY} x2=${W - padR} y2=${zeroY} stroke="var(--line, #E2DFD7)" stroke-width="1" />
        ${series.map((p, i) => {
          const net = nets[i];
          const h = barHeight(net);
          const positive = net >= 0;
          const barY = positive ? zeroY - h : zeroY;
          return svg`
            <rect x=${x(i) - barW / 2} y=${barY} width=${barW} height=${Math.max(h, 1)} rx="4"
              fill=${positive ? "var(--forest, #2D4A3E)" : "var(--danger, #D9534F)"} />
            <text x=${x(i)} y=${positive ? barY - 5 : barY + h + 13} text-anchor="middle" class="mom-value">${this._money(net)}</text>
            <text x=${x(i)} y=${H - 8} text-anchor="middle" class="axis-label">${this._periodLabel(p.key)}</text>
          `;
        })}
      </svg>
    `;
  }

  // ---- Category donut (reuses the already-loaded expense breakdown, no extra fetch) ----

  private _renderDonut(slices: CategorySlice[]): TemplateResult {
    if (slices.length === 0) {
      return html`<div class="chart-empty">No expenses to break down yet.</div>`;
    }
    // Cap to the biggest 6 + an "Other" bucket so the ring stays readable.
    const sorted = [...slices].sort((a, b) => b.total - a.total);
    const shown = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((sum, s) => sum + s.total, 0);
    const segments = rest > 0 ? [...shown, { category: "Other", total: rest }] : shown;

    const total = segments.reduce((sum, s) => sum + s.total, 0);
    const cx = 90, cy = 90, r = 62, strokeWidth = 26;
    const circumference = 2 * Math.PI * r;

    let cumulative = 0;
    const arcs = segments.map((s, i) => {
      const frac = total > 0 ? s.total / total : 0;
      const len = frac * circumference;
      const arc = { ...s, color: DONUT_COLORS[i % DONUT_COLORS.length], dasharray: `${len} ${circumference - len}`, dashoffset: -cumulative, pct: Math.round(frac * 100) };
      cumulative += len;
      return arc;
    });

    return html`
      <div class="donut-wrap">
        <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Expense categories">
          <g transform="rotate(-90 ${cx} ${cy})">
            ${arcs.map(
              (a) => svg`<circle cx=${cx} cy=${cy} r=${r} fill="none" stroke=${a.color} stroke-width=${strokeWidth}
                stroke-dasharray=${a.dasharray} stroke-dashoffset=${a.dashoffset} />`
            )}
          </g>
        </svg>
        <div class="donut-legend">
          ${arcs.map(
            (a) => html`
              <div class="donut-legend-row">
                <i class="dot" style="background:${a.color}"></i>
                <span class="name">${a.category}</span>
                <span class="pct">${a.pct}%</span>
              </div>
            `
          )}
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
      else if (this.section === "trends") body = this._renderTrends();
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
      <foundr-tour-overlay></foundr-tour-overlay>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-margins": FoundrMargins;
  }
}
