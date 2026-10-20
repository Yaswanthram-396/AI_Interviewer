"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArchiveRestore, ClipboardList, Copy, Eye, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, PageHeader, Surface } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { InterviewStatusBadge } from "@/features/interviews/components/StatusBadges";
import { useInterviewCommands, useInterviews, useInterviewsStatus } from "@/features/data/DataProvider";
import { DIFFICULTIES, STATUS_LABEL, labelOf, type InterviewStatus } from "@/features/interviews/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

type Filter = "all" | InterviewStatus;
const FILTERS: Filter[] = ["all", "active", "draft", "completed", "archived"];

function IconAction({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: React.ReactNode }) {
  const className = "inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink";
  return href ? (
    <Link href={href} className={className} aria-label={label} title={label}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className} aria-label={label} title={label}>
      {children}
    </button>
  );
}

export default function AllInterviewsPage() {
  const router = useRouter();
  const interviews = useInterviews();
  const commands = useInterviewCommands();
  const { status, error, refresh } = useInterviewsStatus();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, active: 0, draft: 0, completed: 0, archived: 0 };
    for (const record of interviews) {
      result[record.status] += 1;
      if (record.status !== "archived") result.all += 1;
    }
    return result;
  }, [interviews]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return interviews
      .filter((record) => (filter === "all" ? record.status !== "archived" : record.status === filter))
      .filter((record) => !needle || `${record.title} ${record.role} ${record.code}`.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [interviews, filter, query]);

  /** Runs a command and reports failures instead of leaving the page looking unchanged. */
  const run = async (action: () => Promise<void>, success?: string) => {
    try {
      await action();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    }
  };

  const duplicate = (id: string) =>
    run(async () => {
      const copy = await commands.duplicate(id);
      if (copy) {
        toast.success("Interview duplicated as a draft");
        router.push(`/admin/interviews/${copy.id}/edit`);
      }
    });

  return (
    <>
      <PageHeader
        title="All interviews"
        description="Everything you have created, with who has been assigned and how far they have got."
        actions={
          <LinkButton href="/admin/interviews/new" icon={<Plus className="size-4" />}>
            Create interview
          </LinkButton>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={filter === item}
              onClick={() => setFilter(item)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", filter === item ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken")}
            >
              {item === "all" ? "All" : STATUS_LABEL[item]}
              <span className={cn("tnum text-xs", filter === item ? "text-white/70" : "text-ink-3")}>{counts[item]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, role or ID" aria-label="Search interviews" className="pl-9" />
        </div>
      </div>

      <Surface className="overflow-hidden">
        {status === "loading" ? (
          <p role="status" className="px-6 py-14 text-center text-sm text-ink-3">Loading interviews…</p>
        ) : status === "error" ? (
          <EmptyState icon={<ClipboardList className="size-5" />} title="Could not load interviews" description={error ?? undefined} action={<button type="button" onClick={() => void refresh()} className="text-sm font-medium text-brand hover:underline">Try again</button>} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title={query ? "No interviews match your search" : `No ${filter === "all" ? "" : `${filter} `}interviews`}
            description={query ? "Try a different search term." : "Create an interview to see it here."}
            action={!query && <LinkButton href="/admin/interviews/new">Create interview</LinkButton>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-3 font-medium">Interview</th>
                  <th className="px-4 py-3 font-medium">Difficulty</th>
                  <th className="px-4 py-3 text-right font-medium">Assigned</th>
                  <th className="px-4 py-3 text-right font-medium">Completed</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((record) => {
                  const completed = record.assignments.filter((assignment) => assignment.status === "completed").length;
                  return (
                    <tr key={record.id} className="transition-colors hover:bg-canvas/70">
                      <td className="max-w-xs px-4 py-3.5">
                        <Link href={`/admin/interviews/${record.id}`} className="block truncate font-medium text-ink hover:text-brand">
                          {record.title}
                        </Link>
                        <span className="mt-0.5 block truncate text-xs text-ink-3">
                          {record.role} · <span className="font-mono">{record.code}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-ink-2">{labelOf(DIFFICULTIES, record.difficulty)}</td>
                      <td className="tnum px-4 py-3.5 text-right text-ink-2">{record.assignments.length}</td>
                      <td className="tnum px-4 py-3.5 text-right text-ink-2">{completed}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-ink-3">{formatDate(record.createdAt)}</td>
                      <td className="px-4 py-3.5">
                        <InterviewStatusBadge status={record.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-0.5">
                          <IconAction label="View details" href={`/admin/interviews/${record.id}`}>
                            <Eye className="size-4" />
                          </IconAction>
                          <IconAction label="Edit" href={`/admin/interviews/${record.id}/edit`}>
                            <Pencil className="size-4" />
                          </IconAction>
                          <IconAction label="Duplicate" onClick={() => duplicate(record.id)}>
                            <Copy className="size-4" />
                          </IconAction>
                          {record.status === "archived" ? (
                            <IconAction label="Restore" onClick={() => run(() => commands.restore(record.id), "Interview restored")}>
                              <ArchiveRestore className="size-4" />
                            </IconAction>
                          ) : (
                            <IconAction label="Archive" onClick={() => run(async () => { await commands.archive(record.id); toast("Interview archived", { action: { label: "Undo", onClick: () => void run(() => commands.restore(record.id)) } }); })}>
                              <Archive className="size-4" />
                            </IconAction>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </>
  );
}
