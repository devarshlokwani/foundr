import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { apiGet, apiPost } from "../lib/api";
import { currencySymbol } from "../lib/format";
import { createRecurringRule } from "../lib/recurring";

type EntryKind = "expense" | "revenue" | "investment" | "draw" | "debt";
type DebtDirection = "borrow" | "repay";
type Frequency = "weekly" | "monthly" | "yearly";

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

interface Category {
  _id: string;
  kind: EntryKind;
  name: string;
}

/** Today's date as YYYY-MM-DD for the date input's default. */
function todayStr(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/**
 * <foundr-add-entry>
 * Modal for adding an Expense, Revenue, Investment, Draw, or Debt entry,
 * with the founder's own custom categories.
 *
 * - Five rigid top-level kinds (the money-flows the metrics and the
 *   balance sheet depend on), each with a one-line helper so the user
 *   always knows what & why.
 * - Categories are fully personal: fetched per-user from /api/categories,
 *   and the user can add their own inline ("+ Add your own").
 *
 * Note on data mapping: the UI kind "revenue" maps to the transaction
 * type "income" at the API layer (the backend still stores income/expense).
 * Investments post to /api/investments, Draws to /api/draws, Debt to
 * /api/debts (with a borrow/repay sub-toggle).
 */
@customElement("foundr-add-entry")
export class FoundrAddEntry extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: String }) businessId = "";

  @state() private kind: EntryKind = "expense";
  @state() private amount = "";
  @state() private category = "";
  @state() private note = "";
  @state() private date = todayStr();
  @state() private loading = false;
  @state() private error = "";

  // Expense-only: marks a capital purchase (equipment/tools kept, not
  // consumed) so it becomes a Fixed Asset on the balance sheet instead of
  // reducing retained earnings.
  @state() private isCapital = false;
  // Debt-only: which direction this entry moves the outstanding balance.
  @state() private debtDirection: DebtDirection = "borrow";
  // Expense/revenue-only: adds a recurring rule instead of (well, in
  // addition to, via lazy materialization, see lib/recurring.ts) a
  // one-off entry, so the founder doesn't have to re-type it every period.
  @state() private recurring = false;
  @state() private frequency: Frequency = "monthly";

  @state() private categories: Category[] = [];
  @state() private catsLoaded = false;
  @state() private addingCategory = false;
  @state() private newCategoryName = "";

  // One-line explanation shown under the tabs, so the jargon is always clear.
  private readonly helper: Record<EntryKind, string> = {
    expense: "Money the business spends to operate: ads, tools, salaries.",
    revenue: "Money the business earns from customers.",
    investment: "Money you put in from your own pocket to fund the business.",
    draw: "Money you take out of the business for personal use.",
    debt: "Money borrowed for the business, or a repayment on what you owe.",
  };

  connectedCallback(): void {
    super.connectedCallback();
    void this._loadCategories();
  }

  updated(changed: Map<string, unknown>): void {
    // Re-fetch categories when the modal is (re)opened, in case the user
    // added some elsewhere, or once businessId arrives (it's set as a
    // property by the parent shortly after this element connects).
    if ((changed.has("open") && this.open && !this.catsLoaded) || (changed.has("businessId") && this.businessId)) {
      void this._loadCategories();
    }
  }

  private async _loadCategories(): Promise<void> {
    if (!this.businessId) return;
    try {
      this.categories = await apiGet<Category[]>(`/categories?businessId=${this.businessId}`);
      this.catsLoaded = true;
    } catch {
      // Non-fatal: user can still type a custom one.
    }
  }

  private get currentCategories(): Category[] {
    return this.categories.filter((c) => c.kind === this.kind);
  }

  private _close(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
    this._reset();
  }

  private _reset(): void {
    this.amount = "";
    this.category = "";
    this.note = "";
    this.date = todayStr();
    this.error = "";
    this.kind = "expense";
    this.isCapital = false;
    this.debtDirection = "borrow";
    this.recurring = false;
    this.frequency = "monthly";
    this.addingCategory = false;
    this.newCategoryName = "";
  }

  private _setKind(kind: EntryKind): void {
    this.kind = kind;
    this.category = "";
    this.error = "";
    this.addingCategory = false;
    this.recurring = false;
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
      if (this.kind === "investment") {
        await apiPost(`/investments?businessId=${this.businessId}`, {
          amount: amountNum,
          source: this.category,
          note: this.note,
          date: this.date,
        });
      } else if (this.kind === "draw") {
        await apiPost(`/draws?businessId=${this.businessId}`, {
          amount: amountNum,
          category: this.category,
          note: this.note,
          date: this.date,
        });
      } else if (this.kind === "debt") {
        await apiPost(`/debts?businessId=${this.businessId}`, {
          type: this.debtDirection,
          amount: amountNum,
          source: this.category,
          note: this.note,
          date: this.date,
        });
      } else if (this.recurring) {
        // Creates the rule only; the first occurrence (and any others
        // that come due) appears next time entries/metrics are fetched,
        // via the same lazy materialization ensureDefaultBusiness uses.
        await createRecurringRule(this.businessId, {
          kind: this.kind as "expense" | "revenue",
          amount: amountNum,
          category: this.category,
          note: this.note,
          frequency: this.frequency,
          startDate: this.date,
        });
      } else {
        await apiPost(`/transactions?businessId=${this.businessId}`, {
          // revenue maps to the API's "income" type
          type: this.kind === "revenue" ? "income" : "expense",
          amount: amountNum,
          category: this.category,
          note: this.note,
          date: this.date,
          isCapital: this.kind === "expense" ? this.isCapital : undefined,
        });
      }
      this.dispatchEvent(new CustomEvent("entry-added", { bubbles: true, composed: true }));
      this._reset();
      this._close();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't save. Try again.";
    } finally {
      this.loading = false;
    }
  }

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay, rgba(28,28,28,0.45));
      display: flex; align-items: center; justify-content: center; z-index: 200; padding: 20px;
    }
    .modal {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      width: 100%; max-width: 460px; padding: 28px; box-shadow: 0 24px 60px -20px rgba(31,51,41,0.4);
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

    .kind-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .kind-tab {
      flex: 1 1 28%; padding: 10px 6px; border-radius: 12px; border: 1px solid var(--line, #E2DFD7);
      background: transparent; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 500;
      color: var(--ink-soft, #6B6B66); transition: all 0.15s ease;
    }
    .kind-tab.active { background: var(--forest, #2D4A3E); color: #fff; border-color: var(--forest, #2D4A3E); }
    .helper { font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 14px; line-height: 1.45; }

    .debt-toggle { display: flex; gap: 8px; margin-bottom: 20px; }
    .debt-pill {
      flex: 1; padding: 9px; border-radius: var(--radius-pill, 999px); border: 1px solid var(--line, #E2DFD7);
      background: transparent; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500;
      color: var(--ink-soft, #6B6B66); transition: all 0.15s ease;
    }
    .debt-pill.active { background: var(--accent-purple-bg, #EAE6F3); border-color: var(--accent-purple, #5B4B8A); color: var(--accent-purple, #5B4B8A); }

    .capital-check {
      display: flex; align-items: flex-start; gap: 9px; cursor: pointer;
      margin: -6px 0 16px; font-size: 12.5px; color: var(--ink-soft, #6B6B66); line-height: 1.4;
    }
    .capital-check input { margin-top: 2px; accent-color: var(--forest, #2D4A3E); flex-shrink: 0; }

    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 7px; }
    .amount-wrap { position: relative; }
    .amount-wrap .rupee {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--ink-soft, #6B6B66); font-size: 16px;
    }
    .field input {
      width: 100%; padding: 12px 14px; font-size: 15px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
    }
    .field input.with-rupee { padding-left: 30px; }
    .field input:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .field select {
      width: 100%; padding: 12px 14px; font-size: 15px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C); cursor: pointer;
    }
    .field select:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }

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
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    button.cancel:hover { background: rgba(45,74,62,0.05); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    button.cancel:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    button.save {
      flex: 2; padding: 13px; border-radius: var(--radius-input, 14px); border: none;
      background: var(--forest, #2D4A3E); color: #fff; cursor: pointer; font-family: inherit; font-size: 15px; font-weight: 500;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    button.save:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    button.save:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    button.save:disabled { opacity: 0.6; cursor: not-allowed; }
  `;

  private _label(): string {
    return this.kind === "investment" || this.kind === "debt" ? "Source" : "Category";
  }

  render(): TemplateResult {
    if (!this.open) return html``;

    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal">
          <div class="modal-head">
            <h2>Add an entry</h2>
            <button class="close-x" @click=${this._close} aria-label="Close">×</button>
          </div>

          <div class="kind-tabs">
            <button class="kind-tab ${this.kind === "expense" ? "active" : ""}" @click=${() => this._setKind("expense")}>Expense</button>
            <button class="kind-tab ${this.kind === "revenue" ? "active" : ""}" @click=${() => this._setKind("revenue")}>Revenue</button>
            <button class="kind-tab ${this.kind === "investment" ? "active" : ""}" @click=${() => this._setKind("investment")}>Investment</button>
            <button class="kind-tab ${this.kind === "draw" ? "active" : ""}" @click=${() => this._setKind("draw")}>Draw</button>
            <button class="kind-tab ${this.kind === "debt" ? "active" : ""}" @click=${() => this._setKind("debt")}>Debt</button>
          </div>
          <p class="helper">${this.helper[this.kind]}</p>

          ${this.kind === "debt"
            ? html`
                <div class="debt-toggle">
                  <button type="button" class="debt-pill ${this.debtDirection === "borrow" ? "active" : ""}"
                    @click=${() => { this.debtDirection = "borrow"; }}>Borrowed</button>
                  <button type="button" class="debt-pill ${this.debtDirection === "repay" ? "active" : ""}"
                    @click=${() => { this.debtDirection = "repay"; }}>Repaid</button>
                </div>
              `
            : ""}

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
              <label>${this._label()}</label>
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
                        type="text" placeholder="New ${this._label().toLowerCase()} name"
                        .value=${this.newCategoryName}
                        @input=${(e: Event) => { this.newCategoryName = (e.target as HTMLInputElement).value; }}
                        @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void this._saveNewCategory(); } }}
                      />
                      <button type="button" @click=${this._saveNewCategory}>Add</button>
                    </div>
                  `
                : ""}
            </div>

            ${this.kind === "expense"
              ? html`
                  <label class="capital-check">
                    <input type="checkbox" .checked=${this.isCapital}
                      @change=${(e: Event) => { this.isCapital = (e.target as HTMLInputElement).checked; }} />
                    <span>This is equipment or a tool the business will keep using (not a one-time cost)</span>
                  </label>
                `
              : ""}

            ${this.kind === "expense" || this.kind === "revenue"
              ? html`
                  <label class="capital-check">
                    <input type="checkbox" .checked=${this.recurring}
                      @change=${(e: Event) => { this.recurring = (e.target as HTMLInputElement).checked; }} />
                    <span>Make this recurring, add it again automatically on a schedule</span>
                  </label>
                  ${this.recurring
                    ? html`
                        <div class="field">
                          <label for="frequency">Repeats</label>
                          <select id="frequency" .value=${this.frequency}
                            @change=${(e: Event) => { this.frequency = (e.target as HTMLSelectElement).value as Frequency; }}>
                            ${FREQUENCY_OPTIONS.map((f) => html`<option value=${f.value} ?selected=${f.value === this.frequency}>${f.label}</option>`)}
                          </select>
                        </div>
                      `
                    : ""}
                `
              : ""}

            <div class="field">
              <label for="date">${this.recurring ? "Starts on" : "Date"}</label>
              <input id="date" type="date" .value=${this.date} max=${ifDefined(this.recurring ? undefined : todayStr())}
                @input=${(e: Event) => { this.date = (e.target as HTMLInputElement).value; }}
                ?disabled=${this.loading} />
            </div>

            <div class="field">
              <label for="note">Note (optional)</label>
              <input id="note" type="text" placeholder="What was this for?"
                .value=${this.note} @input=${(e: Event) => { this.note = (e.target as HTMLInputElement).value; }}
                ?disabled=${this.loading} />
            </div>

            <div class="actions">
              <button type="button" class="cancel" @click=${this._close} ?disabled=${this.loading}>Cancel</button>
              <button type="submit" class="save" ?disabled=${this.loading}>
                ${this.loading ? "Saving…" : "Save entry"}
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
    "foundr-add-entry": FoundrAddEntry;
  }
}