import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./foundr-landing";

/**
 * Landing page entry point.
 * Registers the custom element and the icon font; the landing page's
 * auth buttons navigate to the auth pages.
 */
const app = document.querySelector("foundr-landing");

app?.addEventListener("get-started", () => {
  window.location.href = "/sign-up";
});

app?.addEventListener("sign-in", () => {
  window.location.href = "/sign-in";
});