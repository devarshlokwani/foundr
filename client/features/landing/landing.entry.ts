import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./foundr-landing";
import "./foundr-loader";

/**
 * Landing page entry point.
 *
 * CTAs route to the real Clerk-backed auth pages.
 */
const app = document.querySelector("foundr-landing");

app?.addEventListener("get-started", () => {
  window.location.href = "/sign-up";
});
app?.addEventListener("sign-in", () => {
  window.location.href = "/sign-in";
});
