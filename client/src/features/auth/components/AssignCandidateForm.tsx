"use client";

import { useState, type FormEvent } from "react";
import { authSession } from "../services/authSession.instance";
import { ApiError } from "../services/authSession";

type AssignStatus = { kind: "idle" } | { kind: "saving" } | { kind: "done" } | { kind: "error"; message: string };

/** Lets an interview's owner (recruiter/admin) choose the candidate allowed to take it. */
export function AssignCandidateForm({ interviewId }: { interviewId: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<AssignStatus>({ kind: "idle" });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind === "saving" || !email.trim()) return;
    setStatus({ kind: "saving" });
    try {
      await authSession.request(`/api/interviews/${encodeURIComponent(interviewId)}/assign`, {
        method: "POST",
        body: JSON.stringify({ candidateEmail: email.trim() }),
      });
      setStatus({ kind: "done" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof ApiError ? e.message : "Could not assign the candidate." });
    }
  };

  const inputId = `assign-${interviewId}`;
  return (
    <form onSubmit={handleSubmit} className="mt-3 grid gap-1">
      <label htmlFor={inputId} className="text-xs font-medium text-gray-600">
        Assign candidate (email)
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setStatus({ kind: "idle" });
          }}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={status.kind === "saving"}
          className="rounded-lg bg-gray-800 px-3 py-1 text-sm text-white hover:bg-gray-900 disabled:opacity-50"
        >
          Assign
        </button>
      </div>
      <p role="status" className={`text-xs ${status.kind === "error" ? "text-red-600" : "text-green-700"}`}>
        {status.kind === "done" && "Candidate assigned."}
        {status.kind === "error" && status.message}
      </p>
    </form>
  );
}
