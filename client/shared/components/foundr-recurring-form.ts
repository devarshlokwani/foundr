import { LitElement, html, css, type TemplateResult, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { apiGet, apiPost } from "../lib/api";
import { currencySymbol } from "../lib/format";
import { createRecurringRule, updateRecurringRule } from "../lib/recurring";
import type { RecurringRule } from "../lib/types";

type Kind = "expense" | "revenue";
type Frequency = "weekly" | "monthly" | "yearly";

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

interface Category {
  _id: string;
  kind: string;
  name: string;
}

function todayStr(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/**
 * <foundr-recurring-form>
 * Modal for creating or editing a recurring expense/revenue rule directly
 * — not routed through the full 5-kind Add Entry modal, since investment/
 * draw/debt don't support recurring and the extra tabs would just be
 * noise here. Pass `.editing=${rule}` to edit an existing rule in place,
 * or leave it null to create a new one.
 */
@customElement("foundr-recurring-form")
export class FoundrRecurringForm extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: String }) businessId = "";
  @property({ attribute: false }) editing: RecurringRule | null = null;

  @state() private kind: Kind = "expense";
  @state() private amount = "";
  @state() private category = "";
  @state() private note = "";
  @state() private frequency: Frequency = "monthly";
  @state() private startDate = todayStr();
  @state() private loading = false;
  @state() private error = "";

  @state() private categories: Category[] = [];
  @state() private addingCategory = false;
  @state() private newCategoryName = "";

  updated(changed: PropertyValues<this>): void {
    if (changed.has("open") && this.open) {
      this._resetFromEditing();
      void this._loadCategories();
    }
  }

  private _resetFromEditing(): void {
    const r = this.editing;
    this.kind = r?.kind ?? "expense";
    this.amount = r ? String(r.amount) : "";
    this.category = r?.category ?? "";
    this.note = r?.note ?? "";
    this.frequency = r?.frequency ?? "monthly";
    this.startDate = todayStr();
    this.error = "";
    this.addingCategory = false;
    this.newCategoryName = "";
  }

  private async _loadCategories(): Promise<void> {
    if (!this.businessId) return;
    try {
      this.categories = await apiGet<Category[]>(`/categories?businessId=${this.businessId}`);
    } catch {
      // Non-fatal: user can still type a custom one.
    }
  }

  private get currentCategories(): Category[] {
    return this.categories.filter((c) => c.kind === this.kind);
  }

  private _setKind(kind: Kind): void {
    this.kind = kind;
    if (!this.editing) this.category = "";
    this.error = "";
    this.addingCategory = false;
  }

  private async _saveNewCategory(): Promise<void> {
    const name = this.newCategoryName.trim();
    if (!name) return;
    try {
      const created = await apiPost<Category>(`/categories?businessId=${this.businessId}`, { kind: this.kind, name });
      this.categories = [...this.categories, created];
      this.category = created.name;
      this.addingCategory = false;
      this.newCategoryName = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't add category.";
    }
  }

  private _close(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  private async _submit(e: Event): Promise<void> {
    e.preventDefault();
    const amountNum = parseFloat(this.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      this.error = "Enter an amount greater than zero.";
      return;
    }
    if (!this.category) {
      this.error = "Pick a category.";
      return;
    }

    this.loading = true;
    this.error = "";
    try {
      if (this.editing) {
        await updateRecurringRule(this.businessId, this.editing._id, {
          kind: this.kind,
          amount: amountNum,
          category: this.category,
          note: this.note,
          frequency: this.frequency,
        });
      } else {
        await createRecurringRule(this.businessId, {
          kind: this.kind,
          amount: amountNum,
          category: this.category,
          note: this.note,
          frequency: this.frequency,
          startDate: this.startDate,
        });
      }
      this.dispatchEvent(new CustomEvent("saved", { bubbles: true, composed: true }));
      this._close();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't save. Try again.";
    } finally {
      this.loading = false;
    }
  }

  static styles = css`
    :host { display: contents; }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay, rgba(28,28,28,0.45));
      display: flex; align-items: center; justify-content: center; z-index: 200; padding: 20px;
    }
    .modal {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      width: 100%; max-width: 420px; padding: 28px; box-shadow: 0 24px 60px -20px rgba(31,51,41,0.4);
      font-family: var(--font-body, "Inter", sans-serif); color: var(--ink, #1C1C1C);
      max-height: 90vh; overflow-y: auto;
    }
    .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .modal-head h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 24px; margin: 0; }
    .close-x {
      background: none; border: none; cursor: pointer; font-size: 22px; color: var(--ink-soft, #6B6B66);
      width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center;
    }
    .close-x:hover { background: rgba(45,74,62,0.07); }

    .kind-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .kind-tab {
      flex: 1; padding: 10px 6px; border-radius: 12px; border: 1px solid var(--line, #E2DFD7);
      background: transparent; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 500;
      color: var(--ink-soft, #6B6B66); transition: all 0.15s ease;
    }
    .kind-tab.active { background: var(--forest, #2D4A3E); color: #fff; border-color: var(--forest, #2D4A3E); }

    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 7px; }
    .amount-wrap { position: relative; }
    .amount-wrap .rupee {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--ink-soft, #6B6B66); font-size: 16px;
    }
    .field input, .field select {
      width: 100%; padding: 12px 14px; font-size: 15px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C); box-sizing: border-box;
    }
    .field input.with-rupee { padding-left: 30px; }
    .field input:focus, .field select:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }

    .cat-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .cat-chip {
      padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line, #E2DFD7);
      background: transparent; cursor: pointer; font-family: inherit; font-size: 13px;
      color: var(--ink, #1C1C1C); transition: all 0.15s ease;
    }
    .cat-chip.active { background: var(--sage-soft, #DDE7E0); border-color: var(--forest, #2D4A3E); color: var(--forest, #2D4A3E); font-weight: 500; }
    .cat-chip.add { border-style: dashed; color: var(--forest, #2D4A3E); }

    .new-cat-row { display: flex; gap: 8px; margin-top: 10px; }
    .new-cat-row input { flex: 1; padding: 9px 12px; font-size: 14px; font-family: inherit; background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7); border-radius: 10px; }
    .new-cat-row input:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .new-cat-row button {
      padding: 9px 14px; border-radius: 10px; border: none; background: var(--forest, #2D4A3E);
      color: #fff; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500;
    }

    .error { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border: 1px solid var(--danger-border, #F0C5C3); border-radius: 12px; padding: 10px 14px; font-size: 14px; margin-bottom: 16px; }

    .actions { display: flex; gap: 10px; margin-top: 24px; }
    button.cancel {
      flex: 1; padding: 13px; border-radius: var(--radius-input, 14px); border: 1px solid var(--line, #E2DFD7);
      background: transparent; cursor: pointer; font-family: inherit; font-size: 15px; color: var(--ink, #1C1C1C);
    }
    button.cancel:hover { background: rgba(45,74,62,0.05); }
    button.save {
      flex: 2; padding: 13px; border-radius: var(--radius-input, 14px); border: none;
      background: var(--forest, #2D4A3E); color: #fff; cursor: pointer; font-family: inherit; font-size: 15px; font-weight: 500;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    button.save:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    button.save:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    button.save:disabled { opacity: 0.6; cursor: not-allowed; }
  `;

  render(): TemplateResult {
    if (!this.open) return html``;
    const isEdit = Boolean(this.editing);

    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal">
          <div class="modal-head">
            <h2>${isEdit ? "Edit recurring entry" : "New recurring entry"}</h2>
            <button class="close-x" @click=${this._close} aria-label="Close">×</button>
          </div>

          <div class="kind-tabs">
            <button class="kind-tab ${this.kind === "expense" ? "active" : ""}" @click=${() => this._setKind("expense")}>Expense</button>
            <button class="kind-tab ${this.kind === "revenue" ? "active" : ""}" @click=${() => this._setKind("revenue")}>Revenue</button>
          </div>

          ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ""}

          <form @submit=${this._submit}>
            <div class="field">
              <label for="amount">Amount</label>
              <div class="amount-wrap">
                <span class="rupee">${currencySymbol()}</span>
                <input
                  id="amount" class="with-rupee" type="number" inputmode="decimal" min="0" step="0.01"
                  placeholder="0" .value=${this.amount}
                  @input=${(e: Event) => { this.amount = (e.target as HTMLInputElement).value; this.error = ""; }}
                  ?disabled=${this.loading}
                />
              </div>
            </div>

            <div class="field">
              <label>Category</label>
              <div class="cat-grid">
                ${this.currentCategories.map(
                  (c) => html`
                    <button type="button" class="cat-chip ${this.category === c.name ? "active" : ""}"
                      @click=${() => { this.category = c.name; this.error = ""; }}>${c.name}</button>
                  `
                )}
                <button type="button" class="cat-chip add" @click=${() => { this.addingCategory = true; }}>+ Add your own</button>
              </div>

              ${this.addingCategory
                ? html`
                    <div class="new-cat-row">
                      <input
                        type="text" placeholder="New category name"
                        .value=${this.newCategoryName}
                        @input=${(e: Event) => { this.newCategoryName = (e.target as HTMLInputElement).value; }}
                        @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void this._saveNewCategory(); } }}
                      />
                      <button type="button" @click=${this._saveNewCategory}>Add</button>
                    </div>
                  `
                : ""}
            </div>

            <div class="field">
              <label for="frequency">Repeats</label>
              <select id="frequency" .value=${this.frequency}
                @change=${(e: Event) => { this.frequency = (e.target as HTMLSelectElement).value as Frequency; }}>
                ${FREQUENCY_OPTIONS.map((f) => html`<option value=${f.value} ?selected=${f.value === this.frequency}>${f.label}</option>`)}
              </select>
            </div>

            ${!isEdit
              ? html`
                  <div class="field">
                    <label for="startDate">Starts on</label>
                    <input id="startDate" type="date" .value=${this.startDate}
                      @input=${(e: Event) => { this.startDate = (e.target as HTMLInputElement).value; }}
                      ?disabled=${this.loading} />
                  </div>
                `
              : ""}

            <div class="field">
              <label for="note">Note (optional)</label>
              <input id="note" type="text" placeholder="What's this for?"
                .value=${this.note} @input=${(e: Event) => { this.note = (e.target as HTMLInputElement).value; }}
                ?disabled=${this.loading} />
            </div>

            <div class="actions">
              <button type="button" class="cancel" @click=${this._close} ?disabled=${this.loading}>Cancel</button>
              <button type="submit" class="save" ?disabled=${this.loading}>
                ${this.loading ? "Saving…" : isEdit ? "Save changes" : "Add recurring entry"}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-recurring-form": FoundrRecurringForm;
  }
}
