import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  getClerk,
  updateProfileName,
  startTOTPEnrollment,
  confirmTOTPEnrollment,
  disableMFA,
  regenerateBackupCodes,
  addSecondaryEmail,
  verifySecondaryEmail,
  removeEmail as removeClerkEmail,
} from "../auth/auth.service";
import { loadSettings, saveCurrency, saveTheme, saveProfileFields } from "../../shared/lib/settings";
import { CURRENCIES, formatMoney, type CurrencyCode } from "../../shared/lib/format";
import type { ThemeCode } from "../../shared/lib/theme";
import type { UserSettings } from "../../shared/lib/types";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-page-loader";
import "../../shared/components/foundr-mini-loader";

type Gender = UserSettings["gender"];
type Section = "general" | "profile" | "security";

interface EmailRow {
  id: string;
  email: string;
  primary: boolean;
}

/** Fixed preview colours for each theme option — shown regardless of the
 * currently active theme, so a swatch always represents its own theme. */
const THEME_OPTIONS: { code: ThemeCode; label: string; desc: string; swatch: [string, string, string] }[] = [
  { code: "light", label: "Original", desc: "Foundr's original look", swatch: ["#ECEAE3", "#2D4A3E", "#8AAF9A"] },
  { code: "dark", label: "Dark", desc: "Easy on the eyes", swatch: ["#14161A", "#4C8267", "#7FB69B"] },
  { code: "royal", label: "Royal", desc: "Purple and gold", swatch: ["#F4F0FA", "#4B2E83", "#C9A227"] },
  { code: "ocean", label: "Ocean", desc: "Cool blue and teal", swatch: ["#EAF1F3", "#1F5A6E", "#6FA8B8"] },
  { code: "sunset", label: "Sunset", desc: "Warm terracotta", swatch: ["#FBF0E6", "#B5502E", "#E3A85C"] },
  { code: "slate", label: "Slate", desc: "Dark and monochrome", swatch: ["#15181D", "#5B7A99", "#8B9BAE"] },
];

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
];

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "general", label: "General", icon: "ti-adjustments" },
  { key: "profile", label: "Profile", icon: "ti-user" },
  { key: "security", label: "Security", icon: "ti-shield-lock" },
];

const NAV_ITEM_HEIGHT = 44;
const NAV_ITEM_GAP = 6;

/**
 * <foundr-settings>
 * The founder's settings page, split into three sections behind a left
 * nav with an animated sliding indicator: General (currency, appearance),
 * Profile (name, business name, gender — name lives in Clerk, the rest in
 * our DB), and Security (MFA, backup codes, secondary email — all Clerk).
 */
@customElement("foundr-settings")
export class FoundrSettings extends LitElement {
  @state() private loading = true;
  // Two-tier loading feedback: the small mini-loader shows the instant
  // loading starts (no gap, no delay). If it's still going after a couple
  // seconds, that's unexpectedly slow — escalate to the full entrance
  // animation with a reassuring message.
  @state() private escalated = false;
  @state() private loaderVisible = false;
  @state() private section: Section = "general";

  // General
  @state() private currency: CurrencyCode = "AUD";
  @state() private theme: ThemeCode = "light";
  @state() private generalSaving = false;
  @state() private generalSaved = false;
  @state() private generalError = "";

  // Profile
  @state() private firstName = "";
  @state() private lastName = "";
  @state() private businessName = "";
  @state() private gender: Gender = "";
  @state() private primaryEmail = "";
  @state() private profileSaving = false;
  @state() private profileSaved = false;
  @state() private profileError = "";

  // Security — MFA
  @state() private totpEnabled = false;
  @state() private mfaEnrolling = false;
  @state() private totpSecret = "";
  @state() private mfaCode = "";
  @state() private mfaSaving = false;
  @state() private mfaError = "";

  // Security — backup codes
  @state() private backupCodeEnabled = false;
  @state() private backupCodes: string[] | null = null;
  @state() private backupSaving = false;
  @state() private backupError = "";

  // Security — emails
  @state() private emails: EmailRow[] = [];
  @state() private newEmail = "";
  @state() private pendingEmailId = "";
  @state() private pendingEmailAddress = "";
  @state() private emailCode = "";
  @state() private emailSaving = false;
  @state() private emailError = "";

  private _escalateTimer?: ReturnType<typeof setTimeout>;

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
    this._refreshFromClerk();

    this._escalateTimer = setTimeout(() => {
      if (this.loading) {
        this.escalated = true;
        this.loaderVisible = true;
      }
    }, 2000);

    const settings = await loadSettings();
    if (settings) {
      this.currency = settings.currency as CurrencyCode;
      this.theme = settings.theme as ThemeCode;
      this.businessName = settings.businessName ?? "";
      this.gender = settings.gender ?? "";
    }
    this.loading = false;
    clearTimeout(this._escalateTimer);
  }

  /** Re-read the identity/security state Clerk owns after any mutation. */
  private async _refreshFromClerk(): Promise<void> {
    const clerk = await getClerk();
    const user = clerk?.user;
    if (!user) return;
    this.firstName = user.firstName ?? "";
    this.lastName = user.lastName ?? "";
    this.primaryEmail = user.primaryEmailAddress?.emailAddress ?? "";
    this.totpEnabled = user.totpEnabled;
    this.backupCodeEnabled = user.backupCodeEnabled;
    this.emails = user.emailAddresses.map((e) => ({
      id: e.id,
      email: e.emailAddress,
      primary: e.id === user.primaryEmailAddress?.id,
    }));
  }

  // ---- General ----

  private async _onCurrencyChange(e: Event): Promise<void> {
    const next = (e.target as HTMLSelectElement).value as CurrencyCode;
    this.currency = next;
    this.generalSaving = true;
    this.generalSaved = false;
    this.generalError = "";
    try {
      await saveCurrency(next);
      this.generalSaved = true;
      setTimeout(() => { this.generalSaved = false; }, 2000);
    } catch (err) {
      this.generalError = err instanceof Error ? err.message : "Couldn't save.";
    } finally {
      this.generalSaving = false;
    }
  }

  private async _onThemeChange(next: ThemeCode): Promise<void> {
    if (next === this.theme) return;
    this.theme = next;
    this.generalSaving = true;
    this.generalSaved = false;
    this.generalError = "";
    try {
      await saveTheme(next);
      this.generalSaved = true;
      setTimeout(() => { this.generalSaved = false; }, 2000);
    } catch (err) {
      this.generalError = err instanceof Error ? err.message : "Couldn't save.";
    } finally {
      this.generalSaving = false;
    }
  }

  // ---- Profile ----

  private async _saveProfile(e: Event): Promise<void> {
    e.preventDefault();
    this.profileSaving = true;
    this.profileSaved = false;
    this.profileError = "";
    try {
      const nameResult = await updateProfileName(this.firstName.trim(), this.lastName.trim());
      if (!nameResult.ok) throw new Error(nameResult.error);
      await saveProfileFields({ businessName: this.businessName.trim(), gender: this.gender });
      this.profileSaved = true;
      setTimeout(() => { this.profileSaved = false; }, 2000);
    } catch (err) {
      this.profileError = err instanceof Error ? err.message : "Couldn't save.";
    } finally {
      this.profileSaving = false;
    }
  }

  // ---- Security: MFA ----

  private async _startMfa(): Promise<void> {
    this.mfaSaving = true;
    this.mfaError = "";
    const result = await startTOTPEnrollment();
    this.mfaSaving = false;
    if (!result.ok) {
      this.mfaError = result.error ?? "Couldn't start setup.";
      return;
    }
    this.totpSecret = result.secret ?? "";
    this.mfaEnrolling = true;
  }

  private async _confirmMfa(): Promise<void> {
    if (this.mfaCode.trim().length < 6) {
      this.mfaError = "Enter the 6-digit code from your authenticator app.";
      return;
    }
    this.mfaSaving = true;
    this.mfaError = "";
    const result = await confirmTOTPEnrollment(this.mfaCode.trim());
    this.mfaSaving = false;
    if (!result.ok) {
      this.mfaError = result.error ?? "That code didn't work.";
      return;
    }
    this.mfaEnrolling = false;
    this.mfaCode = "";
    this.totpSecret = "";
    await this._refreshFromClerk();
  }

  private async _disableMfa(): Promise<void> {
    if (!confirm("Turn off two-factor authentication?")) return;
    this.mfaSaving = true;
    this.mfaError = "";
    const result = await disableMFA();
    this.mfaSaving = false;
    if (!result.ok) {
      this.mfaError = result.error ?? "Couldn't disable it.";
      return;
    }
    this.backupCodes = null;
    await this._refreshFromClerk();
  }

  // ---- Security: backup codes ----

  private async _genBackupCodes(): Promise<void> {
    this.backupSaving = true;
    this.backupError = "";
    const result = await regenerateBackupCodes();
    this.backupSaving = false;
    if (!result.ok) {
      this.backupError = result.error ?? "Couldn't generate codes.";
      return;
    }
    this.backupCodes = result.codes ?? [];
    await this._refreshFromClerk();
  }

  // ---- Security: emails ----

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
    this.pendingEmailId = "";
    this.pendingEmailAddress = "";
    this.emailCode = "";
    await this._refreshFromClerk();
  }

  private _cancelEmailVerify(): void {
    this.pendingEmailId = "";
    this.pendingEmailAddress = "";
    this.emailCode = "";
    this.emailError = "";
  }

  private async _removeEmail(id: string): Promise<void> {
    if (!confirm("Remove this email address?")) return;
    this.emailSaving = true;
    this.emailError = "";
    const result = await removeClerkEmail(id);
    this.emailSaving = false;
    if (!result.ok) {
      this.emailError = result.error ?? "Couldn't remove it.";
      return;
    }
    await this._refreshFromClerk();
  }

  private _copy(text: string): void {
    void navigator.clipboard?.writeText(text);
  }

  static styles = css`
    :host {
      display: block; min-height: 100vh; background: var(--bg, #ECEAE3);
      color: var(--ink, #1C1C1C); font-family: var(--font-body, "Inter", sans-serif);
      -webkit-font-smoothing: antialiased;
    }
    .page-area { position: relative; min-height: 420px; }
    .loader-overlay {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: var(--bg, #ECEAE3); z-index: 5;
    }
    .loading-hint { font-size: 13px; color: var(--ink-soft, #6B6B66); text-align: center; margin: -8px 0 0; }
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-adjustments:before { content: "\\ea03"; }
    .ti-user:before { content: "\\eb4d"; }
    .ti-shield-lock:before { content: "\\ed58"; }
    .ti-shield-check:before { content: "\\eb22"; }
    .ti-copy:before { content: "\\ea7a"; }
    .ti-mail:before { content: "\\eae5"; }
    .ti-plus:before { content: "\\eb0b"; }
    .ti-trash:before { content: "\\eb41"; }
    button, select, input { font-family: inherit; }
    button { cursor: pointer; border: none; }

    .page { max-width: 880px; margin: 0 auto; padding: 32px 28px; }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 30px; margin: 0 0 4px; }
    .sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 28px; }

    .layout { display: flex; gap: 28px; align-items: flex-start; }

    .settings-nav { position: relative; width: 200px; flex-shrink: 0; }
    .nav-indicator {
      position: absolute; top: 0; left: 0; right: 0; height: ${NAV_ITEM_HEIGHT}px;
      background: var(--forest, #2D4A3E); border-radius: var(--radius-input, 14px);
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 0;
    }
    .nav-item {
      position: relative; z-index: 1; display: flex; align-items: center; gap: 10px;
      width: 100%; text-align: left; height: ${NAV_ITEM_HEIGHT}px; box-sizing: border-box;
      padding: 0 14px; margin-bottom: ${NAV_ITEM_GAP}px; background: transparent;
      border-radius: var(--radius-input, 14px); font-size: 14px; font-weight: 500;
      color: var(--ink-soft, #6B6B66); transition: color 0.25s ease;
    }
    .nav-item .ti { font-size: 16px; }
    .nav-item.active { color: #fff; }
    .nav-item:hover:not(.active) { color: var(--ink, #1C1C1C); }

    .settings-content { flex: 1; min-width: 0; }

    .card { background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px); padding: 24px; border: 0.5px solid var(--line, #E2DFD7); }
    .card + .card { margin-top: 16px; }
    .setting { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .setting-info .label { font-size: 15px; font-weight: 500; }
    .setting-info .desc { font-size: 13px; color: var(--ink-soft, #6B6B66); margin-top: 3px; }
    select {
      font-size: 15px; padding: 10px 14px; border-radius: var(--radius-input, 14px);
      border: 1px solid var(--line, #E2DFD7); background: var(--input-bg, #fff); color: var(--ink, #1C1C1C); cursor: pointer; min-width: 200px;
    }
    select:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .status { font-size: 13px; margin-top: 14px; min-height: 18px; }
    .status.ok { color: var(--forest, #2D4A3E); }
    .status.err { color: var(--danger, #A8302B); }
    .preview { margin-top: 18px; padding-top: 18px; border-top: 0.5px solid var(--line, #E2DFD7); font-size: 14px; color: var(--ink-soft, #6B6B66); }
    .preview strong { color: var(--ink, #1C1C1C); }

    .theme-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
    .theme-option {
      border: 2px solid var(--line, #E2DFD7); border-radius: var(--radius-input, 14px);
      padding: 10px; text-align: left; background: transparent;
      transition: border-color 0.15s ease, transform 0.1s ease;
    }
    .theme-option:hover { border-color: var(--sage, #8AAF9A); }
    .theme-option.active { border-color: var(--forest, #2D4A3E); }
    .theme-option:active { transform: scale(0.98); }
    .theme-swatch { display: flex; height: 34px; border-radius: 9px; overflow: hidden; margin-bottom: 10px; border: 0.5px solid var(--line, #E2DFD7); }
    .theme-swatch span { flex: 1; }
    .theme-option .name { font-size: 13px; font-weight: 600; color: var(--ink, #1C1C1C); }
    .theme-option .desc { font-size: 11.5px; color: var(--ink-soft, #6B6B66); margin-top: 2px; }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
    .field.full { grid-column: 1 / -1; }
    .field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 7px; }
    .field input, .field select {
      width: 100%; padding: 11px 14px; font-size: 14.5px;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C); box-sizing: border-box;
    }
    .field input:focus, .field select:focus { outline: none; border-color: var(--forest, #2D4A3E); }
    .field input:disabled { color: var(--ink-soft, #6B6B66); cursor: not-allowed; }
    .form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; margin-top: 4px; }

    .btn-save-form {
      background: var(--forest, #2D4A3E); color: #fff; padding: 11px 22px;
      border-radius: var(--radius-pill, 999px); font-size: 14px; font-weight: 500;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .btn-save-form:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-4px, -4px); box-shadow: 4px 4px 0 var(--sage, #8AAF9A); }
    .btn-save-form:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .btn-save-form:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-outline-danger {
      background: transparent; color: var(--danger, #A8302B); border: 1px solid var(--danger-border, #F0C5C3);
      padding: 9px 18px; border-radius: var(--radius-pill, 999px); font-size: 13.5px; font-weight: 500;
    }
    .btn-outline-danger:hover { background: var(--danger-bg, #FBEAE9); }

    .mfa-status { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 14px; font-weight: 500; color: var(--positive, #4F8A6B); }
    .mfa-actions { margin-top: 14px; display: flex; align-items: center; gap: 12px; }

    .secret-box {
      margin-top: 16px; background: var(--surface-alt, #F2EFE8); border-radius: var(--radius-input, 14px);
      padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .secret-value { font-family: monospace; font-size: 15px; letter-spacing: 0.06em; word-break: break-all; }
    .copy-btn {
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7); color: var(--ink, #1C1C1C);
      padding: 7px 12px; border-radius: 9px; font-size: 12.5px; display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .copy-btn:hover { background: var(--sage-soft, #DDE7E0); }
    .hint { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 14px 0 0; line-height: 1.5; }
    .code-row { display: flex; gap: 10px; margin-top: 12px; align-items: center; }
    .code-input { font-family: monospace; letter-spacing: 0.25em; text-align: center; width: 140px; }
    .code-row .field { flex-shrink: 0; }

    .codes-warning {
      margin-top: 14px; font-size: 13px; color: var(--tone-warn, #C98A2B); font-weight: 500;
    }
    .codes-grid {
      margin-top: 10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
    }
    .codes-grid code {
      font-family: monospace; font-size: 13.5px; background: var(--surface-alt, #F2EFE8);
      padding: 8px 10px; border-radius: 8px; text-align: center;
    }

    .email-list { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .email-row {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 10px 14px; background: var(--surface-alt, #F2EFE8); border-radius: 12px; font-size: 14px;
    }
    .email-row .badge {
      font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); padding: 3px 8px; border-radius: 999px;
    }
    .icon-btn {
      background: transparent; border: 1px solid var(--line, #E2DFD7); border-radius: 8px;
      width: 30px; height: 30px; display: grid; place-items: center; color: var(--ink-soft, #6B6B66); font-size: 14px;
    }
    .icon-btn.danger:hover { background: var(--danger-bg, #FBEAE9); color: var(--danger, #A8302B); border-color: var(--danger-border, #F0C5C3); }
    .new-email-row { display: flex; gap: 10px; margin-top: 14px; }
    .new-email-row .input-wrap { position: relative; flex: 1; }
    .new-email-row .input-wrap .ti-mail {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--ink-soft, #6B6B66); font-size: 15px; pointer-events: none;
    }
    .new-email-row input {
      width: 100%; box-sizing: border-box; padding: 11px 14px 11px 38px; font-size: 14.5px;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .new-email-row input:focus {
      outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1);
    }
    .new-email-row input::placeholder { color: var(--ink-soft, #6B6B66); }
    .add-btn {
      background: var(--forest, #2D4A3E); color: #fff; padding: 0 18px; border-radius: var(--radius-input, 14px);
      font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 6px; flex-shrink: 0;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .add-btn:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-3px, -3px); box-shadow: 3px 3px 0 var(--sage, #8AAF9A); }
    .add-btn:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .add-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    @media (max-width: 720px) {
      .layout { flex-direction: column; }
      .settings-nav { width: 100%; }
      .form-grid { grid-template-columns: 1fr; }
      .codes-grid { grid-template-columns: 1fr; }
    }
  `;

  private _renderNav(): TemplateResult {
    const idx = SECTIONS.findIndex((s) => s.key === this.section);
    const offset = idx * (NAV_ITEM_HEIGHT + NAV_ITEM_GAP);
    return html`
      <div class="settings-nav">
        <div class="nav-indicator" style="transform: translateY(${offset}px)"></div>
        ${SECTIONS.map(
          (s) => html`
            <button class="nav-item ${this.section === s.key ? "active" : ""}" @click=${() => { this.section = s.key; }}>
              <i class="ti ${s.icon}" aria-hidden="true"></i>${s.label}
            </button>
          `
        )}
      </div>
    `;
  }

  private _renderGeneral(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting">
          <div class="setting-info">
            <div class="label">Currency</div>
            <div class="desc">How amounts are shown across Foundr. We set a default from your region — change it anytime.</div>
          </div>
          <select @change=${this._onCurrencyChange} ?disabled=${this.generalSaving} .value=${this.currency}>
            ${CURRENCIES.map(
              (c) => html`<option value=${c.code} ?selected=${c.code === this.currency}>${c.code} · ${c.label}</option>`
            )}
          </select>
        </div>
        <div class="preview">Example: a $50,000 entry shows as <strong>${formatMoney(50000)}</strong>.</div>
      </div>

      <div class="card">
        <div class="setting-info">
          <div class="label">Appearance</div>
          <div class="desc">Pick the colour scheme Foundr renders in — applies instantly.</div>
        </div>
        <div class="theme-grid">
          ${THEME_OPTIONS.map(
            (t) => html`
              <button
                class="theme-option ${this.theme === t.code ? "active" : ""}"
                @click=${() => this._onThemeChange(t.code)}
                ?disabled=${this.generalSaving}
              >
                <div class="theme-swatch">
                  <span style="background:${t.swatch[0]}"></span>
                  <span style="background:${t.swatch[1]}"></span>
                  <span style="background:${t.swatch[2]}"></span>
                </div>
                <div class="name">${t.label}</div>
                <div class="desc">${t.desc}</div>
              </button>
            `
          )}
        </div>
      </div>

      <div class="status ${this.generalError ? "err" : "ok"}">
        ${this.generalError ? this.generalError : this.generalSaving ? "Saving…" : this.generalSaved ? "Saved ✓" : ""}
      </div>
    `;
  }

  private _renderProfile(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Personal details</div>
          <div class="desc">Your name is managed by your account provider and shown across Foundr.</div>
        </div>
        <form class="form-grid" @submit=${this._saveProfile}>
          <div class="field">
            <label for="firstName">First name</label>
            <input id="firstName" type="text" .value=${this.firstName}
              @input=${(e: Event) => { this.firstName = (e.target as HTMLInputElement).value; }} />
          </div>
          <div class="field">
            <label for="lastName">Last name</label>
            <input id="lastName" type="text" .value=${this.lastName}
              @input=${(e: Event) => { this.lastName = (e.target as HTMLInputElement).value; }} />
          </div>
          <div class="field full">
            <label for="businessName">Business / startup name</label>
            <input id="businessName" type="text" placeholder="e.g. Foundr" .value=${this.businessName}
              @input=${(e: Event) => { this.businessName = (e.target as HTMLInputElement).value; }} />
          </div>
          <div class="field">
            <label for="gender">Gender</label>
            <select id="gender" .value=${this.gender}
              @change=${(e: Event) => { this.gender = (e.target as HTMLSelectElement).value as Gender; }}>
              ${GENDER_OPTIONS.map((g) => html`<option value=${g.value} ?selected=${g.value === this.gender}>${g.label}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" .value=${this.primaryEmail} disabled />
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-save-form" ?disabled=${this.profileSaving}>
              ${this.profileSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
        <div class="status ${this.profileError ? "err" : "ok"}">
          ${this.profileError ? this.profileError : this.profileSaved ? "Saved ✓" : ""}
        </div>
      </div>
    `;
  }

  private _renderMfaCard(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Authenticator app (2FA)</div>
          <div class="desc">Add a one-time code from an app like Google Authenticator or 1Password each time you sign in.</div>
        </div>

        ${this.totpEnabled
          ? html`
              <div class="mfa-status"><i class="ti ti-shield-check" aria-hidden="true"></i>Enabled</div>
              <div class="mfa-actions">
                <button class="btn-outline-danger" @click=${this._disableMfa} ?disabled=${this.mfaSaving}>Disable</button>
              </div>
            `
          : this.mfaEnrolling
            ? html`
                <div class="secret-box">
                  <span class="secret-value">${this.totpSecret}</span>
                  <button class="copy-btn" @click=${() => this._copy(this.totpSecret)}>
                    <i class="ti ti-copy" aria-hidden="true"></i>Copy
                  </button>
                </div>
                <p class="hint">Enter this key into your authenticator app as a manual setup code, then type the 6-digit code it shows.</p>
                <div class="code-row">
                  <div class="field">
                    <input class="code-input" maxlength="6" inputmode="numeric" placeholder="000000" .value=${this.mfaCode}
                      @input=${(e: Event) => { this.mfaCode = (e.target as HTMLInputElement).value; }} />
                  </div>
                  <button class="btn-save-form" @click=${this._confirmMfa} ?disabled=${this.mfaSaving}>
                    ${this.mfaSaving ? "Verifying…" : "Verify & enable"}
                  </button>
                </div>
              `
            : html`
                <div class="mfa-actions">
                  <button class="btn-save-form" @click=${this._startMfa} ?disabled=${this.mfaSaving}>Set up authenticator app</button>
                </div>
              `}

        <div class="status ${this.mfaError ? "err" : "ok"}">${this.mfaError}</div>
      </div>
    `;
  }

  private _renderBackupCard(): TemplateResult {
    if (!this.totpEnabled) return html``;
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Backup codes</div>
          <div class="desc">One-time codes to sign in if you lose access to your authenticator app.</div>
        </div>
        <div class="mfa-actions">
          <button class="btn-save-form" @click=${this._genBackupCodes} ?disabled=${this.backupSaving}>
            ${this.backupSaving ? "Generating…" : this.backupCodeEnabled ? "Regenerate backup codes" : "Generate backup codes"}
          </button>
        </div>
        ${this.backupCodes
          ? html`
              <div class="codes-warning">Save these now — you won't be able to see them again.</div>
              <div class="codes-grid">${this.backupCodes.map((c) => html`<code>${c}</code>`)}</div>
              <div class="mfa-actions">
                <button class="copy-btn" @click=${() => this._copy(this.backupCodes!.join("\n"))}>
                  <i class="ti ti-copy" aria-hidden="true"></i>Copy all
                </button>
              </div>
            `
          : ""}
        <div class="status ${this.backupError ? "err" : ""}">${this.backupError}</div>
      </div>
    `;
  }

  private _renderEmailCard(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Recovery email</div>
          <div class="desc">If you ever lose access to your primary email or forget your password, we'll send account recovery links here instead.</div>
        </div>

        <div class="email-list">
          ${this.emails.map(
            (e) => html`
              <div class="email-row">
                <span><i class="ti ti-mail" aria-hidden="true"></i> ${e.email}</span>
                ${e.primary
                  ? html`<span class="badge">Sign-in email</span>`
                  : html`<button class="icon-btn danger" title="Remove" @click=${() => this._removeEmail(e.id)} ?disabled=${this.emailSaving}>
                      <i class="ti ti-trash" aria-hidden="true"></i>
                    </button>`}
              </div>
            `
          )}
        </div>

        ${this.pendingEmailId
          ? html`
              <p class="hint">Enter the code sent to <strong>${this.pendingEmailAddress}</strong>.</p>
              <div class="code-row">
                <div class="field">
                  <input class="code-input" maxlength="6" inputmode="numeric" placeholder="000000" .value=${this.emailCode}
                    @input=${(e: Event) => { this.emailCode = (e.target as HTMLInputElement).value; }} />
                </div>
                <button class="btn-save-form" @click=${this._verifyEmail} ?disabled=${this.emailSaving}>
                  ${this.emailSaving ? "Verifying…" : "Verify"}
                </button>
                <button class="btn-outline-danger" @click=${this._cancelEmailVerify} ?disabled=${this.emailSaving}>Cancel</button>
              </div>
            `
          : html`
              <div class="new-email-row">
                <div class="input-wrap">
                  <i class="ti ti-mail" aria-hidden="true"></i>
                  <input type="email" placeholder="you@example.com" .value=${this.newEmail}
                    @input=${(e: Event) => { this.newEmail = (e.target as HTMLInputElement).value; }} ?disabled=${this.emailSaving} />
                </div>
                <button class="add-btn" @click=${this._addEmail} ?disabled=${this.emailSaving}>
                  <i class="ti ti-plus" aria-hidden="true"></i>Add
                </button>
              </div>
            `}

        <div class="status ${this.emailError ? "err" : ""}">${this.emailError}</div>
      </div>
    `;
  }

  private _renderSecurity(): TemplateResult {
    return html`
      ${this._renderMfaCard()}
      ${this._renderBackupCard()}
      ${this._renderEmailCard()}
    `;
  }

  render(): TemplateResult {
    let content: TemplateResult = html``;
    if (!this.loading) {
      if (this.section === "general") content = this._renderGeneral();
      else if (this.section === "profile") content = this._renderProfile();
      else content = this._renderSecurity();
    }

    return html`
      <foundr-topbar active="settings"></foundr-topbar>

      <div class="page">
        <h1>Settings</h1>
        <p class="sub">Manage how Foundr works for you.</p>

        <div class="page-area">
          ${!this.loading
            ? html`
                <div class="layout">
                  ${this._renderNav()}
                  <div class="settings-content">${content}</div>
                </div>
              `
            : ""}
          ${this.loading && !this.escalated
            ? html`<div class="loader-overlay"><foundr-mini-loader></foundr-mini-loader></div>`
            : ""}
          ${this.loaderVisible
            ? html`
                <div class="loader-overlay">
                  <foundr-page-loader
                    ?done=${!this.loading}
                    @loader-exit-done=${() => { this.loaderVisible = false; }}
                  >
                    <p slot="hint" class="loading-hint">This is taking longer than usual…</p>
                  </foundr-page-loader>
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-settings": FoundrSettings;
  }
}
