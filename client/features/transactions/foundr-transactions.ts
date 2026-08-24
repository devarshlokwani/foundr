import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { apiGet, apiPatch, apiDelete } from "../../shared/lib/api";
import type { UnifiedEntry, EntriesPage } from "../../shared/lib/types";
import { formatMoney } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";
import { resolveActiveBusiness } from "../../shared/lib/business";
import { restoreEntry, permanentlyDeleteEntry } from "../../shared/lib/trash";
import { checkSessionFreshness } from "../../shared/lib/session-guard";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-mini-loader";
import "../../shared/components/foundr-tour-overlay";
import "../../shared/components/foundr-recurring-list";
import "../../shared/components/foundr-page-actions";
import "../../shared/components/foundr-add-entry";
import "../../shared/components/foundr-migrate-modal";

type Kind = UnifiedEntry["kind"];
type Section = "active" | "recurring" | "deleted";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "revenue", label: "Revenue" },
  { value: "investment", label: "Investment" },
  { value: "draw", label: "Draw" },
  { value: "debt", label: "Debt" },
  { value: "repayment", label: "Repayment" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

/**
 * <foundr-transactions>
 * A full-page, unified, searchable/filterable/paginable table of every
 * entry (expenses, revenue, investments, draws, and debt), newest first.
 * Supports inline editing (amount + note), single-row and bulk delete,
 * routing each change to the correct backend collection based on the
 * entry's `source`.
 *
 * Search and filters are server-side (see /api/entries and
 * server/lib/entries.ts); this scales to however many entries a business
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
  @state() private section: Section = "active";
  @state() private addEntryOpen = false;
  @state() private migrateOpen = false;

  // Search, debounced, resets to page 1 on change.
  @state() private search = "";
  private _searchDebounce: ReturnType<typeof setTimeout> | null = null;

  // Applied filters (what the last fetch actually used).
  @state() private selectedKinds: Kind[] = [];
  @state() private dateFrom = "";
  @state() private dateTo = "";

  // Filter drawer: a draft copy so Apply/Clear is explicit, not live-filtering per checkbox.
  @state() private filterDrawerOpen = false;
  @state() private draftKinds: Kind[] = [];
  @state() private draftDateFrom = "";
  @state() private draftDateTo = "";

  // Pagination
  @state() private page = 1;
  @state() private pageSize = 50;
  @state() private total = 0;

  // "Undo" toast: deleting is soft now, so there's no confirm() dialog;
  // instead a brief window to reverse it right after.
  @state() private undoEntry: UnifiedEntry | null = null;
  private _undoTimer: ReturnType<typeof setTimeout> | null = null;

  // Bulk selection: ids from the current page only (selection doesn't
  // persist across a reload, since the set of rows it refers to changes).
  @state() private selectedIds: Set<string> = new Set();
  @state() private bulkBusy = false;

  // Permanent-delete confirmation: "bulk" means the current selection,
  // a UnifiedEntry means just that one row.
  @state() private permanentDeleteTarget: UnifiedEntry | "bulk" | null = null;
  @state() private deleteConfirmText = "";

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
    // Whatever was selected refers to rows that are about to be replaced.
    this.selectedIds = new Set();
    try {
      const params = new URLSearchParams();
      params.set("businessId", this.businessId);
      params.set("page", String(this.page));
      params.set("pageSize", String(this.pageSize));
      if (this.search) params.set("search", this.search);
      if (this.selectedKinds.length > 0) params.set("kinds", this.selectedKinds.join(","));
      if (this.dateFrom) params.set("dateFrom", this.dateFrom);
      if (this.dateTo) params.set("dateTo", this.dateTo);

      const endpoint = this.section === "deleted" ? "/trash" : "/entries";
      const res = await apiGet<EntriesPage>(`${endpoint}?${params.toString()}`);
      this.entries = res.items;
      this.total = res.total;
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your entries.";
    } finally {
      this.loading = false;
    }
  }

  private async _refresh(): Promise<void> {
    this.loading = true;
    await this._load();
  }

  private _openAddEntry(): void {
    this.addEntryOpen = true;
  }

  private _closeAddEntry(): void {
    this.addEntryOpen = false;
  }

  private _openMigrate(): void {
    this.migrateOpen = true;
  }

  private _closeMigrate(): void {
    this.migrateOpen = false;
  }

  // ---- Section tabs ----

  private get _sectionIndex(): number {
    return this.section === "active" ? 0 : this.section === "recurring" ? 1 : 2;
  }

  private async _setSection(section: Section): Promise<void> {
    if (section === this.section) return;
    this.section = section;
    this.selectedIds = new Set();
    // Active and Deleted are two views over different (differently-sized)
    // result sets, so start each fresh at page 1 rather than carrying over
    // wherever pagination happened to be on the other one.
    if (section === "active" || section === "deleted") {
      this.page = 1;
      this.loading = true;
      await this._load();
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
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  private get viewingRangeText(): string {
    if (this.total === 0) return "Viewing 0 results";
    const start = (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.page * this.pageSize, this.total);
    return `Viewing ${start}–${end} of ${this.total} result${this.total === 1 ? "" : "s"}`;
  }

  private async _goToPage(p: number): Promise<void> {
    const clamped = Math.max(1, Math.min(this.totalPages, p));
    if (clamped === this.page) return;
    this.page = clamped;
    this.loading = true;
    await this._load();
  }

  private async _onPageSizeChange(e: Event): Promise<void> {
    this.pageSize = Number((e.target as HTMLSelectElement).value);
    this.page = 1;
    this.loading = true;
    await this._load();
  }

  /** Windowed page numbers with ellipsis spacers: first, last, current ± 1. */
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
    // Soft-delete, so no confirm() dialog. The "Undo" toast below is the
    // safety net instead of a modal the founder has to click through.
    this.busyId = e.id;
    try {
      await apiDelete(this._path(e));
      // Deleting the last row on a non-first page would otherwise strand
      // the view on a now-empty page.
      if (this.entries.length === 1 && this.page > 1) this.page -= 1;
      await this._load();
      this._showUndo(e);
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't delete.";
    } finally {
      this.busyId = null;
    }
  }

  private _showUndo(e: UnifiedEntry): void {
    if (this._undoTimer) clearTimeout(this._undoTimer);
    this.undoEntry = e;
    this._undoTimer = setTimeout(() => { this.undoEntry = null; }, 6000);
  }

  private async _undoDelete(): Promise<void> {
    const e = this.undoEntry;
    if (!e) return;
    if (this._undoTimer) clearTimeout(this._undoTimer);
    this.undoEntry = null;
    try {
      await restoreEntry(e, this.businessId);
      await this._load();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't undo that delete.";
    }
  }

  // ---- Deleted-tab row actions ----

  private async _restore(e: UnifiedEntry): Promise<void> {
    this.busyId = e.id;
    try {
      await restoreEntry(e, this.businessId);
      if (this.entries.length === 1 && this.page > 1) this.page -= 1;
      await this._load();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't restore that entry.";
    } finally {
      this.busyId = null;
    }
  }

  // Permanent delete skips confirm(): a single "OK" click is too easy to
  // hit by accident for something that's gone for good, unlike the soft
  // deletes elsewhere on this page. Instead it opens a modal that only
  // enables its confirm button once the founder types DELETE.
  private async _doPermanentDelete(e: UnifiedEntry): Promise<void> {
    this.busyId = e.id;
    try {
      await permanentlyDeleteEntry(e, this.businessId);
      if (this.entries.length === 1 && this.page > 1) this.page -= 1;
      await this._load();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't delete that entry.";
    } finally {
      this.busyId = null;
    }
  }

  // ---- Bulk selection ----

  private get allVisibleSelected(): boolean {
    return this.entries.length > 0 && this.entries.every((e) => this.selectedIds.has(e.id));
  }

  private _toggleSelect(id: string): void {
    const next = new Set(this.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds = next;
  }

  private _toggleSelectAll(): void {
    this.selectedIds = this.allVisibleSelected ? new Set() : new Set(this.entries.map((e) => e.id));
  }

  private _clearSelection(): void {
    this.selectedIds = new Set();
  }

  private get _selectedEntries(): UnifiedEntry[] {
    return this.entries.filter((e) => this.selectedIds.has(e.id));
  }

  private async _bulkDelete(): Promise<void> {
    const targets = this._selectedEntries;
    if (targets.length === 0) return;
    if (!confirm(`Delete ${targets.length} selected ${targets.length === 1 ? "entry" : "entries"}? You can restore them from Deleted.`)) return;
    this.bulkBusy = true;
    try {
      await Promise.all(targets.map((e) => apiDelete(this._path(e))));
      await this._load();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't delete some of those entries.";
    } finally {
      this.bulkBusy = false;
    }
  }

  private async _bulkRestore(): Promise<void> {
    const targets = this._selectedEntries;
    if (targets.length === 0) return;
    this.bulkBusy = true;
    try {
      await Promise.all(targets.map((e) => restoreEntry(e, this.businessId)));
      await this._load();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't restore some of those entries.";
    } finally {
      this.bulkBusy = false;
    }
  }

  private async _doBulkPermanentDelete(): Promise<void> {
    const targets = this._selectedEntries;
    if (targets.length === 0) return;
    this.bulkBusy = true;
    try {
      await Promise.all(targets.map((e) => permanentlyDeleteEntry(e, this.businessId)));
      await this._load();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't delete some of those entries.";
    } finally {
      this.bulkBusy = false;
    }
  }

  // ---- Permanent-delete confirmation (type DELETE to confirm) ----

  private _openPermanentDeleteConfirm(target: UnifiedEntry | "bulk"): void {
    this.permanentDeleteTarget = target;
    this.deleteConfirmText = "";
  }

  private _closePermanentDeleteConfirm(): void {
    this.permanentDeleteTarget = null;
    this.deleteConfirmText = "";
  }

  private get _permanentDeleteCount(): number {
    if (this.permanentDeleteTarget === "bulk") return this.selectedIds.size;
    return this.permanentDeleteTarget ? 1 : 0;
  }

  private get _permanentDeleteConfirmed(): boolean {
    return this.deleteConfirmText.trim().toUpperCase() === "DELETE";
  }

  private async _confirmPermanentDelete(): Promise<void> {
    if (!this._permanentDeleteConfirmed) return;
    const target = this.permanentDeleteTarget;
    this._closePermanentDeleteConfirm();
    if (target === "bulk") await this._doBulkPermanentDelete();
    else if (target) await this._doPermanentDelete(target);
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
    .ti-arrow-back-up:before { content: "\\eb77"; }
    .ti-trash-x:before { content: "\\ef88"; }
    .ti-refresh:before { content: "\\eb13"; }
    .ti-check:before { content: "\\ea5e"; }
    .ti-alert-triangle:before { content: "\\ea06"; }
    button, input, select { font-family: inherit; }
    button { cursor: pointer; border: none; }

    .page { max-width: 1120px; margin: 0 auto; padding: 32px 28px; }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 24px; }

    .section-tabs {
      position: relative; display: flex; background: var(--surface-alt, #F2EFE8);
      padding: 4px; border-radius: var(--radius-pill, 999px); width: fit-content; margin-bottom: 20px;
    }
    .section-indicator {
      position: absolute; top: 4px; left: 4px; bottom: 4px; width: var(--tab-w, 130px);
      background: var(--surface, #FAFAF7); border-radius: var(--radius-pill, 999px);
      box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18));
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 0;
    }
    .section-tab {
      position: relative; z-index: 1; width: var(--tab-w, 130px); padding: 8px 0; text-align: center;
      border-radius: var(--radius-pill, 999px); background: transparent; border: none;
      font-size: 13.5px; font-weight: 500; color: var(--ink-soft, #6B6B66); transition: color 0.25s ease;
    }
    .section-tab.active { color: var(--ink, #1C1C1C); }

    .card { background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px); padding: 22px; border: 0.5px solid var(--line, #E2DFD7); }

    /* Table card: search/filter, bulk bar, table, footer, all one unit */
    .table-card {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      border: 0.5px solid var(--line, #E2DFD7); overflow: hidden;
    }
    .table-head-row {
      display: flex; align-items: center; gap: 10px; padding: 20px 22px 0;
    }
    .table-title { font-size: 16px; font-weight: 600; }
    .refresh-btn {
      width: 30px; height: 30px; border-radius: 8px; background: transparent; border: 1px solid var(--line, #E2DFD7);
      color: var(--ink-soft, #6B6B66); display: grid; place-items: center; font-size: 14px;
      transition: background 0.15s ease, transform 0.4s ease;
    }
    .refresh-btn:hover:not(:disabled) { background: rgba(45,74,62,0.06); color: var(--ink, #1C1C1C); }
    .refresh-btn.spinning i { animation: spin 0.6s linear; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    .toolbar { display: flex; gap: 10px; padding: 16px 22px; }
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

    /* Bulk-selection bar: appears above the table only once something's selected */
    .bulk-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      margin: 0 22px 14px; padding: 10px 14px; background: var(--sage-soft, #DDE7E0);
      border-radius: 12px; font-size: 13.5px;
    }
    .bulk-bar .count { font-weight: 600; color: var(--forest, #2D4A3E); }
    .bulk-actions { display: flex; align-items: center; gap: 8px; }
    .bulk-btn {
      display: flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 9px;
      border: 1px solid var(--line, #E2DFD7); background: var(--surface, #FAFAF7); color: var(--ink, #1C1C1C);
      font-size: 13px; font-weight: 500; white-space: nowrap;
    }
    .bulk-btn:hover:not(:disabled) { background: rgba(45,74,62,0.06); }
    .bulk-btn.danger { color: var(--danger, #A8302B); border-color: var(--danger-border, #F0C5C3); }
    .bulk-btn.danger:hover:not(:disabled) { background: var(--danger-bg, #FBEAE9); }
    .bulk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .bulk-clear {
      padding: 7px 12px; border-radius: 9px; border: none; background: transparent;
      color: var(--ink-soft, #6B6B66); font-size: 13px;
    }
    .bulk-clear:hover:not(:disabled) { color: var(--ink, #1C1C1C); }

    /* Table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    thead th {
      text-align: left; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--ink-soft, #6B6B66); padding: 10px 14px; border-bottom: 1px solid var(--line, #E2DFD7);
      white-space: nowrap;
    }
    th.col-check, td.col-check { width: 40px; padding-left: 22px; }
    th.col-amount, td.col-amount { text-align: right; padding-right: 22px; }
    th.col-actions, td.col-actions { width: 90px; padding-right: 22px; }
    tbody td { padding: 13px 14px; font-size: 13.5px; border-bottom: 0.5px solid var(--line, #E2DFD7); vertical-align: middle; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr { transition: background 0.12s ease; }
    tbody tr:hover { background: var(--surface-alt, #F2EFE8); }
    tbody tr.selected { background: var(--sage-soft, #DDE7E0); }
    .row-check { display: flex; cursor: pointer; }
    .row-check input, .select-all-check { accent-color: var(--forest, #2D4A3E); width: 16px; height: 16px; cursor: pointer; }

    .badge { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
    .badge.expense, .badge.draw, .badge.repayment { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); }
    .badge.revenue { background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); }
    .badge.investment, .badge.debt { background: var(--accent-purple-bg, #EAE6F3); color: var(--accent-purple, #5B4B8A); }

    .col-label { font-weight: 500; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .col-note { color: var(--ink-soft, #6B6B66); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .col-note .muted { color: var(--line, #E2DFD7); }
    .col-date { color: var(--ink-soft, #6B6B66); white-space: nowrap; }
    .col-amount { font-weight: 600; white-space: nowrap; }
    .col-amount.outflow { color: var(--danger, #A8302B); }
    .col-amount.inflow { color: var(--forest, #2D4A3E); }

    .row-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .icon-btn {
      background: transparent; border: 1px solid var(--line, #E2DFD7); border-radius: 8px;
      width: 30px; height: 30px; display: grid; place-items: center; color: var(--ink-soft, #6B6B66);
      font-size: 14px; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
    }
    .icon-btn:hover { background: rgba(45,74,62,0.06); color: var(--ink, #1C1C1C); }
    .icon-btn:active { transform: scale(0.94); }
    .icon-btn.danger:hover { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border-color: var(--danger-border, #F0C5C3); }
    .icon-btn.save:hover { background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); border-color: var(--forest, #2D4A3E); }
    .icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .cell-input {
      width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 13px; font-family: inherit;
      background: var(--input-bg, #fff); color: var(--ink, #1C1C1C); border: 1px solid var(--line, #E2DFD7); border-radius: 8px;
    }
    .cell-input:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .amount-input { text-align: right; }

    /* Footer */
    .table-footer {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      padding: 14px 22px; border-top: 0.5px solid var(--line, #E2DFD7);
    }
    .viewing-text { font-size: 13px; color: var(--ink-soft, #6B6B66); }
    .footer-right { display: flex; align-items: center; gap: 16px; }
    .page-size-select {
      font-size: 13px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7); color: var(--ink, #1C1C1C); cursor: pointer;
    }
    .pagination { display: flex; align-items: center; gap: 6px; }
    .page-btn {
      min-width: 30px; height: 30px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7); color: var(--ink, #1C1C1C); font-size: 13px; font-weight: 500;
      transition: background 0.15s ease;
    }
    .page-btn:hover:not(:disabled):not(.active) { background: rgba(45,74,62,0.06); }
    .page-btn.active { background: var(--forest, #2D4A3E); color: #fff; border-color: var(--forest, #2D4A3E); }
    .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .page-ellipsis { color: var(--ink-soft, #6B6B66); padding: 0 2px; font-size: 13px; }

    .undo-toast {
      position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 16px;
      background: var(--ink, #1C1C1C); color: #fff; font-size: 14px;
      padding: 12px 14px 12px 18px; border-radius: 12px; box-shadow: 0 12px 32px -8px rgba(0,0,0,0.35);
      z-index: 150;
    }
    .undo-btn {
      background: transparent; border: 1px solid rgba(255,255,255,0.35); color: #fff;
      padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
      transition: background 0.15s ease;
    }
    .undo-btn:hover { background: rgba(255,255,255,0.12); }

    /* Permanent-delete confirmation: deliberately more friction than the
       plain confirm() used for soft deletes elsewhere on this page, since
       this one is genuinely irreversible. */
    .confirm-overlay {
      position: fixed; inset: 0; background: var(--overlay, rgba(28,28,28,0.5));
      display: flex; align-items: center; justify-content: center; z-index: 250; padding: 20px;
    }
    .confirm-modal {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      width: 100%; max-width: 400px; padding: 28px; box-shadow: 0 24px 60px -20px rgba(31,51,41,0.4);
      font-family: var(--font-body, "Inter", sans-serif); color: var(--ink, #1C1C1C); text-align: center;
    }
    .confirm-icon {
      width: 52px; height: 52px; border-radius: 14px; background: var(--danger-bg, #FBEAE9);
      color: var(--danger, #A8302B); display: grid; place-items: center; font-size: 24px; margin: 0 auto 16px;
    }
    .confirm-modal h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; margin: 0 0 8px; }
    .confirm-modal p { font-size: 14px; color: var(--ink-soft, #6B6B66); line-height: 1.5; margin: 0 0 20px; }
    .confirm-label { display: block; font-size: 13px; margin-bottom: 8px; text-align: left; }
    .confirm-label strong { letter-spacing: 0.04em; }
    .confirm-input {
      width: 100%; box-sizing: border-box; padding: 12px 14px; font-size: 15px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1.5px solid var(--line, #E2DFD7); border-radius: var(--radius-input, 14px);
      color: var(--ink, #1C1C1C); text-align: center; letter-spacing: 0.08em; font-weight: 600;
    }
    .confirm-input:focus { outline: none; border-color: var(--danger, #A8302B); box-shadow: 0 0 0 3px var(--danger-bg, #FBEAE9); }
    .confirm-actions { display: flex; gap: 10px; margin-top: 20px; }
    .btn-cancel {
      flex: 1; padding: 12px; border-radius: var(--radius-input, 14px); border: 1px solid var(--line, #E2DFD7);
      background: transparent; color: var(--ink, #1C1C1C); font-size: 14.5px;
    }
    .btn-cancel:hover { background: rgba(45,74,62,0.05); }
    .btn-confirm-delete {
      flex: 1; padding: 12px; border-radius: var(--radius-input, 14px); border: none;
      background: var(--danger, #A8302B); color: #fff; font-size: 14.5px; font-weight: 500;
      transition: background 0.2s ease, opacity 0.2s ease;
    }
    .btn-confirm-delete:hover:not(:disabled) { background: #8A281F; }
    .btn-confirm-delete:disabled { opacity: 0.4; cursor: not-allowed; }

    .empty { text-align: center; padding: 60px 20px; color: var(--ink-soft, #6B6B66); }
    .empty a, .empty .link-btn {
      color: var(--forest, #2D4A3E); background: none; border: none; padding: 0; font: inherit;
      cursor: pointer; text-decoration: underline;
    }
    .error-box { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border: 1px solid var(--danger-border, #F0C5C3); border-radius: 12px; padding: 12px 16px; font-size: 14px; margin-bottom: 16px; }
    .list-area { position: relative; min-height: 240px; }
    .loader-overlay {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: var(--surface, #FAFAF7); z-index: 5;
    }
  `;

  private _sectionLabel(): string {
    return this.section === "deleted" ? "Deleted entries" : "Active entries";
  }

  private _renderTableHead(): TemplateResult {
    return html`
      <div class="table-head-row">
        <div class="table-title">${this._sectionLabel()} (${this.total})</div>
        <button class="refresh-btn" @click=${this._refresh} title="Refresh" ?disabled=${this.loading}>
          <i class="ti ti-refresh" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

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

  private _renderBulkBar(): TemplateResult {
    const n = this.selectedIds.size;
    if (n === 0) return html``;
    return html`
      <div class="bulk-bar">
        <span class="count">${n} selected</span>
        <div class="bulk-actions">
          ${this.section === "deleted"
            ? html`
                <button class="bulk-btn" @click=${this._bulkRestore} ?disabled=${this.bulkBusy}>
                  <i class="ti ti-arrow-back-up" aria-hidden="true"></i>Restore
                </button>
                <button class="bulk-btn danger" @click=${() => this._openPermanentDeleteConfirm("bulk")} ?disabled=${this.bulkBusy}>
                  <i class="ti ti-trash-x" aria-hidden="true"></i>Delete forever
                </button>
              `
            : html`
                <button class="bulk-btn danger" @click=${this._bulkDelete} ?disabled=${this.bulkBusy}>
                  <i class="ti ti-trash" aria-hidden="true"></i>Delete
                </button>
              `}
          <button class="bulk-clear" @click=${this._clearSelection} ?disabled=${this.bulkBusy}>Clear</button>
        </div>
      </div>
    `;
  }

  private _renderRow(e: UnifiedEntry): TemplateResult {
    const isDeleted = this.section === "deleted";
    const isEditing = !isDeleted && this.editingId === e.id;
    const busy = this.busyId === e.id;
    const outflow = this._isOutflow(e.kind);

    return html`
      <tr class="${this.selectedIds.has(e.id) ? "selected" : ""}">
        <td class="col-check">
          <label class="row-check">
            <input type="checkbox" .checked=${this.selectedIds.has(e.id)} @change=${() => this._toggleSelect(e.id)} />
          </label>
        </td>
        <td><span class="badge ${e.kind}">${e.kind}</span></td>
        <td class="col-label">${e.label}</td>
        <td class="col-note">
          ${isEditing
            ? html`<input class="cell-input" type="text" placeholder="Note" .value=${this.editNote}
                @input=${(ev: Event) => { this.editNote = (ev.target as HTMLInputElement).value; }} />`
            : e.note || html`<span class="muted">-</span>`}
        </td>
        <td class="col-date">${this._date(e.date)}</td>
        <td class="col-amount ${outflow ? "outflow" : "inflow"}">
          ${isEditing
            ? html`<input class="cell-input amount-input" type="number" min="0" step="0.01" .value=${this.editAmount}
                @input=${(ev: Event) => { this.editAmount = (ev.target as HTMLInputElement).value; }} />`
            : html`${outflow ? "−" : "+"}${this._money(e.amount)}`}
        </td>
        <td class="col-actions">
          <div class="row-actions">
            ${isEditing
              ? html`
                  <button class="icon-btn save" title="Save" @click=${() => this._saveEdit(e)} ?disabled=${busy}><i class="ti ti-check" aria-hidden="true"></i></button>
                  <button class="icon-btn" title="Cancel" @click=${this._cancelEdit} ?disabled=${busy}><i class="ti ti-x" aria-hidden="true"></i></button>
                `
              : isDeleted
                ? html`
                    <button class="icon-btn" title="Restore" @click=${() => this._restore(e)} ?disabled=${busy}><i class="ti ti-arrow-back-up" aria-hidden="true"></i></button>
                    <button class="icon-btn danger" title="Delete forever" @click=${() => this._openPermanentDeleteConfirm(e)} ?disabled=${busy}><i class="ti ti-trash-x" aria-hidden="true"></i></button>
                  `
                : html`
                    <button class="icon-btn" title="Edit" @click=${() => this._startEdit(e)} ?disabled=${busy}><i class="ti ti-pencil" aria-hidden="true"></i></button>
                    <button class="icon-btn danger" title="Delete" @click=${() => this._delete(e)} ?disabled=${busy}><i class="ti ti-trash" aria-hidden="true"></i></button>
                  `}
          </div>
        </td>
      </tr>
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

  private _renderEmptyMessage(): TemplateResult {
    if (this.section === "deleted") {
      return this.isFiltered
        ? html`No deleted entries match your search or filters.`
        : html`Trash is empty.`;
    }
    return this.isFiltered
      ? html`No entries match your search or filters.`
      : html`No entries yet. <button class="link-btn" @click=${this._openAddEntry}>Add your first one</button>.`;
  }

  private _renderSectionTabs(): TemplateResult {
    return html`
      <div class="section-tabs" style="--tab-w: 130px">
        <div class="section-indicator" style="transform: translateX(${this._sectionIndex * 130}px)"></div>
        <button class="section-tab ${this.section === "active" ? "active" : ""}" @click=${() => this._setSection("active")}>Active</button>
        <button class="section-tab ${this.section === "recurring" ? "active" : ""}" @click=${() => this._setSection("recurring")}>Recurring</button>
        <button class="section-tab ${this.section === "deleted" ? "active" : ""}" @click=${() => this._setSection("deleted")}>Deleted</button>
      </div>
    `;
  }

  // Shared by both Active and Deleted: same header, toolbar, search,
  // filters, table columns, and footer; only the data source, row
  // actions, and empty-state copy differ by section, so the two feel
  // like one consistent UI rather than a full table next to a
  // stripped-down list.
  private _renderEntriesList(): TemplateResult {
    return html`
      <div class="table-card">
        ${this._renderTableHead()}
        ${this._renderToolbar()}
        ${!this.loading ? this._renderBulkBar() : ""}

        <div class="list-area">
          ${!this.loading
            ? this.entries.length === 0
              ? html`<div class="empty">${this._renderEmptyMessage()}</div>`
              : html`
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th class="col-check">
                            <input class="select-all-check" type="checkbox" .checked=${this.allVisibleSelected} @change=${this._toggleSelectAll} />
                          </th>
                          <th>Kind</th>
                          <th>Category / Source</th>
                          <th>Note</th>
                          <th>Date</th>
                          <th class="col-amount">Amount</th>
                          <th class="col-actions"></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.entries.map((e) => this._renderRow(e))}
                      </tbody>
                    </table>
                  </div>
                `
            : ""}
          ${this.loading
            ? html`<div class="loader-overlay"><foundr-mini-loader></foundr-mini-loader></div>`
            : ""}
        </div>

        ${!this.loading && this.entries.length > 0
          ? html`
              <div class="table-footer">
                <span class="viewing-text">${this.viewingRangeText}</span>
                <div class="footer-right">
                  <select class="page-size-select" .value=${String(this.pageSize)} @change=${this._onPageSizeChange}>
                    ${PAGE_SIZE_OPTIONS.map((n) => html`<option value=${n} ?selected=${n === this.pageSize}>${n} / page</option>`)}
                  </select>
                  ${this._renderPagination()}
                </div>
              </div>
            `
          : ""}
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <foundr-topbar active="transactions" businessName=${this.businessLabel}>
        <foundr-page-actions
          slot="actions"
          @open-add-entry=${this._openAddEntry}
          @open-migrate=${this._openMigrate}
        ></foundr-page-actions>
      </foundr-topbar>

      <div class="page">
        <h1>All entries</h1>
        <p class="sub">Every expense, revenue, investment, draw, and debt entry you've tracked.</p>

        ${this._renderSectionTabs()}

        ${this.error ? html`<div class="error-box">${this.error}</div>` : ""}

        ${this.section === "recurring"
          ? html`<div class="card"><foundr-recurring-list businessId=${this.businessId}></foundr-recurring-list></div>`
          : this._renderEntriesList()}
      </div>
      ${this._renderFilterDrawer()}
      ${this._renderUndoToast()}
      ${this._renderPermanentDeleteConfirm()}
      <foundr-add-entry
        .open=${this.addEntryOpen}
        businessId=${this.businessId}
        @close=${this._closeAddEntry}
        @entry-added=${this._refresh}
      ></foundr-add-entry>
      <foundr-migrate-modal
        .open=${this.migrateOpen}
        businessId=${this.businessId}
        @close=${this._closeMigrate}
        @imported=${this._refresh}
      ></foundr-migrate-modal>
      <foundr-tour-overlay></foundr-tour-overlay>
    `;
  }

  private _renderUndoToast(): TemplateResult {
    if (!this.undoEntry) return html``;
    return html`
      <div class="undo-toast">
        <span>Deleted "${this.undoEntry.label}"</span>
        <button class="undo-btn" @click=${this._undoDelete}>Undo</button>
      </div>
    `;
  }

  private _renderPermanentDeleteConfirm(): TemplateResult {
    if (!this.permanentDeleteTarget) return html``;
    const n = this._permanentDeleteCount;
    const confirmed = this._permanentDeleteConfirmed;
    return html`
      <div class="confirm-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closePermanentDeleteConfirm(); }}>
        <div class="confirm-modal">
          <div class="confirm-icon"><i class="ti ti-alert-triangle" aria-hidden="true"></i></div>
          <h2>Delete forever?</h2>
          <p>This will permanently delete ${n} ${n === 1 ? "entry" : "entries"}. Unlike the Deleted tab, this can't be undone.</p>
          <label class="confirm-label" for="deleteConfirm">Type <strong>DELETE</strong> to confirm</label>
          <input
            id="deleteConfirm" class="confirm-input" type="text" autocomplete="off" placeholder="DELETE"
            .value=${this.deleteConfirmText}
            @input=${(e: Event) => { this.deleteConfirmText = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" && confirmed) void this._confirmPermanentDelete(); }}
          />
          <div class="confirm-actions">
            <button class="btn-cancel" @click=${this._closePermanentDeleteConfirm}>Cancel</button>
            <button class="btn-confirm-delete" ?disabled=${!confirmed} @click=${this._confirmPermanentDelete}>
              Delete forever
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-transactions": FoundrTransactions;
  }
}
