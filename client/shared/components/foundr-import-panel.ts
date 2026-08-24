import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import Papa from "papaparse";
import { importEntries, type ImportRow, type ImportResult } from "../lib/import";
import { downloadText } from "../lib/download";

interface StepMeta {
  title: string;
  short: string;
  icon: string;
  desc: string;
}

const STEPS: StepMeta[] = [
  { title: "The rulebook", short: "Rulebook", icon: "ti-book-2", desc: "Foundr's data shape — what every field means." },
  { title: "Get the AI prompt", short: "AI prompt", icon: "ti-message-2-code", desc: "A ready-made prompt that reshapes your old data for you." },
  { title: "Reshape your data", short: "Reshape", icon: "ti-wand", desc: "Run the prompt in any LLM with your exported data." },
  { title: "Upload & import", short: "Import", icon: "ti-upload", desc: "Upload the result and bring it into Foundr." },
];

const EXAMPLE_ROWS: ImportRow[] = [
  { kind: "expense", amount: 49.99, label: "Software", note: "Notion subscription", date: "2026-01-05" },
  { kind: "revenue", amount: 2500, label: "Consulting", note: "", date: "2026-01-10" },
  { kind: "investment", amount: 10000, label: "Personal savings", note: "Seed capital", date: "2026-01-01" },
  { kind: "draw", amount: 500, label: "Personal", note: "", date: "2026-02-01" },
  { kind: "debt", amount: 2000, label: "Bank loan", note: "", date: "2026-01-15" },
  { kind: "repayment", amount: 300, label: "Bank loan", note: "", date: "2026-02-15" },
];

function buildPrompt(): string {
  return `You are a data-migration assistant. I'm going to give you exported financial data from my old tool, and I need you to convert it into a specific JSON format so I can import it into Foundr, a finance tracker for solo founders.

Output ONLY a raw JSON array — no markdown code fences, no explanation, no commentary before or after. Just the JSON array itself, starting with [ and ending with ].

Each item in the array must be an object with exactly these fields:

- "kind" (REQUIRED): one of "expense", "revenue", "investment", "draw", "debt", "repayment" — exactly one of these six strings, nothing else
  - "expense" = money spent running the business
  - "revenue" = money earned from customers/sales
  - "investment" = money the founder put into the business
  - "draw" = money the founder took out of the business personally
  - "debt" = money borrowed (a loan taken)
  - "repayment" = money paid back on a loan
- "amount" (REQUIRED): a positive number greater than zero, no currency symbols or commas (e.g. 1200.50, not "$1,200.50")
- "label" (REQUIRED): a short non-empty string. For "expense"/"revenue"/"draw" this is the category (e.g. "Software", "Consulting", "Personal"). For "investment"/"debt"/"repayment" this is the source (e.g. "Personal savings", "Bank loan").
- "date" (REQUIRED): an ISO date string, e.g. "2026-01-15"
- "note" (optional): a short string — use "" if there's nothing to put here, never omit the field entirely

A record is only skipped if one of the four REQUIRED fields is truly missing or invalid — so:
- If you can't find a date for a record, use your best guess (e.g. the nearest date you do have, or today's date) rather than leaving it out.
- If a record is missing a category/source, use a reasonable label like "Uncategorized" or "Other" rather than dropping the record.
- Never invent a "kind" or "amount" — if either of those two is truly unknowable for a record, it's fine to leave that one record out (everything else you produce will still import).

Example of the exact output shape:
[
  {"kind": "expense", "amount": 49.99, "label": "Software", "note": "Notion subscription", "date": "2026-01-05"},
  {"kind": "revenue", "amount": 2500, "label": "Consulting", "note": "", "date": "2026-01-10"}
]

Now here is my exported data — convert every record you can into this format. If something doesn't map cleanly, use your best judgment and keep going; don't skip silently or ask me questions, just produce the best JSON array you can from what I give you:

<PASTE YOUR EXPORTED DATA HERE>`;
}

/**
 * <foundr-import-panel>
 * Self-contained bulk-import wizard: rulebook, a copy-pasteable LLM prompt
 * that reshapes a founder's old data into Foundr's schema, and a file
 * upload (JSON or CSV) that previews then submits the parsed rows to
 * POST /api/import. Client only parses JSON.parse / Papa.parse — actual
 * validation and persistence is server-side (see server/lib/import.ts),
 * so this component never has to duplicate those rules.
 *
 * True binary .xlsx isn't supported — the only npm package that parses it
 * (xlsx/SheetJS) has unpatched prototype-pollution and ReDoS vulnerabilities
 * with no fix on the registry, and this route parses untrusted uploads.
 * CSV covers the same "Excel file" use case without that risk.
 */
@customElement("foundr-import-panel")
export class FoundrImportPanel extends LitElement {
  @property({ type: String }) businessId = "";

  @state() private step = 0;
  @state() private copied = false;
  @state() private fileName = "";
  @state() private parsedRows: ImportRow[] = [];
  @state() private parseError = "";
  @state() private importing = false;
  @state() private result: ImportResult | null = null;
  @state() private resultError = "";
  @state() private dragging = false;
  private _dragDepth = 0;

  private _goto(i: number): void {
    this.step = i;
  }

  private _back(): void {
    if (this.step > 0) this.step -= 1;
  }

  private _next(): void {
    if (this.step < STEPS.length - 1) this.step += 1;
  }

  private async _copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      this.copied = true;
      setTimeout(() => { this.copied = false; }, 2000);
    } catch {
      this.parseError = "Couldn't copy automatically — select the text and copy it manually.";
    }
  }

  private _downloadJsonTemplate(): void {
    downloadText("foundr-import-template.json", JSON.stringify(EXAMPLE_ROWS, null, 2), "application/json");
  }

  private _downloadCsvTemplate(): void {
    const csv = Papa.unparse(EXAMPLE_ROWS as unknown as Record<string, unknown>[]);
    downloadText("foundr-import-template.csv", csv, "text/csv");
  }

  private async _onFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this._handleFile(file);
  }

  private _onDragEnter(e: DragEvent): void {
    e.preventDefault();
    this._dragDepth += 1;
    this.dragging = true;
  }

  private _onDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  private _onDragLeave(e: DragEvent): void {
    e.preventDefault();
    this._dragDepth = Math.max(0, this._dragDepth - 1);
    if (this._dragDepth === 0) this.dragging = false;
  }

  private async _onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    this._dragDepth = 0;
    this.dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await this._handleFile(file);
  }

  private async _handleFile(file: File): Promise<void> {
    this.fileName = file.name;
    this.parseError = "";
    this.parsedRows = [];
    this.result = null;
    this.resultError = "";

    if (!/\.(json|csv)$/i.test(file.name)) {
      this.parseError = "That file isn't a .json or .csv file.";
      return;
    }

    const text = await file.text();

    if (file.name.toLowerCase().endsWith(".csv")) {
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      if (parsed.errors.length > 0) {
        this.parseError = `Couldn't read that CSV: ${parsed.errors[0].message}`;
        return;
      }
      this.parsedRows = parsed.data as unknown as ImportRow[];
    } else {
      try {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) {
          this.parseError = "That JSON file isn't a list of entries.";
          return;
        }
        this.parsedRows = data;
      } catch {
        this.parseError = "Couldn't parse that file as JSON.";
        return;
      }
    }

    if (this.parsedRows.length === 0) {
      this.parseError = "No rows found in that file.";
    }
  }

  private async _import(): Promise<void> {
    if (!this.businessId || this.parsedRows.length === 0) return;
    this.importing = true;
    this.resultError = "";
    this.result = null;
    try {
      this.result = await importEntries(this.businessId, this.parsedRows);
      if (this.result.imported > 0) {
        this.dispatchEvent(new CustomEvent("imported", { bubbles: true, composed: true }));
      }
    } catch (err) {
      this.resultError = err instanceof Error ? err.message : "Import failed. Please try again.";
    } finally {
      this.importing = false;
    }
  }

  private _reset(): void {
    this.fileName = "";
    this.parsedRows = [];
    this.parseError = "";
    this.result = null;
    this.resultError = "";
  }

  static styles = css`
    :host { display: block; }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-book-2:before { content: "\\efc5"; }
    .ti-message-2-code:before { content: "\\f012"; }
    .ti-wand:before { content: "\\ebcb"; }
    .ti-upload:before { content: "\\eb47"; }
    .ti-check:before { content: "\\ea5e"; }
    .ti-copy:before { content: "\\ea7a"; }
    .ti-download:before { content: "\\ea96"; }
    .ti-file:before { content: "\\eaa4"; }
    .ti-alert-triangle:before { content: "\\ea06"; }
    .ti-arrow-left:before { content: "\\ea19"; }
    .ti-arrow-right:before { content: "\\ea1f"; }
    .ti-lock:before { content: "\\eae2"; }
    button { font-family: inherit; cursor: pointer; }

    .wizard { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 0; background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7); border-radius: 20px; overflow: hidden; }
    @media (max-width: 760px) { .wizard { grid-template-columns: 1fr; } }

    .rail { background: var(--surface-alt, #F2EFE8); border-right: 1px solid var(--line, #E2DFD7); padding: 22px 18px; display: flex; flex-direction: column; gap: 4px; }
    .rail-step {
      display: flex; align-items: stretch; gap: 12px; padding: 12px 10px; border-radius: 14px;
      background: transparent; border: none; text-align: left; width: 100%; color: inherit;
      transition: background 0.15s ease;
    }
    .rail-step:hover { background: rgba(45,74,62,0.06); }
    .rail-step.active { background: var(--surface, #FAFAF7); box-shadow: 0 1px 0 rgba(0,0,0,0.02); }
    .rail-badge-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; position: relative; }
    .rail-badge {
      width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
      font-size: 13px; font-weight: 600; border: 1.5px solid var(--line, #E2DFD7); color: var(--ink-soft, #6B6B66);
      background: var(--surface, #FAFAF7);
    }
    .rail-connector {
      position: absolute; top: 30px; bottom: -20px; left: 50%; width: 2px; transform: translateX(-50%);
      background: var(--line, #E2DFD7); transition: background 0.2s ease;
    }
    .rail-connector.done { background: var(--forest, #2D4A3E); }
    .rail-step.active .rail-badge { border-color: var(--forest, #2D4A3E); color: var(--forest, #2D4A3E); }
    .rail-step.done .rail-badge { background: var(--forest, #2D4A3E); border-color: var(--forest, #2D4A3E); color: #fff; }
    .rail-text .t { font-size: 13.5px; font-weight: 600; }
    .rail-text .d { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-top: 2px; line-height: 1.4; }

    .panel { padding: 28px 32px 24px; display: flex; flex-direction: column; min-height: 420px; min-width: 0; }
    .eyebrow { font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--forest, #2D4A3E); margin: 0 0 6px; }
    .panel h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; margin: 0 0 6px; }
    .panel .lede { font-size: 13.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 20px; line-height: 1.55; max-width: 60ch; }
    .panel-body { flex: 1; }

    .rulebook-wrap { overflow-x: auto; }
    table.rulebook { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; }
    table.rulebook th, table.rulebook td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line, #E2DFD7); vertical-align: top; overflow-wrap: break-word; }
    table.rulebook th:nth-child(1), table.rulebook td:nth-child(1) { width: 18%; }
    table.rulebook th:nth-child(2), table.rulebook td:nth-child(2) { width: 16%; }
    table.rulebook th { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft, #6B6B66); font-weight: 600; }
    table.rulebook code { background: var(--surface-alt, #F2EFE8); padding: 1px 6px; border-radius: 6px; font-size: 12px; white-space: normal; }

    .template-row { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
    .btn-ghost {
      display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: var(--radius-pill, 999px);
      border: 1px solid var(--line, #E2DFD7); background: var(--surface, #FAFAF7); color: var(--ink, #1C1C1C);
      font-size: 13px; font-weight: 500;
    }
    .btn-ghost:hover { background: var(--surface-alt, #F2EFE8); }

    .prompt-box { position: relative; }
    .prompt-box textarea {
      width: 100%; box-sizing: border-box; min-height: 220px; resize: vertical; padding: 14px 16px; font-size: 12.5px;
      font-family: "SF Mono", Menlo, Consolas, monospace; line-height: 1.55; color: var(--ink, #1C1C1C);
      background: var(--surface-alt, #F2EFE8); border: 1px solid var(--line, #E2DFD7); border-radius: 14px;
    }
    .btn-copy {
      position: absolute; top: 12px; right: 12px; display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 12px; border-radius: var(--radius-pill, 999px); border: 1px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7); font-size: 12.5px; font-weight: 500; color: var(--ink, #1C1C1C);
    }
    .btn-copy.copied { background: var(--forest, #2D4A3E); border-color: var(--forest, #2D4A3E); color: #fff; }

    .privacy-note {
      display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; padding: 12px 14px;
      background: var(--surface-alt, #F2EFE8); border-radius: 12px; font-size: 12.5px; color: var(--ink-soft, #6B6B66); line-height: 1.5;
    }
    .privacy-note .ti { color: var(--forest, #2D4A3E); font-size: 15px; margin-top: 1px; flex-shrink: 0; }

    ol.steps-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 12px; font-size: 13.5px; line-height: 1.5; }
    ol.steps-list li strong { display: block; margin-bottom: 2px; }

    .upload-zone {
      position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;
      border: 1.5px dashed var(--line, #E2DFD7); border-radius: 16px; padding: 28px 20px; text-align: center;
      background: var(--surface-alt, #F2EFE8); transition: background 0.15s ease, border-color 0.15s ease;
    }
    .upload-zone:hover { background: var(--sage-soft, #DDE7E0); border-color: transparent; }
    .upload-zone.dragging { background: var(--sage-soft, #DDE7E0); border-color: transparent; transform: scale(1.01); }
    .upload-zone input[type="file"] { display: none; }
    .upload-zone .ti-upload { font-size: 22px; color: var(--forest, #2D4A3E); margin-bottom: 8px; transition: transform 0.15s ease; }
    .upload-zone:hover .ti-upload, .upload-zone.dragging .ti-upload { transform: translateY(-2px); }
    .upload-zone .hint { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-top: 6px; }
    .marching-ants {
      position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
      opacity: 0; transition: opacity 0.15s ease;
    }
    .upload-zone:hover .marching-ants, .upload-zone.dragging .marching-ants { opacity: 1; }
    .marching-ants rect {
      fill: none; stroke: var(--forest, #2D4A3E); stroke-width: 2; stroke-dasharray: 7 5;
      animation: march 0.5s linear infinite;
    }
    @keyframes march { to { stroke-dashoffset: -24; } }
    @media (prefers-reduced-motion: reduce) {
      .marching-ants rect { animation: none; }
    }
    .file-chip { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; padding: 6px 12px; background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7); border-radius: var(--radius-pill, 999px); font-size: 12.5px; }

    .preview-table-wrap { max-height: 260px; overflow: auto; border: 1px solid var(--line, #E2DFD7); border-radius: 12px; margin-top: 14px; }
    table.preview { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    table.preview th, table.preview td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line, #E2DFD7); white-space: nowrap; }
    table.preview th { position: sticky; top: 0; background: var(--surface-alt, #F2EFE8); text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.04em; color: var(--ink-soft, #6B6B66); }
    .more-rows { font-size: 12px; color: var(--ink-soft, #6B6B66); padding: 8px 10px; }

    .status-box { margin-top: 16px; padding: 12px 14px; border-radius: 12px; font-size: 13px; }
    .status-box.error { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border: 1px solid var(--danger-border, #F0C5C3); }
    .status-box.ok { background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); }
    .status-box.warn { background: rgba(201, 138, 43, 0.12); color: var(--tone-warn, #C98A2B); border: 1px solid rgba(201, 138, 43, 0.35); }
    .skip-list { margin: 8px 0 0; padding-left: 18px; max-height: 140px; overflow: auto; }

    .footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line, #E2DFD7); }
    .btn-back {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: var(--radius-pill, 999px);
      border: 1px solid var(--line, #E2DFD7); background: transparent; color: var(--ink-soft, #6B6B66); font-size: 13.5px; font-weight: 500;
    }
    .btn-back:hover:not(:disabled) { background: var(--surface-alt, #F2EFE8); color: var(--ink, #1C1C1C); }
    .btn-back:disabled { opacity: 0; pointer-events: none; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 7px; padding: 11px 22px; border-radius: var(--radius-pill, 999px);
      border: none; background: var(--forest, #2D4A3E); color: #fff; font-size: 13.5px; font-weight: 600;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
    }
    .btn-primary:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-2px,-2px); box-shadow: 2px 2px 0 var(--sage, #8AAF9A); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  `;

  private _renderStepContent(): TemplateResult {
    switch (this.step) {
      case 0:
        return html`
          <div class="eyebrow">Step 1 of ${STEPS.length}</div>
          <h2>The rulebook</h2>
          <p class="lede">Every entry Foundr imports uses this one flat shape, no matter which kind it is. If you're migrating data by hand (or briefing an LLM yourself), match this exactly.</p>
          <div class="panel-body">
            <div class="rulebook-wrap">
              <table class="rulebook">
                <thead><tr><th>Field</th><th>Required</th><th>Meaning</th></tr></thead>
                <tbody>
                  <tr><td><code>kind</code></td><td>Yes</td><td>One of <code>expense</code>, <code>revenue</code>, <code>investment</code>, <code>draw</code>, <code>debt</code>, <code>repayment</code>.</td></tr>
                  <tr><td><code>amount</code></td><td>Yes</td><td>Positive number — no currency symbols or commas.</td></tr>
                  <tr><td><code>label</code></td><td>Yes</td><td>Category for expense/revenue/draw (e.g. "Software"), or source for investment/debt/repayment (e.g. "Bank loan").</td></tr>
                  <tr><td><code>date</code></td><td>Yes</td><td>ISO date, e.g. <code>2026-01-15</code>.</td></tr>
                  <tr><td><code>note</code></td><td>No</td><td>Can be left as an empty string.</td></tr>
                </tbody>
              </table>
            </div>
            <div class="privacy-note">
              <i class="ti ti-alert-triangle" aria-hidden="true"></i>
              <span>Import is per-row — a few rows missing required fields won't block the rest. Anything that doesn't fit is skipped with a reason, everything else still comes in.</span>
            </div>
            <div class="template-row">
              <button class="btn-ghost" @click=${this._downloadJsonTemplate}><i class="ti ti-download" aria-hidden="true"></i>Download JSON template</button>
              <button class="btn-ghost" @click=${this._downloadCsvTemplate}><i class="ti ti-download" aria-hidden="true"></i>Download CSV template</button>
            </div>
          </div>
        `;
      case 1:
        return html`
          <div class="eyebrow">Step 2 of ${STEPS.length}</div>
          <h2>Get the AI prompt</h2>
          <p class="lede">Copy this prompt into ChatGPT, Claude, or any LLM, paste your exported data (CSV, spreadsheet, whatever you've got) right after it, and it'll come back as data shaped for Foundr.</p>
          <div class="panel-body">
            <div class="prompt-box">
              <button class="btn-copy ${this.copied ? "copied" : ""}" @click=${this._copyPrompt}>
                <i class="ti ${this.copied ? "ti-check" : "ti-copy"}" aria-hidden="true"></i>${this.copied ? "Copied" : "Copy prompt"}
              </button>
              <textarea readonly .value=${buildPrompt()}></textarea>
            </div>
            <div class="privacy-note">
              <i class="ti ti-lock" aria-hidden="true"></i>
              <span>Pasting your financial data into a third-party LLM sends it to whichever tool you use — use one you trust, and check its data-retention policy if that matters for your business.</span>
            </div>
          </div>
        `;
      case 2:
        return html`
          <div class="eyebrow">Step 3 of ${STEPS.length}</div>
          <h2>Reshape your data</h2>
          <p class="lede">A few minutes in any chat window turns your old export into something Foundr can read.</p>
          <div class="panel-body">
            <ol class="steps-list">
              <li><strong>Export your existing data</strong>Get it out of your old tool as CSV, a spreadsheet export, or even a rough copy-paste — the LLM will make sense of it.</li>
              <li><strong>Paste the prompt, then your data</strong>Open a new chat with any LLM, paste the prompt from Step 2, then paste your exported data right after it in the same message.</li>
              <li><strong>Save the response as a file</strong>The reply should be a raw JSON array. Save it as a <code>.json</code> file (any text editor works — just make sure the extension is <code>.json</code>).</li>
              <li><strong>If it added extra text</strong>Some models add a sentence before/after the array despite instructions — just delete anything that isn't between the outer <code>[</code> and <code>]</code>.</li>
            </ol>
          </div>
        `;
      default:
        return this._renderUploadStep();
    }
  }

  private _renderResult(result: ImportResult): TemplateResult {
    const total = result.imported + result.skipped.length;
    const outcome = result.imported === 0 ? "failure" : result.skipped.length === 0 ? "success" : "partial";

    const summary =
      outcome === "success"
        ? html`<div class="status-box ok"><i class="ti ti-check" aria-hidden="true"></i> Imported ${result.imported} row(s).</div>`
        : outcome === "partial"
          ? html`<div class="status-box warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${result.imported} out of ${total} row(s) imported successfully.</div>`
          : html`<div class="status-box error"><i class="ti ti-alert-triangle" aria-hidden="true"></i> 0 out of ${total} row(s) imported.</div>`;

    return html`
      ${summary}
      ${result.skipped.length > 0
        ? html`
            <div class="status-box ${outcome === "failure" ? "error" : "warn"}">
              ${result.skipped.length} row(s) skipped:
              <ul class="skip-list">
                ${result.skipped.map((s) => html`<li>Row ${s.row}: ${s.reason}</li>`)}
              </ul>
            </div>
          `
        : ""}
      <div class="template-row"><button class="btn-ghost" @click=${this._reset}>Import another file</button></div>
    `;
  }

  private _renderUploadStep(): TemplateResult {
    const preview = this.parsedRows.slice(0, 8);
    return html`
      <div class="eyebrow">Step 4 of ${STEPS.length}</div>
      <h2>Upload & import</h2>
      <p class="lede">Upload the JSON file from Step 3, or a CSV built from the template in Step 1.</p>
      <div class="panel-body">
        <label
          class="upload-zone ${this.dragging ? "dragging" : ""}"
          @dragenter=${this._onDragEnter}
          @dragover=${this._onDragOver}
          @dragleave=${this._onDragLeave}
          @drop=${this._onDrop}
        >
          <svg class="marching-ants" aria-hidden="true"><rect x="1" y="1" width="99%" height="99%" rx="15"></rect></svg>
          <input type="file" accept=".json,.csv" @change=${this._onFile} />
          <i class="ti ti-upload" aria-hidden="true"></i>
          <div>${this.dragging ? "Drop it here" : "Click to choose a file, or drag one here"}</div>
          <div class="hint">.json or .csv</div>
          ${this.fileName
            ? html`<div class="file-chip"><i class="ti ti-file" aria-hidden="true"></i>${this.fileName}</div>`
            : ""}
        </label>

        ${this.parseError
          ? html`<div class="status-box error"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${this.parseError}</div>`
          : ""}

        ${this.parsedRows.length > 0 && !this.result
          ? html`
              <div class="preview-table-wrap">
                <table class="preview">
                  <thead><tr><th>Kind</th><th>Amount</th><th>Label</th><th>Note</th><th>Date</th></tr></thead>
                  <tbody>
                    ${preview.map(
                      (r) => html`<tr><td>${r.kind ?? ""}</td><td>${r.amount ?? ""}</td><td>${r.label ?? ""}</td><td>${r.note ?? ""}</td><td>${r.date ?? ""}</td></tr>`
                    )}
                  </tbody>
                </table>
                ${this.parsedRows.length > preview.length
                  ? html`<div class="more-rows">+ ${this.parsedRows.length - preview.length} more row(s)</div>`
                  : ""}
              </div>
              <div class="template-row">
                <button class="btn-primary" @click=${this._import} ?disabled=${this.importing}>
                  <i class="ti ti-upload" aria-hidden="true"></i>${this.importing ? "Importing…" : `Import ${this.parsedRows.length} row(s)`}
                </button>
              </div>
            `
          : ""}

        ${this.resultError ? html`<div class="status-box error"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${this.resultError}</div>` : ""}

        ${this.result ? this._renderResult(this.result) : ""}
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <div class="wizard">
        <div class="rail">
          ${STEPS.map(
            (s, i) => html`
              <button class="rail-step ${i === this.step ? "active" : ""} ${i < this.step ? "done" : ""}" @click=${() => this._goto(i)}>
                <span class="rail-badge-col">
                  <span class="rail-badge">${i < this.step ? html`<i class="ti ti-check" aria-hidden="true"></i>` : i + 1}</span>
                  ${i < STEPS.length - 1 ? html`<span class="rail-connector ${i < this.step ? "done" : ""}"></span>` : ""}
                </span>
                <span class="rail-text">
                  <span class="t">${s.title}</span>
                  <span class="d">${s.desc}</span>
                </span>
              </button>
            `
          )}
        </div>
        <div class="panel">
          ${this._renderStepContent()}
          <div class="footer">
            <button class="btn-back" @click=${this._back} ?disabled=${this.step === 0}><i class="ti ti-arrow-left" aria-hidden="true"></i>Back</button>
            ${this.step < STEPS.length - 1
              ? html`<button class="btn-primary" @click=${this._next}>Continue<i class="ti ti-arrow-right" aria-hidden="true"></i></button>`
              : ""}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-import-panel": FoundrImportPanel;
  }
}
