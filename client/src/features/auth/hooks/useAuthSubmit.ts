"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { defaultRouteFor, safeNextPath } from "../schemas/authSchemas";
import { ApiError } from "../services/authSession";
import type { AuthUser } from "../types/auth.types";
import { useAuth } from "./useAuth";

const FRIENDLY_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Incorrect email or password.",
  ACCOUNT_LOCKED: "Too many failed attempts. Try again in a few minutes.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
};

/**
 * Submit handling shared by the sign-in and sign-up forms: blocks double submission, maps API errors
 * to messages, and redirects after success (to `?next=` if it is a safe relative path).
 */
export function useAuthSubmit(action: () => Promise<AuthUser>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const destination = useCallback(
    (user: AuthUser) => safeNextPath(searchParams.get("next")) ?? defaultRouteFor(user.role),
    [searchParams]
  );

  // Someone who is already signed in has no reason to see these pages.
  useEffect(() => {
    if (state.status === "authenticated") router.replace(destination(state.user));
  }, [state, router, destination]);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsSubmitting(true);
    setFormError(null);
    try {
      router.replace(destination(await action()));
    } catch (e) {
      setFormError(
        e instanceof ApiError
          ? FRIENDLY_MESSAGES[e.code] ?? e.message
          : "Could not reach the server. Check your connection and try again."
      );
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }, [action, destination, router]);

  return { submit, isSubmitting, formError };
}
