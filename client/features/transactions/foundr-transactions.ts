import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { apiGet, apiPatch, apiDelete } from "../../shared/lib/api";
import type { UnifiedEntry } from "../../shared/lib/types";
import { formatMoney } from "../../shared/lib/format";
import { loadSettings } from "../../shared/lib/settings";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-page-loader";
import "../../shared/components/foundr-mini-loader";

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
  // Two-tier loading feedback: the small mini-loader shows the instant
  // loading starts (no gap, no delay). If it's still going after a couple
  // seconds, that's unexpectedly slow — escalate to the full entrance
  // animation with a reassuring message.
  @state() private escalated = false;
  @state() private loaderVisible = false;
  @state() private error = "";
  @state() private editingId: string | null = null;
  @state() private editAmount = "";
  @state() private editNote = "";
  @state() private busyId: string | null = null;

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
      this.entries = await apiGet<UnifiedEntry[]>("/entries");
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your entries.";
    } finally {
      this.loading = false;
    }
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
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-pencil:before { content: "\\eb04"; }
    .ti-trash:before { content: "\\eb41"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .page { max-width: 860px; margin: 0 auto; padding: 32px 28px; }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 28px; }

    .list { display: flex; flex-direction: column; gap: 10px; }
    .row {
      background: var(--surface, #FAFAF7); border: 0.5px solid var(--line, #E2DFD7);
      border-left: 3px solid var(--line, #E2DFD7);
      border-radius: 16px; padding: 16px 18px; display: flex; align-items: center; gap: 14px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .row.expense { border-left-color: var(--danger, #D9534F); }
    .row.revenue { border-left-color: var(--forest, #2D4A3E); }
    .row.investment { border-left-color: var(--accent-purple, #5B4B8A); }
    .row:hover { box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18)); }

    .badge { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
    .badge.expense { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); }
    .badge.revenue { background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); }
    .badge.investment { background: var(--accent-purple-bg, #EAE6F3); color: var(--accent-purple, #5B4B8A); }
    .info { flex: 1; min-width: 0; }
    .info .label { font-size: 15px; font-weight: 500; }
    .info .meta { font-size: 13px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .amount { font-size: 16px; font-weight: 600; white-space: nowrap; }
    .amount.expense { color: var(--danger, #A8302B); }
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

    .empty { text-align: center; padding: 70px 20px; color: var(--ink-soft, #6B6B66); }
    .empty a { color: var(--forest, #2D4A3E); }
    .error-box { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border: 1px solid var(--danger-border, #F0C5C3); border-radius: 12px; padding: 12px 16px; font-size: 14px; margin-bottom: 16px; }
    .list-area { position: relative; min-height: 320px; }
    .loader-overlay {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: var(--bg, #ECEAE3); z-index: 5;
    }
    .loading-hint { font-size: 13px; color: var(--ink-soft, #6B6B66); text-align: center; margin: -8px 0 0; }
  `;

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
        <div class="amount ${e.kind}">${e.kind === "expense" ? "−" : "+"}${this._money(e.amount)}</div>
        <div class="row-actions">
          <button class="icon-btn" title="Edit" @click=${() => this._startEdit(e)} ?disabled=${busy}><i class="ti ti-pencil" aria-hidden="true"></i></button>
          <button class="icon-btn danger" title="Delete" @click=${() => this._delete(e)} ?disabled=${busy}><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <foundr-topbar active="transactions"></foundr-topbar>

      <div class="page">
        <h1>All entries</h1>
        <p class="sub">Every expense, revenue, and investment you've tracked.</p>

        ${this.error ? html`<div class="error-box">${this.error}</div>` : ""}

        <div class="list-area">
          ${!this.loading
            ? this.entries.length === 0
              ? html`<div class="empty">No entries yet. <a href="/dashboard">Add your first one</a> from the dashboard.</div>`
              : html`<div class="list">${this.entries.map((e) => this._renderRow(e))}</div>`
            : ""}
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
    "foundr-transactions": FoundrTransactions;
  }
}