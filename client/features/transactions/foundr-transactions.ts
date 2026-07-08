import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk, signOut } from "../auth/auth.service";
import { apiGet, apiPatch, apiDelete } from "../../shared/lib/api";
import type { UnifiedEntry } from "../../shared/lib/types";
import { formatMoney } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";

/**
 * <foundr-transactions>
 * A full-page, unified list of every entry — expenses, revenue, and
 * investments — newest first. Supports inline editing (amount + note) and
 * deleting, routing each change to the correct backend collection based on
 * the entry's `source`.
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
    await loadSettings();
    await this._load();
  }

  private async _load(): Promise<void> {
    try {
      this.entries = await apiGet<UnifiedEntry[]>("/entries");
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your entries.";
    } finally {
      this.loading = false;
    }
  }

  private async _signOut(): Promise<void> {
    await signOut();
    window.location.href = "/";
  }

  private _path(e: UnifiedEntry): string {
    return e.source === "investment" ? `/investments/${e.id}` : `/transactions/${e.id}`;
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

    .page { max-width: 820px; margin: 0 auto; padding: 32px 28px; }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 28px; }

    .list { display: flex; flex-direction: column; gap: 10px; }
    .row {
      background: var(--surface, #FAFAF7); border: 0.5px solid var(--line, #E2DFD7);
      border-radius: 16px; padding: 16px 18px; display: flex; align-items: center; gap: 14px;
    }
    .badge { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
    .badge.expense { background: #FBEAE9; color: #A8302B; }
    .badge.revenue { background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); }
    .badge.investment { background: #EAE6F3; color: #5B4B8A; }
    .info { flex: 1; min-width: 0; }
    .info .label { font-size: 15px; font-weight: 500; }
    .info .meta { font-size: 13px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .amount { font-size: 16px; font-weight: 600; white-space: nowrap; }
    .amount.expense { color: #A8302B; }
    .amount.revenue { color: var(--forest, #2D4A3E); }
    .row-actions { display: flex; gap: 6px; }
    .icon-btn {
      background: transparent; border: 1px solid var(--line, #E2DFD7); border-radius: 9px;
      width: 32px; height: 32px; display: grid; place-items: center; color: var(--ink-soft, #6B6B66); font-size: 14px;
    }
    .icon-btn:hover { background: rgba(45,74,62,0.06); color: var(--ink, #1C1C1C); }
    .icon-btn.danger:hover { background: #FBEAE9; color: #A8302B; border-color: #F0C5C3; }

    .edit-row { display: flex; flex-direction: column; gap: 10px; flex: 1; }
    .edit-fields { display: flex; gap: 10px; }
    .edit-fields input { flex: 1; padding: 9px 12px; font-size: 14px; font-family: inherit; background: #fff; border: 1px solid var(--line, #E2DFD7); border-radius: 10px; }
    .edit-fields input:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .edit-actions { display: flex; gap: 8px; }
    .btn-save { background: var(--forest, #2D4A3E); color: #fff; padding: 8px 16px; border-radius: 9px; font-size: 13px; font-weight: 500; }
    .btn-cancel { background: transparent; border: 1px solid var(--line, #E2DFD7); color: var(--ink, #1C1C1C); padding: 8px 16px; border-radius: 9px; font-size: 13px; }

    .empty { text-align: center; padding: 70px 20px; color: var(--ink-soft, #6B6B66); }
    .empty a { color: var(--forest, #2D4A3E); }
    .error-box { background: #FBEAE9; color: #A8302B; border: 1px solid #F0C5C3; border-radius: 12px; padding: 12px 16px; font-size: 14px; margin-bottom: 16px; }
    .skeleton { height: 64px; border-radius: 16px; background: linear-gradient(90deg,#EDEBE4 25%,#F4F2EC 50%,#EDEBE4 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }
  `;

  private _renderRow(e: UnifiedEntry): TemplateResult {
    const isEditing = this.editingId === e.id;
    const busy = this.busyId === e.id;

    if (isEditing) {
      return html`
        <div class="row">
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
      <div class="row">
        <span class="badge ${e.kind}">${e.kind}</span>
        <div class="info">
          <div class="label">${e.label}</div>
          <div class="meta">${this._date(e.date)}${e.note ? ` · ${e.note}` : ""}</div>
        </div>
        <div class="amount ${e.kind}">${e.kind === "expense" ? "−" : "+"}${this._money(e.amount)}</div>
        <div class="row-actions">
          <button class="icon-btn" title="Edit" @click=${() => this._startEdit(e)} ?disabled=${busy}>✎</button>
          <button class="icon-btn danger" title="Delete" @click=${() => this._delete(e)} ?disabled=${busy}>🗑</button>
        </div>
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <div class="topbar">
        <a class="brand" href="/dashboard"><span class="mark">F</span>Foundr</a>
        <div class="nav">
          <a href="/dashboard">Dashboard</a>
          <button class="signout" @click=${this._signOut}>Sign out</button>
        </div>
      </div>

      <div class="page">
        <h1>All entries</h1>
        <p class="sub">Every expense, revenue, and investment you've tracked.</p>

        ${this.error ? html`<div class="error-box">${this.error}</div>` : ""}

        ${this.loading
          ? html`<div class="list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`
          : this.entries.length === 0
            ? html`<div class="empty">No entries yet. <a href="/dashboard">Add your first one</a> from the dashboard.</div>`
            : html`<div class="list">${this.entries.map((e) => this._renderRow(e))}</div>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-transactions": FoundrTransactions;
  }
}