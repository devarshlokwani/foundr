import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { gsap } from "gsap";
import type { Metric, Step, Feature, Plan, Faq } from "../../shared/lib/types";
import {
  initSmoothScroll,
  scrollToTarget,
  revealOnScroll,
  teardownAnimations,
} from "../../shared/lib/animations";

/**
 * <foundr-landing>
 * Full marketing landing page for Foundr.
 *
 * React-ready: data lives in typed reactive `@property` fields (≈ props/state),
 * each section is its own render method (≈ a child component), and auth actions
 * fire typed custom events that will later call Clerk.
 *
 * GSAP powers the metric rotation and scroll-reveal animations.
 */
@customElement("foundr-landing")
export class FoundrLanding extends LitElement {
  @property({ type: Array }) metrics: Metric[] = [
    { label: "Burn rate", value: "$4.2K", tone: "neutral" },
    { label: "Runway", value: "7 months", tone: "warn" },
    { label: "ROI on your money", value: "+18%", tone: "good" },
    { label: "Gross margin", value: "62%", tone: "good" },
  ];

  @property({ type: Array }) steps: Step[] = [
    {
      n: "01",
      title: "Record what you spend",
      body: "Add an amount, pick a category. That's the whole input. Takes seconds, no accounting knowledge needed.",
      icon: "ti-pencil",
    },
    {
      n: "02",
      title: "We do the math",
      body: "Foundr turns your raw numbers into the metrics that matter, burn, runway, ROI, margins, and more.",
      icon: "ti-calculator",
    },
    {
      n: "03",
      title: "Know where you stand",
      body: "See it all on one clean dashboard. Catch problems early, and know if your money is coming back.",
      icon: "ti-chart-line",
    },
  ];

  @property({ type: Array }) features: Feature[] = [
    { icon: "ti-flame", title: "Burn rate", body: "See exactly how fast you're spending, month over month." },
    { icon: "ti-clock", title: "Runway", body: "Know how many months of cash you have left at your current pace." },
    { icon: "ti-trending-up", title: "Personal ROI", body: "Track the money you put in and whether it's coming back." },
    { icon: "ti-percentage", title: "Margins & EBITDA", body: "Business metrics made plain, no finance degree required." },
    { icon: "ti-category", title: "Spending by category", body: "See where every rupee goes, grouped automatically." },
    { icon: "ti-flag", title: "Milestones", body: "Set targets like 'break even' and watch your progress." },
  ];

  @property({ type: Array }) plans: Plan[] = [
    {
      name: "Starter",
      price: "Free",
      sub: "at launch",
      tagline: "For founders just getting going",
      features: ["Track 1 business", "All core metrics", "Manual entry", "Up to 50 transactions/mo"],
      cta: "Join the waitlist",
      featured: false,
    },
    {
      name: "Founder",
      price: "The full toolkit",
      sub: "",
      tagline: "For founders ready to scale",
      features: [
        "Everything in Starter",
        "Unlimited businesses",
        "Unlimited transactions",
        "Milestones & goals",
        "Export reports",
      ],
      cta: "Join the waitlist",
      featured: true,
    },
    {
      name: "Growth",
      price: "On the roadmap",
      sub: "",
      tagline: "Auto-sync, no manual entry",
      features: ["Everything in Founder", "Shopify integration", "Auto-tracked sales", "Bank sync", "Early access list"],
      cta: "Join the waitlist",
      featured: false,
    },
  ];

  @property({ type: Array }) faqs: Faq[] = [
    {
      q: "Do I need any accounting knowledge?",
      a: "None at all. Foundr is built for founders, not accountants. You enter what you spent and we translate it into the metrics that matter, in plain language.",
    },
    {
      q: "What exactly do I have to enter?",
      a: "Just the amount and a category for each expense or bit of income. That's it. We handle every calculation from there.",
    },
    {
      q: "Will this connect to Shopify or my bank?",
      a: "That's on the way. Right now Foundr works on the numbers you enter yourself. Automatic Shopify and bank sync are coming on the Growth plan, join the waitlist to get early access.",
    },
    {
      q: "Is my financial data safe?",
      a: "Yes. Your data is encrypted, private to your account, and never sold. You can export or delete it any time.",
    },
    {
      q: "Can I track more than one business?",
      a: "On the free plan you track one. The Founder plan lets you track as many separate ventures as you like, each with its own dashboard.",
    },
  ];

  @state() private activeMetric = 0;
  @state() private openFaq = -1;

  private _rotator?: ReturnType<typeof setInterval>;

  connectedCallback(): void {
    super.connectedCallback();
    this._rotator = setInterval(() => {
      this.activeMetric = (this.activeMetric + 1) % this.metrics.length;
    }, 2600);
  }

  disconnectedCallback(): void {
    if (this._rotator) clearInterval(this._rotator);
    teardownAnimations();
    super.disconnectedCallback();
  }

  // Set up smooth scroll, scroll-reveal, and button micro-interactions
  // after the first render, once nodes exist in the shadow root.
  firstUpdated(): void {
    initSmoothScroll();

    revealOnScroll(this.renderRoot, ".step");
    revealOnScroll(this.renderRoot, ".feature");
    revealOnScroll(this.renderRoot, ".plan");
    revealOnScroll(this.renderRoot, ".sec-head");
    revealOnScroll(this.renderRoot, ".split > div");

    this._setupButtonHovers();
  }

  // GSAP-driven hover lift on every pill button (smoother than CSS alone)
  private _setupButtonHovers(): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const buttons = this.renderRoot.querySelectorAll<HTMLElement>(
      ".btn-primary, .btn-ghost, .btn-outline, .btn-light"
    );
    buttons.forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        gsap.to(btn, { y: -2, duration: 0.25, ease: "power2.out" });
      });
      btn.addEventListener("mouseleave", () => {
        gsap.to(btn, { y: 0, duration: 0.3, ease: "power2.out" });
      });
    });
  }

  // Intercept in-page nav links. Targets live in the shadow DOM, so native
  // hash navigation can't reach them — we scroll manually via Lenis and
  // still update the URL hash for shareable links / back button.
  private _navClick(e: Event, hash: string): void {
    e.preventDefault();
    const target = this.renderRoot.querySelector<HTMLElement>(hash);
    if (target) {
      scrollToTarget(target);
      history.replaceState(null, "", hash);
    }
  }

  // Opens the waitlist modal (both CTAs use this pre-launch).
  private _getStarted(): void {
    this.dispatchEvent(new CustomEvent("get-started", { bubbles: true, composed: true }));
  }
  private _toggleFaq(i: number): void {
    this.openFaq = this.openFaq === i ? -1 : i;
  }

  static styles = css`
    :host {
      display: block;
      background: var(--bg, #ECEAE3);
      color: var(--ink, #1C1C1C);
      font-family: var(--font-body, "Inter", sans-serif);
      -webkit-font-smoothing: antialiased;
    }

    /* Tabler icon rules — needed inside the shadow root since global CSS
       can't cross the shadow boundary. The @font-face itself is loaded
       globally (bundled via main.ts); these map the .ti classes to glyphs. */
    .ti {
      font-family: "tabler-icons" !important;
      font-style: normal;
      font-weight: normal;
      font-variant: normal;
      text-transform: none;
      line-height: 1;
      speak: none;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .ti-pencil:before { content: "\\eb04"; }
    .ti-calculator:before { content: "\\eb80"; }
    .ti-chart-line:before { content: "\\ea5c"; }
    .ti-flame:before { content: "\\ec2c"; }
    .ti-clock:before { content: "\\ea70"; }
    .ti-trending-up:before { content: "\\eb43"; }
    .ti-percentage:before { content: "\\ecf4"; }
    .ti-category:before { content: "\\f1f6"; }
    .ti-flag:before { content: "\\eaa6"; }
    .ti-check:before { content: "\\ea5e"; }
    .ti-plus:before { content: "\\eb0b"; }

    .wrap { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
    section { scroll-margin-top: 90px; }

    button { font-family: inherit; cursor: pointer; border: none; transition: transform 0.12s ease, background 0.2s ease, box-shadow 0.2s ease; }
    button:active { transform: scale(0.97); }
    a { color: inherit; text-decoration: none; }
    .btn-primary { background: var(--forest, #2D4A3E); color: #fff; padding: 12px 22px; border-radius: var(--radius-pill, 999px); font-size: 14px; font-weight: 500; }
    .btn-primary:hover { background: var(--forest-deep, #1F3329); box-shadow: 0 10px 22px -8px rgba(31,51,41,0.45); transform: translateY(-2px); }
    .btn-primary:active { transform: translateY(0) scale(0.98); box-shadow: 0 4px 10px -6px rgba(31,51,41,0.4); }
    .btn-primary.lg { padding: 15px 28px; font-size: 15px; }
    .btn-ghost { background: transparent; color: var(--ink, #1C1C1C); padding: 11px 18px; border-radius: var(--radius-pill, 999px); font-size: 14px; font-weight: 500; }
    .btn-ghost:hover { background: rgba(45,74,62,0.07); }

    .nav { position: sticky; top: 0; z-index: 50; background: rgba(236,234,227,0.82); backdrop-filter: blur(10px); border-bottom: 0.5px solid var(--line, #E2DFD7); }
    .nav-inner { max-width: 1180px; margin: 0 auto; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 20px; letter-spacing: -0.02em; }
    .brand .mark { width: 30px; height: 30px; border-radius: 9px; background: var(--forest, #2D4A3E); display: grid; place-items: center; color: #fff; font-family: var(--font-display, serif); font-size: 17px; }
    .nav-links { display: flex; align-items: center; gap: 28px; }
    .nav-links a { font-size: 14px; color: var(--ink-soft, #6B6B66); position: relative; transition: color 0.2s ease; }
    .nav-links a::after {
      content: ""; position: absolute; left: 0; bottom: -4px; height: 2px; width: 100%;
      background: var(--forest, #2D4A3E); border-radius: 2px;
      transform: scaleX(0); transform-origin: right; transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
    }
    .nav-links a:hover { color: var(--ink, #1C1C1C); }
    .nav-links a:hover::after { transform: scaleX(1); transform-origin: left; }
    .nav-actions { display: flex; align-items: center; gap: 10px; }
    @media (max-width: 760px) { .nav-menu { display: none; } }

    .hero { padding: 56px 0 88px; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 56px; align-items: center; }
    .eyebrow { display: inline-flex; align-items: center; gap: 8px; background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); padding: 7px 14px; border-radius: var(--radius-pill, 999px); font-size: 13px; font-weight: 500; margin-bottom: 24px; }
    .eyebrow .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--forest, #2D4A3E); }
    h1 { font-family: var(--font-display, serif); font-weight: 400; font-size: clamp(40px, 5vw, 60px); line-height: 1.05; letter-spacing: -0.01em; margin: 0 0 20px; }
    h1 .accent { color: var(--forest, #2D4A3E); font-style: italic; }
    .sub { font-size: 18px; line-height: 1.6; color: var(--ink-soft, #6B6B66); max-width: 480px; margin: 0 0 32px; }
    .cta-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .trust { margin-top: 28px; font-size: 13px; color: var(--ink-soft, #6B6B66); }

    .preview { background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px); padding: 26px; box-shadow: var(--shadow-soft, 0 18px 50px -20px rgba(31,51,41,0.25)); }
    .preview-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
    .preview-greet { font-size: 15px; font-weight: 600; }
    .preview-greet span { color: var(--ink-soft, #6B6B66); font-weight: 400; display: block; font-size: 12px; margin-top: 2px; }
    .preview-avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--forest, #2D4A3E); color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 600; }
    .metric-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
    .metric { background: var(--surface-alt, #F2EFE8); border-radius: 16px; padding: 14px 16px; transition: background 0.4s ease, color 0.4s ease; }
    .metric.live { background: var(--forest, #2D4A3E); color: #fff; }
    .metric .m-label { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-bottom: 6px; }
    .metric.live .m-label { color: rgba(255,255,255,0.7); }
    .metric .m-value { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
    .m-tone { font-size: 12px; margin-top: 4px; font-weight: 500; }
    .tone-good { color: var(--positive, #4F8A6B); }
    .tone-warn { color: #C98A2B; }
    .tone-neutral { color: var(--ink-soft, #6B6B66); }
    .metric.live .m-tone { color: var(--sage, #8AAF9A); }
    .spark { background: var(--surface-alt, #F2EFE8); border-radius: 16px; padding: 16px; }
    .spark-label { font-size: 12px; color: var(--ink-soft, #6B6B66); margin-bottom: 10px; display: flex; justify-content: space-between; }
    .spark svg { display: block; width: 100%; height: 56px; }

    .trustbar { padding: 24px 0 8px; }
    .trustbar-inner { display: flex; align-items: center; justify-content: center; gap: 40px; flex-wrap: wrap; font-size: 13px; color: var(--ink-soft, #6B6B66); }
    .trustbar-inner .stat strong { color: var(--ink, #1C1C1C); font-weight: 600; }

    .sec-head { text-align: center; max-width: 640px; margin: 0 auto 48px; }
    .sec-label { font-size: 13px; font-weight: 500; color: var(--forest, #2D4A3E); letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 12px; }
    .sec-title { font-family: var(--font-display, serif); font-weight: 400; font-size: clamp(28px, 3.4vw, 40px); line-height: 1.12; margin: 0 0 14px; }
    .sec-sub { font-size: 17px; line-height: 1.6; color: var(--ink-soft, #6B6B66); margin: 0; }

    .pad { padding: 80px 0; }
    .pad-sm { padding: 56px 0; }

    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .step { background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px); padding: 28px; box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18)); }
    .step-icon { width: 46px; height: 46px; border-radius: 13px; background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); display: grid; place-items: center; font-size: 22px; margin-bottom: 18px; }
    .step-n { font-size: 13px; font-weight: 600; color: var(--sage, #8AAF9A); margin-bottom: 6px; letter-spacing: 0.05em; }
    .step h3 { font-size: 18px; font-weight: 600; margin: 0 0 10px; }
    .step p { font-size: 15px; line-height: 1.6; color: var(--ink-soft, #6B6B66); margin: 0; }

    .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .feature { background: var(--surface, #FAFAF7); border-radius: 18px; padding: 24px; border: 0.5px solid var(--line, #E2DFD7); }
    .feature-icon { width: 40px; height: 40px; border-radius: 11px; background: var(--forest, #2D4A3E); color: #fff; display: grid; place-items: center; font-size: 19px; margin-bottom: 16px; }
    .feature h3 { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
    .feature p { font-size: 14px; line-height: 1.55; color: var(--ink-soft, #6B6B66); margin: 0; }

    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
    .split .sec-title { font-size: clamp(26px, 3vw, 36px); }
    .checklist { list-style: none; padding: 0; margin: 24px 0 0; }
    .checklist li { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; font-size: 16px; line-height: 1.5; }
    .checklist .tick { flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%; background: var(--sage-soft, #DDE7E0); color: var(--forest, #2D4A3E); display: grid; place-items: center; font-size: 14px; margin-top: 1px; }
    .checklist strong { font-weight: 600; }
    .checklist span.muted { color: var(--ink-soft, #6B6B66); }
    .panel { background: var(--forest, #2D4A3E); border-radius: var(--radius-card, 24px); padding: 32px; color: #fff; }
    .panel-row { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 0.5px solid rgba(255,255,255,0.12); }
    .panel-row:last-child { border-bottom: none; }
    .panel-row .pr-label { font-size: 14px; color: rgba(255,255,255,0.75); }
    .panel-row .pr-value { font-size: 18px; font-weight: 600; }
    .panel-row .pr-value.good { color: var(--sage, #8AAF9A); }

    .plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: start; }
    .plan { background: var(--surface, #FAFAF7); border-radius: var(--radius-card, 24px); padding: 30px; border: 0.5px solid var(--line, #E2DFD7); position: relative; }
    .plan.featured { border: 2px solid var(--forest, #2D4A3E); box-shadow: var(--shadow-card, 0 8px 28px -12px rgba(31,51,41,0.18)); }
    .plan-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: var(--forest, #2D4A3E); color: #fff; font-size: 12px; font-weight: 500; padding: 5px 14px; border-radius: var(--radius-pill, 999px); }
    .plan h3 { font-size: 18px; font-weight: 600; margin: 0 0 6px; }
    .plan-tagline { font-size: 13px; color: var(--ink-soft, #6B6B66); margin: 0 0 20px; min-height: 18px; }
    .plan-price { display: flex; align-items: baseline; gap: 6px; margin-bottom: 22px; }
    .plan-price .amt { font-family: var(--font-display, serif); font-size: 36px; }
    .plan-price .per { font-size: 14px; color: var(--ink-soft, #6B6B66); }
    .plan-features { list-style: none; padding: 0; margin: 0 0 24px; }
    .plan-features li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.5; margin-bottom: 12px; color: var(--ink, #1C1C1C); }
    .plan-features .tick { color: var(--forest, #2D4A3E); flex-shrink: 0; font-size: 16px; margin-top: 1px; }
    .plan button { width: 100%; }
    .btn-outline { background: transparent; color: var(--forest, #2D4A3E); border: 1px solid var(--forest, #2D4A3E); padding: 12px 22px; border-radius: var(--radius-pill, 999px); font-size: 14px; font-weight: 500; }
    .btn-outline:hover { background: rgba(45,74,62,0.06); }

    .faq-list { max-width: 760px; margin: 0 auto; }
    .faq-item { border-bottom: 0.5px solid var(--line, #E2DFD7); }
    .faq-q { width: 100%; text-align: left; background: transparent; padding: 22px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 17px; font-weight: 500; color: var(--ink, #1C1C1C); }
    .faq-q i { color: var(--forest, #2D4A3E); font-size: 20px; transition: transform 0.2s ease; flex-shrink: 0; }
    .faq-q.open i { transform: rotate(45deg); }
    .faq-a { max-height: 0; overflow: hidden; transition: max-height 0.28s ease, padding 0.28s ease; }
    .faq-a.open { max-height: 240px; padding: 0 0 22px; }
    .faq-a p { margin: 0; font-size: 16px; line-height: 1.6; color: var(--ink-soft, #6B6B66); max-width: 92%; }

    .final { background: var(--forest, #2D4A3E); border-radius: var(--radius-card, 24px); padding: 64px 40px; text-align: center; color: #fff; margin: 40px 0; }
    .final h2 { font-family: var(--font-display, serif); font-weight: 400; font-size: clamp(30px, 4vw, 44px); line-height: 1.1; margin: 0 0 16px; }
    .final p { font-size: 18px; color: rgba(255,255,255,0.78); margin: 0 0 32px; max-width: 460px; margin-left: auto; margin-right: auto; }
    .btn-light { background: #fff; color: var(--forest, #2D4A3E); padding: 15px 30px; border-radius: var(--radius-pill, 999px); font-size: 15px; font-weight: 600; }
    .btn-light:hover { background: #F2EFE8; box-shadow: 0 10px 22px -8px rgba(0,0,0,0.25); transform: translateY(-2px); }
    .btn-light:active { transform: translateY(0) scale(0.98); }
    .final .fineprint { margin-top: 18px; font-size: 13px; color: rgba(255,255,255,0.6); }

    .footer { border-top: 0.5px solid var(--line, #E2DFD7); padding: 48px 0 40px; }
    .footer-inner { display: flex; justify-content: space-between; gap: 40px; flex-wrap: wrap; }
    .footer-brand { max-width: 280px; }
    .footer-brand p { font-size: 14px; line-height: 1.6; color: var(--ink-soft, #6B6B66); margin: 14px 0 0; }
    .footer-cols { display: flex; gap: 56px; flex-wrap: wrap; }
    .footer-col h4 { font-size: 13px; font-weight: 600; margin: 0 0 14px; letter-spacing: 0.03em; }
    .footer-col a { display: block; font-size: 14px; color: var(--ink-soft, #6B6B66); margin-bottom: 10px; }
    .footer-col a:hover { color: var(--ink, #1C1C1C); }
    .footer-bottom { max-width: 1180px; margin: 36px auto 0; padding: 20px 32px 0; border-top: 0.5px solid var(--line, #E2DFD7); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--ink-soft, #6B6B66); }

    @media (max-width: 880px) {
      .hero { grid-template-columns: 1fr; gap: 40px; padding: 40px 0 56px; }
      .preview { order: -1; }
      .steps, .features, .plans { grid-template-columns: 1fr; }
      .split { grid-template-columns: 1fr; gap: 32px; }
      .plan.featured { order: -1; }
    }
    @media (prefers-reduced-motion: reduce) {
      button, .metric, .faq-q i, .faq-a { transition: none; }
    }
  `;

  private _renderMetric(m: Metric, i: number): TemplateResult {
    const live = i === this.activeMetric;
    const toneText = m.tone === "good" ? "On track" : m.tone === "warn" ? "Watch this" : "Steady";
    return html`
      <div class="metric ${live ? "live" : ""}">
        <div class="m-label">${m.label}</div>
        <div class="m-value">${m.value}</div>
        <div class="m-tone tone-${m.tone}">${toneText}</div>
      </div>
    `;
  }

  private _renderNav(): TemplateResult {
    return html`
      <nav class="nav">
        <div class="nav-inner">
          <a class="brand" href="#top" @click=${(e: Event) => this._navClick(e, "#top")}><span class="mark">F</span>Foundr</a>
          <div class="nav-links nav-menu">
            <a href="#how" @click=${(e: Event) => this._navClick(e, "#how")}>How it works</a>
            <a href="#features" @click=${(e: Event) => this._navClick(e, "#features")}>Features</a>
            <a href="#pricing" @click=${(e: Event) => this._navClick(e, "#pricing")}>Plans</a>
            <a href="#faq" @click=${(e: Event) => this._navClick(e, "#faq")}>FAQ</a>
          </div>
          <div class="nav-actions">
            <button class="btn-primary" @click=${this._getStarted}>Join the waitlist</button>
          </div>
        </div>
      </nav>
    `;
  }

  private _renderHero(): TemplateResult {
    return html`
      <section class="hero" id="top">
        <div class="hero-copy">
          <div class="eyebrow"><span class="dot"></span>Built for solo founders</div>
          <h1>Know exactly where<br />your <span class="accent">money</span> stands.</h1>
          <p class="sub">
            You're funding the dream yourself. Foundr turns the numbers you
            already track on paper into clear metrics, burn, runway, ROI, and
            margins, so you always know if it's working.
          </p>
          <div class="cta-row">
            <button class="btn-primary lg" @click=${this._getStarted}>Join the waitlist</button>
          </div>
          <p class="trust">Launching soon · Be the first to know when early access opens</p>
        </div>

        <div class="preview" role="img" aria-label="Preview of the Foundr dashboard showing live financial metrics">
          <div class="preview-head">
            <div class="preview-greet">Hello, founder<span>Here's your business today</span></div>
            <div class="preview-avatar">YO</div>
          </div>
          <div class="metric-strip">${this.metrics.map((m, i) => this._renderMetric(m, i))}</div>
          <div class="spark">
            <div class="spark-label"><span>Cash over time</span><span>Last 6 months</span></div>
            <svg viewBox="0 0 280 56" preserveAspectRatio="none" aria-hidden="true">
              <polyline fill="none" stroke="#2D4A3E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="0,44 46,38 93,42 140,28 186,32 233,16 280,20" />
              <polyline fill="rgba(45,74,62,0.07)" stroke="none" points="0,44 46,38 93,42 140,28 186,32 233,16 280,20 280,56 0,56" />
            </svg>
          </div>
        </div>
      </section>
    `;
  }

  private _renderTrustBar(): TemplateResult {
    return html`
      <section class="trustbar">
        <div class="wrap">
          <div class="trustbar-inner">
            <span class="stat"><strong>Built for solo founders</strong></span>
            <span class="stat"><strong>Self-funded</strong>, not VC-backed</span>
            <span class="stat"><strong>Launching 2026</strong></span>
          </div>
        </div>
      </section>
    `;
  }

  private _renderHowItWorks(): TemplateResult {
    return html`
      <section class="pad" id="how">
        <div class="wrap">
          <div class="sec-head">
            <div class="sec-label">How it works</div>
            <h2 class="sec-title">From scattered numbers to a clear picture</h2>
            <p class="sec-sub">No spreadsheets. No accounting jargon. Three simple steps from messy notes to real insight.</p>
          </div>
          <div class="steps">
            ${this.steps.map(
              (s) => html`
                <div class="step">
                  <div class="step-icon"><i class="ti ${s.icon}" aria-hidden="true"></i></div>
                  <div class="step-n">${s.n}</div>
                  <h3>${s.title}</h3>
                  <p>${s.body}</p>
                </div>
              `
            )}
          </div>
        </div>
      </section>
    `;
  }

  private _renderFeatures(): TemplateResult {
    return html`
      <section class="pad" id="features" style="background: var(--surface-alt, #F2EFE8);">
        <div class="wrap">
          <div class="sec-head">
            <div class="sec-label">Features</div>
            <h2 class="sec-title">Every number a founder needs</h2>
            <p class="sec-sub">The metrics that tell you whether your business is healthy, calculated for you, explained in plain words.</p>
          </div>
          <div class="features">
            ${this.features.map(
              (f) => html`
                <div class="feature">
                  <div class="feature-icon"><i class="ti ${f.icon}" aria-hidden="true"></i></div>
                  <h3>${f.title}</h3>
                  <p>${f.body}</p>
                </div>
              `
            )}
          </div>
        </div>
      </section>
    `;
  }

  private _renderExplainer(): TemplateResult {
    return html`
      <section class="pad">
        <div class="wrap">
          <div class="split">
            <div>
              <div class="sec-label">Why Foundr</div>
              <h2 class="sec-title">You put your own money in. Know if it's coming back.</h2>
              <p class="sec-sub">Most finance tools are built for funded startups with accountants. Foundr is built for you, the founder paying for the dream out of your own pocket.</p>
              <ul class="checklist">
                <li><span class="tick"><i class="ti ti-check" aria-hidden="true"></i></span><span><strong>Track your personal stake.</strong> <span class="muted">See the money you've invested and exactly how much has come back.</span></span></li>
                <li><span class="tick"><i class="ti ti-check" aria-hidden="true"></i></span><span><strong>Catch trouble early.</strong> <span class="muted">A shrinking runway shows up before it becomes a crisis.</span></span></li>
                <li><span class="tick"><i class="ti ti-check" aria-hidden="true"></i></span><span><strong>Made to be simple.</strong> <span class="muted">If you can write a number on paper, you can use Foundr.</span></span></li>
              </ul>
            </div>
            <div class="panel" aria-hidden="true">
              <div class="panel-row"><span class="pr-label">Total invested</span><span class="pr-value">$45,000</span></div>
              <div class="panel-row"><span class="pr-label">Returned so far</span><span class="pr-value good">$29,700</span></div>
              <div class="panel-row"><span class="pr-label">Net position</span><span class="pr-value">−$15,300</span></div>
              <div class="panel-row"><span class="pr-label">Personal ROI</span><span class="pr-value good">+18% this qtr</span></div>
              <div class="panel-row"><span class="pr-label">Break-even target</span><span class="pr-value">Sep 2026</span></div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private _renderPricing(): TemplateResult {
    return html`
      <section class="pad" id="pricing" style="background: var(--surface-alt, #F2EFE8);">
        <div class="wrap">
          <div class="sec-head">
            <div class="sec-label">Plans</div>
            <h2 class="sec-title">What you'll get at launch.</h2>
            <p class="sec-sub">Foundr is in the works. Here's what each plan will include, join the waitlist to get early access.</p>
          </div>
          <div class="plans">
            ${this.plans.map(
              (p) => html`
                <div class="plan ${p.featured ? "featured" : ""}">
                  ${p.featured ? html`<div class="plan-badge">Most popular</div>` : ""}
                  <h3>${p.name}</h3>
                  <p class="plan-tagline">${p.tagline}</p>
                  <div class="plan-price">
                    <span class="amt">${p.price}</span>
                    ${p.sub ? html`<span class="per">${p.sub}</span>` : ""}
                  </div>
                  <ul class="plan-features">
                    ${p.features.map(
                      (f: string) => html`<li><span class="tick"><i class="ti ti-check" aria-hidden="true"></i></span>${f}</li>`
                    )}
                  </ul>
                  <button class="${p.featured ? "btn-primary" : "btn-outline"}" @click=${this._getStarted}>${p.cta}</button>
                </div>
              `
            )}
          </div>
        </div>
      </section>
    `;
  }

  private _renderFaq(): TemplateResult {
    return html`
      <section class="pad" id="faq">
        <div class="wrap">
          <div class="sec-head">
            <div class="sec-label">FAQ</div>
            <h2 class="sec-title">Questions, answered</h2>
          </div>
          <div class="faq-list">
            ${this.faqs.map(
              (f, i) => html`
                <div class="faq-item">
                  <button
                    class="faq-q ${this.openFaq === i ? "open" : ""}"
                    @click=${() => this._toggleFaq(i)}
                    aria-expanded=${this.openFaq === i}
                  >
                    ${f.q}<i class="ti ti-plus" aria-hidden="true"></i>
                  </button>
                  <div class="faq-a ${this.openFaq === i ? "open" : ""}"><p>${f.a}</p></div>
                </div>
              `
            )}
          </div>
        </div>
      </section>
    `;
  }

  private _renderFinalCta(): TemplateResult {
    return html`
      <section class="pad-sm">
        <div class="wrap">
          <div class="final">
            <h2>Your business deserves to be understood.</h2>
            <p>Stop guessing on paper. Start seeing your numbers clearly today.</p>
            <button class="btn-light" @click=${this._getStarted}>Join the waitlist</button>
            <p class="fineprint">Be first in line when early access opens</p>
          </div>
        </div>
      </section>
    `;
  }

  private _renderFooter(): TemplateResult {
    return html`
      <footer class="footer">
        <div class="wrap">
          <div class="footer-inner">
            <div class="footer-brand">
              <a class="brand" href="#top" @click=${(e: Event) => this._navClick(e, "#top")}><span class="mark">F</span>Foundr</a>
              <p>The simple finance tracker built for solo founders funding their own dream.</p>
            </div>
            <div class="footer-cols">
              <div class="footer-col">
                <h4>Product</h4>
                <a href="#how" @click=${(e: Event) => this._navClick(e, "#how")}>How it works</a>
                <a href="#features" @click=${(e: Event) => this._navClick(e, "#features")}>Features</a>
                <a href="#pricing" @click=${(e: Event) => this._navClick(e, "#pricing")}>Plans</a>
              </div>
              <div class="footer-col">
                <h4>Get in touch</h4>
                <a href="#" @click=${(e: Event) => { e.preventDefault(); this._getStarted(); }}>Join the waitlist</a>
                <a href="#" @click=${(e: Event) => { e.preventDefault(); this._getStarted(); }}>Contact</a>
              </div>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} Foundr. All rights reserved.</span>
          <span>Made for founders, by founders.</span>
        </div>
      </footer>
    `;
  }

  render(): TemplateResult {
    return html`
      ${this._renderNav()}
      <div class="wrap">${this._renderHero()}</div>
      ${this._renderTrustBar()}
      ${this._renderHowItWorks()}
      ${this._renderFeatures()}
      ${this._renderExplainer()}
      ${this._renderPricing()}
      ${this._renderFaq()}
      ${this._renderFinalCta()}
      ${this._renderFooter()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "foundr-landing": FoundrLanding;
  }
}