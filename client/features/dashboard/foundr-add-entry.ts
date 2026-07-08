import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { apiGet, apiPost } from "../../shared/lib/api";
import { currencySymbol } from "../../shared/lib/format";

type EntryKind = "expense" | "revenue" | "investment";

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
 * Modal for adding an Expense, Revenue, or Investment, with the founder's
 * own custom categories.
 *
 * - Three rigid top-level kinds (the money-flows the metrics depend on),
 *   each with a one-line helper so the user always knows what & why.
 * - Categories are fully personal: fetched per-user from /api/categories,
 *   and the user can add their own inline ("+ Add your own").
 *
 * Note on data mapping: the UI kind "revenue" maps to the transaction
 * type "income" at the API layer (the backend still stores income/expense).
 * Investments post to /api/investments.
 */
@customElement("foundr-add-entry")
export class FoundrAddEntry extends LitElement {
  @property({ type: Boolean }) open = false;

  @state() private kind: EntryKind = "expense";
  @state() private amount = "";
  @state() private category = "";
  @state() private note = "";
  @state() private date = todayStr();
  @state() private loading = false;
  @state() private error = "";

  @state() private categories: Category[] = [];
  @state() private catsLoaded = false;
  @state() private addingCategory = false;
  @state() private newCategoryName = "";

  // One-line explanation shown under the tabs, so the jargon is always clear.
  private readonly helper: Record<EntryKind, string> = {
    expense: "Money the business spends to operate — ads, tools, salaries.",
    revenue: "Money the business earns from customers.",
    investment: "Money you put in from your own pocket to fund the business.",
  };

  connectedCallback(): void {
    super.connectedCallback();
    void this._loadCategories();
  }

  updated(changed: Map<string, unknown>): void {
    // Re-fetch categories when the modal is (re)opened, in case the user
    // added some elsewhere.
    if (changed.has("open") && this.open && !this.catsLoaded) {
      void this._loadCategories();
    }
  }

  private async _loadCategories(): Promise<void> {
    try {
      this.categories = await apiGet<Category[]>("/categories");
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
    this.addingCategory = false;
    this.newCategoryName = "";
  }

  private _setKind(kind: EntryKind): void {
    this.kind = kind;
    this.category = "";
    this.error = "";
    this.addingCategory = false;
  }

  private async _saveNewCategory(): Promise<void> {
    const name = this.newCategoryName.trim();
    if (!name) return;
    try {
      const created = await apiPost<Category>("/categories", { kind: this.kind, name });
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
        await apiPost("/investments", {
          amount: amountNum,
          source: this.category,
          note: this.note,
          date: this.date,
        });
      } else {
        await apiPost("/transactions", {
          // revenue maps to the API's "income" type
          type: this.kind === "revenue" ? "income" : "expense",
          amount: amountNum,
          category: this.category,
          note: this.note,
          date: this.date,
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
      position: fixed; inset: 0; background: rgba(28,28,28,0.45);
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

    .kind-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
    .kind-tab {
      flex: 1; padding: 10px; border-radius: 12px; border: 1px solid var(--line, #E2DFD7);
      background: transparent; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 500;
      color: var(--ink-soft, #6B6B66); transition: all 0.15s ease;
    }
    .kind-tab.active { background: var(--forest, #2D4A3E); color: #fff; border-color: var(--forest, #2D4A3E); }
    .helper { font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 20px; line-height: 1.45; }

    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 7px; }
    .amount-wrap { position: relative; }
    .amount-wrap .rupee {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--ink-soft, #6B6B66); font-size: 16px;
    }
    .field input {
      width: 100%; padding: 12px 14px; font-size: 15px; font-family: inherit;
      background: #fff; border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
    }
    .field input.with-rupee { padding-left: 30px; }
    .field input:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }

    .cat-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .cat-chip {
      padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line, #E2DFD7);
      background: transparent; cursor: pointer; font-family: inherit; font-size: 13px;
      color: var(--ink, #1C1C1C); transition: all 0.15s ease;
    }
    .cat-chip.active { background: var(--sage-soft, #DDE7E0); border-color: var(--forest, #2D4A3E); color: var(--forest, #2D4A3E); font-weight: 500; }
    .cat-chip.add { border-style: dashed; color: var(--forest, #2D4A3E); }

    .new-cat-row { display: flex; gap: 8px; margin-top: 10px; }
    .new-cat-row input { flex: 1; padding: 9px 12px; font-size: 14px; font-family: inherit; background: #fff; border: 1px solid var(--line, #E2DFD7); border-radius: 10px; }
    .new-cat-row input:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .new-cat-row button {
      padding: 9px 14px; border-radius: 10px; border: none; background: var(--forest, #2D4A3E);
      color: #fff; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500;
    }

    .error { background: #FBEAE9; color: #A8302B; border: 1px solid #F0C5C3; border-radius: 12px; padding: 10px 14px; font-size: 14px; margin-bottom: 16px; }

    .actions { display: flex; gap: 10px; margin-top: 24px; }
    button.cancel {
      flex: 1; padding: 13px; border-radius: var(--radius-input, 14px); border: 1px solid var(--line, #E2DFD7);
      background: transparent; cursor: pointer; font-family: inherit; font-size: 15px; color: var(--ink, #1C1C1C);
    }
    button.cancel:hover { background: rgba(45,74,62,0.05); }
    button.save {
      flex: 2; padding: 13px; border-radius: var(--radius-input, 14px); border: none;
      background: var(--forest, #2D4A3E); color: #fff; cursor: pointer; font-family: inherit; font-size: 15px; font-weight: 500;
    }
    button.save:hover:not(:disabled) { background: var(--forest-deep, #1F3329); }
    button.save:disabled { opacity: 0.6; cursor: not-allowed; }
  `;

  private _label(): string {
    return this.kind === "investment" ? "Source" : "Category";
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
          </div>
          <p class="helper">${this.helper[this.kind]}</p>

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

            <div class="field">
              <label for="date">Date</label>
              <input id="date" type="date" .value=${this.date} max=${todayStr()}
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