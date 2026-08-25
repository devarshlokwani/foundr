import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

type Reason = "sales" | "hiring" | "partnership" | "press" | "support" | "general";

interface ReasonOption {
  value: Reason;
  label: string;
  /** Meeting-worthy reasons get a live booking calendar instead of a form. */
  meeting: boolean;
}

const REASONS: ReasonOption[] = [
  { value: "sales", label: "Book a sales call", meeting: true },
  { value: "hiring", label: "Hiring me / a role for me", meeting: true },
  { value: "partnership", label: "Partnership or integration", meeting: true },
  { value: "support", label: "Bug report or support", meeting: false },
  { value: "press", label: "Press or media", meeting: false },
  { value: "general", label: "General inquiry", meeting: false },
];

const WEB3FORMS_ACCESS_KEY = "8ba9eb1b-1221-4c12-8df4-ca6909bb7134";

const CALCOM_BOOKING_URL = "https://cal.com/devarsh-lokwani-ggqkrm/30min";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * <foundr-contact>
 * The reason a visitor picks decides what they see next: a meeting-worthy
 * reason (sales, hiring, partnership) embeds a live Cal.com calendar so
 * they book a real open slot directly, no back-and-forth email needed.
 * Anything else shows a short message form that posts to Web3Forms, which
 * forwards it straight to the founder's inbox with no backend involved.
 */
@customElement("foundr-contact")
export class FoundrContact extends LitElement {
  @state() private reason: Reason = "sales";
  @state() private name = "";
  @state() private email = "";
  @state() private message = "";
  @state() private status: Status = "idle";
  @state() private error = "";

  private get _selected(): ReasonOption {
    return REASONS.find((r) => r.value === this.reason) ?? REASONS[0];
  }

  private _onReasonChange(e: Event): void {
    this.reason = (e.target as HTMLSelectElement).value as Reason;
    this.status = "idle";
    this.error = "";
  }

  private async _submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.name.trim()) {
      this.error = "Let us know your name.";
      return;
    }
    if (!this.email.includes("@")) {
      this.error = "Enter a valid email address.";
      return;
    }
    if (!this.message.trim()) {
      this.error = "Add a quick message so we know what you need.";
      return;
    }

    this.status = "sending";
    this.error = "";

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: `Foundr contact: ${this._selected.label}`,
          from_name: this.name,
          // Sets the notification email's Reply-To header, so replying to
          // it from your inbox goes straight to the visitor instead of
          // bouncing back to Web3Forms' own sending address.
          replyto: this.email,
          reason: this._selected.label,
          name: this.name,
          email: this.email,
          message: this.message,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Couldn't send that. Try again?");
      this.status = "sent";
    } catch (err) {
      this.status = "error";
      this.error = err instanceof Error ? err.message : "Couldn't send that. Try again?";
    }
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
    a { color: var(--forest, #2D4A3E); }

    .topbar { display: flex; align-items: center; justify-content: space-between; max-width: 640px; margin: 0 auto; padding: 28px 24px 0; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 18px; color: var(--ink, #1C1C1C); text-decoration: none; }
    .brand .mark {
      width: 30px; height: 30px; border-radius: 8px; background: var(--forest, #2D4A3E);
      color: #fff; display: grid; place-items: center; font-family: var(--font-display, serif); font-size: 16px;
    }
    .back-link {
      display: inline-flex; align-items: center; font-size: 14px; color: var(--ink, #1C1C1C);
      text-decoration: none; padding: 11px 18px; border-radius: var(--radius-pill, 999px);
      background: transparent; font-weight: 500;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .back-link:hover {
      background: rgba(45,74,62,0.07);
      transform: translate(-5px, -5px); box-shadow: 5px 5px 0 var(--sage, #8AAF9A);
    }
    .back-link:active { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }

    .wrap { max-width: 640px; margin: 0 auto; padding: 40px 24px 100px; }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: 38px; margin: 0 0 8px; line-height: 1.15; }
    .sub { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 32px; line-height: 1.55; max-width: 50ch; }

    .field { margin-bottom: 18px; }
    .field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 7px; }
    .field input, .field select, .field textarea {
      width: 100%; padding: 12px 14px; font-size: 15px; font-family: inherit;
      background: var(--surface, #FAFAF7); border: 1px solid var(--line, #E2DFD7);
      border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C); box-sizing: border-box;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .field textarea { resize: vertical; min-height: 110px; font-family: inherit; line-height: 1.5; }
    .field input:focus, .field select:focus, .field textarea:focus {
      outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1);
    }

    .submit-btn {
      width: 100%; background: var(--forest, #2D4A3E); color: #fff; border: none; cursor: pointer;
      border-radius: var(--radius-input, 14px); padding: 14px; font-size: 15px; font-weight: 500;
      font-family: inherit; margin-top: 4px; transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
    }
    .submit-btn:hover:not(:disabled) { background: var(--forest-deep, #1F3329); transform: translate(-4px, -4px); box-shadow: 4px 4px 0 var(--sage, #8AAF9A); }
    .submit-btn:active:not(:disabled) { transform: translate(0, 0); box-shadow: 1px 1px 0 var(--forest-deep, #1F3329); }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .error {
      background: #FBEAE9; color: #A8302B; border: 1px solid #F0C5C3;
      border-radius: 12px; padding: 11px 14px; font-size: 14px; margin-bottom: 18px; line-height: 1.45;
    }
    .sent {
      background: var(--sage-soft, #DDE7E0); color: var(--forest-deep, #1F3329); border: 1px solid var(--sage, #8AAF9A);
      border-radius: 12px; padding: 16px 18px; font-size: 14.5px; line-height: 1.55;
    }

    .booking-card {
      border: 1px solid var(--line, #E2DFD7); border-radius: 20px; overflow: hidden;
      background: var(--surface, #FAFAF7); box-shadow: 0 8px 28px -12px rgba(31,51,41,0.18);
    }
    .booking-frame { width: 100%; height: 640px; border: none; display: block; }
    .booking-fallback { padding: 40px 28px; text-align: center; }
    .booking-fallback p { font-size: 14.5px; color: var(--ink-soft, #6B6B66); margin: 0 0 18px; line-height: 1.5; }
    .booking-fallback a.cta {
      display: inline-block; background: var(--forest, #2D4A3E); color: #fff; text-decoration: none;
      border-radius: var(--radius-pill, 999px); padding: 12px 26px; font-size: 14.5px; font-weight: 500;
    }
  `;

  private _renderBooking(): TemplateResult {
    return html`
      <div class="booking-card">
        <iframe
          class="booking-frame"
          src="${CALCOM_BOOKING_URL}?embed=true&theme=light"
          title="Book a time"
        ></iframe>
      </div>
    `;
  }

  private _renderForm(): TemplateResult {
    if (this.status === "sent") {
      return html`<div class="sent">Thanks, that's sent. We'll reply at <strong>${this.email}</strong> soon.</div>`;
    }
    return html`
      ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ""}
      <form @submit=${this._submit}>
        <div class="field">
          <label for="name">Name</label>
          <input id="name" type="text" .value=${this.name}
            @input=${(e: Event) => { this.name = (e.target as HTMLInputElement).value; }}
            ?disabled=${this.status === "sending"} />
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" placeholder="you@example.com" .value=${this.email}
            @input=${(e: Event) => { this.email = (e.target as HTMLInputElement).value; }}
            ?disabled=${this.status === "sending"} />
        </div>
        <div class="field">
          <label for="message">Message</label>
          <textarea id="message" .value=${this.message}
            @input=${(e: Event) => { this.message = (e.target as HTMLTextAreaElement).value; }}
            ?disabled=${this.status === "sending"}></textarea>
        </div>
        <button class="submit-btn" type="submit" ?disabled=${this.status === "sending"}>
          ${this.status === "sending" ? "Sending…" : "Send message"}
        </button>
      </form>
    `;
  }

  render(): TemplateResult {
    return html`
      <div class="topbar">
        <a class="brand" href="/"><span class="mark">F</span>Foundr</a>
        <a class="back-link" href="/">Back to home</a>
      </div>
      <div class="wrap">
        <h1>Get in touch</h1>
        <p class="sub">
          Tell us what this is about and we'll route you the fastest way to a real answer:
          straight onto the calendar for anything worth talking through, or a direct message
          to the founder's inbox for everything else.
        </p>

        <div class="field">
          <label for="reason">What's this about?</label>
          <select id="reason" .value=${this.reason} @change=${this._onReasonChange}>
            ${REASONS.map((r) => html`<option value=${r.value} ?selected=${r.value === this.reason}>${r.label}</option>`)}
          </select>
        </div>

        ${this._selected.meeting ? this._renderBooking() : this._renderForm()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-contact": FoundrContact;
  }
}
