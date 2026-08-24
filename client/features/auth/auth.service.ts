import { Clerk } from "@clerk/clerk-js";
import { clearSessionHeartbeat } from "../../shared/lib/session-guard";

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
      // Every sign-in path lands on the startup switcher first, not the
      // dashboard directly — a founder with more than one business should
      // choose which one before seeing any numbers. A brand-new account
      // (not onboarded yet) gets bounced from there straight into the
      // wizard, same as before.
      window.location.href = "/business";
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
        window.location.href = "/business";
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
      redirectUrl: "/business",
      redirectUrlComplete: "/business",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/**
 * Forgot-password flow, three steps against `client.signIn` (not `signUp` —
 * this signs the user back in once their new password is set):
 *   1. requestPasswordReset(email)    — sends the code, to whichever of the
 *      account's verified emails (primary or a recovery one) was given.
 *   2. confirmPasswordResetCode(code) — verifies it.
 *   3. setNewPassword(password)       — sets the password and completes the
 *      sign-in, same as signInWithEmail.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const ctx = await getClient();
  if (!ctx) return { ok: false, error: "Auth isn't configured yet. Add your Clerk key to .env." };

  try {
    await ctx.client.signIn.create({ strategy: "reset_password_email_code", identifier: email });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

export async function confirmPasswordResetCode(code: string): Promise<AuthResult> {
  const ctx = await getClient();
  if (!ctx) return { ok: false, error: "Auth isn't configured yet." };

  try {
    const res = await ctx.client.signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code });
    if (res.status === "needs_new_password") return { ok: true };
    return { ok: false, error: "That code didn't work." };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

export async function setNewPassword(password: string): Promise<AuthResult> {
  const ctx = await getClient();
  if (!ctx) return { ok: false, error: "Auth isn't configured yet." };

  try {
    const res = await ctx.client.signIn.resetPassword({ password });
    if (res.status === "complete" && res.createdSessionId) {
      await ctx.clerk.setActive({ session: res.createdSessionId });
      window.location.href = "/business";
      return { ok: true };
    }
    return { ok: false, error: "Couldn't finish resetting your password. Please try again." };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Sign the current user out. */
export async function signOut(): Promise<void> {
  const c = await getClerk();
  await c?.signOut();
  clearSessionHeartbeat();
}

/** Get the signed-in Clerk user, guaranteed defined. Null if not signed in. */
async function getUser() {
  const c = await getClerk();
  if (!c || !c.user) return null;
  return c.user;
}

/** Update the founder's first/last name — this is Clerk identity data, not ours. */
export async function updateProfileName(firstName: string, lastName: string): Promise<AuthResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You must be signed in to do that." };

  try {
    await user.update({ firstName, lastName });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

export interface TOTPEnrollResult {
  ok: boolean;
  error?: string;
  /** Plain manually-typeable setup key — no QR code needed. */
  secret?: string;
}

/** Start authenticator-app (TOTP) enrollment. Returns a secret to type into the app. */
export async function startTOTPEnrollment(): Promise<TOTPEnrollResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You must be signed in to do that." };

  try {
    const totp = await user.createTOTP();
    return { ok: true, secret: totp.secret };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Confirm TOTP enrollment with the 6-digit code from the authenticator app. */
export async function confirmTOTPEnrollment(code: string): Promise<AuthResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You must be signed in to do that." };

  try {
    await user.verifyTOTP({ code });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Turn off authenticator-app MFA. */
export async function disableMFA(): Promise<AuthResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You must be signed in to do that." };

  try {
    await user.disableTOTP();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

export interface BackupCodesResult {
  ok: boolean;
  error?: string;
  /** One-time reveal — Clerk won't show these again after this call. */
  codes?: string[];
}

/** Generate a fresh set of MFA backup codes (running this again regenerates them). */
export async function regenerateBackupCodes(): Promise<BackupCodesResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You must be signed in to do that." };

  try {
    const resource = await user.createBackupCode();
    return { ok: true, codes: resource.codes };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

export interface AddEmailResult {
  ok: boolean;
  error?: string;
  emailId?: string;
}

/** Add a secondary email and send it a verification code. */
export async function addSecondaryEmail(email: string): Promise<AddEmailResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You must be signed in to do that." };

  try {
    const emailResource = await user.createEmailAddress({ email });
    await emailResource.prepareVerification({ strategy: "email_code" });
    return { ok: true, emailId: emailResource.id };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Confirm a newly-added secondary email with the code sent to it. */
export async function verifySecondaryEmail(emailId: string, code: string): Promise<AuthResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You must be signed in to do that." };

  const emailResource = user.emailAddresses.find((e) => e.id === emailId);
  if (!emailResource) return { ok: false, error: "That email address wasn't found — try adding it again." };

  try {
    await emailResource.attemptVerification({ code });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Remove an email address from the account (can't remove the primary one). */
export async function removeEmail(emailId: string): Promise<AuthResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "You must be signed in to do that." };

  const emailResource = user.emailAddresses.find((e) => e.id === emailId);
  if (!emailResource) return { ok: false, error: "That email address wasn't found." };

  try {
    await emailResource.destroy();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readClerkError(err) };
  }
}

/** Pull a human-readable message out of a Clerk error. */
function readClerkError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const arr = (err as { errors?: Array<{ code?: string; message?: string; longMessage?: string }> }).errors;
    if (arr && arr.length > 0) {
      // Clerk requires "reverification" (a fresh confirmation of identity)
      // for some sensitive actions — e.g. adding an email — and this app
      // doesn't have Clerk's step-up verification UI wired up to handle
      // that automatically, so the raw API error would otherwise surface
      // as opaque, technical text ("You need to provide additional
      // verification to perform this operation").
      if (arr[0].code === "session_reverification_required") {
        return "This needs a fresh sign-in to confirm it's really you — try signing out and back in, or skip it for now.";
      }
      return arr[0].longMessage || arr[0].message || "Something went wrong.";
    }
  }
  return "Something went wrong. Please try again.";
}