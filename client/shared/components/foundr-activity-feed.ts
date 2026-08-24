import { LitElement, html, css, type TemplateResult, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fetchActivity } from "../lib/activity";
import { apiPost, apiDelete } from "../lib/api";
import type { ActivityLogEntry } from "../lib/types";

/**
 * Which collection route reverses a given entity type — only the 4 ledger
 * kinds are soft-deletable/restorable; businesses/categories/recurring
 * rules are hard-deleted so there's nothing to undo them through.
 */
function collectionPath(entityType: ActivityLogEntry["entityType"]): string | null {
  switch (entityType) {
    case "expense": return "transactions";
    case "investment": return "investments";
    case "draw": return "draws";
    case "debt": return "debts";
    default: return null;
  }
}

/**
 * <foundr-activity-feed>
 * A compact "what just happened" glance for the dashboard — the last few
 * logged mutations, no pagination, with an Undo on the ones that reverse
 * cleanly (create/delete/restore, via the same restore/delete endpoints
 * everywhere else already uses). "Update" isn't undo-able here — reversing
 * an edit would need the field values from before the change, which the
 * activity log doesn't capture; that'd be a real schema change, not a
 * small addition, so it's deliberately out of scope for now.
 *
 * The full paginated history lives in Settings → Activity; this is a
 * different, lighter component rather than the same one in "compact
 * mode," since the two have genuinely different jobs.
 */
@customElement("foundr-activity-feed")
export class FoundrActivityFeed extends LitElement {
  @property({ type: String }) businessId = "";
  @property({ type: Number }) limit = 5;
  @state() private items: ActivityLogEntry[] = [];
  @state() private loading = true;
  @state() private undoingId: string | null = null;
  @state() private error = "";

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("businessId") && this.businessId) void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.businessId) return;
    try {
      const res = await fetchActivity(this.businessId, 1, this.limit);
      this.items = res.items;
      this.error = "";
    } catch {
      this.items = [];
    } finally {
      this.loading = false;
    }
  }

  private _canUndo(a: ActivityLogEntry): boolean {
    return (a.action === "create" || a.action === "delete" || a.action === "restore") && collectionPath(a.entityType) !== null;
  }

  private async _undo(a: ActivityLogEntry): Promise<void> {
    const path = collectionPath(a.entityType);
    if (!path) return;
    this.undoingId = a._id;
    this.error = "";
    try {
      if (a.action === "delete") {
        // Undoing a delete = restore.
        await apiPost(`/${path}/${a.entityId}/restore?businessId=${this.businessId}`, {});
      } else {
        // Undoing a create or a restore = (soft-)delete it again.
        await apiDelete(`/${path}/${a.entityId}?businessId=${this.businessId}`);
      }
      // The undo itself is a real mutation and gets its own log entry —
      // refreshing picks that up too, which is correct: an undo is an
      // auditable action, not something that erases its own trail.
      await this.refresh();
      this.dispatchEvent(new CustomEvent("changed", { bubbles: true, composed: true }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't undo that.";
    } finally {
      this.undoingId = null;
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

  private _actionIcon(action: ActivityLogEntry["action"]): string {
    if (action === "create") return "ti-plus";
    if (action === "delete") return "ti-trash";
    if (action === "restore") return "ti-arrow-back-up";
    return "ti-pencil";
  }

  static styles = css`
    :host { display: block; margin-top: 16px; }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-plus:before { content: "\\eb0b"; }
    .ti-pencil:before { content: "\\eb04"; }
    .ti-trash:before { content: "\\eb41"; }
    .ti-arrow-back-up:before { content: "\\eb77"; }

    .card {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      padding: 22px; border: 0.5px solid var(--line, #E2DFD7);
    }
    .head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    h3 {
      font-family: var(--font-body, "Inter", sans-serif); font-size: 14px; font-weight: 600;
      margin: 0; color: var(--ink, #1C1C1C);
    }
    .view-all { font-size: 12.5px; color: var(--forest, #2D4A3E); font-weight: 500; text-decoration: none; }
    .view-all:hover { text-decoration: underline; }

    .list { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
    .icon {
      width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E);
      display: grid; place-items: center; font-size: 13px;
    }
    .summary { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .time { font-size: 12px; color: var(--ink-soft, #6B6B66); white-space: nowrap; flex-shrink: 0; }
    button { font-family: inherit; cursor: pointer; border: none; }
    .undo-btn {
      background: transparent; border: 1px solid var(--line, #E2DFD7); color: var(--forest, #2D4A3E);
      font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 7px; white-space: nowrap; flex-shrink: 0;
      transition: background 0.15s ease;
    }
    .undo-btn:hover:not(:disabled) { background: var(--sage-soft, #DDE7E0); }
    .undo-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { font-size: 12.5px; color: var(--danger, #A8302B); margin-top: 10px; }
  `;

  render(): TemplateResult {
    if (this.loading || this.items.length === 0) return html``;
    return html`
      <div class="card">
        <div class="head-row">
          <h3>Recent activity</h3>
          <a class="view-all" href="/settings?section=activity">View all</a>
        </div>
        <div class="list">
          ${this.items.map(
            (a) => html`
              <div class="row">
                <span class="icon"><i class="ti ${this._actionIcon(a.action)}" aria-hidden="true"></i></span>
                <span class="summary">${a.summary}</span>
                <span class="time">${this._timeAgo(a.createdAt)}</span>
                ${this._canUndo(a)
                  ? html`<button class="undo-btn" @click=${() => this._undo(a)} ?disabled=${this.undoingId === a._id}>
                      ${this.undoingId === a._id ? "Undoing…" : "Undo"}
                    </button>`
                  : ""}
              </div>
            `
          )}
        </div>
        ${this.error ? html`<div class="status">${this.error}</div>` : ""}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-activity-feed": FoundrActivityFeed;
  }
}
