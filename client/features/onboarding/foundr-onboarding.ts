import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gsap } from "gsap";
import { getClerk, updateProfileName, addSecondaryEmail, verifySecondaryEmail } from "../auth/auth.service";
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

interface CardMeta {
  title: string;
  desc: string;
  icon: string;
}

const CARDS: CardMeta[] = [
  { title: "Welcome", desc: "What Foundr does for you.", icon: "ti-sparkles" },
  { title: "Your name", desc: "So we know what to call you.", icon: "ti-user" },
  { title: "Your business", desc: "The startup you're tracking.", icon: "ti-building-store" },
  { title: "About you", desc: "Optional, helps us tailor Foundr.", icon: "ti-user-circle" },
  { title: "Security", desc: "Keep your account recoverable.", icon: "ti-shield-lock" },
  { title: "All set", desc: "Your dashboard is ready.", icon: "ti-rocket" },
];

const CARD_COUNT = CARDS.length;

/**
 * <foundr-onboarding>
 * The one-time welcome wizard, shown the moment a founder finishes
 * signing up and never again (gated by `UserSettings.onboarded`). Collects
 * their name, their first business's name, gender, and whether they want
 * a recovery email, then creates that first Business and hands off to the
 * dashboard. Everything it collects writes straight into the same Clerk
 * fields / UserSettings / Business records Settings itself reads, so
 * there's no separate store to keep in sync.
 *
 * Layout mirrors the Migrate wizard (see foundr-import-panel.ts): a left
 * rail of numbered steps with a progress connector line, a right panel
 * with "STEP X OF N" + content. Rail steps are only reachable up to
 * `furthest` (the deepest card the founder has actually validated into),
 * unlike Migrate, onboarding has required fields partway through, so free
 * jumping would let someone reach the final "create my business" step
 * with an empty name or business name.
 *
 * Step transitions use the same GSAP easing language as the landing
 * page's #features deck (power2.out slide) rather than an instant swap.
 * The header uses the plain static Foundr brand mark (same square-F badge
 * as the topbar); an earlier animated illustration here read as noisy
 * rather than polished, so it's gone.
 *
 * Two-factor authentication isn't offered here: it needs a paid Clerk
 * plan Foundr isn't on yet, so Settings → Security marks it "coming soon"
 * rather than exposing a setup flow that would fail.
 *
 * The recovery-email step runs the real add-email + verify-code flow
 * inline (same `addSecondaryEmail`/`verifySecondaryEmail` calls Settings →
 * Security uses) instead of just recording a "yes" and redirecting to
 * Settings afterward: asking for the address on a step that says
 * "add a recovery email" and then bouncing to a different screen to
 * actually type it in was confusing. Because it's the same underlying
 * Clerk email record, Settings shows it automatically next time it loads,
 * no separate syncing needed.
 *
 * Dispatches `onboarding-done` with `{ businessId }` once finished.
 */
@customElement("foundr-onboarding")
export class FoundrOnboarding extends LitElement {
  @state() private card = 0;
  @state() private furthest = 0;
  @state() private firstName = "";
  @state() private lastName = "";
  @state() private businessName = "";
  @state() private gender: Gender = "";
  @state() private saving = false;
  @state() private animating = false;
  @state() private error = "";

  // Recovery email, inline add + verify, mirroring Settings → Security.
  @state() private newEmail = "";
  @state() private emailCode = "";
  @state() private pendingEmailId = "";
  @state() private pendingEmailAddress = "";
  @state() private emailAdded = "";
  @state() private emailSaving = false;
  @state() private emailError = "";

  private _direction: 1 | -1 = 1;
  private readonly _reducedMotion =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  connectedCallback(): void {
    super.connectedCallback();
    void this._prefill();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("card")) {
      const el = this.renderRoot.querySelector<HTMLElement>(".panel-content");
      if (el) this._animateIn(el);
    }
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

  // ---- Step transition motion: same power2.out slide/fade language as
  // the landing page's #features deck, adapted for a single panel instead
  // of a stacked card (see foundr-landing.ts's _nextFeature/_prevFeature).

  private _animateOut(el: HTMLElement): Promise<void> {
    if (this._reducedMotion) return Promise.resolve();
    return new Promise((resolve) => {
      gsap.to(el, {
        x: this._direction === 1 ? -28 : 28,
        opacity: 0,
        duration: 0.22,
        ease: "power2.out",
        onComplete: resolve,
      });
    });
  }

  private _animateIn(el: HTMLElement): void {
    if (this._reducedMotion) {
      this.animating = false;
      return;
    }
    gsap.fromTo(
      el,
      { x: this._direction === 1 ? 28 : -28, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.4,
        ease: "power2.out",
        onComplete: () => { this.animating = false; },
      }
    );
  }

  private async _step(direction: 1 | -1): Promise<void> {
    if (this.animating || this.saving) return;
    if (direction === 1 && !this.canAdvance) {
      this.error = this.card === 1 ? "Enter your first and last name." : "What should we call your business?";
      return;
    }
    this.error = "";
    if (direction === 1 && this.card === CARD_COUNT - 1) {
      void this._finish();
      return;
    }

    this._direction = direction;
    this.animating = true;
    const el = this.renderRoot.querySelector<HTMLElement>(".panel-content");
    if (el) await this._animateOut(el);
    this.card += direction;
    this.furthest = Math.max(this.furthest, this.card);
    if (this._reducedMotion) this.animating = false;
  }

  private async _goto(i: number): Promise<void> {
    if (this.animating || this.saving || i === this.card || i > this.furthest) return;
    this.error = "";
    this._direction = i > this.card ? 1 : -1;
    this.animating = true;
    const el = this.renderRoot.querySelector<HTMLElement>(".panel-content");
    if (el) await this._animateOut(el);
    this.card = i;
    if (this._reducedMotion) this.animating = false;
  }

  private _next(): void {
    void this._step(1);
  }

  private _back(): void {
    void this._step(-1);
  }

  // ---- Recovery email: same two-step add/verify Settings → Security
  // uses, just asked for right here instead of deferring to another page.

  private async _addEmail(): Promise<void> {
    const email = this.newEmail.trim();
    if (!email.includes("@")) {
      this.emailError = "Enter a valid email address.";
      return;
    }
    this.emailSaving = true;
    this.emailError = "";
    const result = await addSecondaryEmail(email);
    this.emailSaving = false;
    if (!result.ok) {
      this.emailError = result.error ?? "Couldn't add that email.";
      return;
    }
    this.pendingEmailId = result.emailId ?? "";
    this.pendingEmailAddress = email;
    this.newEmail = "";
  }

  private async _verifyEmail(): Promise<void> {
    if (this.emailCode.trim().length < 4) {
      this.emailError = "Enter the code from your email.";
      return;
    }
    this.emailSaving = true;
    this.emailError = "";
    const result = await verifySecondaryEmail(this.pendingEmailId, this.emailCode.trim());
    this.emailSaving = false;
    if (!result.ok) {
      this.emailError = result.error ?? "That code didn't work.";
      return;
    }
    this.emailAdded = this.pendingEmailAddress;
    this.pendingEmailId = "";
    this.pendingEmailAddress = "";
    this.emailCode = "";
  }

  private _cancelEmailVerify(): void {
    this.pendingEmailId = "";
    this.pendingEmailAddress = "";
    this.emailCode = "";
    this.emailError = "";
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
          detail: { businessId: business._id },
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
      background: var(--overlay, rgba(28,28,28,0.55)); backdrop-filter: blur(4px);
      padding: 24px; font-family: var(--font-body, "Inter", sans-serif); color: var(--ink, #1C1C1C);
    }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-user:before { content: "\\eb4d"; }
    .ti-building-store:before { content: "\\ea4e"; }
    .ti-user-circle:before { content: "\\ef68"; }
    .ti-shield-lock:before { content: "\\ed58"; }
    .ti-rocket:before { content: "\\ec45"; }
    .ti-sparkles:before { content: "\\f6d7"; }
    .ti-arrow-left:before { content: "\\ea19"; }
    .ti-arrow-right:before { content: "\\ea1f"; }
    .ti-check:before { content: "\\ea5e"; }
    button { font-family: inherit; cursor: pointer; }

    .shell {
      width: 100%; max-width: 780px; max-height: 92vh; background: var(--surface, #FAFAF7);
      border-radius: 30px; overflow: hidden; box-shadow: 0 40px 90px -24px rgba(31,51,41,0.5), 0 2px 0 rgba(255,255,255,0.4) inset;
      display: flex; flex-direction: column;
      animation: shell-in 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes shell-in {
      from { opacity: 0; transform: translateY(18px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .shell { animation: none; }
    }

    .head {
      display: flex; align-items: center; gap: 18px; padding: 26px 30px 20px;
      background: linear-gradient(180deg, var(--surface-alt, #F2EFE8) 0%, var(--surface, #FAFAF7) 100%);
      border-bottom: 0.5px solid var(--line, #E2DFD7); flex-shrink: 0;
    }
    .mark {
      flex-shrink: 0; width: 44px; height: 44px; border-radius: 13px; background: var(--forest, #2D4A3E);
      color: #fff; display: grid; place-items: center; font-family: var(--font-display, serif); font-size: 22px;
    }
    .head h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 21px; margin: 0 0 3px; }
    .head p { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 0; }

    .wizard { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 0; overflow-y: auto; flex: 1; min-height: 0; }
    @media (max-width: 640px) { .wizard { grid-template-columns: 1fr; } }

    .rail { background: var(--surface-alt, #F2EFE8); border-right: 1px solid var(--line, #E2DFD7); padding: 18px 14px; display: flex; flex-direction: column; gap: 4px; }
    .rail-step {
      display: flex; align-items: stretch; gap: 10px; padding: 10px 8px; border-radius: 14px;
      background: transparent; border: none; text-align: left; width: 100%; color: inherit;
      transition: background 0.15s ease, opacity 0.15s ease;
    }
    .rail-step:not(.locked):hover { background: rgba(45,74,62,0.06); }
    .rail-step.active { background: var(--surface, #FAFAF7); box-shadow: 0 1px 0 rgba(0,0,0,0.02); }
    .rail-step.locked { opacity: 0.45; cursor: default; }
    .rail-badge-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; position: relative; }
    .rail-badge {
      width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
      font-size: 12px; font-weight: 600; border: 1.5px solid var(--line, #E2DFD7); color: var(--ink-soft, #6B6B66);
      background: var(--surface, #FAFAF7);
    }
    .rail-connector {
      position: absolute; top: 26px; bottom: -18px; left: 50%; width: 2px; transform: translateX(-50%);
      background: var(--line, #E2DFD7); transition: background 0.2s ease;
    }
    .rail-connector.done { background: var(--forest, #2D4A3E); }
    .rail-step.active .rail-badge { border-color: var(--forest, #2D4A3E); color: var(--forest, #2D4A3E); }
    .rail-step.done .rail-badge { background: var(--forest, #2D4A3E); border-color: var(--forest, #2D4A3E); color: #fff; }
    .rail-text .t { font-size: 13px; font-weight: 600; }
    .rail-text .d { font-size: 11px; color: var(--ink-soft, #6B6B66); margin-top: 1px; line-height: 1.4; }

    .panel { padding: 24px 28px 22px; display: flex; flex-direction: column; min-width: 0; }
    .panel-content { flex: 1; display: flex; flex-direction: column; }
    .eyebrow { font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--forest, #2D4A3E); margin: 0 0 6px; }
    .panel h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; margin: 0 0 6px; }
    .panel .lede { font-size: 13.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 22px; line-height: 1.55; }
    .fields { flex: 1; display: flex; flex-direction: column; gap: 14px; }

    .field label { display: block; font-size: 12.5px; font-weight: 500; margin-bottom: 6px; }
    .field input, .field select {
      width: 100%; box-sizing: border-box; padding: 11px 13px; font-size: 14.5px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .field input:focus, .field select:focus {
      outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1);
    }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

    .email-card { padding: 16px; background: var(--surface-alt, #F2EFE8); border-radius: 16px; }
    .email-card .label { font-size: 13.5px; font-weight: 500; margin-bottom: 8px; }
    .email-card .desc { font-size: 12px; color: var(--ink-soft, #6B6B66); margin: -4px 0 10px; }
    .email-row { display: flex; gap: 8px; }
    .email-row input {
      flex: 1; min-width: 0; box-sizing: border-box; padding: 11px 13px; font-size: 14px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
    }
    .email-row input:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .email-row .code-input { flex: 0 0 120px; letter-spacing: 2px; text-align: center; }
    .email-row .btn-primary { flex-shrink: 0; padding: 11px 18px; }
    .link-btn {
      background: none; border: none; padding: 0; margin-top: 10px; font-family: inherit; font-size: 12.5px;
      color: var(--ink-soft, #6B6B66); text-decoration: underline; cursor: pointer;
    }
    .link-btn:hover { color: var(--ink, #1C1C1C); }
    .skip-link { display: block; margin-top: 14px; }
    .email-done { display: flex; align-items: center; gap: 12px; }
    .email-done .ti-check {
      width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
      background: var(--forest, #2D4A3E); color: #fff; font-size: 14px;
    }
    .email-done .label { margin-bottom: 1px; }
    .email-done .desc { margin: 0; }

    .final-body strong { color: var(--forest, #2D4A3E); }

    .error { font-size: 13px; color: var(--danger, #A8302B); margin-top: 10px; }

    .footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line, #E2DFD7); }
    .btn-back {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: var(--radius-pill, 999px);
      border: 1px solid var(--line, #E2DFD7); background: transparent; color: var(--ink-soft, #6B6B66); font-size: 13.5px; font-weight: 500;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease, color 0.2s ease;
    }
    .btn-back:hover:not(:disabled) { background: var(--surface-alt, #F2EFE8); color: var(--ink, #1C1C1C); transform: translate(-2px,-2px); box-shadow: 2px 2px 0 var(--sage, #8AAF9A); }
    .btn-back:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .btn-back:disabled { opacity: 0; pointer-events: none; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 7px; padding: 11px 22px; border-radius: var(--radius-pill, 999px);
      border: none; background: var(--forest, #2D4A3E); color: #fff; font-size: 13.5px; font-weight: 600;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
    }
    .btn-primary:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-2px,-2px); box-shadow: 2px 2px 0 var(--sage, #8AAF9A); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  `;

  private _renderCard(): TemplateResult {
    const eyebrow = html`<div class="eyebrow">Step ${this.card + 1} of ${CARD_COUNT}</div>`;

    switch (this.card) {
      case 0:
        return html`
          ${eyebrow}
          <h2>Let's set up your workspace</h2>
          <p class="lede">Foundr turns the numbers you'd otherwise track on paper into a clear picture of your business: burn, runway, ROI, and margins, all in one place. Takes less than a minute.</p>
        `;
      case 1:
        return html`
          ${eyebrow}
          <h2>What's your name?</h2>
          <p class="lede">So we know what to call you.</p>
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
          ${eyebrow}
          <h2>What's your business?</h2>
          <p class="lede">The name of the startup or side hustle you're tracking. You can add more later.</p>
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
          ${eyebrow}
          <h2>A little about you</h2>
          <p class="lede">Totally optional, helps us tailor Foundr over time.</p>
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
          ${eyebrow}
          <h2>Keep your account safe</h2>
          <p class="lede">Optional, but recommended: a backup way in if you ever lose access to your inbox. You can always add or change this later in Settings.</p>
          <div class="email-card">
            ${this.emailAdded
              ? html`
                  <div class="email-done">
                    <i class="ti ti-check" aria-hidden="true"></i>
                    <div>
                      <div class="label">Recovery email added</div>
                      <div class="desc">${this.emailAdded}</div>
                    </div>
                  </div>
                `
              : this.pendingEmailId
                ? html`
                    <div class="label">Enter the code</div>
                    <div class="desc">Sent to ${this.pendingEmailAddress}.</div>
                    <div class="email-row">
                      <input
                        class="code-input" maxlength="6" inputmode="numeric" placeholder="000000"
                        .value=${this.emailCode}
                        @input=${(e: Event) => { this.emailCode = (e.target as HTMLInputElement).value; this.emailError = ""; }}
                        ?disabled=${this.emailSaving}
                      />
                      <button class="btn-primary" @click=${this._verifyEmail} ?disabled=${this.emailSaving}>
                        ${this.emailSaving ? "Verifying…" : "Verify"}
                      </button>
                    </div>
                    <button class="link-btn" @click=${this._cancelEmailVerify} ?disabled=${this.emailSaving}>Use a different email</button>
                  `
                : html`
                    <div class="label">Recovery email</div>
                    <div class="email-row">
                      <input
                        type="email" placeholder="you@example.com" .value=${this.newEmail}
                        @input=${(e: Event) => { this.newEmail = (e.target as HTMLInputElement).value; this.emailError = ""; }}
                        ?disabled=${this.emailSaving}
                      />
                      <button class="btn-primary" @click=${this._addEmail} ?disabled=${this.emailSaving}>
                        ${this.emailSaving ? "Sending…" : "Add"}
                      </button>
                    </div>
                  `}
            ${this.emailError ? html`<div class="error">${this.emailError}</div>` : ""}
          </div>
          ${!this.emailAdded ? html`<button class="link-btn skip-link" @click=${this._next}>Skip for now</button>` : ""}
        `;
      default:
        return html`
          ${eyebrow}
          <h2>You're all set</h2>
          <p class="lede final-body">We've created <strong>${this.businessName || "your business"}</strong>. Your dashboard is ready the moment you continue.</p>
        `;
    }
  }

  render(): TemplateResult {
    const isFinal = this.card === CARD_COUNT - 1;
    return html`
      <div class="shell">
        <div class="head">
          <div class="mark">F</div>
          <div>
            <h1>Hello, Founder!</h1>
            <p>Welcome to Foundr. Let's set up your workspace.</p>
          </div>
        </div>
        <div class="wizard">
          <div class="rail">
            ${CARDS.map(
              (c, i) => html`
                <button
                  class="rail-step ${i === this.card ? "active" : ""} ${i < this.card ? "done" : ""} ${i > this.furthest ? "locked" : ""}"
                  @click=${() => void this._goto(i)}
                >
                  <span class="rail-badge-col">
                    <span class="rail-badge">${i < this.card ? html`<i class="ti ti-check" aria-hidden="true"></i>` : i + 1}</span>
                    ${i < CARDS.length - 1 ? html`<span class="rail-connector ${i < this.card ? "done" : ""}"></span>` : ""}
                  </span>
                  <span class="rail-text">
                    <span class="t">${c.title}</span>
                    <span class="d">${c.desc}</span>
                  </span>
                </button>
              `
            )}
          </div>
          <div class="panel">
            <div class="panel-content">
              ${this._renderCard()}
              ${this.error ? html`<div class="error">${this.error}</div>` : ""}
            </div>
            <div class="footer">
              <button class="btn-back" @click=${this._back} ?disabled=${this.card === 0 || this.animating || this.saving}>
                <i class="ti ti-arrow-left" aria-hidden="true"></i>Back
              </button>
              ${isFinal
                ? html`
                    <button class="btn-primary" @click=${this._next} ?disabled=${this.saving || this.animating}>
                      ${this.saving ? "Setting up…" : "Start your first startup journey with us"}
                      <i class="ti ti-arrow-right" aria-hidden="true"></i>
                    </button>
                  `
                : html`
                    <button class="btn-primary" @click=${this._next} ?disabled=${this.animating}>
                      Continue<i class="ti ti-arrow-right" aria-hidden="true"></i>
                    </button>
                  `}
            </div>
          </div>
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
