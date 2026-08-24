import { LitElement, html, css, svg, type TemplateResult, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { apiGet } from "../../shared/lib/api";
import type { DashboardInsights, CategorySlice, CashPoint } from "../../shared/lib/types";
import { formatMoney } from "../../shared/lib/format";
import { rangeQueryParams, type RangePreset } from "../../shared/lib/dateRange";
import { GRANULARITY_OPTIONS, getStoredGranularity, setStoredGranularity, type Granularity } from "../../shared/lib/granularity";

/**
 * <foundr-insights>
 * Two hand-built SVG charts for the dashboard:
 *  - Spending by category (horizontal bars, biggest first)
 *  - Cash over time (area + line, running monthly balance)
 *
 * Fetches /api/insights itself and exposes a refresh() the dashboard
 * calls after a new entry is added. Pure SVG: no chart library, matches
 * the Foundr theme exactly, and renders fine inside the shadow root.
 */
@customElement("foundr-insights")
export class FoundrInsights extends LitElement {
  @property({ type: String }) businessId = "";
  @property({ type: String }) range: RangePreset = "all-time";
  @state() private data: DashboardInsights | null = null;
  @state() private loading = true;
  @state() private hoveredIndex: number | null = null;
  @state() private granularity: Granularity = getStoredGranularity();

  private static readonly CHART_W = 320;
  private static readonly PAD_L = 28;
  private static readonly PAD_R = 28;
  // Above this many points (daily granularity over a few months), skip the
  // per-point markers so the line doesn't turn into a wall of dots.
  private static readonly MAX_DOTS = 60;

  protected updated(changed: PropertyValues<this>): void {
    if ((changed.has("businessId") || changed.has("range")) && this.businessId) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (!this.businessId) return;
    try {
      this.data = await apiGet<DashboardInsights>(
        `/insights?businessId=${this.businessId}${rangeQueryParams(this.range)}&granularity=${this.granularity}`
      );
    } catch {
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  private _onGranularityChange(e: Event): void {
    const next = (e.target as HTMLSelectElement).value as Granularity;
    this.granularity = next;
    setStoredGranularity(next);
    void this.refresh();
  }

  private _money(n: number): string {
    return formatMoney(n);
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

  static styles = css`
    :host { display: block; margin-top: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      padding: 22px; border: 0.5px solid var(--line, #E2DFD7);
    }
    .card h3 {
      font-family: var(--font-body, "Inter", sans-serif); font-size: 14px; font-weight: 600;
      margin: 0 0 4px; color: var(--ink, #1C1C1C);
    }
    .card .sub { font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 18px; }
    .card-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .granularity-select {
      font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--ink, #1C1C1C);
      background: var(--surface-alt, #F2EFE8); border: 0.5px solid var(--line, #E2DFD7);
      border-radius: var(--radius-pill, 999px); padding: 6px 12px; cursor: pointer; flex-shrink: 0;
      appearance: none; -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B6B66' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 10px center; padding-right: 26px;
    }
    .empty { font-size: 13px; color: var(--ink-soft, #6B6B66); padding: 30px 0; text-align: center; line-height: 1.7; }
    .empty strong { color: var(--ink, #1C1C1C); font-size: 16px; }

    /* category bars */
    .bar-row { position: relative; margin-bottom: 14px; }
    .bar-head { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
    .bar-head .name { color: var(--ink, #1C1C1C); font-weight: 500; }
    .bar-head .val { color: var(--ink-soft, #6B6B66); }
    .bar-track { height: 10px; background: var(--sage-soft, #DDE7E0); border-radius: 999px; overflow: hidden; cursor: default; }
    .bar-fill { height: 100%; background: var(--forest, #2D4A3E); border-radius: 999px; transition: width 0.5s ease; }

    /* Hover tooltip on a bar row: pure CSS reveal, shows exact amount and
       share of the total, which the always-visible label doesn't. */
    .bar-tooltip {
      position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
      background: var(--ink, #1C1C1C); color: #fff; font-size: 11.5px; font-weight: 500;
      padding: 5px 10px; border-radius: 8px; white-space: nowrap;
      opacity: 0; pointer-events: none; transition: opacity 0.15s ease; z-index: 2;
    }
    .bar-row:hover .bar-tooltip { opacity: 1; }

    svg { display: block; width: 100%; height: auto; }
    .axis-label { font-size: 10px; fill: var(--ink-soft, #6B6B66); font-family: var(--font-body, sans-serif); }
    .chart-hit-area { fill: transparent; cursor: crosshair; }
    .guide-line { stroke: var(--ink-soft, #6B6B66); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.5; pointer-events: none; }
    .hover-point { fill: var(--forest, #2D4A3E); stroke: var(--surface, #FAFAF7); stroke-width: 2; pointer-events: none; }
    .tooltip-box { fill: var(--ink, #1C1C1C); pointer-events: none; }
    .tooltip-text { fill: #fff; font-family: var(--font-body, sans-serif); pointer-events: none; }
    .tooltip-text.label { font-size: 9px; opacity: 0.75; }
    .tooltip-text.value { font-size: 11px; font-weight: 600; }

    @media (max-width: 880px) { .grid { grid-template-columns: 1fr; } }
  `;

  private _renderCategoryBars(slices: CategorySlice[]): TemplateResult {
    if (slices.length === 0) {
      return html`<div class="empty">No expenses to break down yet.</div>`;
    }
    const max = Math.max(...slices.map((s) => s.total));
    const grandTotal = slices.reduce((sum, s) => sum + s.total, 0);
    const top = slices.slice(0, 6); // keep it readable
    return html`
      ${top.map(
        (s) => html`
          <div class="bar-row">
            <div class="bar-head">
              <span class="name">${s.category}</span>
              <span class="val">${this._money(s.total)}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${max > 0 ? (s.total / max) * 100 : 0}%"></div>
            </div>
            <div class="bar-tooltip">
              ${this._money(s.total)} · ${grandTotal > 0 ? Math.round((s.total / grandTotal) * 100) : 0}% of total
            </div>
          </div>
        `
      )}
    `;
  }

  private _renderCashChart(series: CashPoint[]): TemplateResult {
    if (series.length === 0) {
      return html`<div class="empty">Add entries to see your cash trend.</div>`;
    }
    // A line needs at least two months to be meaningful.
    if (series.length === 1) {
      return html`<div class="empty">
        Cash so far: <strong>${this._money(series[0].cash)}</strong><br />
        Add entries across more months to see the trend.
      </div>`;
    }

    // Chart geometry
    const W = 320, H = 180, padL = 28, padR = 28, padT = 12, padB = 24;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const cashVals = series.map((p) => p.cash);
    const maxCash = Math.max(...cashVals, 0);
    const minCash = Math.min(...cashVals, 0);
    const range = maxCash - minCash || 1;

    const x = (i: number) =>
      padL + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
    const y = (cash: number) => padT + innerH - ((cash - minCash) / range) * innerH;

    const linePts = series.map((p, i) => `${x(i)},${y(p.cash)}`).join(" ");
    const areaPts = `${x(0)},${y(minCash)} ${linePts} ${x(series.length - 1)},${y(minCash)}`;

    // zero line (if range crosses zero)
    const zeroY = y(0);
    const showZero = minCash < 0 && maxCash > 0;

    const hover = this.hoveredIndex !== null ? series[this.hoveredIndex] : null;
    const hoverX = this.hoveredIndex !== null ? x(this.hoveredIndex) : 0;
    const hoverY = hover ? y(hover.cash) : 0;

    // Tooltip box, clamped so it never overflows the chart's left/right edge.
    const boxW = 62, boxH = 30;
    const boxX = Math.max(padL, Math.min(hoverX - boxW / 2, W - padR - boxW));
    const boxY = padT;

    return html`
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cash over time">
        ${showZero
          ? svg`<line x1=${padL} y1=${zeroY} x2=${W - padR} y2=${zeroY}
              stroke="var(--line, #E2DFD7)" stroke-width="1" stroke-dasharray="3 3" />`
          : ""}
        <polygon points=${areaPts} fill="var(--sage-soft, #DDE7E0)" opacity="0.6" />
        <polyline points=${linePts} fill="none" stroke="var(--forest, #2D4A3E)"
          stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        ${series.length <= FoundrInsights.MAX_DOTS
          ? series.map((p, i) => svg`<circle cx=${x(i)} cy=${y(p.cash)} r="3" fill="var(--forest, #2D4A3E)" />`)
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
              <circle class="hover-point" cx=${hoverX} cy=${hoverY} r="5" />
              <rect class="tooltip-box" x=${boxX} y=${boxY} width=${boxW} height=${boxH} rx="6" />
              <text class="tooltip-text label" x=${boxX + boxW / 2} y=${boxY + 12} text-anchor="middle">${this._periodLabel(hover.key)}</text>
              <text class="tooltip-text value" x=${boxX + boxW / 2} y=${boxY + 24} text-anchor="middle">${this._money(hover.cash)}</text>
            `
          : ""}
        <rect class="chart-hit-area" x="0" y="0" width=${W} height=${H}
          @mousemove=${(e: MouseEvent) => this._onChartHover(e, series)}
          @mouseleave=${() => { this.hoveredIndex = null; }}
        />
      </svg>
    `;
  }

  private _onChartHover(e: MouseEvent, series: CashPoint[]): void {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as unknown as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const scaleX = FoundrInsights.CHART_W / rect.width;
    const svgX = (e.clientX - rect.left) * scaleX;
    const innerW = FoundrInsights.CHART_W - FoundrInsights.PAD_L - FoundrInsights.PAD_R;
    const t = (svgX - FoundrInsights.PAD_L) / innerW;
    const idx = Math.round(t * (series.length - 1));
    this.hoveredIndex = Math.max(0, Math.min(series.length - 1, idx));
  }

  render(): TemplateResult {
    if (this.loading || !this.data) return html``;

    const { categoryBreakdown, cashSeries } = this.data;
    // Hide the whole section until there's something to show.
    if (categoryBreakdown.length === 0 && cashSeries.length === 0) return html``;

    return html`
      <div class="grid">
        <div class="card">
          <h3>Where your money goes</h3>
          <p class="sub">Spending by category</p>
          ${this._renderCategoryBars(categoryBreakdown)}
        </div>
        <div class="card">
          <div class="card-head-row">
            <div>
              <h3>Cash over time</h3>
              <p class="sub">Running balance</p>
            </div>
            <select class="granularity-select" .value=${this.granularity} @change=${this._onGranularityChange}>
              ${GRANULARITY_OPTIONS.map((o) => html`<option value=${o.code} ?selected=${o.code === this.granularity}>${o.label}</option>`)}
            </select>
          </div>
          ${this._renderCashChart(cashSeries)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-insights": FoundrInsights;
  }
}