import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  getClerk,
  updateProfileName,
  addSecondaryEmail,
  verifySecondaryEmail,
  removeEmail as removeClerkEmail,
} from "../auth/auth.service";
import { loadSettings, saveTheme, saveProfileFields } from "../../shared/lib/settings";
import { CURRENCIES, formatMoney, setCurrency, type CurrencyCode } from "../../shared/lib/format";
import { THEME_OPTIONS, type ThemeCode } from "../../shared/lib/theme";
import type { UserSettings, Business } from "../../shared/lib/types";
import { resolveActiveBusiness, createBusiness, setActiveBusiness, renameBusiness, setBusinessCurrency, deleteBusiness, deleteBlockedReason } from "../../shared/lib/business";
import { fetchActivity } from "../../shared/lib/activity";
import type { ActivityLogEntry } from "../../shared/lib/types";
import { checkSessionFreshness } from "../../shared/lib/session-guard";
import { startTour } from "../../shared/lib/tour";
import "../../shared/components/foundr-topbar";
import "../../shared/components/foundr-mini-loader";
import "../../shared/components/foundr-coming-soon-modal";
import "../../shared/components/foundr-tour-overlay";
import "../../shared/components/foundr-recurring-list";
import "../../shared/components/foundr-trash-list";
import "../../shared/components/foundr-import-panel";

type Gender = UserSettings["gender"];
type Section = "general" | "profile" | "security" | "startups" | "recurring" | "trash" | "activity" | "migrate";

const ACTIVITY_PAGE_SIZE = 20;

interface EmailRow {
  id: string;
  email: string;
  primary: boolean;
}

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
  { key: "startups", label: "Startups", icon: "ti-building-store" },
  { key: "recurring", label: "Recurring", icon: "ti-repeat" },
  { key: "trash", label: "Trash", icon: "ti-trash" },
  { key: "activity", label: "Activity", icon: "ti-history" },
  { key: "migrate", label: "Migrate", icon: "ti-upload" },
];

const NAV_ITEM_HEIGHT = 44;
const NAV_ITEM_GAP = 6;

/**
 * <foundr-settings>
 * The founder's settings page, split into sections behind a left nav with
 * an animated sliding indicator: General (currency, appearance — currency
 * belongs to whichever startup is currently active, not the account),
 * Profile (name, gender — name lives in Clerk, gender in our DB), Security
 * (recovery email, all Clerk — two-factor auth needs a paid Clerk plan
 * Foundr isn't on yet, so it's marked "coming soon" instead of a broken
 * setup flow), and Startups (switch, rename, or add businesses).
 */
@customElement("foundr-settings")
export class FoundrSettings extends LitElement {
  @state() private loading = true;
  @state() private section: Section = "general";
  @state() private comingSoonOpen = false;

  // General
  @state() private currency: CurrencyCode = "AUD";
  @state() private theme: ThemeCode = "light";
  @state() private generalSaving = false;
  @state() private generalSaved = false;
  @state() private generalError = "";

  // Profile
  @state() private firstName = "";
  @state() private lastName = "";
  @state() private gender: Gender = "";
  @state() private primaryEmail = "";
  @state() private profileSaving = false;
  @state() private profileSaved = false;
  @state() private profileError = "";

  // Security — emails
  @state() private emails: EmailRow[] = [];
  @state() private newEmail = "";
  @state() private pendingEmailId = "";
  @state() private pendingEmailAddress = "";
  @state() private emailCode = "";
  @state() private emailSaving = false;
  @state() private emailError = "";

  // Startups
  @state() private businesses: Business[] = [];
  @state() private activeBusinessId = "";
  @state() private newStartupName = "";
  @state() private startupSaving = false;
  @state() private startupError = "";
  @state() private renamingId = "";
  @state() private renameValue = "";

  // Activity — lazy-loaded (only fetched once the tab is actually opened).
  @state() private activityItems: ActivityLogEntry[] = [];
  @state() private activityLoading = false;
  @state() private activityError = "";
  @state() private activityPage = 1;
  @state() private activityTotal = 0;
  private _activityLoadedFor = "";

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
    this._refreshFromClerk();

    const settings = await loadSettings();
    if (settings && !settings.onboarded) {
      window.location.href = "/dashboard";
      return;
    }
    if (settings) {
      this.theme = settings.theme as ThemeCode;
      this.gender = settings.gender ?? "";
    }

    const requestedSection = new URLSearchParams(window.location.search).get("section");
    if (requestedSection && SECTIONS.some((s) => s.key === requestedSection)) {
      this.section = requestedSection as Section;
    }

    try {
      const { businesses, activeId } = await resolveActiveBusiness(settings?.activeBusinessId ?? "");
      this.businesses = businesses;
      this.activeBusinessId = activeId;
      this.currency = (businesses.find((b) => b._id === activeId)?.currency as CurrencyCode) ?? "AUD";
      if (this.section === "activity") await this._loadActivity(1);
    } catch {
      this.businesses = [];
    }

    this.loading = false;
  }

  // ---- Activity ----

  private _selectSection(key: Section): void {
    this.section = key;
    if (key === "activity" && this._activityLoadedFor !== this.activeBusinessId) {
      void this._loadActivity(1);
    }
  }

  private async _loadActivity(page: number): Promise<void> {
    if (!this.activeBusinessId) return;
    this.activityLoading = true;
    this.activityError = "";
    try {
      const res = await fetchActivity(this.activeBusinessId, page, ACTIVITY_PAGE_SIZE);
      this.activityItems = res.items;
      this.activityTotal = res.total;
      this.activityPage = res.page;
      this._activityLoadedFor = this.activeBusinessId;
    } catch (err) {
      this.activityError = err instanceof Error ? err.message : "Couldn't load activity.";
    } finally {
      this.activityLoading = false;
    }
  }

  private _timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  private _actionIcon(action: ActivityLogEntry["action"]): string {
    if (action === "create") return "ti-plus";
    if (action === "delete") return "ti-trash";
    if (action === "restore") return "ti-arrow-back-up";
    return "ti-pencil";
  }

  // ---- Startups ----

  private async _switchBusiness(id: string): Promise<void> {
    if (id === this.activeBusinessId) return;
    this.activeBusinessId = id;
    this.currency = (this.businesses.find((b) => b._id === id)?.currency as CurrencyCode) ?? "AUD";
    await setActiveBusiness(id);
    if (this.section === "activity") void this._loadActivity(1);
  }

  private _startRename(b: Business): void {
    this.renamingId = b._id;
    this.renameValue = b.name;
    this.startupError = "";
  }

  private _cancelRename(): void {
    this.renamingId = "";
    this.renameValue = "";
  }

  private async _saveRename(id: string): Promise<void> {
    const name = this.renameValue.trim();
    if (!name) {
      this.startupError = "Give your startup a name.";
      return;
    }
    this.startupSaving = true;
    this.startupError = "";
    try {
      const updated = await renameBusiness(id, name);
      this.businesses = this.businesses.map((b) => (b._id === id ? updated : b));
      this._cancelRename();
    } catch (err) {
      this.startupError = err instanceof Error ? err.message : "Couldn't rename that startup.";
    } finally {
      this.startupSaving = false;
    }
  }

  /** Empty businesses only — the backend refuses if it still has tracked entries. */
  private async _deleteStartup(b: Business): Promise<void> {
    if (deleteBlockedReason(this.businesses, b._id, this.activeBusinessId)) return;
    if (!confirm(`Delete "${b.name}"? This can't be undone.`)) return;

    this.startupSaving = true;
    this.startupError = "";
    try {
      await deleteBusiness(b._id);
      this.businesses = this.businesses.filter((x) => x._id !== b._id);
    } catch (err) {
      this.startupError = err instanceof Error ? err.message : "Couldn't delete that startup.";
    } finally {
      this.startupSaving = false;
    }
  }

  private async _addStartup(e: Event): Promise<void> {
    e.preventDefault();
    const name = this.newStartupName.trim();
    if (!name) {
      this.startupError = "Give your startup a name.";
      return;
    }
    this.startupSaving = true;
    this.startupError = "";
    try {
      const business = await createBusiness(name);
      this.businesses = [...this.businesses, business];
      this.newStartupName = "";
      await this._switchBusiness(business._id);
    } catch (err) {
      this.startupError = err instanceof Error ? err.message : "Couldn't add that startup.";
    } finally {
      this.startupSaving = false;
    }
  }

  /** Re-read the identity/security state Clerk owns after any mutation. */
  private async _refreshFromClerk(): Promise<void> {
    const clerk = await getClerk();
    const user = clerk?.user;
    if (!user) return;
    this.firstName = user.firstName ?? "";
    this.lastName = user.lastName ?? "";
    this.primaryEmail = user.primaryEmailAddress?.emailAddress ?? "";
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
      // Currency belongs to whichever startup is currently active, not the
      // account as a whole — switching businesses picks up their own value.
      const updated = await setBusinessCurrency(this.activeBusinessId, next);
      this.businesses = this.businesses.map((b) => (b._id === updated._id ? updated : b));
      setCurrency(next);
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
      await saveProfileFields({ gender: this.gender });
      this.profileSaved = true;
      setTimeout(() => { this.profileSaved = false; }, 2000);
    } catch (err) {
      this.profileError = err instanceof Error ? err.message : "Couldn't save.";
    } finally {
      this.profileSaving = false;
    }
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
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal; font-weight: normal; font-variant: normal;
      text-transform: none; line-height: 1; speak: none;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .ti-adjustments:before { content: "\\ea03"; }
    .ti-user:before { content: "\\eb4d"; }
    .ti-shield-lock:before { content: "\\ed58"; }
    .ti-mail:before { content: "\\eae5"; }
    .ti-plus:before { content: "\\eb0b"; }
    .ti-trash:before { content: "\\eb41"; }
    .ti-building-store:before { content: "\\ea4e"; }
    .ti-rocket:before { content: "\\ec45"; }
    .ti-check:before { content: "\\ea5e"; }
    .ti-pencil:before { content: "\\eb04"; }
    .ti-x:before { content: "\\eb55"; }
    .ti-arrow-back-up:before { content: "\\eb77"; }
    .ti-history:before { content: "\\ebea"; }
    .ti-repeat:before { content: "\\eb72"; }
    .ti-upload:before { content: "\\eb47"; }
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
      display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
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

    .hint { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 14px 0 0; line-height: 1.5; }
    .code-row { display: flex; gap: 10px; margin-top: 12px; align-items: center; }
    .code-input { font-family: monospace; letter-spacing: 0.25em; text-align: center; width: 140px; }
    .code-row .field { flex-shrink: 0; }

    .badge-soon {
      font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      background: var(--surface-alt, #F2EFE8); color: var(--ink-soft, #6B6B66); padding: 4px 10px; border-radius: 999px;
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

    .startup-list { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .startup-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; background: var(--surface-alt, #F2EFE8); border: 1px solid transparent;
      border-radius: 14px; font-size: 14px; transition: border-color 0.15s ease;
    }
    .startup-row.active { border-color: var(--forest, #2D4A3E); }
    .startup-icon {
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E);
      display: grid; place-items: center; font-size: 16px;
    }
    .startup-name { flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .startup-add-form { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
    .startup-add-input {
      flex: 1; min-width: 0; box-sizing: border-box; padding: 11px 14px; font-size: 14px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .startup-add-input:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    .startup-add-input::placeholder { color: var(--ink-soft, #6B6B66); }
    .startup-row .badge {
      display: flex; align-items: center; gap: 4px;
      font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); padding: 3px 8px; border-radius: 999px;
      flex-shrink: 0;
    }
    .btn-switch {
      background: transparent; color: var(--forest, #2D4A3E); border: 1px solid var(--line, #E2DFD7);
      padding: 6px 14px; border-radius: var(--radius-pill, 999px); font-size: 12.5px; font-weight: 500;
      flex-shrink: 0; transition: background 0.15s ease, border-color 0.15s ease;
    }
    .btn-switch:hover { background: var(--sage-soft, #DDE7E0); border-color: var(--forest, #2D4A3E); }
    .startup-row-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .startup-row.renaming { gap: 10px; }
    .rename-input {
      flex: 1; min-width: 0; box-sizing: border-box; padding: 9px 12px; font-size: 14px; font-family: inherit;
      background: var(--input-bg, #fff); border: 1px solid var(--line, #E2DFD7);
      border-radius: 10px; color: var(--ink, #1C1C1C);
    }
    .rename-input:focus { outline: none; border-color: var(--forest, #2D4A3E); }

    .activity-list { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .activity-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--surface-alt, #F2EFE8); border-radius: 14px; font-size: 14px; }
    .activity-icon {
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); display: grid; place-items: center; font-size: 15px;
    }
    .activity-info { flex: 1; min-width: 0; }
    .activity-summary { font-weight: 500; }
    .activity-time { font-size: 12.5px; color: var(--ink-soft, #6B6B66); margin-top: 2px; white-space: nowrap; }
    .activity-pagination { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 16px; font-size: 13px; color: var(--ink-soft, #6B6B66); }
    .activity-page-btn { background: transparent; border: 1px solid var(--line, #E2DFD7); border-radius: 8px; padding: 6px 12px; font-size: 13px; color: var(--ink, #1C1C1C); }
    .activity-page-btn:hover:not(:disabled) { background: rgba(45,74,62,0.06); }
    .activity-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    @media (max-width: 720px) {
      .layout { flex-direction: column; }
      .settings-nav { width: 100%; }
      .form-grid { grid-template-columns: 1fr; }
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
            <button class="nav-item ${this.section === s.key ? "active" : ""}" @click=${() => this._selectSection(s.key)}>
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
            <div class="label">Plan</div>
            <div class="desc">You're on the Free plan — every core feature, no cost.</div>
          </div>
          <button class="btn-save-form" @click=${() => { this.comingSoonOpen = true; }}>Upgrade</button>
        </div>
      </div>

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

  // Two-factor auth (TOTP) and backup codes need a paid Clerk plan Foundr
  // isn't on yet — shown as "coming soon" rather than a setup flow that
  // would fail. See auth.service.ts for the underlying Clerk calls, which
  // are already written and ready to wire back in once that changes.
  private _renderMfaCard(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting">
          <div class="setting-info">
            <div class="label">Two-factor authentication</div>
            <div class="desc">A one-time code from an authenticator app each time you sign in, plus backup codes as a fallback.</div>
          </div>
          <span class="badge-soon">Coming soon</span>
        </div>
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
      ${this._renderEmailCard()}
      ${this._renderMfaCard()}
    `;
  }

  private _renderStartups(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Your startups</div>
          <div class="desc">Every side hustle you track on Foundr gets its own isolated dashboard — numbers never mix between them. Switch which one you're working in here.</div>
        </div>
        <div class="startup-list">
          ${this.businesses.map((b) =>
            this.renamingId === b._id
              ? html`
                  <div class="startup-row renaming">
                    <span class="startup-icon"><i class="ti ti-building-store" aria-hidden="true"></i></span>
                    <input
                      class="rename-input"
                      type="text"
                      .value=${this.renameValue}
                      @input=${(e: Event) => { this.renameValue = (e.target as HTMLInputElement).value; }}
                      ?disabled=${this.startupSaving}
                    />
                    <div class="startup-row-actions">
                      <button class="icon-btn" title="Save" @click=${() => this._saveRename(b._id)} ?disabled=${this.startupSaving}>
                        <i class="ti ti-check" aria-hidden="true"></i>
                      </button>
                      <button class="icon-btn" title="Cancel" @click=${this._cancelRename} ?disabled=${this.startupSaving}>
                        <i class="ti ti-x" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                `
              : html`
                  <div class="startup-row ${b._id === this.activeBusinessId ? "active" : ""}">
                    <span class="startup-icon"><i class="ti ti-building-store" aria-hidden="true"></i></span>
                    <span class="startup-name">${b.name}</span>
                    <div class="startup-row-actions">
                      <button class="icon-btn" title="Rename" @click=${() => this._startRename(b)} ?disabled=${this.startupSaving}>
                        <i class="ti ti-pencil" aria-hidden="true"></i>
                      </button>
                      <button
                        class="icon-btn danger"
                        title=${deleteBlockedReason(this.businesses, b._id, this.activeBusinessId) || "Delete"}
                        @click=${() => this._deleteStartup(b)}
                        ?disabled=${Boolean(deleteBlockedReason(this.businesses, b._id, this.activeBusinessId)) || this.startupSaving}
                      >
                        <i class="ti ti-trash" aria-hidden="true"></i>
                      </button>
                      ${b._id === this.activeBusinessId
                        ? html`<span class="badge"><i class="ti ti-check" aria-hidden="true"></i> Active</span>`
                        : html`<button class="btn-switch" @click=${() => this._switchBusiness(b._id)}>Switch</button>`}
                    </div>
                  </div>
                `
          )}
        </div>

        <form class="startup-add-form" @submit=${this._addStartup}>
          <span class="startup-icon"><i class="ti ti-building-store" aria-hidden="true"></i></span>
          <input
            type="text"
            class="startup-add-input"
            placeholder="e.g. The Coffee Cart"
            .value=${this.newStartupName}
            @input=${(e: Event) => { this.newStartupName = (e.target as HTMLInputElement).value; }}
            ?disabled=${this.startupSaving}
          />
          <button type="submit" class="btn-save-form" ?disabled=${this.startupSaving}>
            <i class="ti ti-plus" aria-hidden="true"></i>${this.startupSaving ? "Adding…" : "Add startup"}
          </button>
        </form>
        <div class="status ${this.startupError ? "err" : ""}">${this.startupError}</div>
      </div>

      <div class="card">
        <div class="setting">
          <div class="setting-info">
            <div class="label">Virtual tour</div>
            <div class="desc">A guided walkthrough of what each part of Foundr does.</div>
          </div>
          <button class="btn-save-form" @click=${() => startTour()}>Launch tour</button>
        </div>
      </div>
    `;
  }

  private _renderRecurring(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Recurring entries</div>
          <div class="desc">Expenses or revenue that repeat on a schedule — start one from "Add entry" and check "Make this recurring." Each appears automatically as a real entry when it comes due. Also manageable from the "Recurring" tab on All Entries.</div>
        </div>
        <foundr-recurring-list businessId=${this.activeBusinessId}></foundr-recurring-list>
      </div>
    `;
  }

  private _renderTrash(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Trash</div>
          <div class="desc">Deleted expenses, revenue, investments, draws, and debt entries land here first — restore one, or delete it forever. Also manageable from the "Deleted" tab on All Entries.</div>
        </div>
        <foundr-trash-list businessId=${this.activeBusinessId}></foundr-trash-list>
      </div>
    `;
  }

  private _renderActivity(): TemplateResult {
    const totalPages = Math.max(1, Math.ceil(this.activityTotal / ACTIVITY_PAGE_SIZE));
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Activity</div>
          <div class="desc">Who changed what and when, across every expense, revenue, investment, draw, debt, startup, category, and recurring rule.</div>
        </div>

        ${this.activityLoading
          ? html`<p class="hint">Loading…</p>`
          : this.activityItems.length === 0
            ? html`<p class="hint">Nothing recorded yet.</p>`
            : html`
                <div class="activity-list">
                  ${this.activityItems.map(
                    (a) => html`
                      <div class="activity-row">
                        <span class="activity-icon"><i class="ti ${this._actionIcon(a.action)}" aria-hidden="true"></i></span>
                        <div class="activity-info">
                          <div class="activity-summary">${a.summary}</div>
                        </div>
                        <div class="activity-time">${this._timeAgo(a.createdAt)}</div>
                      </div>
                    `
                  )}
                </div>
                ${totalPages > 1
                  ? html`
                      <div class="activity-pagination">
                        <button class="activity-page-btn" ?disabled=${this.activityPage <= 1}
                          @click=${() => this._loadActivity(this.activityPage - 1)}>Prev</button>
                        <span>Page ${this.activityPage} of ${totalPages}</span>
                        <button class="activity-page-btn" ?disabled=${this.activityPage >= totalPages}
                          @click=${() => this._loadActivity(this.activityPage + 1)}>Next</button>
                      </div>
                    `
                  : ""}
              `}
        <div class="status ${this.activityError ? "err" : ""}">${this.activityError}</div>
      </div>
    `;
  }

  private _renderMigrate(): TemplateResult {
    return html`
      <div class="card">
        <div class="setting-info">
          <div class="label">Migrate</div>
          <div class="desc">Bring in data from wherever you were tracking things before — a rulebook, a copy-pasteable AI prompt, and a JSON/CSV upload. Also reachable from the Actions menu on Dashboard and All Entries.</div>
        </div>
        <foundr-import-panel businessId=${this.activeBusinessId}></foundr-import-panel>
      </div>
    `;
  }

  render(): TemplateResult {
    let content: TemplateResult = html``;
    if (!this.loading) {
      if (this.section === "general") content = this._renderGeneral();
      else if (this.section === "profile") content = this._renderProfile();
      else if (this.section === "security") content = this._renderSecurity();
      else if (this.section === "startups") content = this._renderStartups();
      else if (this.section === "recurring") content = this._renderRecurring();
      else if (this.section === "trash") content = this._renderTrash();
      else if (this.section === "activity") content = this._renderActivity();
      else content = this._renderMigrate();
    }

    return html`
      <foundr-topbar active="settings" businessName=${this.businesses.find((b) => b._id === this.activeBusinessId)?.name ?? ""}></foundr-topbar>

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
          ${this.loading
            ? html`<div class="loader-overlay"><foundr-mini-loader></foundr-mini-loader></div>`
            : ""}
        </div>
      </div>

      <foundr-coming-soon-modal
        ?open=${this.comingSoonOpen}
        @close=${() => { this.comingSoonOpen = false; }}
      ></foundr-coming-soon-modal>
      <foundr-tour-overlay></foundr-tour-overlay>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-settings": FoundrSettings;
  }
}
