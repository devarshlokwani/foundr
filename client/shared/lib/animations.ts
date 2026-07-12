import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Animation foundation for Foundr.
 *
 * Lenis handles smooth scrolling. GSAP handles everything else — reveals,
 * hovers. The two must be synced: Lenis drives the scroll position and we
 * tell ScrollTrigger to update on each Lenis frame, otherwise scroll-reveal
 * triggers fire at the wrong place.
 *
 * Kept framework-agnostic so it carries straight into the React port.
 */

let lenis: Lenis | null = null;
let scrollLocked = false;

const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Initialise Lenis smooth scroll and wire it to GSAP ScrollTrigger. Safe to call once. */
export function initSmoothScroll(): Lenis | null {
  if (prefersReducedMotion()) return null;
  if (lenis) return lenis;

lenis = new Lenis({
    duration: 0.1,
    easing: (t: number): number => 1 - Math.pow(1 - t, 3),
    smoothWheel: true,
    wheelMultiplier: 0.5,
  });
  lenis.on("scroll", ScrollTrigger.update);

  gsap.ticker.add((time: number) => {
    lenis?.raf(time * 1000);
  });
  // Only stay frozen if the loader has an active lock right now; otherwise
  // Lenis starts normally. This makes init order-independent.
  if (scrollLocked) {
    lenis.stop();
  } else {
    lenis.start();
  }

  return lenis;
}

export function scrollToTarget(target: string | HTMLElement, offset = -80): void {
  if (lenis) {
    lenis.scrollTo(target, { offset });
    return;
  }
  // Fallback when smooth scroll is disabled (reduced motion)
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (el instanceof HTMLElement) {
    window.scrollTo({ top: el.offsetTop + offset, behavior: "auto" });
  }
}

export function resetScrollToTop(): void {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  window.scrollTo(0, 0);
  lenis?.scrollTo(0, { immediate: true });
}

export function lockScroll(): void {
  scrollLocked = true;
  lenis?.stop();
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

export function unlockScroll(): void {
  scrollLocked = false;
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  lenis?.start();
}
/**
 * Reveal elements on scroll with a gentle fade + rise.
 * `root` is the element (or shadow root) the selectors are queried within,
 * so it works inside a Lit component's shadow DOM.
 */
export function revealOnScroll(
  root: ParentNode,
  selector: string,
  opts: { y?: number; stagger?: number; duration?: number } = {}
): void {
  if (prefersReducedMotion()) return;
  const { y = 28, stagger = 0.08, duration = 0.7 } = opts;

  const els = root.querySelectorAll<HTMLElement>(selector);
  els.forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y,
      duration,
      ease: "power2.out",
      stagger,
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none none",
      },
    });
  });
}

/** Clean up all scroll-driven animations (call on disconnect). */
export function teardownAnimations(): void {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
}
