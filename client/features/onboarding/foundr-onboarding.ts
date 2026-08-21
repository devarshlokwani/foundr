import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gsap } from "gsap";
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
 * their name, their first business's name, gender, and whether they want
 * a recovery email, then creates that first Business and hands off to the
 * dashboard — everything it collects writes straight into the same Clerk
 * fields / UserSettings / Business records Settings itself reads, so
 * there's no separate store to keep in sync.
 *
 * Step transitions use the same GSAP easing language as the landing
 * page's #features deck (power2.out slide) rather than an instant swap,
 * and the banner is a small animated illustration (drawn-in growth line,
 * staggered markers, floating sparkles) instead of a static icon.
 *
 * Two-factor authentication isn't offered here — it needs a paid Clerk
 * plan Foundr isn't on yet, so Settings → Security marks it "coming soon"
 * rather than exposing a setup flow that would fail.
 *
 * Dispatches `onboarding-done` with `{ businessId, goToSecurity }` once
 * finished — saying yes to the recovery email doesn't add it here (that
 * needs a live verification step that doesn't fit a wizard card); it just
 * routes into the real flow already built in Settings → Security right
 * after this closes.
 */
@customElement("foundr-onboarding")
export class FoundrOnboarding extends LitElement {
  @state() private card = 0;
  @state() private firstName = "";
  @state() private lastName = "";
  @state() private businessName = "";
  @state() private gender: Gender = "";
  @state() private wantsRecoveryEmail = false;
  @state() private saving = false;
  @state() private animating = false;
  @state() private error = "";

  private _direction: 1 | -1 = 1;
  private readonly _reducedMotion =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  connectedCallback(): void {
    super.connectedCallback();
    void this._prefill();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("card")) {
      const el = this.renderRoot.querySelector<HTMLElement>(".content-inner");
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

  // ---- Step transition motion — same power2.out slide/fade language as
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
    const el = this.renderRoot.querySelector<HTMLElement>(".content-inner");
    if (el) await this._animateOut(el);
    this.card += direction;
    if (this._reducedMotion) this.animating = false;
  }

  private _next(): void {
    void this._step(1);
  }

  private _back(): void {
    void this._step(-1);
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
          detail: { businessId: business._id, goToSecurity: this.wantsRecoveryEmail },
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

    .card-shell {
      width: 100%; max-width: 400px; min-height: 580px; background: var(--surface, #FAFAF7);
      border-radius: 30px; overflow: hidden; box-shadow: 0 40px 90px -24px rgba(31,51,41,0.5), 0 2px 0 rgba(255,255,255,0.4) inset;
      display: flex; flex-direction: column;
      animation: shell-in 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes shell-in {
      from { opacity: 0; transform: translateY(18px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .card-shell { animation: none; }
    }

    .banner {
      background: linear-gradient(180deg, var(--surface-alt, #F2EFE8) 0%, var(--surface, #FAFAF7) 100%);
      padding: 30px 28px 22px; text-align: center; flex-shrink: 0;
      border-bottom: 0.5px solid var(--line, #E2DFD7);
    }
    .mark { display: flex; justify-content: center; margin-bottom: 10px; }
    .mark svg { display: block; }
    .banner h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 23px; margin: 0 0 3px; }
    .banner p { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 0; }

    .content { flex: 1; display: flex; flex-direction: column; padding: 26px 28px 8px; overflow: hidden; }
    .content-inner { flex: 1; display: flex; flex-direction: column; }
    .content h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 22px; margin: 0 0 6px; }
    .content .hint { font-size: 13.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 22px; line-height: 1.5; }
    .fields { flex: 1; display: flex; flex-direction: column; gap: 14px; }

    .step-icon {
      width: 46px; height: 46px; border-radius: 14px; margin-bottom: 16px;
      background: linear-gradient(155deg, var(--forest, #2D4A3E), var(--forest-deep, #1F3329));
      color: #fff; display: grid; place-items: center; font-size: 21px;
      box-shadow: 0 8px 18px -8px rgba(31,51,41,0.55);
    }
    .step-icon-lg { width: 60px; height: 60px; font-size: 26px; margin: 0 auto 18px; }

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

    .choice-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 15px 16px; background: var(--surface-alt, #F2EFE8); border: 1px solid transparent;
      border-radius: 16px; margin-bottom: 10px; transition: border-color 0.15s ease;
    }
    .choice-row .label { font-size: 14px; font-weight: 500; }
    .choice-row .desc { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }
    .toggle-pill { display: flex; gap: 6px; flex-shrink: 0; }
    .toggle-pill button {
      padding: 7px 14px; border-radius: var(--radius-pill, 999px); border: 1px solid var(--line, #E2DFD7);
      background: var(--surface, #FAFAF7); font-size: 12.5px; font-weight: 500; color: var(--ink-soft, #6B6B66);
      cursor: pointer; font-family: inherit; transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.1s ease;
    }
    .toggle-pill button.active { background: var(--forest, #2D4A3E); border-color: var(--forest, #2D4A3E); color: #fff; }
    .toggle-pill button:active { transform: scale(0.95); }

    .welcome-body, .final-body { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; gap: 8px; }
    .welcome-body p, .final-body p { font-size: 14.5px; color: var(--ink-soft, #6B6B66); line-height: 1.65; margin: 0; }
    .final-body strong { color: var(--forest, #2D4A3E); }

    .error { font-size: 13px; color: var(--danger, #A8302B); margin-top: 10px; }

    .footer { display: flex; align-items: center; gap: 10px; padding: 10px 24px 26px; flex-shrink: 0; }
    .dots { flex: 1; display: flex; justify-content: center; gap: 6px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--line, #E2DFD7); transition: background 0.25s ease, width 0.25s ease; }
    .dot.active { background: var(--forest, #2D4A3E); width: 20px; border-radius: 4px; }

    .back-btn {
      width: 48px; height: 48px; border-radius: 50%; background: transparent; border: 1px solid var(--line, #E2DFD7);
      color: var(--ink-soft, #6B6B66); cursor: pointer; display: grid; place-items: center; font-size: 16px;
      flex-shrink: 0; transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
    }
    .back-btn:hover:not(:disabled) { background: var(--surface-alt, #F2EFE8); color: var(--ink, #1C1C1C); }
    .back-btn:disabled { opacity: 0; cursor: default; pointer-events: none; }

    .nav-btn {
      width: 48px; height: 48px; border-radius: 50%; background: var(--forest, #2D4A3E); color: #fff;
      border: none; cursor: pointer; display: grid; place-items: center; font-size: 18px; flex-shrink: 0;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .nav-btn:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    .nav-btn:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .nav-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .nav-btn.text {
      flex: 1; min-width: 0; width: auto; height: auto; border-radius: var(--radius-pill, 999px);
      padding: 14px 20px; font-size: 14px; font-weight: 500; white-space: normal; line-height: 1.3;
    }

    /* Banner illustration — an ascending growth line drawing itself in,
       markers popping along it in sequence, the F mark settling in last,
       and a couple of sparkles drifting continuously. Mirrors the visual
       language (forest/sage palette, soft glow) used across the app
       rather than a stock icon. */
    .growth-line {
      stroke-dasharray: 148; stroke-dashoffset: 148;
      animation: draw-line 1s ease-out 0.1s forwards;
    }
    @keyframes draw-line { to { stroke-dashoffset: 0; } }

    .marker { opacity: 0; transform-box: fill-box; transform-origin: center; animation: pop-in 0.4s ease-out forwards; }
    .marker-1 { animation-delay: 0.2s; }
    .marker-2 { animation-delay: 0.55s; }
    .marker-3 { animation-delay: 0.9s; }
    @keyframes pop-in { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }

    .f-badge { opacity: 0; animation: badge-in 0.45s ease-out 1.05s forwards; }
    @keyframes badge-in {
      from { opacity: 0; transform: translateY(5px) scale(0.85); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .spark { transform-box: fill-box; transform-origin: center; animation: float 3.6s ease-in-out infinite; }
    .spark-2 { animation-delay: 0.7s; animation-duration: 4.2s; }
    .spark-3 { animation-delay: 1.3s; animation-duration: 3.9s; }
    @keyframes float {
      0%, 100% { transform: translateY(0); opacity: 0.55; }
      50% { transform: translateY(-5px); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .growth-line, .marker, .f-badge, .spark { animation: none; opacity: 1; stroke-dashoffset: 0; transform: none; }
    }
  `;

  private _renderMark(): TemplateResult {
    return html`
      <svg width="128" height="96" viewBox="0 0 128 96" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="onbGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="var(--sage, #8AAF9A)" stop-opacity="0.4" />
            <stop offset="100%" stop-color="var(--sage, #8AAF9A)" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="64" cy="50" r="48" fill="url(#onbGlow)" />

        <circle class="spark spark-1" cx="16" cy="26" r="3" fill="var(--sage, #8AAF9A)" />
        <circle class="spark spark-2" cx="110" cy="20" r="2.5" fill="var(--forest, #2D4A3E)" opacity="0.55" />
        <circle class="spark spark-3" cx="104" cy="72" r="2" fill="var(--sage, #8AAF9A)" opacity="0.7" />

        <path class="growth-line" d="M12 74 C 30 74, 38 52, 54 48 S 80 32, 96 18"
          fill="none" stroke="var(--forest, #2D4A3E)" stroke-width="3" stroke-linecap="round" />

        <circle class="marker marker-1" cx="12" cy="74" r="4" fill="var(--sage, #8AAF9A)" />
        <circle class="marker marker-2" cx="54" cy="48" r="4" fill="var(--sage, #8AAF9A)" />
        <circle class="marker marker-3" cx="96" cy="18" r="5" fill="var(--forest, #2D4A3E)" />

        <g class="f-badge">
          <rect x="82" y="0" width="32" height="32" rx="10" fill="var(--forest, #2D4A3E)" />
          <path d="M92 8 h14 v4.5 h-9 v5 h8 v4.5 h-8 v8 h-5 z" fill="#fff" />
        </g>
      </svg>
    `;
  }

  private _renderCard(): TemplateResult {
    switch (this.card) {
      case 0:
        return html`
          <div class="welcome-body">
            <div class="step-icon step-icon-lg"><i class="ti ti-sparkles" aria-hidden="true"></i></div>
            <h2>Let's set up your workspace</h2>
            <p>Foundr turns the numbers you'd otherwise track on paper into a clear picture of your business — burn, runway, ROI, and margins, all in one place. Takes less than a minute.</p>
          </div>
        `;
      case 1:
        return html`
          <div class="step-icon"><i class="ti ti-user" aria-hidden="true"></i></div>
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
          <div class="step-icon"><i class="ti ti-building-store" aria-hidden="true"></i></div>
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
          <div class="step-icon"><i class="ti ti-user-circle" aria-hidden="true"></i></div>
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
          <div class="step-icon"><i class="ti ti-shield-lock" aria-hidden="true"></i></div>
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
        `;
      default:
        return html`
          <div class="final-body">
            <div class="step-icon step-icon-lg"><i class="ti ti-rocket" aria-hidden="true"></i></div>
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
          <div class="content-inner">
            ${this._renderCard()}
            ${this.error ? html`<div class="error">${this.error}</div>` : ""}
          </div>
        </div>
        <div class="footer">
          <button class="back-btn" @click=${this._back} ?disabled=${this.card === 0 || this.animating || this.saving} aria-label="Back">
            <i class="ti ti-arrow-left" aria-hidden="true"></i>
          </button>
          ${isFinal
            ? html`
                <button class="nav-btn text" @click=${this._next} ?disabled=${this.saving || this.animating}>
                  ${this.saving ? "Setting up…" : "Start your first startup journey with us"}
                </button>
              `
            : html`
                <div class="dots">
                  ${Array.from({ length: CARD_COUNT }).map((_, i) => html`<div class="dot ${i === this.card ? "active" : ""}"></div>`)}
                </div>
                <button class="nav-btn" @click=${this._next} ?disabled=${this.animating} aria-label="Continue">
                  <i class="ti ti-arrow-right" aria-hidden="true"></i>
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
