import { LitElement, html, css, type TemplateResult, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fetchRecurringRules, setRecurringActive, deleteRecurringRule } from "../lib/recurring";
import type { RecurringRule } from "../lib/types";
import { formatMoney } from "../lib/format";
import "./foundr-recurring-form";

const FREQUENCY_LABELS: Record<RecurringRule["frequency"], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/**
 * <foundr-recurring-list>
 * Self-contained recurring-rule manager: fetches its own rules for
 * `businessId`, pause/resume/delete. Used both in Settings and in All
 * Entries' "Recurring" tab: a shared component (not duplicated state +
 * markup in each page) so the two stay identical and in sync by
 * construction rather than by discipline.
 */
@customElement("foundr-recurring-list")
export class FoundrRecurringList extends LitElement {
  @property({ type: String }) businessId = "";
  @state() private rules: RecurringRule[] = [];
  @state() private loading = true;
  @state() private saving = false;
  @state() private error = "";
  @state() private formOpen = false;
  @state() private editingRule: RecurringRule | null = null;

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("businessId") && this.businessId) void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.businessId) return;
    try {
      this.rules = await fetchRecurringRules(this.businessId);
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load recurring entries.";
    } finally {
      this.loading = false;
    }
  }

  private async _toggle(rule: RecurringRule): Promise<void> {
    this.saving = true;
    this.error = "";
    try {
      const updated = await setRecurringActive(this.businessId, rule._id, !rule.active);
      this.rules = this.rules.map((r) => (r._id === rule._id ? updated : r));
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't update that rule.";
    } finally {
      this.saving = false;
    }
  }

  private async _delete(rule: RecurringRule): Promise<void> {
    if (!confirm(`Stop "${rule.category}"? This can't be undone.`)) return;
    this.saving = true;
    this.error = "";
    try {
      await deleteRecurringRule(this.businessId, rule._id);
      this.rules = this.rules.filter((r) => r._id !== rule._id);
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't delete that rule.";
    } finally {
      this.saving = false;
    }
  }

  private _openCreate(): void {
    this.editingRule = null;
    this.formOpen = true;
  }

  private _openEdit(rule: RecurringRule): void {
    this.editingRule = rule;
    this.formOpen = true;
  }

  private _closeForm(): void {
    this.formOpen = false;
  }

  private _nextRun(rule: RecurringRule): string {
    return new Date(rule.nextRunDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
    .ti-repeat:before { content: "\\eb72"; }
    .ti-player-pause:before { content: "\\ed45"; }
    .ti-player-play:before { content: "\\ed46"; }
    .ti-trash:before { content: "\\eb41"; }
    .ti-pencil:before { content: "\\eb04"; }
    .ti-plus:before { content: "\\eb0b"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .head-row { display: flex; align-items: center; justify-content: flex-end; margin-bottom: 14px; }
    .add-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--forest, #2D4A3E); color: #fff; font-size: 13.5px; font-weight: 500;
      padding: 9px 16px; border-radius: var(--radius-pill, 999px);
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .add-btn:hover { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    .add-btn:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }

    .hint { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 0; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; background: var(--surface-alt, #F2EFE8); border: 1px solid transparent;
      border-radius: 14px; font-size: 14px; transition: opacity 0.15s ease;
    }
    .row.paused { opacity: 0.6; }
    .icon {
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E);
      display: grid; place-items: center; font-size: 16px;
    }
    .info { flex: 1; min-width: 0; }
    .name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .badge {
      font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      background: var(--surface-alt, #F2EFE8); color: var(--ink-soft, #6B6B66); padding: 3px 8px; border-radius: 999px;
    }
    .icon-btn {
      background: transparent; border: 1px solid var(--line, #E2DFD7); border-radius: 8px;
      width: 30px; height: 30px; display: grid; place-items: center; color: var(--ink-soft, #6B6B66); font-size: 14px;
    }
    .icon-btn:hover { background: rgba(45,74,62,0.06); color: var(--ink, #1C1C1C); }
    .icon-btn.danger:hover { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border-color: var(--danger-border, #F0C5C3); }
    .icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { font-size: 13px; color: var(--danger, #A8302B); margin-top: 12px; min-height: 18px; }
  `;

  render(): TemplateResult {
    if (this.loading) return html``;
    return html`
      <div class="head-row">
        <button class="add-btn" @click=${this._openCreate}>
          <i class="ti ti-plus" aria-hidden="true"></i>Add recurring
        </button>
      </div>
      ${this.rules.length === 0
        ? html`<p class="hint">Nothing recurring yet.</p>`
        : html`
            <div class="list">
              ${this.rules.map(
                (r) => html`
                  <div class="row ${r.active ? "" : "paused"}">
                    <span class="icon"><i class="ti ti-repeat" aria-hidden="true"></i></span>
                    <div class="info">
                      <div class="name">${r.category}</div>
                      <div class="meta">
                        ${r.kind === "revenue" ? "+" : "−"}${this._money(r.amount)} · ${FREQUENCY_LABELS[r.frequency]} · next ${this._nextRun(r)}
                      </div>
                    </div>
                    <div class="actions">
                      ${!r.active ? html`<span class="badge">Paused</span>` : ""}
                      <button class="icon-btn" title="Edit"
                        @click=${() => this._openEdit(r)} ?disabled=${this.saving}>
                        <i class="ti ti-pencil" aria-hidden="true"></i>
                      </button>
                      <button class="icon-btn" title=${r.active ? "Pause" : "Resume"}
                        @click=${() => this._toggle(r)} ?disabled=${this.saving}>
                        <i class="ti ${r.active ? "ti-player-pause" : "ti-player-play"}" aria-hidden="true"></i>
                      </button>
                      <button class="icon-btn danger" title="Delete"
                        @click=${() => this._delete(r)} ?disabled=${this.saving}>
                        <i class="ti ti-trash" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                `
              )}
            </div>
          `}
      <div class="status">${this.error}</div>
      <foundr-recurring-form
        .open=${this.formOpen}
        .editing=${this.editingRule}
        businessId=${this.businessId}
        @close=${this._closeForm}
        @saved=${() => this.refresh()}
      ></foundr-recurring-form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-recurring-list": FoundrRecurringList;
  }
}
