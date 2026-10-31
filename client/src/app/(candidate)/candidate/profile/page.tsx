"use client";

import { Avatar, PageHeader, Surface } from "@/components/ui/display";
import { Badge } from "@/components/ui/Badge";
import { useSession } from "@/features/session/useSession";

export default function CandidateProfilePage() {
  const { state } = useSession();
  const user = state.user;
  if (!user) return null;
  return (
    <>
      <PageHeader title="Profile" description="How you appear to interviewers." />
      <Surface className="max-w-xl p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} size="lg" />
          <div>
            <p className="text-lg font-semibold text-ink">{user.name}</p>
            <p className="text-sm text-ink-3">{user.email}</p>
          </div>
        </div>
        <dl className="mt-6 divide-y divide-line border-t border-line text-sm">
          <div className="flex justify-between py-3">
            <dt className="text-ink-3">Account type</dt>
            <dd>
              <Badge tone={user.source === "demo" ? "accent" : "brand"}>{user.source === "demo" ? "Demo candidate" : "Candidate"}</Badge>
            </dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-ink-3">Interviews are matched by</dt>
            <dd className="text-ink">{user.email}</dd>
          </div>
        </dl>
      </Surface>
    </>
  );
}
