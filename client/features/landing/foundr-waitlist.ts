import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { joinWaitlist } from "../../shared/lib/waitlist";

/**
 * <foundr-waitlist>
 * A small modal that captures an email for the pre-launch waitlist.
 * Opened by the landing page's CTA buttons. On success it shows a friendly
 * confirmation instead of the form.
 */
@customElement("foundr-waitlist")
export class FoundrWaitlist extends LitElement {
  @property({ type: Boolean }) open = false;

  @state() private email = "";
  @state() private loading = false;
  @state() private error = "";
  @state() private done = false;

  private _close(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
    this.email = "";
    this.error = "";
    this.done = false;
  }

  private async _submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.email.includes("@")) {
      this.error = "Please enter a valid email.";
      return;
    }
    this.loading = true;
    this.error = "";
    const result = await joinWaitlist(this.email.trim());
    this.loading = false;
    if (!result.ok) {
      this.error = result.error ?? "Something went wrong.";
      return;
    }
    this.done = true;
  }

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: rgba(28,28,28,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 300; padding: 20px;
    }
    .modal {
      background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px);
      width: 100%; max-width: 420px; padding: 32px; box-shadow: 0 24px 60px -20px rgba(31,51,41,0.4);
      font-family: var(--font-body, "Inter", sans-serif); color: var(--ink, #1C1C1C); text-align: center;
    }
    .icon {
      width: 52px; height: 52px; border-radius: 14px; background: var(--sage-soft, #DDE7E0);
      color: var(--forest, #2D4A3E); display: grid; place-items: center; margin: 0 auto 18px; font-size: 24px;
    }
    h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: 26px; margin: 0 0 8px; }
    p { font-size: 15px; color: var(--ink-soft, #6B6B66); margin: 0 0 24px; line-height: 1.55; }
    form { display: flex; flex-direction: column; gap: 12px; }
    input {
      width: 100%; padding: 13px 15px; font-size: 15px; font-family: inherit; text-align: center;
      background: #fff; border: 1px solid var(--line, #E2DFD7); border-radius: var(--radius-input, 14px); color: var(--ink, #1C1C1C);
    }
    input:focus { outline: none; border-color: var(--forest, #2D4A3E); box-shadow: 0 0 0 3px rgba(45,74,62,0.1); }
    button { font-family: inherit; cursor: pointer; border: none; }
    .submit {
      width: 100%; background: var(--forest, #2D4A3E); color: #fff; padding: 14px;
      border-radius: var(--radius-input, 14px); font-size: 15px; font-weight: 500;
    }
    .submit:hover:not(:disabled) { background: var(--forest-deep, #1F3329); }
    .submit:disabled { opacity: 0.6; cursor: not-allowed; }
    .error { color: #A8302B; font-size: 14px; }
    .close { background: none; color: var(--ink-soft, #6B6B66); font-size: 14px; margin-top: 16px; }
    .close:hover { color: var(--ink, #1C1C1C); }
    .privacy { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-top: 4px; }
  `;

  render(): TemplateResult {
    if (!this.open) return html``;

    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._close(); }}>
        <div class="modal">
          ${this.done
            ? html`
                <div class="icon">✓</div>
                <h2>You're on the list</h2>
                <p>Thanks for your interest in Foundr. We'll email you the moment early access opens.</p>
                <button class="submit" @click=${this._close}>Done</button>
              `
            : html`
                <div class="icon">✦</div>
                <h2>Join the waitlist</h2>
                <p>Foundr is launching soon. Leave your email and we'll let you know the moment it's ready.</p>
                <form @submit=${this._submit}>
                  <input
                    type="email" placeholder="you@example.com" autocomplete="email"
                    .value=${this.email}
                    @input=${(e: Event) => { this.email = (e.target as HTMLInputElement).value; this.error = ""; }}
                    ?disabled=${this.loading}
                  />
                  ${this.error ? html`<div class="error">${this.error}</div>` : ""}
                  <button class="submit" type="submit" ?disabled=${this.loading}>
                    ${this.loading ? "Joining…" : "Notify me at launch"}
                  </button>
                </form>
                <div class="privacy">No spam. Just one email when we launch.</div>
                <button class="close" @click=${this._close}>Maybe later</button>
              `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-waitlist": FoundrWaitlist;
  }
}