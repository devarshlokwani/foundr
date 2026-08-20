import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getClerk, updateProfileName } from "../auth/auth.service";
import { saveProfileFields, markOnboarded } from "../../shared/lib/settings";
import { createBusiness, setActiveBusiness } from "../../shared/lib/business";
import type { UserSettings } from "../../shared/lib/types";

type Gender = UserSettings["gender"];

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
];

const CARD_COUNT = 6;

/**
 * <foundr-onboarding>
 * The one-time welcome wizard, shown the moment a founder finishes
 * signing up and never again (gated by `UserSettings.onboarded`). Collects
 * their name, their first business's name, gender, and a security
 * preference, then creates that first Business and hands off to the
 * dashboard — everything it collects writes straight into the same Clerk
 * fields / UserSettings / Business records Settings itself reads, so
 * there's no separate store to keep in sync.
 *
 * Dispatches `onboarding-done` with `{ businessId, goToSecurity }` once
 * finished — the security card's answers don't enroll MFA or add a
 * recovery email here (those need live verification steps that don't fit
 * a wizard card); saying yes to either just routes into the real flows
 * already built in Settings → Security right after this closes.
 */
@customElement("foundr-onboarding")
export class FoundrOnboarding extends LitElement {
  @state() private card = 0;
  @state() private firstName = "";
  @state() private lastName = "";
  @state() private businessName = "";
  @state() private gender: Gender = "";
  @state() private wantsRecoveryEmail = false;
  @state() private wants2FA = false;
  @state() private saving = false;
  @state() private error = "";

  connectedCallback(): void {
    super.connectedCallback();
    void this._prefill();
  }

  private async _prefill(): Promise<void> {
    const clerk = await getClerk();
    const user = clerk?.user;
    if (!user) return;
    this.firstName = user.firstName ?? "";
    this.lastName = user.lastName ?? "";
  }

  private get canAdvance(): boolean {
    if (this.card === 1) return this.firstName.trim().length > 0 && this.lastName.trim().length > 0;
    if (this.card === 2) return this.businessName.trim().length > 0;
    return true;
  }

  private _next(): void {
    if (!this.canAdvance) {
      this.error = this.card === 1 ? "Enter your first and last name." : "What should we call your business?";
      return;
    }
    this.error = "";
    if (this.card === CARD_COUNT - 1) {
      void this._finish();
      return;
    }
    this.card += 1;
  }

  private async _finish(): Promise<void> {
    this.saving = true;
    this.error = "";
    try {
      const nameResult = await updateProfileName(this.firstName.trim(), this.lastName.trim());
      if (!nameResult.ok) throw new Error(nameResult.error);

      await saveProfileFields({ gender: this.gender });

      const business = await createBusiness(this.businessName.trim());
      await setActiveBusiness(business._id);
      await markOnboarded();

      this.dispatchEvent(
        new CustomEvent("onboarding-done", {
          detail: { businessId: business._id, goToSecurity: this.wantsRecoveryEmail || this.wants2FA },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Something went wrong. Please try again.";
    } finally {
      this.saving = false;
    }
  }

  static styles = css`
    :host {
      position: fixed; inset: 0; z-index: 500; display: flex; align-items: center; justify-content: center;
      background: var(--overlay, rgba(28,28,28,0.5)); padding: 24px;
      font-family: var(--font-body, "Inter", sans-serif); color: var(--ink, #1C1C1C);
    }
    .card-shell {
      width: 100%; max-width: 380px; min-height: 560px; background: var(--surface, #FAFAF7);
      border-radius: 28px; overflow: hidden; box-shadow: 0 30px 70px -20px rgba(31,51,41,0.45);
      display: flex; flex-direction: column;
    }
    .banner {
      background: var(--surface-alt, #F2EFE8); padding: 36px 28px 28px; text-align: center;
      flex-shrink: 0;
    }
    .mark { display: flex; justify-content: center; margin-bottom: 14px; }
    .banner h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; margin: 0 0 4px; }
    .banner p { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 0; }

    .content { flex: 1; display: flex; flex-direction: column; padding: 28px; }
    .content h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; margin: 0 0 6px; }
    .content .hint { font-size: 13.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 22px; line-height: 1.5; }
    .fields { flex: 1; display: flex; flex-direction: column; gap: 14px; }

    .field label { display: block; font-size: 12.5px; font-weight: 500; margin-bottom: 6px; }
    .field input, .field select {
      width: 100%; box-sizing: border-box; padding: 11px 13px; font-size: 14.5px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
    }
    .field input:focus, .field select:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

    .choice-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 16px; background: var(--surface-alt, #F2EFE8); border-radius: 16px; margin-bottom: 10px;
    }
    .choice-row .label { font-size: 14px; font-weight: 500; }
    .choice-row .desc { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .toggle-pill { display: flex; gap: 6px; flex-shrink: 0; }
    .toggle-pill button {
      padding: 7px 14px; border-radius: var(--radius-pill, 999px); border: 1px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7); font-size: 12.5px; font-weight: 500; color: var(--ink-soft, #6B6B66);
      cursor: pointer; font-family: inherit;
    }
    .toggle-pill button.active { background: var(--forest, #2D4A3E); border-color: var(--forest, #2D4A3E); color: #fff; }

    .welcome-body, .final-body { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; gap: 10px; }
    .welcome-body p, .final-body p { font-size: 14px; color: var(--ink-soft, #6B6B66); line-height: 1.6; margin: 0; }
    .final-body strong { color: var(--forest, #2D4A3E); }

    .error { font-size: 13px; color: var(--danger, #A8302B); margin-top: 10px; }

    .footer { display: flex; align-items: center; justify-content: space-between; padding: 0 28px 28px; flex-shrink: 0; }
    .progress { font-size: 13px; color: var(--ink-soft, #6B6B66); font-weight: 500; }
    .nav-btn {
      width: 48px; height: 48px; border-radius: 50%; background: var(--forest, #2D4A3E); color: #fff;
      border: none; cursor: pointer; display: grid; place-items: center; font-size: 20px;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .nav-btn:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    .nav-btn:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .nav-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .nav-btn.text {
      width: auto; height: auto; border-radius: var(--radius-pill, 999px); padding: 14px 22px; font-size: 14px; font-weight: 500;
    }
  `;

  private _renderMark(): TemplateResult {
    return html`
      <svg width="56" height="56" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="14" r="3" fill="var(--sage, #8AAF9A)" opacity="0.7" />
        <circle cx="54" cy="48" r="2.5" fill="var(--sage, #8AAF9A)" opacity="0.5" />
        <path d="M8 44 Q 8 30 20 30" fill="none" stroke="var(--sage, #8AAF9A)" stroke-width="2" stroke-linecap="round" opacity="0.6" />
        <rect x="14" y="14" width="36" height="36" rx="11" fill="var(--forest, #2D4A3E)" />
        <path d="M27 24 h14 v5 h-9 v6 h8 v5 h-8 v9 h-5 z" fill="#fff" />
        <path d="M40 40 l6 -12 l6 12 z" fill="var(--sage, #8AAF9A)" opacity="0.85" />
      </svg>
    `;
  }

  private _renderCard(): TemplateResult {
    switch (this.card) {
      case 0:
        return html`
          <div class="welcome-body">
            <h2>Hello, Founder!</h2>
            <p>Foundr turns the numbers you'd otherwise track on paper into a clear picture of your business. Let's get you set up — it takes less than a minute.</p>
          </div>
        `;
      case 1:
        return html`
          <h2>What's your name?</h2>
          <p class="hint">So we know what to call you.</p>
          <div class="fields">
            <div class="two-col">
              <div class="field">
                <label for="firstName">First name</label>
                <input id="firstName" type="text" .value=${this.firstName}
                  @input=${(e: Event) => { this.firstName = (e.target as HTMLInputElement).value; this.error = ""; }} />
              </div>
              <div class="field">
                <label for="lastName">Last name</label>
                <input id="lastName" type="text" .value=${this.lastName}
                  @input=${(e: Event) => { this.lastName = (e.target as HTMLInputElement).value; this.error = ""; }} />
              </div>
            </div>
          </div>
        `;
      case 2:
        return html`
          <h2>What's your business?</h2>
          <p class="hint">The name of the startup or side hustle you're tracking — you can add more later.</p>
          <div class="fields">
            <div class="field">
              <label for="bizName">Business name</label>
              <input id="bizName" type="text" placeholder="e.g. Foundr" .value=${this.businessName}
                @input=${(e: Event) => { this.businessName = (e.target as HTMLInputElement).value; this.error = ""; }} />
            </div>
          </div>
        `;
      case 3:
        return html`
          <h2>A little about you</h2>
          <p class="hint">Totally optional — helps us tailor Foundr over time.</p>
          <div class="fields">
            <div class="field">
              <label for="gender">Gender</label>
              <select id="gender" .value=${this.gender}
                @change=${(e: Event) => { this.gender = (e.target as HTMLSelectElement).value as Gender; }}>
                ${GENDER_OPTIONS.map((g) => html`<option value=${g.value} ?selected=${g.value === this.gender}>${g.label}</option>`)}
              </select>
            </div>
          </div>
        `;
      case 4:
        return html`
          <h2>Keep your account safe</h2>
          <p class="hint">Optional, but recommended — you can always change this later in Settings.</p>
          <div class="choice-row">
            <div>
              <div class="label">Recovery email</div>
              <div class="desc">A backup way in if you lose access to your inbox.</div>
            </div>
            <div class="toggle-pill">
              <button class="${this.wantsRecoveryEmail ? "active" : ""}" @click=${() => { this.wantsRecoveryEmail = true; }}>Yes</button>
              <button class="${!this.wantsRecoveryEmail ? "active" : ""}" @click=${() => { this.wantsRecoveryEmail = false; }}>Skip</button>
            </div>
          </div>
          <div class="choice-row">
            <div>
              <div class="label">Two-factor authentication</div>
              <div class="desc">A code from your phone each time you sign in.</div>
            </div>
            <div class="toggle-pill">
              <button class="${this.wants2FA ? "active" : ""}" @click=${() => { this.wants2FA = true; }}>Yes</button>
              <button class="${!this.wants2FA ? "active" : ""}" @click=${() => { this.wants2FA = false; }}>Skip</button>
            </div>
          </div>
        `;
      default:
        return html`
          <div class="final-body">
            <h2>You're all set</h2>
            <p>We've created <strong>${this.businessName || "your business"}</strong> — your dashboard is ready the moment you continue.</p>
          </div>
        `;
    }
  }

  render(): TemplateResult {
    const isFinal = this.card === CARD_COUNT - 1;
    return html`
      <div class="card-shell">
        <div class="banner">
          <div class="mark">${this._renderMark()}</div>
          <h1>Hello, Founder!</h1>
          <p>Welcome to Foundr</p>
        </div>
        <div class="content">
          ${this._renderCard()}
          ${this.error ? html`<div class="error">${this.error}</div>` : ""}
        </div>
        <div class="footer">
          <span class="progress">${this.card + 1}/${CARD_COUNT}</span>
          ${isFinal
            ? html`
                <button class="nav-btn text" @click=${this._next} ?disabled=${this.saving}>
                  ${this.saving ? "Setting up…" : "Start your first startup journey with us"}
                </button>
              `
            : html`
                <button class="nav-btn" @click=${this._next} aria-label="Continue">
                  <i>→</i>
                </button>
              `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-onboarding": FoundrOnboarding;
  }
}
