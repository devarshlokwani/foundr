import { LitElement, html, css, svg, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { apiGet } from "../../shared/lib/api";
import type { DashboardInsights, CategorySlice, CashPoint } from "../../shared/lib/types";
import { formatMoney } from "../../shared/lib/format";

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
  @state() private data: DashboardInsights | null = null;
  @state() private loading = true;

  connectedCallback(): void {
    super.connectedCallback();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.data = await apiGet<DashboardInsights>("/insights");
    } catch {
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  private _money(n: number): string {
    return formatMoney(n);
  }

  private _monthLabel(key: string): string {
    const [y, m] = key.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[m - 1]} ${String(y).slice(2)}`;
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
    .empty { font-size: 13px; color: var(--ink-soft, #6B6B66); padding: 30px 0; text-align: center; line-height: 1.7; }
    .empty strong { color: var(--ink, #1C1C1C); font-size: 16px; }

    /* category bars */
    .bar-row { margin-bottom: 14px; }
    .bar-head { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
    .bar-head .name { color: var(--ink, #1C1C1C); font-weight: 500; }
    .bar-head .val { color: var(--ink-soft, #6B6B66); }
    .bar-track { height: 10px; background: var(--sage-soft, #DDE7E0); border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--forest, #2D4A3E); border-radius: 999px; transition: width 0.5s ease; }

    svg { display: block; width: 100%; height: auto; }
    .axis-label { font-size: 10px; fill: var(--ink-soft, #6B6B66); font-family: var(--font-body, sans-serif); }

    @media (max-width: 880px) { .grid { grid-template-columns: 1fr; } }
  `;

  private _renderCategoryBars(slices: CategorySlice[]): TemplateResult {
    if (slices.length === 0) {
      return html`<div class="empty">No expenses to break down yet.</div>`;
    }
    const max = Math.max(...slices.map((s) => s.total));
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

    return html`
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cash over time">
        ${showZero
          ? svg`<line x1=${padL} y1=${zeroY} x2=${W - padR} y2=${zeroY}
              stroke="var(--line, #E2DFD7)" stroke-width="1" stroke-dasharray="3 3" />`
          : ""}
        <polygon points=${areaPts} fill="var(--sage-soft, #DDE7E0)" opacity="0.6" />
        <polyline points=${linePts} fill="none" stroke="var(--forest, #2D4A3E)"
          stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        ${series.map(
          (p, i) => svg`<circle cx=${x(i)} cy=${y(p.cash)} r="3" fill="var(--forest, #2D4A3E)" />`
        )}
        ${series.map((p, i) => {
          const show = series.length <= 6 || i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2);
          return show
            ? svg`<text x=${x(i)} y=${H - 8} text-anchor="middle" class="axis-label">${this._monthLabel(p.month)}</text>`
            : "";
        })}
      </svg>
    `;
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
          <h3>Cash over time</h3>
          <p class="sub">Running balance, month by month</p>
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