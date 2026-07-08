import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  signInWithEmail,
  signUpWithEmail,
  verifyEmailCode,
  signInWithGoogle,
} from "./auth.service";

type Mode = "sign-in" | "sign-up";
type Phase = "form" | "verify";

/**
 * <foundr-auth mode="sign-in" | "sign-up">
 * Custom-designed auth page wired to Clerk's API.
 *
 * Owns the full UI (layout, fields, validation, errors). Clerk handles the
 * actual auth via the helpers in lib/auth. Email+password and Google.
 * Sign-up adds an email verification step.
 *
 * React-ready: typed reactive state, render split into methods, all auth
 * calls isolated in lib/auth.
 */
@customElement("foundr-auth")
export class FoundrAuth extends LitElement {
  @property({ type: String }) mode: Mode = "sign-in";

  @state() private phase: Phase = "form";
  @state() private email = "";
  @state() private password = "";
  @state() private code = "";
  @state() private loading = false;
  @state() private error = "";

  private get isSignUp(): boolean {
    return this.mode === "sign-up";
  }

  private _switchMode(): void {
    this.mode = this.isSignUp ? "sign-in" : "sign-up";
    this.error = "";
    this.phase = "form";
    history.replaceState(null, "", this.isSignUp ? "/sign-up" : "/sign-in");
  }

  private _onInput(field: "email" | "password" | "code", e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this[field] = value;
    if (this.error) this.error = "";
  }

  private _validate(): string | null {
    if (!this.email.includes("@")) return "Enter a valid email address.";
    if (this.password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  private async _submitForm(e: Event): Promise<void> {
    e.preventDefault();
    const problem = this._validate();
    if (problem) {
      this.error = problem;
      return;
    }

    this.loading = true;
    this.error = "";

    const result = this.isSignUp
      ? await signUpWithEmail(this.email, this.password)
      : await signInWithEmail(this.email, this.password);

    this.loading = false;

    if (!result.ok) {
      this.error = result.error ?? "Something went wrong.";
      return;
    }

    if (result.needsVerification) {
      this.phase = "verify";
      return;
    }

    this._onSuccess();
  }

  private async _submitCode(e: Event): Promise<void> {
    e.preventDefault();
    if (this.code.trim().length < 4) {
      this.error = "Enter the code from your email.";
      return;
    }

    this.loading = true;
    this.error = "";
    const result = await verifyEmailCode(this.code.trim());
    this.loading = false;

    if (!result.ok) {
      this.error = result.error ?? "That code didn't work.";
      return;
    }
    this._onSuccess();
  }

  private async _google(): Promise<void> {
    this.loading = true;
    this.error = "";
    const result = await signInWithGoogle();
    if (!result.ok) {
      this.loading = false;
      this.error = result.error ?? "Couldn't connect to Google.";
    }
    // On success Clerk redirects away.
  }

  private _onSuccess(): void {
    this.dispatchEvent(new CustomEvent("auth-success", { bubbles: true, composed: true }));
    // Navigation is handled by Clerk's setActive redirectUrl.
  }

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--bg, #ECEAE3);
      color: var(--ink, #1C1C1C);
      font-family: var(--font-body, "Inter", sans-serif);
      -webkit-font-smoothing: antialiased;
    }
    .layout { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; }

    .brand-panel {
      background: var(--forest, #2D4A3E);
      color: #fff;
      padding: 48px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 20px; color: #fff; text-decoration: none; }
    .brand .mark {
      width: 32px; height: 32px; border-radius: 9px; background: #fff;
      color: var(--forest, #2D4A3E); display: grid; place-items: center;
      font-family: var(--font-display, serif); font-size: 18px;
    }
    .brand-copy { max-width: 380px; }
    .brand-copy h1 {
      font-family: var(--font-display, serif); font-weight: 400;
      font-size: 36px; line-height: 1.15; margin: 0 0 16px;
    }
    .brand-copy p { font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.78); margin: 0; }
    .brand-stats { display: flex; gap: 28px; }
    .brand-stat .num { font-size: 22px; font-weight: 600; }
    .brand-stat .lbl { font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 2px; }

    .form-panel { display: flex; align-items: center; justify-content: center; padding: 48px; }
    .form-card { width: 100%; max-width: 380px; }
    .form-card h2 {
      font-family: var(--font-display, serif); font-weight: 400;
      font-size: 30px; margin: 0 0 8px;
    }
    .form-sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 28px; }

    button { font-family: inherit; cursor: pointer; border: none; transition: background 0.2s ease, transform 0.1s ease; }
    button:active { transform: scale(0.99); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }

    .google-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); padding: 13px; font-size: 15px; font-weight: 500;
      color: var(--ink, #1C1C1C);
    }
    .google-btn:hover { background: #fff; border-color: var(--ink-soft, #6B6B66); }
    .google-icon { width: 18px; height: 18px; }

    .divider { display: flex; align-items: center; gap: 14px; margin: 22px 0; color: var(--ink-soft, #6B6B66); font-size: 13px; }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--line, #E2DFD7); }

    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 7px; }
    .field input {
      width: 100%; padding: 12px 14px; font-size: 15px; font-family: inherit;
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .field input:focus {
      outline: none; border-color: var(--forest, #2D4A3E);
      box-shadow: 0 0 0 3px rgba(45,74,62,0.1);
    }
    .field input::placeholder { color: var(--ink-soft, #6B6B66); }

    .submit-btn {
      width: 100%; background: var(--forest, #2D4A3E); color: #fff;
      border-radius: var(--radius-input, 14px); padding: 14px; font-size: 15px; font-weight: 500;
      margin-top: 4px;
    }
    .submit-btn:hover:not(:disabled) { background: var(--forest-deep, #1F3329); }

    .error {
      background: #FBEAE9; color: #A8302B; border: 1px solid #F0C5C3;
      border-radius: 12px; padding: 11px 14px; font-size: 14px; margin-bottom: 18px;
      line-height: 1.45;
    }

    .switch { margin-top: 24px; font-size: 14px; color: var(--ink-soft, #6B6B66); text-align: center; }
    .switch button {
      background: none; color: var(--forest, #2D4A3E); font-weight: 500; font-size: 14px;
      padding: 0; text-decoration: underline; text-underline-offset: 2px;
    }
    .legal { margin-top: 20px; font-size: 12px; color: var(--ink-soft, #6B6B66); text-align: center; line-height: 1.5; }
    .legal a { color: var(--forest, #2D4A3E); }

    .verify-hint { font-size: 14px; color: var(--ink-soft, #6B6B66); margin: 0 0 22px; line-height: 1.5; }
    .verify-hint strong { color: var(--ink, #1C1C1C); }
    .code-input { letter-spacing: 0.3em; text-align: center; font-size: 18px !important; }
    .back-link { background: none; color: var(--ink-soft, #6B6B66); font-size: 14px; padding: 0; margin-top: 18px; display: block; width: 100%; text-align: center; }
    .back-link:hover { color: var(--ink, #1C1C1C); }

    @media (max-width: 860px) {
      .layout { grid-template-columns: 1fr; }
      .brand-panel { display: none; }
      .form-panel { min-height: 100vh; }
    }
  `;

  private _renderBrandPanel(): TemplateResult {
    return html`
      <div class="brand-panel">
        <a class="brand" href="/"><span class="mark">F</span>Foundr</a>
        <div class="brand-copy">
          <h1>${this.isSignUp ? "Start seeing your numbers clearly." : "Welcome back, founder."}</h1>
          <p>
            ${this.isSignUp
              ? "Join founders who turned scattered notes into a clear picture of their business — burn, runway, ROI, and margins, all in one place."
              : "Pick up right where you left off. Your business, your numbers, all in one clear view."}
          </p>
        </div>
        <div class="brand-stats">
          <div class="brand-stat"><div class="num">2,400+</div><div class="lbl">founders tracking</div></div>
          <div class="brand-stat"><div class="num">4.8/5</div><div class="lbl">average rating</div></div>
        </div>
      </div>
    `;
  }

  private _googleIcon(): TemplateResult {
    return html`
      <svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    `;
  }

  private _renderForm(): TemplateResult {
    return html`
      <div class="form-card">
        <h2>${this.isSignUp ? "Create your account" : "Sign in"}</h2>
        <p class="form-sub">
          ${this.isSignUp ? "Free to start. No card required." : "Welcome back. Let's check your numbers."}
        </p>

        ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ""}

        <button class="google-btn" @click=${this._google} ?disabled=${this.loading}>
          ${this._googleIcon()} Continue with Google
        </button>

        <div class="divider">or</div>

        <form @submit=${this._submitForm}>
          <div class="field">
            <label for="email">Email</label>
            <input
              id="email" type="email" placeholder="you@example.com" autocomplete="email"
              .value=${this.email} @input=${(e: Event) => this._onInput("email", e)} ?disabled=${this.loading}
            />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input
              id="password" type="password"
              placeholder=${this.isSignUp ? "At least 8 characters" : "Your password"}
              autocomplete=${this.isSignUp ? "new-password" : "current-password"}
              .value=${this.password} @input=${(e: Event) => this._onInput("password", e)} ?disabled=${this.loading}
            />
          </div>
          <div id="clerk-captcha"></div>
          <button class="submit-btn" type="submit" ?disabled=${this.loading}>
            ${this.loading ? "Please wait…" : this.isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <p class="switch">
          ${this.isSignUp ? "Already have an account?" : "New to Foundr?"}
          <button @click=${this._switchMode}>${this.isSignUp ? "Sign in" : "Create one free"}</button>
        </p>

        ${this.isSignUp
          ? html`<p class="legal">By creating an account you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>`
          : ""}
      </div>
    `;
  }

  private _renderVerify(): TemplateResult {
    return html`
      <div class="form-card">
        <h2>Check your email</h2>
        <p class="verify-hint">
          We sent a verification code to <strong>${this.email}</strong>. Enter it below to finish setting up your account.
        </p>

        ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ""}

        <form @submit=${this._submitCode}>
          <div class="field">
            <label for="code">Verification code</label>
            <input
              id="code" class="code-input" type="text" inputmode="numeric" placeholder="000000"
              maxlength="6" .value=${this.code} @input=${(e: Event) => this._onInput("code", e)} ?disabled=${this.loading}
            />
          </div>
          <button class="submit-btn" type="submit" ?disabled=${this.loading}>
            ${this.loading ? "Verifying…" : "Verify and continue"}
          </button>
        </form>

        <button class="back-link" @click=${() => { this.phase = "form"; this.error = ""; }}>
          Back to sign up
        </button>
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <div class="layout">
        ${this._renderBrandPanel()}
        <div class="form-panel">
          ${this.phase === "verify" ? this._renderVerify() : this._renderForm()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-auth": FoundrAuth;
  }
}