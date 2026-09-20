import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/supabase';

export interface InviteResult {
  error: string | null;
  reusedExistingAccount?: boolean;
}

/** Builds a strong, hard-to-guess temporary password for a new teammate. */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*';
  const all = upper + lower + digits + symbols;

  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const core = Array.from({ length: 12 }, () => pick(all)).join('');
  return pick(upper) + pick(lower) + pick(digits) + pick(symbols) + core;
}

/**
 * Adds a person to the current business with a specific role.
 *
 * Goes through a server function rather than the browser sign-up call, because
 * signing up from the browser would replace the signed-in owner's session with
 * the new teammate's.
 */
export async function inviteTeammate(params: {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}): Promise<InviteResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'You are not signed in' };

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-teammate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(params),
  });

  let payload: { error?: string; reused_existing_account?: boolean } = {};
  try {
    payload = await res.json();
  } catch {
    return { error: 'The server returned an unexpected response' };
  }

  if (!res.ok) return { error: payload.error || 'Could not add this team member' };
  return { error: null, reusedExistingAccount: payload.reused_existing_account };
}

/** Sends the welcome email with the teammate's login details. Returns whether it was delivered. */
export async function sendWelcomeEmail(email: string, name: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'welcome', to: email, name, password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
