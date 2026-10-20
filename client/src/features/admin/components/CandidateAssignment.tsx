"use client";

import { useState, type FormEvent } from "react";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar, EmptyState } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { newAssignment } from "@/features/interviews/interviewActions";
import { AssignmentStatusBadge } from "@/features/interviews/components/StatusBadges";
import type { Assignment } from "@/features/interviews/types";
import { validateCandidate, type FieldErrors } from "@/features/interviews/validation";

interface CandidateAssignmentProps {
  assignments: Assignment[];
  onChange: (assignments: Assignment[]) => void;
  error?: string;
  /** Candidates can be removed only while their interview has not started. */
  lockedIds?: ReadonlySet<string>;
}

/** Add candidates one at a time; each starts as "Invited" (invitations are simulated in this prototype). */
export function CandidateAssignment({ assignments, onChange, error, lockedIds }: CandidateAssignmentProps) {
  const [values, setValues] = useState({ name: "", email: "", candidateId: "" });
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateCandidate(values, assignments);
    setErrors(found);
    if (Object.keys(found).length) return;
    onChange([...assignments, newAssignment(values)]);
    setValues({ name: "", email: "", candidateId: "" });
  };

  return (
    <div>
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_1.3fr_0.8fr_auto] sm:items-start">
        <Field label="Candidate name" error={errors.name}>
          {(field) => <Input {...field} value={values.name} onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))} placeholder="Arjun Mehta" autoComplete="off" />}
        </Field>
        <Field label="Candidate email" error={errors.email}>
          {(field) => <Input {...field} type="email" value={values.email} onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))} placeholder="arjun@example.com" autoComplete="off" />}
        </Field>
        <Field label="Candidate ID (optional)">
          {(field) => <Input {...field} value={values.candidateId} onChange={(event) => setValues((v) => ({ ...v, candidateId: event.target.value }))} placeholder="EMP-1042" autoComplete="off" />}
        </Field>
        <div className="sm:pt-[26px]">
          <Button type="submit" variant="secondary" icon={<UserPlus className="size-4" />} className="w-full sm:w-auto">
            Add
          </Button>
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-md border border-line">
        {assignments.length === 0 ? (
          <EmptyState icon={<Mail className="size-5" />} title="No candidates assigned yet" description="Add candidates above. You can also assign people after publishing." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Candidate</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Candidate ID</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="w-12 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={assignment.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{assignment.name}</p>
                        <p className="truncate text-xs text-ink-3">{assignment.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-ink-3 sm:table-cell">{assignment.candidateId ?? "—"}</td>
                  <td className="px-4 py-3">
                    <AssignmentStatusBadge status={assignment.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={lockedIds?.has(assignment.id)}
                      onClick={() => onChange(assignments.filter((item) => item.id !== assignment.id))}
                      className="rounded-md p-1.5 text-ink-3 hover:bg-sunken hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Remove ${assignment.name}`}
                      title={lockedIds?.has(assignment.id) ? "This candidate has already started" : "Remove"}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-ink-3">Invitations are simulated here: candidates are marked Invited and no email is sent.</p>
    </div>
  );
}
