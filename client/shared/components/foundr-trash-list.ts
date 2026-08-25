import { LitElement, html, css, type TemplateResult, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fetchTrash, restoreEntry, permanentlyDeleteEntry } from "../lib/trash";
import type { TrashedEntry } from "../lib/types";
import { formatMoney } from "../lib/format";

/**
 * <foundr-trash-list>
 * Self-contained trash manager: fetches soft-deleted entries for
 * `businessId`, restore/delete-forever. Used both in Settings and in All
 * Entries' "Deleted" tab: a shared component so the two stay identical
 * and in sync by construction, same reasoning as foundr-recurring-list.
 */
@customElement("foundr-trash-list")
export class FoundrTrashList extends LitElement {
  @property({ type: String }) businessId = "";
  @state() private items: TrashedEntry[] = [];
  @state() private loading = true;
  @state() private saving = false;
  @state() private error = "";

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("businessId") && this.businessId) void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.businessId) return;
    try {
      this.items = await fetchTrash(this.businessId);
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load the trash.";
    } finally {
      this.loading = false;
    }
  }

  private async _restore(item: TrashedEntry): Promise<void> {
    this.saving = true;
    this.error = "";
    try {
      await restoreEntry(item, this.businessId);
      this.items = this.items.filter((t) => t.id !== item.id);
      this.dispatchEvent(new CustomEvent("trash-changed", { bubbles: true, composed: true }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't restore that entry.";
    } finally {
      this.saving = false;
    }
  }

  private async _permanentlyDelete(item: TrashedEntry): Promise<void> {
    if (!confirm(`Permanently delete this ${item.kind} of ${formatMoney(item.amount)}? This can't be undone.`)) return;
    this.saving = true;
    this.error = "";
    try {
      await permanentlyDeleteEntry(item, this.businessId);
      this.items = this.items.filter((t) => t.id !== item.id);
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't delete that entry.";
    } finally {
      this.saving = false;
    }
  }

  private _timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  private _money(n: number): string {
    return formatMoney(n);
  }

  static styles = css`
    :host { display: block; }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-trash:before { content: "\\eb41"; }
    .ti-arrow-back-up:before { content: "\\eb77"; }
    .ti-trash-x:before { content: "\\ef88"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .hint { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 0; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; background: var(--surface-alt, #F2EFE8); border-radius: 14px; font-size: 14px;
    }
    .icon {
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E);
      display: grid; place-items: center; font-size: 16px;
    }
    .info { flex: 1; min-width: 0; }
    .name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .icon-btn {
      background: transparent; border: 1px solid var(--line, #E2DFD7); border-radius: 8px;
      width: 30px; height: 30px; display: grid; place-items: center; color: var(--ink-soft, #6B6B66); font-size: 14px;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    .icon-btn:hover:not(:disabled) { background: rgba(45,74,62,0.06); color: var(--ink, #1C1C1C); transform: translate(-2px, -2px); box-shadow: 2px 2px 0 var(--sage, #8AAF9A); }
    .icon-btn:active:not(:disabled) { transform: translate(0, 0) scale(0.94); box-shadow: none; }
    .icon-btn.danger:hover:not(:disabled) { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border-color: var(--danger-border, #F0C5C3); box-shadow: 2px 2px 0 var(--danger-border, #F0C5C3); }
    .icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { font-size: 13px; color: var(--danger, #A8302B); margin-top: 12px; min-height: 18px; }
  `;

  render(): TemplateResult {
    if (this.loading) return html``;
    return html`
      ${this.items.length === 0
        ? html`<p class="hint">Trash is empty.</p>`
        : html`
            <div class="list">
              ${this.items.map(
                (t) => html`
                  <div class="row">
                    <span class="icon"><i class="ti ti-trash" aria-hidden="true"></i></span>
                    <div class="info">
                      <div class="name">${t.label}</div>
                      <div class="meta">${t.kind} · ${this._money(t.amount)} · deleted ${this._timeAgo(t.deletedAt)}</div>
                    </div>
                    <div class="actions">
                      <button class="icon-btn" title="Restore" @click=${() => this._restore(t)} ?disabled=${this.saving}>
                        <i class="ti ti-arrow-back-up" aria-hidden="true"></i>
                      </button>
                      <button class="icon-btn danger" title="Delete forever" @click=${() => this._permanentlyDelete(t)} ?disabled=${this.saving}>
                        <i class="ti ti-trash-x" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                `
              )}
            </div>
          `}
      <div class="status">${this.error}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-trash-list": FoundrTrashList;
  }
}
