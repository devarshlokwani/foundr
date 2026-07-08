import { Clerk } from "@clerk/clerk-js";

/**
 * Clerk integration for Foundr.
 *
 * Keeps all auth logic in one place, separate from the UI components.
 * The custom auth forms call these functions; Clerk handles the actual
 * authentication, sessions, and tokens.
 *
 * Needs a publishable key. Add to .env at the project root:
 *   VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
 * (Vite only exposes env vars prefixed with VITE_ to the browser.)
 *
 * React-ready: swap this file's imports for @clerk/clerk-react later;
 * the component code that calls these functions barely changes.
 */

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;


let clerk: Clerk | null = null;
let loadPromise: Promise<Clerk | null> | null = null;

/** Load and initialise Clerk once. Returns null if no key is configured. */
export function getClerk(): Promise<Clerk | null> {
  if (loadPromise) return loadPromise;

  loadPromise = (async (): Promise<Clerk | null> => {
    if (!PUBLISHABLE_KEY) {
      console.warn(
        "[auth] No VITE_CLERK_PUBLISHABLE_KEY set. Auth UI will render but submitting won't work. Add the key to your .env."
      );
      return null;
    }
    clerk = new Clerk(PUBLISHABLE_KEY);
    await clerk.load();
    return clerk;
  })();

  return loadPromise;
}

/** Whether a user is currently signed in. */
export async function isSignedIn(): Promise<boolean> {
  const c = await getClerk();
  return Boolean(c?.user);
}

/**
 * Get Clerk's `client` object, guaranteed defined.
 * Returns null (with a friendly message) when auth isn't configured.
 */
async function getClient() {
  const c = await getClerk();
  if (!c || !c.client) return null;
  return { clerk: c, client: c.client };
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  needsVerification?: boolean;
}

/** Sign up with email + password. Triggers an email verification code. */
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const ctx = await getClient();
  if (!ctx) return { ok: false, error: "Auth isn't configured yet. Add your Clerk key to .env." };

  try {
    await ctx.client.signUp.create({ emailAddress: email, password });
    await ctx.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    return { ok: true, needsVerification: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Complete sign-up by verifying the emailed code. */
/** Complete sign-up by verifying the emailed code. */
export async function verifyEmailCode(code: string): Promise<AuthResult> {
  const ctx = await getClient();
  if (!ctx) return { ok: false, error: "Auth isn't configured yet." };

  try {
    const res = await ctx.client.signUp.attemptEmailAddressVerification({ code });
    if (res.status === "complete" && res.createdSessionId) {
      await ctx.clerk.setActive({ session: res.createdSessionId });
      window.location.href = "/dashboard";
      return { ok: true };
    }
    return { ok: false, error: "Couldn't finish sign-up. Please try again." };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Sign in with email + password. */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const ctx = await getClient();
  if (!ctx) return { ok: false, error: "Auth isn't configured yet. Add your Clerk key to .env." };

  try {
    const res = await ctx.client.signIn.create({ identifier: email, password });
    if (res.status === "complete" && res.createdSessionId) {
      await ctx.clerk.setActive({ session: res.createdSessionId });
      // Confirm the session actually took before navigating.
      if (ctx.clerk.user) {
        window.location.href = "/dashboard";
        return { ok: true };
      }
      return { ok: false, error: "Session didn't persist. Please try again." };
    }
    return { ok: false, error: "Couldn't sign you in. Check your details and try again." };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Start Google OAuth. Redirects away, so resolves only on failure. */
export async function signInWithGoogle(): Promise<AuthResult> {
  const ctx = await getClient();
  if (!ctx) return { ok: false, error: "Auth isn't configured yet. Add your Clerk key to .env." };

  try {
    await ctx.client.signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: "/dashboard",
      redirectUrlComplete: "/dashboard",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Sign the current user out. */
export async function signOut(): Promise<void> {
  const c = await getClerk();
  await c?.signOut();
}

/** Pull a human-readable message out of a Clerk error. */
function readClerkError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const arr = (err as { errors?: Array<{ message?: string; longMessage?: string }> }).errors;
    if (arr && arr.length > 0) {
      return arr[0].longMessage || arr[0].message || "Something went wrong.";
    }
  }
  return "Something went wrong. Please try again.";
}