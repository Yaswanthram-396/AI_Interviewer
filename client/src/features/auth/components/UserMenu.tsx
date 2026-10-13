"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

/** Shows who is signed in and offers sign-out. Renders nothing for anonymous users. */
export function UserMenu() {
  const { state, logout } = useAuth();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (state.status !== "authenticated") return null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
    } catch {
      // The local session is cleared regardless; the server-side token expires on its own.
    }
    router.replace("/login");
  };

  return (
    <div className="flex items-center justify-end gap-3 text-sm text-gray-600">
      <span>
        {state.user.email} <span className="text-gray-400">({state.user.role})</span>
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="rounded-lg border border-gray-300 px-3 py-1 font-medium hover:bg-gray-100 disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
