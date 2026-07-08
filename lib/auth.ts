import { ensureAnonymousSession, supabase } from "./supabase";

// "Sign in to sync": links a permanent email identity to the current
// anonymous account (keeping the same user id and all its data), and lets a
// returning user sign back into that account on another device. Everything is
// code-based (6-digit OTP) so it works identically on web and Expo Go with no
// deep-link / redirect handling.

export interface AuthStatus {
  email: string | null;
  isAnonymous: boolean;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  return { email: u?.email ?? null, isAnonymous: u?.is_anonymous ?? true };
}

// --- Link (device 1): attach an email to THIS anonymous account -----------
// Sends a code to the new address; the account keeps its id + data.
export async function sendLinkCode(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
}
export async function confirmLinkCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email_change" });
  if (error) throw error;
}

// --- Sign in (device 2): get back into an EXISTING synced account ---------
// shouldCreateUser:false so an unknown email errors instead of silently
// creating a brand-new empty account.
export async function sendSignInCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}
export async function confirmSignInCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

// Sign out, then drop back to a fresh anonymous session so the app keeps
// working (and so a single device can be used to test the sign-in flow).
export async function signOutToAnonymous(): Promise<void> {
  await supabase.auth.signOut();
  await ensureAnonymousSession();
}
