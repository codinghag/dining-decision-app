import { supabase } from "./supabase";

// Email + 6-digit-OTP auth. Two flows, chosen automatically by the sign-in
// gate based on the current session:
//   - LINK (updateUser + verifyOtp type=email_change): the current session is
//     anonymous, so we attach an email to it IN PLACE, keeping the same user
//     id and all its collections/votes. Used to migrate an existing anonymous
//     user (e.g. someone's phone) to a permanent, recoverable account.
//   - SIGN IN (signInWithOtp + verifyOtp type=email): no session yet (brand-new
//     or a clean device), so create/return the email's own account.
// All code-based so it works identically on web, iOS and Android with no
// deep-link/redirect handling.

export interface AuthStatus {
  hasSession: boolean;
  isAnonymous: boolean;
  email: string | null;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return {
    hasSession: !!u,
    isAnonymous: u?.is_anonymous ?? false,
    email: u?.email ?? null,
  };
}

// --- Link: attach an email to the current anonymous account (preserves data) --
export async function sendLinkCode(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
}
export async function confirmLinkCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email_change" });
  if (error) throw error;
}

// --- Sign in / sign up with an email's own account ------------------------
export async function sendSignInCode(email: string): Promise<void> {
  // shouldCreateUser:true so a brand-new user can sign up from the same gate;
  // an existing email just signs in.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}
export async function confirmSignInCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

// Make sure there is *some* session, creating an anonymous one if needed.
// Used on the invite edge (/collection/* routes) so a link recipient can join
// and vote with zero friction; the sign-in gate later upgrades the anonymous
// account in place (see LINK flow above), so nothing they did is orphaned.
export async function ensureSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// Supabase's "email already in use" error, used to fall back from link ->
// sign-in when someone links an email that already has an account.
export function isEmailAlreadyRegistered(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already (been )?registered|already in use|already exists/i.test(msg);
}
