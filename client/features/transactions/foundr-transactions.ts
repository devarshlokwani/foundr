import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { apiGet, apiPatch, apiDelete } from "../../shared/lib/api";
import type { UnifiedEntry, EntriesPage } from "../../shared/lib/types";
import { formatMoney } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";
import { resolveActiveBusiness } from "../../shared/lib/business";
import { checkSessionFreshness } from "../../shared/lib/session-guard";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-mini-loader";
import "../../shared/components/foundr-tour-overlay";

type Kind = UnifiedEntry["kind"];

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "revenue", label: "Revenue" },
  { value: "investment", label: "Investment" },
  { value: "draw", label: "Draw" },
  { value: "debt", label: "Debt" },
  { value: "repayment", label: "Repayment" },
];

const PAGE_SIZE = 50;

/**
 * <foundr-transactions>
 * A full-page, unified, searchable/filterable/paginated list of every
 * entry — expenses, revenue, investments, draws, and debt — newest first.
 * Supports inline editing (amount + note) and deleting, routing each
 * change to the correct backend collection based on the entry's `source`.
 *
 * Search and filters are server-side (see /api/entries and
 * server/lib/entries.ts) — this scales to however many entries a business
 * accumulates, not just what fits comfortably in one unbounded DOM list.
 *
 * Auth-guarded like the dashboard. Reachable at /transactions.
 */
@customElement("foundr-transactions")
export class FoundrTransactions extends LitElement {
  @state() private entries: UnifiedEntry[] = [];
  @state() private loading = true;
  @state() private error = "";
  @state() private editingId: string | null = null;
  @state() private editAmount = "";
  @state() private editNote = "";
  @state() private busyId: string | null = null;
  @state() private businessId = "";
  @state() private businessLabel = "";

  // Search — debounced, resets to page 1 on change.
  @state() private search = "";
  private _searchDebounce: ReturnType<typeof setTimeout> | null = null;

  // Applied filters (what the last fetch actually used).
  @state() private selectedKinds: Kind[] = [];
  @state() private dateFrom = "";
  @state() private dateTo = "";

  // Filter drawer — a draft copy so Apply/Clear is explicit, not live-filtering per checkbox.
  @state() private filterDrawerOpen = false;
  @state() private draftKinds: Kind[] = [];
  @state() private draftDateFrom = "";
  @state() private draftDateTo = "";

  // Pagination
  @state() private page = 1;
  @state() private total = 0;

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
      this.businessLabel = businesses.find((b) => b._id === activeId)?.name ?? "";
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
      const params = new URLSearchParams();
      params.set("businessId", this.businessId);
      params.set("page", String(this.page));
      params.set("pageSize", String(PAGE_SIZE));
      if (this.search) params.set("search", this.search);
      if (this.selectedKinds.length > 0) params.set("kinds", this.selectedKinds.join(","));
      if (this.dateFrom) params.set("dateFrom", this.dateFrom);
      if (this.dateTo) params.set("dateTo", this.dateTo);

      const res = await apiGet<EntriesPage>(`/entries?${params.toString()}`);
      this.entries = res.items;
      this.total = res.total;
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your entries.";
    } finally {
      this.loading = false;
    }
  }

  // ---- Search ----

  private _onSearchInput(e: Event): void {
    this.search = (e.target as HTMLInputElement).value;
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => {
      this.page = 1;
      void this._load();
    }, 300);
  }

  // ---- Filter drawer ----

  private get activeFilterCount(): number {
    let n = 0;
    if (this.selectedKinds.length > 0) n++;
    if (this.dateFrom || this.dateTo) n++;
    return n;
  }

  private _openFilters(): void {
    this.draftKinds = [...this.selectedKinds];
    this.draftDateFrom = this.dateFrom;
    this.draftDateTo = this.dateTo;
    this.filterDrawerOpen = true;
  }

  private _closeFilters(): void {
    this.filterDrawerOpen = false;
  }

  private _toggleDraftKind(kind: Kind): void {
    this.draftKinds = this.draftKinds.includes(kind)
      ? this.draftKinds.filter((k) => k !== kind)
      : [...this.draftKinds, kind];
  }

  private async _applyFilters(): Promise<void> {
    this.selectedKinds = this.draftKinds;
    this.dateFrom = this.draftDateFrom;
    this.dateTo = this.draftDateTo;
    this.page = 1;
    this.filterDrawerOpen = false;
    this.loading = true;
    await this._load();
  }

  private async _clearFilters(): Promise<void> {
    this.draftKinds = [];
    this.draftDateFrom = "";
    this.draftDateTo = "";
    this.selectedKinds = [];
    this.dateFrom = "";
    this.dateTo = "";
    this.page = 1;
    this.filterDrawerOpen = false;
    this.loading = true;
    await this._load();
  }

  // ---- Pagination ----

  private get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / PAGE_SIZE));
  }

  private async _goToPage(p: number): Promise<void> {
    const clamped = Math.max(1, Math.min(this.totalPages, p));
    if (clamped === this.page) return;
    this.page = clamped;
    this.loading = true;
    await this._load();
  }

  /** Windowed page numbers with ellipsis spacers — first, last, current ± 1. */
  private _pageNumbers(): (number | "ellipsis")[] {
    const total = this.totalPages;
    const current = this.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = new Set<number>([1, total, current]);
    if (current - 1 >= 1) pages.add(current - 1);
    if (current + 1 <= total) pages.add(current + 1);

    const sorted = [...pages].sort((a, b) => a - b);
    const result: (number | "ellipsis")[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("ellipsis");
      result.push(sorted[i]);
    }
    return result;
  }

  // ---- Row actions ----

  private _path(e: UnifiedEntry): string {
    switch (e.source) {
      case "investment": return `/investments/${e.id}?businessId=${this.businessId}`;
      case "draw": return `/draws/${e.id}?businessId=${this.businessId}`;
      case "debt": return `/debts/${e.id}?businessId=${this.businessId}`;
      default: return `/transactions/${e.id}?businessId=${this.businessId}`;
    }
  }

  private _isOutflow(kind: UnifiedEntry["kind"]): boolean {
    return kind === "expense" || kind === "draw" || kind === "repayment";
  }

  private _startEdit(e: UnifiedEntry): void {
    this.editingId = e.id;
    this.editAmount = String(e.amount);
    this.editNote = e.note;
    this.error = "";
  }

  private _cancelEdit(): void {
    this.editingId = null;
    this.editAmount = "";
    this.editNote = "";
  }

  private async _saveEdit(e: UnifiedEntry): Promise<void> {
    const amountNum = parseFloat(this.editAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      this.error = "Enter an amount greater than zero.";
      return;
    }
    this.busyId = e.id;
    try {
      await apiPatch(this._path(e), { amount: amountNum, note: this.editNote });
      this._cancelEdit();
      await this._load();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't save changes.";
    } finally {
      this.busyId = null;
    }
  }

  private async _delete(e: UnifiedEntry): Promise<void> {
    if (!confirm(`Delete this ${e.kind} of ${formatMoney(e.amount)}?`)) return;
    this.busyId = e.id;
    try {
      await apiDelete(this._path(e));
      // Deleting the last row on a non-first page would otherwise strand
      // the view on a now-empty page.
      if (this.entries.length === 1 && this.page > 1) this.page -= 1;
      await this._load();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't delete.";
    } finally {
      this.busyId = null;
    }
  }

  private _money(n: number): string {
    return formatMoney(n);
  }

  private _date(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
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
    .ti-pencil:before { content: "\\eb04"; }
    .ti-trash:before { content: "\\eb41"; }
    .ti-search:before { content: "\\eb1c"; }
    .ti-filter:before { content: "\\eaa5"; }
    .ti-x:before { content: "\\eb55"; }
    .ti-chevron-left:before { content: "\\ea60"; }
    .ti-chevron-right:before { content: "\\ea61"; }
    button, input { font-family: inherit; }
    button { cursor: pointer; border: none; }

    .page { max-width: 860px; margin: 0 auto; padding: 32px 28px; }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 24px; }

    .toolbar { display: flex; gap: 10px; margin-bottom: 20px; }
    .search-wrap { position: relative; flex: 1; }
    .search-wrap .ti-search {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--ink-soft, #6B6B66); font-size: 15px; pointer-events: none;
    }
    .search-input {
      width: 100%; box-sizing: border-box; padding: 11px 14px 11px 38px; font-size: 14.5px;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .search-input:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .filter-btn {
      display: flex; align-items: center; gap: 8px; padding: 0 18px; border-radius: var(--radius-input, 14px);
      border: 1px solid var(--line, #E2DFD7); background: var(--surface, #FAFAF7); color: var(--ink, #1C1C1C);
      font-size: 14px; font-weight: 500; white-space: nowrap; transition: background 0.15s ease;
    }
    .filter-btn:hover { background: rgba(45,74,62,0.05); }
    .filter-badge {
      background: var(--forest, #2D4A3E); color: #fff; font-size: 11px; font-weight: 600;
      padding: 1px 7px; border-radius: 999px; line-height: 1.5;
    }

    /* filter drawer */
    .drawer-overlay { position: fixed; inset: 0; background: var(--overlay, rgba(28,28,28,0.45)); z-index: 200; }
    .drawer {
      position: fixed; top: 0; right: 0; bottom: 0; width: 340px; max-width: 90vw;
      background: var(--surface, #FAFAF7); box-shadow: -12px 0 40px -12px rgba(31,51,41,0.3);
      padding: 26px; overflow-y: auto; display: flex; flex-direction: column; z-index: 201;
    }
    .drawer-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
    .drawer-head h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; margin: 0; }
    .close-x {
      background: none; border: none; cursor: pointer; font-size: 16px; color: var(--ink-soft, #6B6B66);
      width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;
    }
    .close-x:hover { background: rgba(45,74,62,0.07); }
    .drawer-section { margin-bottom: 24px; }
    .drawer-section .label { font-size: 13px; font-weight: 500; margin-bottom: 10px; }
    .kind-check-list { display: flex; flex-direction: column; gap: 10px; }
    .kind-check { display: flex; align-items: center; gap: 9px; font-size: 14px; cursor: pointer; }
    .kind-check input { accent-color: var(--forest, #2D4A3E); width: 15px; height: 15px; }
    .date-fields { display: flex; gap: 10px; }
    .date-fields .field { flex: 1; }
    .date-fields label { display: block; font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin-bottom: 6px; }
    .date-fields input {
      width: 100%; box-sizing: border-box; padding: 9px 10px; font-size: 13.5px; font-family: inherit;
      border: 1px solid var(--line, #E2DFD7); border-radius: 10px; background: var(--input-bg, #fff); color: var(--ink, #1C1C1C);
    }
    .date-fields input:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .drawer-actions { margin-top: auto; display: flex; gap: 10px; padding-top: 16px; }
    .btn-apply {
      flex: 2; padding: 12px; border-radius: var(--radius-input, 14px); border: none;
      background: var(--forest, #2D4A3E); color: #fff; font-size: 14.5px; font-weight: 500;
      transition: background 0.2s ease;
    }
    .btn-apply:hover { background: var(--forest-deep, #1F3329); }
    .btn-clear {
      flex: 1; padding: 12px; border-radius: var(--radius-input, 14px); border: 1px solid var(--line, #E2DFD7);
      background: transparent; color: var(--ink, #1C1C1C); font-size: 14.5px;
    }
    .btn-clear:hover { background: rgba(45,74,62,0.05); }

    .list { display: flex; flex-direction: column; gap: 10px; }
    .row {
      background: var(--surface, #FAFAF7); border: 0.5px solid var(--line, #E2DFD7);
      border-left: 3px solid var(--line, #E2DFD7);
      border-radius: 16px; padding: 16px 18px; display: flex; align-items: center; gap: 14px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .row.expense, .row.draw { border-left-color: var(--danger, #D9534F); }
    .row.revenue { border-left-color: var(--forest, #2D4A3E); }
    .row.investment, .row.debt, .row.repayment { border-left-color: var(--accent-purple, #5B4B8A); }
    .row:hover { box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18)); }

    .badge { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
    .badge.expense, .badge.draw { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); }
    .badge.revenue { background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); }
    .badge.investment, .badge.debt, .badge.repayment { background: var(--accent-purple-bg, #EAE6F3); color: var(--accent-purple, #5B4B8A); }
    .info { flex: 1; min-width: 0; }
    .info .label { font-size: 15px; font-weight: 500; }
    .info .meta { font-size: 13px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .amount { font-size: 16px; font-weight: 600; white-space: nowrap; }
    .amount.expense, .amount.draw { color: var(--danger, #A8302B); }
    .amount.revenue { color: var(--forest, #2D4A3E); }
    .row-actions { display: flex; gap: 6px; }
    .icon-btn {
      background: transparent; border: 1px solid var(--line, #E2DFD7); border-radius: 10px;
      width: 34px; height: 34px; display: grid; place-items: center; color: var(--ink-soft, #6B6B66);
      font-size: 16px; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
    }
    .icon-btn:hover { background: rgba(45,74,62,0.06); color: var(--ink, #1C1C1C); }
    .icon-btn:active { transform: scale(0.94); }
    .icon-btn.danger:hover { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border-color: var(--danger-border, #F0C5C3); }
    .icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .edit-row { display: flex; flex-direction: column; gap: 10px; flex: 1; }
    .edit-fields { display: flex; gap: 10px; }
    .edit-fields input { flex: 1; padding: 9px 12px; font-size: 14px; font-family: inherit; background: var(--input-bg, #fff); color: var(--ink, #1C1C1C); border: 1px solid var(--line, #E2DFD7); border-radius: 10px; }
    .edit-fields input:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .edit-actions { display: flex; gap: 8px; }
    .btn-save {
      background: var(--forest, #2D4A3E); color: #fff; padding: 8px 16px; border-radius: 9px; font-size: 13px; font-weight: 500;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .btn-save:hover { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    .btn-save:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .btn-cancel { background: transparent; border: 1px solid var(--line, #E2DFD7); color: var(--ink, #1C1C1C); padding: 8px 16px; border-radius: 9px; font-size: 13px; }

    .pagination { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 24px; }
    .page-btn {
      min-width: 34px; height: 34px; padding: 0 8px; border-radius: 9px; border: 1px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7); color: var(--ink, #1C1C1C); font-size: 13.5px; font-weight: 500;
      transition: background 0.15s ease;
    }
    .page-btn:hover:not(:disabled):not(.active) { background: rgba(45,74,62,0.06); }
    .page-btn.active { background: var(--forest, #2D4A3E); color: #fff; border-color: var(--forest, #2D4A3E); }
    .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .page-ellipsis { color: var(--ink-soft, #6B6B66); padding: 0 4px; }

    .empty { text-align: center; padding: 70px 20px; color: var(--ink-soft, #6B6B66); }
    .empty a { color: var(--forest, #2D4A3E); }
    .error-box { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border: 1px solid var(--danger-border, #F0C5C3); border-radius: 12px; padding: 12px 16px; font-size: 14px; margin-bottom: 16px; }
    .list-area { position: relative; min-height: 320px; }
    .loader-overlay {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: var(--bg, #ECEAE3); z-index: 5;
    }
  `;

  private _renderToolbar(): TemplateResult {
    return html`
      <div class="toolbar">
        <div class="search-wrap">
          <i class="ti ti-search" aria-hidden="true"></i>
          <input
            class="search-input" type="text" placeholder="Search by category, source, or note…"
            .value=${this.search} @input=${this._onSearchInput}
          />
        </div>
        <button class="filter-btn" @click=${this._openFilters}>
          <i class="ti ti-filter" aria-hidden="true"></i>Filters
          ${this.activeFilterCount > 0 ? html`<span class="filter-badge">${this.activeFilterCount}</span>` : ""}
        </button>
      </div>
    `;
  }

  private _renderFilterDrawer(): TemplateResult {
    if (!this.filterDrawerOpen) return html``;
    return html`
      <div class="drawer-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closeFilters(); }}>
        <div class="drawer">
          <div class="drawer-head">
            <h2>Filters</h2>
            <button class="close-x" @click=${this._closeFilters} aria-label="Close">
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>

          <div class="drawer-section">
            <div class="label">Kind</div>
            <div class="kind-check-list">
              ${KIND_OPTIONS.map(
                (k) => html`
                  <label class="kind-check">
                    <input type="checkbox" .checked=${this.draftKinds.includes(k.value)}
                      @change=${() => this._toggleDraftKind(k.value)} />
                    ${k.label}
                  </label>
                `
              )}
            </div>
          </div>

          <div class="drawer-section">
            <div class="label">Date range</div>
            <div class="date-fields">
              <div class="field">
                <label for="dateFrom">From</label>
                <input id="dateFrom" type="date" .value=${this.draftDateFrom}
                  @input=${(e: Event) => { this.draftDateFrom = (e.target as HTMLInputElement).value; }} />
              </div>
              <div class="field">
                <label for="dateTo">To</label>
                <input id="dateTo" type="date" .value=${this.draftDateTo}
                  @input=${(e: Event) => { this.draftDateTo = (e.target as HTMLInputElement).value; }} />
              </div>
            </div>
          </div>

          <div class="drawer-actions">
            <button class="btn-clear" @click=${this._clearFilters}>Clear all</button>
            <button class="btn-apply" @click=${this._applyFilters}>Apply filters</button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderRow(e: UnifiedEntry): TemplateResult {
    const isEditing = this.editingId === e.id;
    const busy = this.busyId === e.id;

    if (isEditing) {
      return html`
        <div class="row ${e.kind}">
          <span class="badge ${e.kind}">${e.kind}</span>
          <div class="edit-row">
            <div class="edit-fields">
              <input type="number" min="0" step="0.01" .value=${this.editAmount}
                @input=${(ev: Event) => { this.editAmount = (ev.target as HTMLInputElement).value; }}
                placeholder="Amount" />
              <input type="text" .value=${this.editNote}
                @input=${(ev: Event) => { this.editNote = (ev.target as HTMLInputElement).value; }}
                placeholder="Note (optional)" />
            </div>
            <div class="edit-actions">
              <button class="btn-save" @click=${() => this._saveEdit(e)} ?disabled=${busy}>${busy ? "Saving…" : "Save"}</button>
              <button class="btn-cancel" @click=${this._cancelEdit} ?disabled=${busy}>Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="row ${e.kind}">
        <span class="badge ${e.kind}">${e.kind}</span>
        <div class="info">
          <div class="label">${e.label}</div>
          <div class="meta">${this._date(e.date)}${e.note ? ` · ${e.note}` : ""}</div>
        </div>
        <div class="amount ${e.kind}">${this._isOutflow(e.kind) ? "−" : "+"}${this._money(e.amount)}</div>
        <div class="row-actions">
          <button class="icon-btn" title="Edit" @click=${() => this._startEdit(e)} ?disabled=${busy}><i class="ti ti-pencil" aria-hidden="true"></i></button>
          <button class="icon-btn danger" title="Delete" @click=${() => this._delete(e)} ?disabled=${busy}><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>
    `;
  }

  private _renderPagination(): TemplateResult {
    if (this.total === 0 || this.totalPages <= 1) return html``;
    return html`
      <div class="pagination">
        <button class="page-btn" ?disabled=${this.page === 1} @click=${() => this._goToPage(this.page - 1)} aria-label="Previous page">
          <i class="ti ti-chevron-left" aria-hidden="true"></i>
        </button>
        ${this._pageNumbers().map((p) =>
          p === "ellipsis"
            ? html`<span class="page-ellipsis">…</span>`
            : html`<button class="page-btn ${p === this.page ? "active" : ""}" @click=${() => this._goToPage(p)}>${p}</button>`
        )}
        <button class="page-btn" ?disabled=${this.page === this.totalPages} @click=${() => this._goToPage(this.page + 1)} aria-label="Next page">
          <i class="ti ti-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  private get isFiltered(): boolean {
    return Boolean(this.search) || this.activeFilterCount > 0;
  }

  render(): TemplateResult {
    return html`
      <foundr-topbar active="transactions" businessName=${this.businessLabel}></foundr-topbar>

      <div class="page">
        <h1>All entries</h1>
        <p class="sub">Every expense, revenue, investment, draw, and debt entry you've tracked.</p>

        ${this._renderToolbar()}

        ${this.error ? html`<div class="error-box">${this.error}</div>` : ""}

        <div class="list-area">
          ${!this.loading
            ? this.entries.length === 0
              ? html`<div class="empty">
                  ${this.isFiltered
                    ? "No entries match your search or filters."
                    : html`No entries yet. <a href="/dashboard">Add your first one</a> from the dashboard.`}
                </div>`
              : html`<div class="list">${this.entries.map((e) => this._renderRow(e))}</div>`
            : ""}
          ${this.loading
            ? html`<div class="loader-overlay"><foundr-mini-loader></foundr-mini-loader></div>`
            : ""}
        </div>

        ${!this.loading ? this._renderPagination() : ""}
      </div>
      ${this._renderFilterDrawer()}
      <foundr-tour-overlay></foundr-tour-overlay>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-transactions": FoundrTransactions;
  }
}
