import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk } from "../auth/auth.service";
import { checkSessionFreshness } from "../../shared/lib/session-guard";
import { fetchEntitlements, entriesRemaining, formatQuotaReset, type Entitlements } from "../../shared/lib/entitlements";
import { PLANS, PREMIUM_PRICE, PREMIUM_INTERVAL, type PlanDefinition } from "../../shared/lib/plans";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-mini-loader";
import "../../shared/components/foundr-coming-soon-modal";

/**
 * <foundr-upgrade>
 * The signed-in plan page: where a founder sees what they're on, what
 * they've used, and what paying would change.
 *
 * Deliberately shows real usage rather than generic marketing copy. "You've
 * used 47 of 50 entries this month" is a far more honest and more
 * persuasive argument than a feature grid, because it is about their own
 * account rather than a claim about the product.
 *
 * No card details are ever collected here. The upgrade button will hand off
 * to Stripe's hosted checkout, which keeps card data off Foundr's servers
 * entirely and out of PCI scope. Until that exists the button explains
 * itself rather than pretending to work.
 */
@customElement("foundr-upgrade")
export class FoundrUpgrade extends LitElement {
  @state() private entitlements: Entitlements | null = null;
  @state() private loading = true;
  @state() private error = "";
  @state() private comingSoonOpen = false;

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
    if (!(await checkSessionFreshness(clerk))) {
      window.location.href = "/sign-in";
      return;
    }

    try {
      this.entitlements = await fetchEntitlements();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Couldn't load your plan.";
    } finally {
      this.loading = false;
    }
  }

  private get _isPremium(): boolean {
    return this.entitlements?.plan === "premium";
  }

  static styles = css`
    :host {
      display: block; min-height: 100vh;
      background: var(--bg, #ECEAE3); color: var(--ink, #1C1C1C);
      font-family: var(--font-body, "Inter", sans-serif); -webkit-font-smoothing: antialiased;
    }
    .ti {
      font-family: "tabler-icons" !important; font-style: normal; font-weight: normal;
      line-height: 1; -webkit-font-smoothing: antialiased;
    }
    .ti-check:before { content: "\\ea5e"; }
    .ti-sparkles:before { content: "\\f6d7"; }
    .ti-arrow-left:before { content: "\\ea19"; }
    .ti-shield-check:before { content: "\\eb22"; }
    button { font-family: inherit; cursor: pointer; border: none; }

    .page { max-width: 900px; margin: 0 auto; padding: 40px 32px 90px; }
    .back {
      display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px;
      color: var(--ink-soft, #6B6B66); text-decoration: none; margin-bottom: 26px;
      padding: 8px 14px; border-radius: var(--radius-pill, 999px); background: transparent;
      transition: transform 0.18s ease, box-shadow 0.18s ease, color 0.15s ease, background 0.2s ease;
    }
    .back:hover {
      color: var(--ink, #1C1C1C); background: rgba(45,74,62,0.07);
      transform: translate(-4px, -4px); box-shadow: 4px 4px 0 var(--sage, #8AAF9A);
    }
    .back:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }

    h1 { font-family: var(--font-display, Georgia, serif); font-weight: 400; font-size: 38px; margin: 0 0 8px; line-height: 1.15; }
    .sub { font-size: 15.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 34px; max-width: 56ch; line-height: 1.6; }

    /* ---- Current usage ---- */
    .usage-card {
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7);
      border-radius: 20px; padding: 22px 24px; margin-bottom: 34px;
    }
    .usage-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
    .usage-head .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft, #6B6B66); }
    .usage-head .plan-name { font-size: 21px; font-weight: 600; margin-top: 3px; }
    .badge {
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
      padding: 5px 11px; border-radius: 999px;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E);
      display: inline-flex; align-items: center; gap: 5px;
    }

    .meters { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
    @media (max-width: 620px) { .meters { grid-template-columns: 1fr; } }
    .meter-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; margin-bottom: 7px; }
    .meter-head .name { color: var(--ink-soft, #6B6B66); }
    .meter-head .count { font-weight: 600; font-variant-numeric: tabular-nums; }
    .bar-track { height: 8px; background: var(--surface-alt, #F2EFE8); border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--forest, #2D4A3E); border-radius: 999px; transition: width 0.5s ease; }
    .bar-fill.full { background: var(--danger, #D9534F); }
    .meter-note { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-top: 7px; }

    /* ---- Plans ---- */
    .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 760px) { .plans { grid-template-columns: 1fr; } }
    .plan {
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7);
      border-radius: 22px; padding: 26px 24px; display: flex; flex-direction: column;
    }
    .plan.featured { border: 2px solid var(--forest, #2D4A3E); box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18)); }
    .plan.current { background: var(--surface-alt, #F2EFE8); }
    .plan-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .plan h3 { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
    .plan .tagline { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 0 0 18px; }
    .price { display: flex; align-items: baseline; gap: 7px; margin-bottom: 20px; }
    .price .amount { font-family: var(--font-display, Georgia, serif); font-size: 38px; line-height: 1; }
    .price .interval { font-size: 13.5px; color: var(--ink-soft, #6B6B66); }
    ul.features { list-style: none; padding: 0; margin: 0 0 24px; flex: 1; }
    ul.features li { display: flex; align-items: flex-start; gap: 9px; font-size: 14px; line-height: 1.5; margin-bottom: 11px; }
    ul.features .tick { color: var(--forest, #2D4A3E); flex-shrink: 0; font-size: 15px; margin-top: 1px; }

    .btn-upgrade {
      width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      background: var(--forest, #2D4A3E); color: #fff; font-size: 15px; font-weight: 500;
      padding: 14px; border-radius: var(--radius-input, 14px);
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .btn-upgrade:hover { background: var(--forest-deep, #1F3329); transform: translate(-4px, -4px); box-shadow: 4px 4px 0 var(--sage, #8AAF9A); }
    .btn-upgrade:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .btn-current {
      width: 100%; text-align: center; padding: 14px; border-radius: var(--radius-input, 14px);
      background: transparent; border: 1px solid var(--line, #E2DFD7);
      color: var(--ink-soft, #6B6B66); font-size: 14.5px; cursor: default;
    }

    .reassure {
      margin-top: 26px; display: flex; align-items: center; justify-content: center; gap: 8px;
      font-size: 12.5px; color: var(--ink-soft, #6B6B66);
    }
    .error { background: var(--danger-bg, #FBEAE9); border: 1px solid var(--danger-border, #F0C5C3); color: var(--danger, #A8302B); border-radius: 12px; padding: 12px 15px; font-size: 14px; margin-bottom: 22px; }
    .loading-wrap { padding: 80px 0; display: grid; place-items: center; }
  `;

  private _renderUsage(): TemplateResult {
    const e = this.entitlements;
    if (!e) return html``;

    const entryLimit = e.limits.entriesPerMonth;
    const bizLimit = e.limits.businesses;
    const left = entriesRemaining(e);

    const meter = (name: string, used: number, limit: number | null, note: string) => {
      if (limit === null) {
        return html`
          <div>
            <div class="meter-head"><span class="name">${name}</span><span class="count">${used} · unlimited</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:100%"></div></div>
            <div class="meter-note">${note}</div>
          </div>
        `;
      }
      const pct = Math.min(100, Math.round((used / limit) * 100));
      return html`
        <div>
          <div class="meter-head"><span class="name">${name}</span><span class="count">${used} of ${limit}</span></div>
          <div class="bar-track"><div class="bar-fill ${used >= limit ? "full" : ""}" style="width:${pct}%"></div></div>
          <div class="meter-note">${note}</div>
        </div>
      `;
    };

    return html`
      <div class="usage-card">
        <div class="usage-head">
          <div>
            <div class="label">Your plan</div>
            <div class="plan-name">${this._isPremium ? "Premium" : "Starter"}</div>
          </div>
          ${e.isAdmin
            ? html`<span class="badge"><i class="ti ti-shield-check" aria-hidden="true"></i>Admin, unlimited</span>`
            : this._isPremium
              ? html`<span class="badge"><i class="ti ti-sparkles" aria-hidden="true"></i>Premium</span>`
              : ""}
        </div>
        <div class="meters">
          ${meter(
            "Entries this month",
            e.usage.entriesThisMonth,
            entryLimit,
            entryLimit === null
              ? "No monthly limit."
              : left === 0
                ? `Allowance resets on ${formatQuotaReset(e)}.`
                : `${left} left. Resets on ${formatQuotaReset(e)}.`
          )}
          ${meter(
            "Startups",
            e.usage.businesses,
            bizLimit,
            bizLimit === null ? "Track as many as you like." : `The free plan covers ${bizLimit}.`
          )}
        </div>
      </div>
    `;
  }

  private _renderPlan(plan: PlanDefinition): TemplateResult {
    const isCurrent = (plan.id === "premium") === this._isPremium;

    return html`
      <div class="plan ${plan.featured ? "featured" : ""} ${isCurrent ? "current" : ""}">
        <div class="plan-top">
          <div>
            <h3>${plan.name}</h3>
            <p class="tagline">${plan.tagline}</p>
          </div>
          ${isCurrent ? html`<span class="badge">Current</span>` : ""}
        </div>
        <div class="price">
          <span class="amount">${plan.price}</span>
          <span class="interval">${plan.interval}</span>
        </div>
        <ul class="features">
          ${plan.features.map(
            (f) => html`<li><i class="ti ti-check tick" aria-hidden="true"></i><span>${f}</span></li>`
          )}
        </ul>
        ${isCurrent
          ? html`<div class="btn-current">Your current plan</div>`
          : plan.id === "premium"
            ? html`
                <button class="btn-upgrade" @click=${() => { this.comingSoonOpen = true; }}>
                  <i class="ti ti-sparkles" aria-hidden="true"></i>Upgrade to Premium
                </button>
              `
            : html`<div class="btn-current">Included with every account</div>`}
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <foundr-topbar active=""></foundr-topbar>
      <div class="page">
        <a class="back" href="/dashboard"><i class="ti ti-arrow-left" aria-hidden="true"></i>Back to dashboard</a>

        ${this.loading
          ? html`<div class="loading-wrap"><foundr-mini-loader></foundr-mini-loader></div>`
          : html`
              <h1>${this._isPremium ? "You're on Premium" : "Do more with Premium"}</h1>
              <p class="sub">
                ${this._isPremium
                  ? "You have unlimited startups, entries, and Shopify history. Thanks for backing Foundr."
                  : `Foundr is free to use for as long as you like. Premium lifts the limits when your business outgrows them, for ${PREMIUM_PRICE} ${PREMIUM_INTERVAL}.`}
              </p>

              ${this.error ? html`<div class="error">${this.error}</div>` : ""}
              ${this._renderUsage()}
              <div class="plans">${PLANS.map((p) => this._renderPlan(p))}</div>

              ${!this._isPremium
                ? html`
                    <div class="reassure">
                      <i class="ti ti-shield-check" aria-hidden="true"></i>
                      Payments are handled by Stripe. Your card details never touch Foundr's servers.
                    </div>
                  `
                : ""}
            `}
      </div>

      <foundr-coming-soon-modal
        ?open=${this.comingSoonOpen}
        @close=${() => { this.comingSoonOpen = false; }}
      ></foundr-coming-soon-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-upgrade": FoundrUpgrade;
  }
}
