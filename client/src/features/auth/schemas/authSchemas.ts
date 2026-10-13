import type { UserRole } from "../types/auth.types";

export type FieldErrors<TField extends string> = Partial<Record<TField, string>>;

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything beyond this, so the server rejects it

/**
 * Client-side checks give fast feedback only. The server enforces the real policy
 * (common-password list, email-name check, ...) and its message is shown if it disagrees.
 */
function validateEmail(email: string): string | undefined {
  return EMAIL_PATTERN.test(email.trim()) ? undefined : "Enter a valid email address";
}

function validatePassword(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return `Use at most ${MAX_PASSWORD_BYTES} bytes`;
  return undefined;
}

const compact = <T extends string>(errors: FieldErrors<T>): FieldErrors<T> =>
  Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as FieldErrors<T>;

export function validateLogin(input: { email: string; password: string }): FieldErrors<"email" | "password"> {
  return compact({
    email: validateEmail(input.email),
    password: input.password ? undefined : "Enter your password",
  });
}

export function validateRegister(input: {
  email: string;
  password: string;
  confirmPassword: string;
}): FieldErrors<"email" | "password" | "confirmPassword"> {
  return compact({
    email: validateEmail(input.email),
    password: validatePassword(input.password),
    confirmPassword: input.password === input.confirmPassword ? undefined : "Passwords do not match",
  });
}

/** Accepts only same-origin relative paths, so a `next` parameter can't redirect to another site. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

export function defaultRouteFor(role: UserRole): string {
  return role === "candidate" ? "/candidate" : "/admin";
}
