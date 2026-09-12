import { LitElement, html, css, type TemplateResult, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchShopifyConnection,
  connectShopify,
  syncShopify,
  disconnectShopify,
  formatSyncedAt,
  type ShopifyConnection,
  type SyncResult,
} from "../lib/shopify";
import { fetchEntitlements, entriesRemaining, formatQuotaReset, type Entitlements } from "../lib/entitlements";

/**
 * <foundr-shopify-panel businessId="...">
 * Connect a Shopify store to one business and pull its orders in as
 * revenue, replacing manual entry for anyone selling online.
 *
 * The free plan is deliberately shaped as a real taste rather than a
 * locked door: a founder connects, the most recent orders land in their
 * actual dashboard with their actual numbers, and only then do they meet
 * the monthly ceiling, with a note of exactly how much is still waiting.
 * Hitting a limit after seeing your own revenue appear is a far better
 * reason to upgrade than being refused before seeing anything work.
 *
 * The access token is sent once and never returned by the server, so this
 * component holds it only for as long as the form is open.
 */
@customElement("foundr-shopify-panel")
export class FoundrShopifyPanel extends LitElement {
  @property({ type: String }) businessId = "";

  @state() private connection: ShopifyConnection = { connected: false };
  @state() private entitlements: Entitlements | null = null;
  @state() private loading = true;
  @state() private busy = false;
  @state() private error = "";
  @state() private showSetup = false;
  @state() private domainInput = "";
  @state() private tokenInput = "";
  @state() private lastSync: SyncResult | null = null;
  @state() private confirmingDisconnect = false;

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("businessId") && this.businessId) void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.businessId) return;
    try {
      const [connection, entitlements] = await Promise.all([
        fetchShopifyConnection(this.businessId),
        fetchEntitlements(),
      ]);
      this.connection = connection;
      this.entitlements = entitlements;
      this.error = "";
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your Shopify connection.";
    } finally {
      this.loading = false;
    }
  }

  private async _connect(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.domainInput.trim() || !this.tokenInput.trim()) {
      this.error = "Both the store domain and the access token are required.";
      return;
    }

    this.busy = true;
    this.error = "";
    try {
      this.connection = await connectShopify(this.businessId, this.domainInput.trim(), this.tokenInput.trim());
      this.showSetup = false;
      this.domainInput = "";
      this.tokenInput = ""; // the token is not kept around once it's stored
      this.lastSync = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't connect that store.";
    } finally {
      this.busy = false;
    }
  }

  private async _sync(): Promise<void> {
    this.busy = true;
    this.error = "";
    try {
      const result = await syncShopify(this.businessId);
      this.lastSync = result;
      this.connection = result.connection;
      this.entitlements = result.entitlements;
      // Other views (dashboard, entries) are now stale, so tell the page.
      this.dispatchEvent(new CustomEvent("shopify-synced", { bubbles: true, composed: true, detail: result }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Sync failed.";
    } finally {
      this.busy = false;
    }
  }

  private async _disconnect(): Promise<void> {
    this.busy = true;
    this.error = "";
    try {
      const { keptEntries } = await disconnectShopify(this.businessId);
      this.connection = { connected: false };
      this.lastSync = null;
      this.confirmingDisconnect = false;
      if (keptEntries > 0) {
        this.error = "";
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't disconnect that store.";
    } finally {
      this.busy = false;
    }
  }

  static styles = css`
    :host { display: block; }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-building-store:before { content: "\\ea4e"; }
    .ti-plug-connected:before { content: "\\f00a"; }
    .ti-refresh:before { content: "\\eb13"; }
    .ti-external-link:before { content: "\\ea99"; }
    .ti-alert-triangle:before { content: "\\ea06"; }
    .ti-circle-check:before { content: "\\ea67"; }
    .ti-lock:before { content: "\\eae2"; }
    .ti-arrow-right:before { content: "\\ea1f"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .loading { padding: 30px 0; text-align: center; color: var(--ink-soft, #6B6B66); font-size: 13.5px; }

    /* ---- Disconnected ---- */
    .empty { text-align: center; padding: 28px 20px 32px; }
    .empty .ti-building-store { font-size: 30px; color: var(--sage, #8AAF9A); display: block; margin-bottom: 12px; }
    .empty h4 { font-size: 16px; margin: 0 0 6px; font-weight: 600; }
    .empty p { font-size: 13.5px; color: var(--ink-soft, #6B6B66); margin: 0 auto 18px; max-width: 42ch; line-height: 1.55; }

    .btn-primary {
      display: inline-flex; align-items: center; gap: 7px;
      background: var(--forest, #2D4A3E); color: #fff; font-size: 14px; font-weight: 500;
      padding: 11px 20px; border-radius: var(--radius-pill, 999px);
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .btn-primary:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    .btn-primary:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

    .btn-ghost {
      background: transparent; color: var(--ink-soft, #6B6B66); font-size: 13.5px;
      padding: 9px 14px; border-radius: var(--radius-pill, 999px);
      border: 1px solid var(--line, #E2DFD7);
      transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .btn-ghost:hover:not(:disabled) { color: var(--ink, #1C1C1C); border-color: var(--ink-soft, #6B6B66); }
    .btn-ghost.danger:hover:not(:disabled) { color: var(--danger, #A8302B); border-color: var(--danger-border, #F0C5C3); background: var(--danger-bg, #FBEAE9); }
    .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ---- Setup steps ---- */
    .setup { border: 1px solid var(--line, #E2DFD7); border-radius: 16px; padding: 20px; background: var(--surface-alt, #F2EFE8); }
    .setup h4 { font-size: 14px; margin: 0 0 4px; font-weight: 600; }
    .setup .lead { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 0 0 16px; line-height: 1.5; }
    ol.steps { margin: 0 0 18px; padding-left: 20px; }
    ol.steps li { font-size: 13px; line-height: 1.65; margin-bottom: 7px; color: var(--ink, #1C1C1C); }
    ol.steps code {
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px;
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7);
      padding: 1px 5px; border-radius: 4px;
    }
    .doc-link { font-size: 12.5px; color: var(--forest, #2D4A3E); display: inline-flex; align-items: center; gap: 5px; }

    .field { margin-bottom: 14px; }
    .field label { display: block; font-size: 12.5px; font-weight: 500; margin-bottom: 6px; }
    .field input {
      width: 100%; padding: 11px 13px; font-size: 14px; font-family: inherit; box-sizing: border-box;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
    }
    .field input:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .field .hint { font-size: 11.5px; color: var(--ink-soft, #6B6B66); margin-top: 5px; display: flex; align-items: center; gap: 5px; }
    .form-actions { display: flex; gap: 10px; align-items: center; }

    /* ---- Connected ---- */
    .store-row {
      display: flex; align-items: center; gap: 13px;
      padding: 14px 16px; background: var(--surface-alt, #F2EFE8);
      border: 1px solid transparent; border-radius: 14px;
    }
    .store-row.err { border-color: var(--danger-border, #F0C5C3); background: var(--danger-bg, #FBEAE9); }
    .store-icon {
      width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E);
      display: grid; place-items: center; font-size: 18px;
    }
    .store-info { flex: 1; min-width: 0; }
    .store-name { font-weight: 600; font-size: 14.5px; }
    .store-meta { font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .store-actions { display: flex; gap: 8px; flex-shrink: 0; }

    .note {
      display: flex; gap: 9px; align-items: flex-start;
      font-size: 12.5px; line-height: 1.55; border-radius: 12px; padding: 12px 14px; margin-top: 12px;
    }
    .note.warn { background: var(--danger-bg, #FBEAE9); border: 1px solid var(--danger-border, #F0C5C3); color: var(--ink, #1C1C1C); }
    .note.info { background: var(--sage-soft, #DDE7E0); border: 1px solid var(--sage, #8AAF9A); color: var(--forest-deep, #1F3329); }
    .note .ti { flex-shrink: 0; margin-top: 1px; font-size: 14px; }

    /* ---- Quota ---- */
    .quota { margin-top: 16px; }
    .quota-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; margin-bottom: 7px; }
    .quota-head .label { color: var(--ink-soft, #6B6B66); }
    .quota-head .count { font-weight: 600; }
    .bar-track { height: 7px; background: var(--surface-alt, #F2EFE8); border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--forest, #2D4A3E); border-radius: 999px; transition: width 0.4s ease; }
    .bar-fill.full { background: var(--danger, #D9534F); }
    .quota-note { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-top: 7px; }

    /* ---- Upgrade prompt ---- */
    .upgrade {
      margin-top: 14px; border: 1px solid var(--forest, #2D4A3E); border-radius: 16px;
      padding: 16px 18px; background: var(--surface, #FAFAF7);
    }
    .upgrade h5 { margin: 0 0 5px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 7px; }
    .upgrade p { margin: 0 0 14px; font-size: 13px; color: var(--ink-soft, #6B6B66); line-height: 1.55; }
    .upgrade strong { color: var(--ink, #1C1C1C); }

    .status { font-size: 13px; color: var(--danger, #A8302B); margin-top: 12px; min-height: 18px; }
  `;

  private _renderQuota(): TemplateResult {
    const e = this.entitlements;
    if (!e || e.limits.entriesPerMonth === null) return html``;

    const used = e.usage.entriesThisMonth;
    const limit = e.limits.entriesPerMonth;
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const left = entriesRemaining(e) ?? 0;

    return html`
      <div class="quota">
        <div class="quota-head">
          <span class="label">Entries this month</span>
          <span class="count">${used} of ${limit}</span>
        </div>
        <div class="bar-track"><div class="bar-fill ${left === 0 ? "full" : ""}" style="width:${pct}%"></div></div>
        <div class="quota-note">
          ${left === 0
            ? html`Your allowance resets on ${formatQuotaReset(e)}.`
            : html`${left} left. Resets on ${formatQuotaReset(e)}.`}
        </div>
      </div>
    `;
  }

  private _renderSyncResult(): TemplateResult {
    const r = this.lastSync;
    if (!r) return html``;

    const bits: string[] = [];
    if (r.duplicates > 0) bits.push(`${r.duplicates} already imported`);
    if (r.skipped > 0) bits.push(`${r.skipped} skipped as cancelled or refunded`);

    return html`
      <div class="note info">
        <i class="ti ti-circle-check" aria-hidden="true"></i>
        <div>
          ${r.synced > 0
            ? html`Brought in <strong>${r.synced}</strong> order${r.synced === 1 ? "" : "s"} as revenue.`
            : html`No new orders to bring in.`}
          ${bits.length ? html`<br />${bits.join(", ")}.` : ""}
        </div>
      </div>
      ${r.quotaReached ? this._renderUpgrade(r) : ""}
    `;
  }

  private _renderUpgrade(r: SyncResult): TemplateResult {
    const remaining = r.remaining;
    return html`
      <div class="upgrade">
        <h5><i class="ti ti-lock" aria-hidden="true"></i>More orders are waiting</h5>
        <p>
          ${remaining
            ? html`Your store has <strong>${remaining.exact ? "" : "about "}${remaining.count.toLocaleString()}</strong>
                more order${remaining.count === 1 ? "" : "s"} we haven't brought in yet, because the free plan covers
                ${this.entitlements?.limits.entriesPerMonth} entries a month.`
            : html`You've used this month's entry allowance, so the rest of your orders are still waiting.`}
          Upgrade to import your full history and keep it syncing automatically.
        </p>
        <button class="btn-primary" @click=${this._requestUpgrade}>
          Upgrade<i class="ti ti-arrow-right" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  private _requestUpgrade(): void {
    this.dispatchEvent(new CustomEvent("request-upgrade", { bubbles: true, composed: true }));
  }

  private _renderSetup(): TemplateResult {
    return html`
      <div class="setup">
        <h4>Connect your store</h4>
        <p class="lead">
          Foundr reads your orders through a private app you create inside your own Shopify admin.
          Nothing is installed on your storefront and no one else can see it.
        </p>
        <ol class="steps">
          <li>In your Shopify admin, go to <strong>Settings, Apps and sales channels, Develop apps</strong>.</li>
          <li>Select <strong>Create an app</strong>, name it <code>Foundr</code>, and create it.</li>
          <li>Open <strong>Configuration, Admin API integration</strong> and enable <code>read_orders</code>.
            To import more than the last 60 days, also enable <code>read_all_orders</code>.</li>
          <li>Select <strong>Install app</strong>, then reveal and copy the <strong>Admin API access token</strong>
            (it starts with <code>shpat_</code>). Shopify shows it only once.</li>
        </ol>
        <a class="doc-link" href="https://help.shopify.com/en/manual/apps/app-types/custom-apps" target="_blank" rel="noopener">
          Shopify's own guide<i class="ti ti-external-link" aria-hidden="true"></i>
        </a>

        <form @submit=${this._connect} style="margin-top:18px">
          <div class="field">
            <label for="shop-domain">Store domain</label>
            <input id="shop-domain" type="text" placeholder="your-store.myshopify.com"
              .value=${this.domainInput}
              @input=${(e: Event) => { this.domainInput = (e.target as HTMLInputElement).value; }}
              ?disabled=${this.busy} />
          </div>
          <div class="field">
            <label for="shop-token">Admin API access token</label>
            <input id="shop-token" type="password" placeholder="shpat_..." autocomplete="off"
              .value=${this.tokenInput}
              @input=${(e: Event) => { this.tokenInput = (e.target as HTMLInputElement).value; }}
              ?disabled=${this.busy} />
            <div class="hint"><i class="ti ti-lock" aria-hidden="true"></i>Encrypted before it's stored, and never shown again.</div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" type="submit" ?disabled=${this.busy}>
              ${this.busy ? "Connecting…" : "Connect store"}
            </button>
            <button class="btn-ghost" type="button" ?disabled=${this.busy}
              @click=${() => { this.showSetup = false; this.error = ""; }}>Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  private _renderConnected(): TemplateResult {
    const c = this.connection;
    const errored = c.status === "error";

    return html`
      <div class="store-row ${errored ? "err" : ""}">
        <span class="store-icon"><i class="ti ti-building-store" aria-hidden="true"></i></span>
        <div class="store-info">
          <div class="store-name">${c.shopName || c.shopDomain}</div>
          <div class="store-meta">
            ${c.totalOrdersSynced ?? 0} order${(c.totalOrdersSynced ?? 0) === 1 ? "" : "s"} imported
            · last synced ${formatSyncedAt(c.lastSyncedAt)}
          </div>
        </div>
        <div class="store-actions">
          <button class="btn-primary" @click=${this._sync} ?disabled=${this.busy}>
            <i class="ti ti-refresh" aria-hidden="true"></i>${this.busy ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>

      ${errored && c.lastError
        ? html`<div class="note warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i><div>${c.lastError}</div></div>`
        : ""}

      ${c.currencyMismatch
        ? html`<div class="note warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i><div>${c.currencyMismatch}</div></div>`
        : ""}

      ${c.hasFullHistoryScope === false
        ? html`
            <div class="note info">
              <i class="ti ti-alert-triangle" aria-hidden="true"></i>
              <div>
                This app can only read the last 60 days of orders. To import older history, enable
                <strong>read_all_orders</strong> on the app in your Shopify admin and reconnect.
              </div>
            </div>
          `
        : ""}

      ${this._renderSyncResult()}
      ${this._renderQuota()}

      <div style="margin-top:16px; display:flex; gap:10px; align-items:center;">
        ${this.confirmingDisconnect
          ? html`
              <span style="font-size:13px; color:var(--ink-soft,#6B6B66)">Disconnect? Imported orders stay in your ledger.</span>
              <button class="btn-ghost danger" @click=${this._disconnect} ?disabled=${this.busy}>Disconnect</button>
              <button class="btn-ghost" @click=${() => { this.confirmingDisconnect = false; }} ?disabled=${this.busy}>Cancel</button>
            `
          : html`<button class="btn-ghost danger" @click=${() => { this.confirmingDisconnect = true; }} ?disabled=${this.busy}>Disconnect store</button>`}
      </div>
    `;
  }

  render(): TemplateResult {
    if (this.loading) return html`<div class="loading">Loading your Shopify connection…</div>`;

    let body: TemplateResult;
    if (this.connection.connected) body = this._renderConnected();
    else if (this.showSetup) body = this._renderSetup();
    else
      body = html`
        <div class="empty">
          <i class="ti ti-building-store" aria-hidden="true"></i>
          <h4>No store connected</h4>
          <p>
            Connect a Shopify store and its orders arrive as revenue automatically, so your burn,
            runway, and margins stay current without typing a sale in by hand.
          </p>
          <button class="btn-primary" @click=${() => { this.showSetup = true; }}>
            <i class="ti ti-plug-connected" aria-hidden="true"></i>Connect Shopify
          </button>
          ${this._renderQuota()}
        </div>
      `;

    return html`${body}<div class="status">${this.error}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-shopify-panel": FoundrShopifyPanel;
  }
}
