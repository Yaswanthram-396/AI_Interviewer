"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/display";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { syncInterviewToBackend } from "@/features/interviews/backendSync";
import { InterviewBrief } from "@/features/interviews/components/InterviewBrief";
import { blankInterviewConfig } from "@/features/interviews/defaults";
import { useData } from "@/features/data/DataProvider";
import { interviewCommands as demoInterviewCommands } from "@/features/interviews/interviewStore";
import { templateById } from "@/features/interviews/templates";
import { DIFFICULTIES, INTERVIEW_TYPES, LANGUAGES, type Assignment, type InterviewConfig, type InterviewRecord, type InterviewType } from "@/features/interviews/types";
import { validateForPublish } from "@/features/interviews/validation";
import { BehaviorSection } from "./BehaviorSection";
import { CandidateAssignment } from "./CandidateAssignment";
import { FormSection } from "./FormSection";
import { InterviewSummary } from "./InterviewSummary";
import { PublishSuccess, type SyncState } from "./PublishSuccess";
import { TopicEditor } from "./TopicEditor";

const SECTIONS = [
  { id: "information", letter: "A", label: "Information" },
  { id: "configuration", letter: "B", label: "Configuration" },
  { id: "topics", letter: "C", label: "Topics and skills" },
  { id: "behavior", letter: "D", label: "SIRI behaviour" },
  { id: "candidates", letter: "E", label: "Candidates" },
  { id: "review", letter: "F", label: "Review and publish" },
];

const toInt = (raw: string) => (raw === "" ? Number.NaN : Math.round(Number(raw)));

/** Maps a validation key to the section that contains it, so the page can scroll to the first problem. */
const SECTION_OF: Record<string, string> = {
  title: "information",
  role: "information",
  description: "information",
  durationMinutes: "configuration",
  mainQuestions: "configuration",
  maxFollowUps: "configuration",
  topics: "topics",
  personality: "behavior",
  candidates: "candidates",
};

export function CreateInterviewForm({ record }: { record?: InterviewRecord }) {
  const router = useRouter();
  const params = useSearchParams();
  const editing = Boolean(record);
  const { commands, mode } = useData();

  const [config, setConfig] = useState<InterviewConfig>(() => record ?? templateById(params.get("template"))?.build() ?? blankInterviewConfig());
  const [assignments, setAssignments] = useState<Assignment[]>(record?.assignments ?? []);
  const [savedId, setSavedId] = useState<string | undefined>(record?.id);
  const [showErrors, setShowErrors] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [published, setPublished] = useState<{ record: InterviewRecord; sync: SyncState } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = useMemo(() => validateForPublish(config, assignments), [config, assignments]);
  const visible = showErrors ? errors : {};
  const started = useMemo(() => new Set(assignments.filter((assignment) => assignment.status !== "invited").map((assignment) => assignment.id)), [assignments]);

  const set = <K extends keyof InterviewConfig>(key: K, value: InterviewConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));

  const saveDraft = async () => {
    if (!config.title.trim()) {
      setShowErrors(true);
      toast.error("Give the interview a title before saving a draft.");
      return;
    }
    setBusy("draft");
    try {
      const saved = await commands.saveDraft(config, assignments, savedId);
      setSavedId(saved.id);
      toast.success("Draft saved", { description: `${saved.title} (${saved.code})` });
    } catch (error) {
      toast.error("Could not save the draft.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setShowErrors(true);
    const keys = Object.keys(errors);
    if (keys.length > 0) {
      toast.error("A few things need attention before publishing.", { description: Object.values(errors)[0] });
      const firstSection = SECTION_OF[keys[0]] ?? "information";
      document.getElementById(firstSection)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setBusy("publish");
    let saved: InterviewRecord;
    try {
      saved = await commands.publish(config, assignments, savedId);
    } catch (error) {
      // The backend validates too; show its reason rather than pretending it worked.
      toast.error("Could not publish.", { description: error instanceof Error ? error.message : undefined });
      setBusy(null);
      return;
    }
    setSavedId(saved.id);
    // With a real session the interview already lives in the backend; a demo session mirrors it there best-effort.
    setPublished({ record: saved, sync: mode === "live" || saved.backendId ? { kind: "skipped" } : { kind: "syncing" } });
    setBusy(null);
    window.scrollTo({ top: 0 });
    if (mode === "live" || saved.backendId) return;
    const result = await syncInterviewToBackend(saved);
    if (result.ok) {
      demoInterviewCommands.linkBackend(saved.id, result.backendId);
      setPublished({ record: { ...saved, backendId: result.backendId }, sync: { kind: "synced", backendId: result.backendId } });
    } else {
      setPublished({ record: saved, sync: { kind: "local", reason: result.reason } });
    }
  };

  const reset = () => {
    setConfig(blankInterviewConfig());
    setAssignments([]);
    setSavedId(undefined);
    setShowErrors(false);
    setPublished(null);
    router.replace("/admin/interviews/new");
  };

  if (published) return <PublishSuccess record={published.record} sync={published.sync} onCreateAnother={reset} />;

  return (
    <>
      <PageHeader
        title={editing ? "Edit interview" : "Create interview"}
        description="Configure the role, topics and how SIRI should behave, then assign candidates and publish."
        actions={
          <>
            <Button variant="secondary" icon={<Save className="size-4" />} loading={busy === "draft"} onClick={saveDraft}>
              Save draft
            </Button>
            <Button variant="secondary" icon={<Eye className="size-4" />} onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
            <Button icon={<Send className="size-4" />} loading={busy === "publish"} onClick={() => void publish()}>
              Publish
            </Button>
          </>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[180px_1fr]">
        <nav aria-label="Form sections" className="sticky top-8 hidden self-start lg:block">
          <ol className="space-y-0.5 border-l border-line">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="-ml-px flex items-center gap-2.5 border-l border-transparent py-1.5 pl-4 text-[13px] text-ink-3 transition-colors hover:border-brand hover:text-ink">
                  <span className="tnum w-3 text-[11px] font-semibold text-ink-3/70">{section.letter}</span>
                  {section.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <form ref={formRef} onSubmit={(event) => event.preventDefault()} noValidate className="min-w-0 space-y-9">
          <FormSection id="information" letter="A" title="Interview information" description="Who is being interviewed and for what.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Interview title" required error={visible.title} className="sm:col-span-2">
                {(field) => <Input {...field} value={config.title} onChange={(event) => set("title", event.target.value)} placeholder="MERN Stack Developer Technical Interview" />}
              </Field>
              <Field label="Job role" required error={visible.role}>
                {(field) => <Input {...field} value={config.role} onChange={(event) => set("role", event.target.value)} placeholder="Full Stack Developer" />}
              </Field>
              <Field label="Department">
                {(field) => <Input {...field} value={config.department} onChange={(event) => set("department", event.target.value)} placeholder="Engineering" />}
              </Field>
              <Field label="Company name" className="sm:col-span-2">
                {(field) => <Input {...field} value={config.company} onChange={(event) => set("company", event.target.value)} placeholder="Northwind Labs" />}
              </Field>
              <Field label="Interview description" required error={visible.description} hint="Shown to candidates before they start." className="sm:col-span-2">
                {(field) => <Textarea {...field} rows={3} value={config.description} onChange={(event) => set("description", event.target.value)} placeholder="Evaluate the candidate's knowledge of JavaScript, React, Node.js, Express and MongoDB." />}
              </Field>
              <Field label="Interview instructions" hint="Practical guidance for the candidate." className="sm:col-span-2">
                {(field) => <Textarea {...field} rows={3} value={config.instructions} onChange={(event) => set("instructions", event.target.value)} />}
              </Field>
            </div>
          </FormSection>

          <FormSection id="configuration" letter="B" title="Interview configuration" description="Format, length and how deep SIRI goes.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Interview type">
                {(field) => (
                  <Select {...field} value={config.type} onChange={(event) => set("type", event.target.value as InterviewType)}>
                    {INTERVIEW_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Language">
                {(field) => (
                  <Select {...field} value={config.language} onChange={(event) => set("language", event.target.value)}>
                    {LANGUAGES.map((language) => (
                      <option key={language}>{language}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-[13px] font-medium text-ink">Difficulty level</p>
                <Segmented
                  label="Difficulty level"
                  value={config.difficulty}
                  onChange={(value) => setConfig((current) => ({ ...current, difficulty: value, behavior: { ...current.behavior, adaptiveDifficulty: value === "adaptive" ? true : current.behavior.adaptiveDifficulty } }))}
                  options={DIFFICULTIES}
                />
                <p className="mt-1.5 text-xs text-ink-3">{DIFFICULTIES.find((option) => option.value === config.difficulty)?.hint}</p>
              </div>
              <Field label="Duration (minutes)" required error={visible.durationMinutes}>
                {(field) => <Input {...field} type="number" min={5} max={120} inputMode="numeric" value={Number.isNaN(config.durationMinutes) ? "" : config.durationMinutes} onChange={(event) => set("durationMinutes", toInt(event.target.value))} className="tnum" />}
              </Field>
              <Field label="Main questions" required error={visible.mainQuestions}>
                {(field) => <Input {...field} type="number" min={1} max={20} inputMode="numeric" value={Number.isNaN(config.mainQuestions) ? "" : config.mainQuestions} onChange={(event) => set("mainQuestions", toInt(event.target.value))} className="tnum" />}
              </Field>
              <Field label="Maximum follow-ups per main question" error={visible.maxFollowUps} hint="SIRI never asks more than this, whatever the model suggests." className="sm:col-span-2">
                {(field) => <Input {...field} type="number" min={0} max={5} inputMode="numeric" value={Number.isNaN(config.maxFollowUps) ? "" : config.maxFollowUps} onChange={(event) => set("maxFollowUps", toInt(event.target.value))} className="tnum sm:max-w-40" />}
              </Field>
            </div>
          </FormSection>

          <FormSection id="topics" letter="C" title="Technical topics and skills" description="What to assess, how much each topic counts, and how many questions it gets.">
            <TopicEditor topics={config.topics} mainQuestions={config.mainQuestions} onChange={(topics) => set("topics", topics)} onMainQuestionsChange={(count) => set("mainQuestions", count)} error={visible.topics} />
          </FormSection>

          <FormSection id="behavior" letter="D" title="AI interview behaviour" description="How SIRI conducts the conversation.">
            <BehaviorSection value={config.behavior} onChange={(behavior) => set("behavior", behavior)} error={visible.personality} />
          </FormSection>

          <FormSection id="candidates" letter="E" title="Candidate assignment" description="Who should take this interview. You can also do this later.">
            <CandidateAssignment assignments={assignments} onChange={setAssignments} error={visible.candidates} lockedIds={started} />
          </FormSection>

          <FormSection id="review" letter="F" title="Review and publish" description="Check everything before candidates can see it.">
            <InterviewSummary config={config} />
            <div className="mt-6 rounded-md border border-line bg-surface p-4">
              <p className="text-sm font-medium text-ink">Assigned candidates</p>
              <p className="mt-1 text-sm text-ink-3">{assignments.length === 0 ? "None yet" : assignments.map((assignment) => assignment.name).join(", ")}</p>
            </div>
            {showErrors && Object.keys(errors).length > 0 && (
              <ul role="alert" className="mt-4 space-y-1 rounded-md border border-accent-line bg-accent-soft px-4 py-3 text-sm text-accent-ink">
                {Object.values(errors).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Save className="size-4" />} loading={busy === "draft"} onClick={saveDraft}>
                Save as draft
              </Button>
              <Button variant="secondary" icon={<Eye className="size-4" />} onClick={() => setPreviewOpen(true)}>
                Preview interview
              </Button>
              <Button icon={<Send className="size-4" />} loading={busy === "publish"} onClick={() => void publish()}>
                Publish interview
              </Button>
            </div>
          </FormSection>
        </form>
      </div>

      <Modal open={previewOpen} onOpenChange={setPreviewOpen} size="lg" title={config.title || "Untitled interview"} description={`${config.role || "Role not set"} · This is what candidates see before they start.`} footer={<Button variant="secondary" onClick={() => setPreviewOpen(false)}>Close preview</Button>}>
        <InterviewBrief config={config} />
      </Modal>
    </>
  );
}
