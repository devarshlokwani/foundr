import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./foundr-landing";
import "./foundr-waitlist";
import "./foundr-loader";
import type { FoundrWaitlist } from "./foundr-waitlist";

/**
 * Landing page entry point (pre-launch).
 *
 * Both CTAs open the waitlist modal instead of auth pages.
 * When we launch, switch these back to /sign-up and /sign-in.
 */
const app = document.querySelector("foundr-landing");

// Create the waitlist modal once and append it to the page.
const waitlist = document.createElement("foundr-waitlist") as FoundrWaitlist;
document.body.appendChild(waitlist);
document.body.appendChild(document.createElement("foundr-loader"));

function openWaitlist(): void {
  waitlist.open = true;
}

waitlist.addEventListener("close", () => {
  waitlist.open = false;
});

app?.addEventListener("get-started", openWaitlist);
app?.addEventListener("sign-in", openWaitlist);