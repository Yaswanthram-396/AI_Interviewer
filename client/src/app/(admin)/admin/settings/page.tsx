"use client";

import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useData } from "@/features/data/DataProvider";
import { PageHeader, SectionTitle, Surface } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { interviewStore } from "@/features/interviews/interviewStore";
import { seedInterviews, seedReports } from "@/features/interviews/seed";
import { reportStore, scoringStore, useScoringSettings, type ScoringSettings } from "@/features/reports/reportStore";
import { DEFAULT_READINESS, DEFAULT_THRESHOLDS, LEVEL_LABEL, validateThresholds } from "@/features/reports/scoring";


const num = (raw: string) => (raw === "" ? Number.NaN : Number(raw));

function ScoringForm({ initial }: { initial: ScoringSettings }) {
  const [draft, setDraft] = useState(initial);
  const thresholdError = validateThresholds(draft.thresholds);
  const readinessError =
    draft.readiness.almostAt >= draft.readiness.readyAt ? "“Almost ready” must be below “Interview ready”." : [draft.readiness.readyAt, draft.readiness.almostAt, draft.readiness.minTopicScore].some((v) => !Number.isFinite(v) || v < 1 || v > 100) ? "Values must be between 1 and 100." : null;

  const save = () => {
    if (thresholdError || readinessError) return;
    scoringStore.set(() => draft);
    toast.success("Scoring settings saved", { description: "Existing reports use the new thresholds immediately." });
  };

  const t = draft.thresholds;
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section>
        <SectionTitle title="Performance levels" description="The lowest score for each level. Below the last one is “Poor”." />
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["excellent", "Excellent"],
              ["strong", "Strong"],
              ["good", "Good"],
              ["needsImprovement", "Needs improvement"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={`${label} from`}>
              {(field) => <Input {...field} type="number" min={1} max={100} value={Number.isNaN(t[key]) ? "" : t[key]} onChange={(event) => setDraft((d) => ({ ...d, thresholds: { ...d.thresholds, [key]: num(event.target.value) } }))} className="tnum" />}
            </Field>
          ))}
        </div>
        {thresholdError ? (
          <p role="alert" className="mt-3 text-xs text-danger">
            {thresholdError}
          </p>
        ) : (
          <p className="mt-3 text-xs text-ink-3">
            {LEVEL_LABEL.excellent.replace(" Performance", "")} {t.excellent}+ · Strong {t.strong}–{t.excellent - 1} · Good {t.good}–{t.strong - 1} · Needs improvement {t.needsImprovement}–{t.good - 1} · Poor below {t.needsImprovement}
          </p>
        )}
      </section>

      <section>
        <SectionTitle title="Readiness criteria" description="Describes preparation for this interview format, not a hiring prediction." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              ["readyAt", "Interview ready at"],
              ["almostAt", "Almost ready at"],
              ["minTopicScore", "Weakest topic at least"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              {(field) => <Input {...field} type="number" min={1} max={100} value={Number.isNaN(draft.readiness[key]) ? "" : draft.readiness[key]} onChange={(event) => setDraft((d) => ({ ...d, readiness: { ...d.readiness, [key]: num(event.target.value) } }))} className="tnum" />}
            </Field>
          ))}
        </div>
        {readinessError && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {readinessError}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-3">A candidate is “Interview ready” when the overall score reaches the first value and no assessed topic is below the third.</p>
      </section>

      <div className="flex gap-2 lg:col-span-2">
        <Button icon={<Save className="size-4" />} onClick={save} disabled={Boolean(thresholdError || readinessError)}>
          Save settings
        </Button>
        <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setDraft({ thresholds: DEFAULT_THRESHOLDS, readiness: DEFAULT_READINESS })}>
          Restore defaults
        </Button>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const settings = useScoringSettings();
  const { mode } = useData();

  const resetDemo = () => {
    interviewStore.set(() => seedInterviews());
    reportStore.set(() => seedReports());
    toast.success("Demo data restored");
  };

  return (
    <>
      <PageHeader title="Settings" description="Scoring rules used to label every candidate report. They are saved in this browser." />
      <ScoringForm initial={settings} key={JSON.stringify(settings)} />

      {mode === "demo" && (
      <section className="mt-14 border-t border-line pt-8">
        <SectionTitle title="Demo data" description="Interviews, candidates and reports in this prototype are stored in your browser. Restore them to the original samples at any time." />
        <Surface className="flex flex-wrap items-center justify-between gap-4 p-4">
          <p className="text-sm text-ink-2">This removes interviews you created and reports from simulated interviews. It does not touch the SIRI backend.</p>
          <Button variant="secondary" onClick={resetDemo}>
            Restore sample data
          </Button>
        </Surface>
      </section>
      )}
    </>
  );
}
