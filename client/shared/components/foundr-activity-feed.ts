import { LitElement, html, css, type TemplateResult, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fetchActivity, timeAgo, exactTime, cleanSummary, canUndoActivity, undoActivity } from "../lib/activity";
import type { ActivityLogEntry } from "../lib/types";

/**
 * <foundr-activity-feed>
 * A compact "what just happened" glance for the dashboard: the last few
 * logged mutations, no pagination, with an Undo on the ones that reverse
 * cleanly (create/delete/restore, via the same restore/delete endpoints
 * everywhere else already uses, see lib/activity.ts's undoActivity).
 * "Update" isn't undo-able here: reversing an edit would need the field
 * values from before the change, which the activity log doesn't capture;
 * that'd be a real schema change, not a small addition, so it's
 * deliberately out of scope for now.
 *
 * The full paginated history lives in Settings → Data → Activity; this is
 * a different, lighter component rather than the same one in "compact
 * mode," since the two have genuinely different jobs. They share the
 * same row detail (relative + exact timestamp, undo) via lib/activity.ts
 * so a row reads and behaves identically wherever it's shown.
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

  private async _undo(a: ActivityLogEntry): Promise<void> {
    this.undoingId = a._id;
    this.error = "";
    try {
      await undoActivity(a, this.businessId);
      // The undo itself is a real mutation and gets its own log entry;
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
    .time { text-align: right; white-space: nowrap; flex-shrink: 0; }
    .time .rel { font-size: 12px; color: var(--ink-soft, #6B6B66); }
    .time .exact { font-size: 10.5px; color: var(--ink-soft, #6B6B66); opacity: 0.75; margin-top: 1px; }
    button { font-family: inherit; cursor: pointer; border: none; }
    .undo-btn {
      background: transparent; border: 1px solid var(--line, #E2DFD7); color: var(--forest, #2D4A3E);
      font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 7px; white-space: nowrap; flex-shrink: 0;
      transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    .undo-btn:hover:not(:disabled) { background: var(--sage-soft, #DDE7E0); transform: translate(-2px, -2px); box-shadow: 2px 2px 0 var(--sage, #8AAF9A); }
    .undo-btn:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .undo-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { font-size: 12.5px; color: var(--danger, #A8302B); margin-top: 10px; }
  `;

  render(): TemplateResult {
    if (this.loading || this.items.length === 0) return html``;
    return html`
      <div class="card">
        <div class="head-row">
          <h3>Recent activity</h3>
          <a class="view-all" href="/settings?section=data&sub=activity">View all</a>
        </div>
        <div class="list">
          ${this.items.map(
            (a) => html`
              <div class="row">
                <span class="icon"><i class="ti ${this._actionIcon(a.action)}" aria-hidden="true"></i></span>
                <span class="summary">${cleanSummary(a.summary)}</span>
                <span class="time">
                  <div class="rel">${timeAgo(a.createdAt)}</div>
                  <div class="exact">${exactTime(a.createdAt)}</div>
                </span>
                ${canUndoActivity(a)
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
