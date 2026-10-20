"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, Server } from "lucide-react";
import { toast } from "sonner";
import { LinkButton } from "@/components/ui/Button";
import { Avatar, Surface } from "@/components/ui/display";
import { AssignmentStatusBadge } from "@/features/interviews/components/StatusBadges";
import type { InterviewRecord } from "@/features/interviews/types";

export type SyncState = { kind: "syncing" } | { kind: "synced"; backendId: string } | { kind: "local"; reason: string } | { kind: "skipped" };

/** Shown after publishing: the interview ID, who was assigned, and whether the live backend has a copy. */
export function PublishSuccess({ record, sync, onCreateAnother }: { record: InterviewRecord; sync: SyncState; onCreateAnother: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(record.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy. Select the ID and copy it manually.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-up py-6 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <CheckCircle2 className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Interview published</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">
        <span className="font-medium text-ink-2">{record.title}</span> is live. Assigned candidates will see it in their dashboard.
      </p>

      <div className="mx-auto mt-6 inline-flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 shadow-card">
        <span className="text-xs text-ink-3">Interview ID</span>
        <code className="font-mono text-sm font-semibold tracking-wide text-ink">{record.code}</code>
        <button type="button" onClick={copy} className="rounded-md p-1.5 text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Copy interview ID">
          {copied ? <Check className="size-4 text-brand" /> : <Copy className="size-4" />}
        </button>
      </div>

      <div className="mt-5 text-sm" role="status" aria-live="polite">
        {sync.kind === "syncing" && (
          <span className="inline-flex items-center gap-2 text-ink-3">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Connecting to the SIRI backend…
          </span>
        )}
        {sync.kind === "skipped" && record.backendId && (
          <span className="inline-flex items-center gap-2 text-brand">
            <Server className="size-4" aria-hidden /> Saved in the SIRI backend. Candidates can take this as a live voice interview.
          </span>
        )}
        {sync.kind === "synced" && (
          <span className="inline-flex items-center gap-2 text-brand">
            <Server className="size-4" aria-hidden /> Synced to the SIRI backend. Candidates can take this as a live voice interview.
          </span>
        )}
        {sync.kind === "local" && (
          <span className="inline-flex items-start gap-2 text-left text-accent-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Saved locally only ({sync.reason}). Candidates can take the simulated interview; live voice needs the backend.
            </span>
          </span>
        )}
      </div>

      <Surface className="mt-8 text-left">
        <div className="border-b border-line px-5 py-3 text-sm font-medium text-ink">Candidate assignment</div>
        {record.assignments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-3">No candidates assigned yet. You can add them from the interview details page.</p>
        ) : (
          <ul className="divide-y divide-line">
            {record.assignments.map((assignment) => (
              <li key={assignment.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={assignment.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{assignment.name}</span>
                  <span className="block truncate text-xs text-ink-3">{assignment.email}</span>
                </span>
                <AssignmentStatusBadge status={assignment.status} />
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <LinkButton href={`/admin/interviews/${record.id}`}>View interview</LinkButton>
        <button type="button" onClick={onCreateAnother} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken">
          Create another
        </button>
        <LinkButton href="/admin/interviews" variant="ghost">
          All interviews
        </LinkButton>
      </div>
    </div>
  );
}
