"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, Clock, Download, FlaskConical, Info, Lightbulb, Quote, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, formatDuration } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Divider, Eyebrow, ScoreBar, ScoreRing } from "@/components/ui/display";
import { LEVEL_LABEL, READINESS_LABEL, performanceLevel, readinessFor, scoreTone } from "../scoring";
import { useScoringSettings } from "../reportStore";
import { SOURCE_LABEL, type CandidateReport, type Priority, type QuestionEvaluation, type TopicScore } from "../types";

const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 print-break-avoid">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={`${id}-h`} className="mt-1.5 text-[22px] font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {intro && <p className="mt-1.5 max-w-2xl text-sm text-ink-3">{intro}</p>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

function SourceBanner({ report }: { report: CandidateReport }) {
  const source = SOURCE_LABEL[report.source];
  const simulated = report.source !== "backend";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm no-print", simulated ? "border-accent-line bg-accent-soft text-accent-ink" : "border-brand-line bg-brand-soft text-brand")}>
      {simulated ? <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Check className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <p>
        <span className="font-semibold">{source.label}.</span> {source.description}
      </p>
    </div>
  );
}

// ---- header + overall -------------------------------------------------------

function Overview({ report }: { report: CandidateReport }) {
  const { thresholds, readiness: criteria } = useScoringSettings();
  const level = performanceLevel(report.overall, thresholds);
  const readiness = readinessFor(report.overall, report.topics, criteria);
  const tone = scoreTone(report.overall);
  const strongest = [...report.topics].filter((t) => t.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const gap = [...report.topics].filter((t) => t.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[auto_1fr] lg:items-center">
      <div className="flex flex-col items-center gap-3">
        <ScoreRing value={report.overall} size={188} stroke={12} tone={tone} label={`Overall score ${report.overall} out of 100`}>
          <span className="tnum text-[52px] font-semibold leading-none tracking-tight text-ink">{report.overall}</span>
          <span className="mt-1 text-xs text-ink-3">out of 100</span>
        </ScoreRing>
        <Badge tone={level === "excellent" || level === "strong" ? "brand" : level === "good" ? "neutral" : "accent"} className="text-[13px]">
          {LEVEL_LABEL[level]}
        </Badge>
      </div>

      <div>
        <Eyebrow>In 30 seconds</Eyebrow>
        <p className="mt-2 max-w-2xl text-[17px] leading-relaxed text-ink">{report.summary}</p>
        <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-3">Readiness</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">{READINESS_LABEL[readiness]}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Strongest area</dt>
            <dd className="mt-1 text-sm font-semibold text-brand">{strongest ? `${strongest.topic} · ${strongest.score}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Biggest opportunity</dt>
            <dd className="mt-1 text-sm font-semibold text-accent-ink">{gap && gap.topic !== strongest?.topic ? `${gap.topic} · ${gap.score}` : "None identified"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

// ---- strengths / improvements ---------------------------------------------------

function Strengths({ report }: { report: CandidateReport }) {
  return (
    <ol className="grid gap-x-12 gap-y-9 md:grid-cols-2">
      {report.strengths.map((item, index) => (
        <li key={item.title} className="relative border-l-2 border-brand/30 pl-5">
          <div className="flex items-center gap-2">
            <span className="tnum text-xs font-semibold text-brand">{String(index + 1).padStart(2, "0")}</span>
            <Badge tone="brand">{item.topic}</Badge>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-ink">{item.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{item.explanation}</p>
          <figure className="mt-3 rounded-md bg-brand-soft/60 px-3.5 py-3">
            <Quote className="mb-1 size-3.5 text-brand/60" aria-hidden />
            <blockquote className="text-[13px] italic leading-relaxed text-ink-2">{item.evidence}</blockquote>
            <figcaption className="mt-2 text-xs text-ink-3">In answer to: {item.question}</figcaption>
          </figure>
        </li>
      ))}
    </ol>
  );
}

function Improvements({ report }: { report: CandidateReport }) {
  if (report.improvements.length === 0) {
    return <p className="text-sm text-ink-3">No clear gaps in the topics assessed. Try a harder interview to find your next area to grow.</p>;
  }
  return (
    <ol className="space-y-9">
      {report.improvements.map((item, index) => (
        <li key={item.area} className="grid gap-5 md:grid-cols-[200px_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="tnum text-xs font-semibold text-accent-ink">{String(index + 1).padStart(2, "0")}</span>
              <Badge tone="accent">{PRIORITY_LABEL[item.priority]} priority</Badge>
            </div>
            <h3 className="mt-2 text-[15px] font-semibold text-ink">{item.area}</h3>
            <div className="mt-3 flex items-center gap-2.5">
              <ScoreBar value={item.current} tone="accent" label={`${item.area} current score`} />
              <span className="tnum text-sm font-semibold text-ink">{item.current}</span>
            </div>
            <p className="mt-1 text-xs text-ink-3">current performance</p>
          </div>
          <div className="space-y-4 border-l-2 border-accent/30 pl-5 md:pl-6">
            <div>
              <p className="text-xs font-semibold text-ink-3">What was missing</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.missing}</p>
            </div>
            {item.whyItMatters && (
              <div>
                <p className="text-xs font-semibold text-ink-3">Why it matters</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.whyItMatters}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-ink-3">How to improve</p>
              <ul className="mt-1.5 space-y-1.5">
                {item.actions.map((action) => (
                  <li key={action} className="flex gap-2 text-sm text-ink-2">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---- topics -------------------------------------------------------------------

function Topics({ report }: { report: CandidateReport }) {
  const assessed = report.topics.filter((topic): topic is TopicScore & { score: number } => topic.score !== null);
  const notCovered = report.topics.filter((topic) => topic.score === null);
  const [selected, setSelected] = useState<string | null>(assessed[0]?.topic ?? null);
  const questions = report.questions.filter((question) => question.topic === selected);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <ul className="space-y-1">
          {assessed.map((topic) => (
            <li key={topic.topic}>
              <button type="button" onClick={() => setSelected(topic.topic)} aria-pressed={selected === topic.topic} className={cn("w-full rounded-md px-3 py-2.5 text-left transition-colors", selected === topic.topic ? "bg-brand-soft/70" : "hover:bg-sunken")}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{topic.topic}</span>
                  <span className="tnum text-sm font-semibold text-ink">
                    {topic.score}
                    <span className="font-normal text-ink-3"> / 100</span>
                  </span>
                </div>
                <ScoreBar value={topic.score} label={`${topic.topic} score`} />
                <p className="mt-1.5 text-xs text-ink-3">
                  {topic.questionsAsked} {topic.questionsAsked === 1 ? "question" : "questions"} · weight {topic.weight}%
                </p>
              </button>
            </li>
          ))}
        </ul>
        {notCovered.length > 0 && (
          <div className="mt-6 rounded-md border border-dashed border-line-strong px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
              <Info className="size-3.5" aria-hidden /> Not covered in this interview
            </p>
            <p className="mt-1 text-sm text-ink-2">{notCovered.map((topic) => topic.topic).join(", ")}</p>
            <p className="mt-1 text-xs text-ink-3">These topics are not scored and do not affect the overall result.</p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-5 print-surface" aria-live="polite">
        {selected ? (
          <>
            <p className="text-xs font-semibold text-ink-3">{selected}: what was asked</p>
            <ul className="mt-3 space-y-5">
              {questions.map((question) => (
                <li key={question.id}>
                  <p className="text-sm font-medium text-ink">{question.question}</p>
                  <p className="mt-1.5 text-[13px] italic leading-relaxed text-ink-2">“{question.answer}”</p>
                  <p className="mt-2 text-[13px] text-ink-2">{question.interviewerFeedback}</p>
                  {question.missing.length > 0 && (
                    <p className="mt-2 text-xs text-accent-ink">
                      <span className="font-semibold">Missing:</span> {question.missing.join("; ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-ink-3">Select a topic to see the questions and feedback.</p>
        )}
      </div>
    </div>
  );
}

// ---- question breakdown -------------------------------------------------------------

function QuestionRow({ question, open, onToggle }: { question: QuestionEvaluation; open: boolean; onToggle: () => void }) {
  const tone = question.score >= 8 ? "brand" : question.score >= 6 ? "neutral" : "accent";
  return (
    <li className="print-break-avoid">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-4 px-1 py-4 text-left hover:bg-canvas/70 no-print-hover">
        <span className="tnum mt-0.5 w-8 shrink-0 text-xs font-semibold text-ink-3">{String(question.number).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{question.question}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <Badge tone="outline">{question.topic}</Badge>
            <span className="capitalize">{question.difficulty}</span>
            {question.kind === "follow-up" && <span>Follow-up</span>}
          </span>
        </span>
        <Badge tone={tone} className="tnum">
          {question.score}/10
        </Badge>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-ink-3 transition-transform no-print", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="mb-5 ml-12 grid gap-5 border-l border-line pl-5 text-sm print:block">
          <div>
            <p className="text-xs font-semibold text-ink-3">Your answer</p>
            <p className="mt-1 italic leading-relaxed text-ink-2">“{question.answer}”</p>
          </div>
          <p className="leading-relaxed text-ink-2">{question.evaluation}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-brand">What you got right</p>
              <ul className="mt-1.5 space-y-1">
                {question.correct.map((item) => (
                  <li key={item} className="flex gap-2 text-ink-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-accent-ink">What was missing</p>
              {question.missing.length === 0 ? (
                <p className="mt-1.5 text-ink-3">Nothing significant.</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {question.missing.map((item) => (
                    <li key={item} className="flex gap-2 text-ink-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {question.betterApproach && (
            <div className="rounded-md bg-sunken px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
                <Lightbulb className="size-3.5" aria-hidden /> A stronger approach
              </p>
              <p className="mt-1 leading-relaxed text-ink-2">{question.betterApproach}</p>
            </div>
          )}
          <p className="text-[13px] text-ink-3">
            <span className="font-semibold text-ink-2">Interviewer feedback:</span> {question.interviewerFeedback}
          </p>
        </div>
      )}
    </li>
  );
}

function Breakdown({ report }: { report: CandidateReport }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(report.questions.slice(0, 1).map((question) => question.id)));
  const allOpen = openIds.size === report.questions.length;
  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <>
      <div className="mb-2 flex justify-end no-print">
        <Button size="sm" variant="ghost" onClick={() => setOpenIds(allOpen ? new Set() : new Set(report.questions.map((question) => question.id)))}>
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {report.questions.map((question) => (
          <QuestionRow key={question.id} question={question} open={openIds.has(question.id)} onToggle={() => toggle(question.id)} />
        ))}
      </ul>
    </>
  );
}

// ---- communication, roadmap, final ----------------------------------------------------

function Communication({ report }: { report: CandidateReport }) {
  if (!report.communication) {
    return (
      <p className="flex max-w-2xl items-start gap-2 text-sm text-ink-3">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Communication is not assessed for this interview yet. Only technical answers were scored.
      </p>
    );
  }
  const communication = report.communication;
  return (
    <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
      <ul className="space-y-5">
        {communication.metrics.map((metric) => (
          <li key={metric.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{metric.label}</span>
              <span className="tnum text-sm font-semibold text-ink">{metric.score}</span>
            </div>
            <ScoreBar value={metric.score} label={metric.label} />
            <p className="mt-1.5 text-xs text-ink-3">{metric.note}</p>
          </li>
        ))}
      </ul>
      <aside className="self-start rounded-md border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink-3">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink-2">
          <Info className="size-3.5" aria-hidden /> How this is assessed
        </p>
        {communication.note}
      </aside>
    </div>
  );
}

function Roadmap({ report }: { report: CandidateReport }) {
  if (report.roadmap.length === 0) return <p className="text-sm text-ink-3">No improvement plan needed: there were no clear gaps.</p>;
  return (
    <ol className="space-y-10">
      {report.roadmap.map((item) => (
        <li key={item.topic} className="grid gap-4 md:grid-cols-[140px_1fr]">
          <div>
            <p className="text-xs font-semibold text-ink-3">Priority {item.priority}</p>
            <Badge tone={item.level === "high" ? "accent" : "neutral"} className="mt-1.5">
              {PRIORITY_LABEL[item.level]}
            </Badge>
            {item.estimatedHours !== null && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
                <Clock className="size-3.5" aria-hidden /> about {formatDuration(item.estimatedHours * 60)}
              </p>
            )}
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{item.topic}</h3>
            <p className="mt-1 text-sm text-ink-3">Goal: {item.objective}</p>
            <ul className="mt-3 space-y-1.5">
              {item.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-ink-2">
                  <span className="tnum flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken text-[11px] font-semibold text-ink-3">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ul>
            {item.resources.length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold text-ink-3">Recommended resources</p>
                <ul className="mt-1.5 space-y-1 text-[13px] text-ink-2">
                  {item.resources.map((resource) => (
                    <li key={resource}>· {resource}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Final({ report }: { report: CandidateReport }) {
  const { readiness: criteria } = useScoringSettings();
  const readiness = readinessFor(report.overall, report.topics, criteria);
  const { finalAssessment } = report;
  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4 text-[15px] leading-relaxed text-ink-2">
        {finalAssessment.narrative.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="flex items-start gap-2 border-t border-line pt-4 text-[13px] text-ink-3">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This describes preparation for interviews of this format. It is not a prediction of any hiring decision.
        </p>
      </div>
      <dl className="divide-y divide-line self-start rounded-lg border border-line bg-surface print-surface">
        {[
          ["Current readiness", READINESS_LABEL[readiness]],
          ["Strongest skill", finalAssessment.strongestSkill],
          ["Biggest improvement area", finalAssessment.biggestGap],
          ["Recommended next step", finalAssessment.nextStep],
        ].map(([label, value]) => (
          <div key={label} className="px-4 py-3.5">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---- page -----------------------------------------------------------------------

const TOC = [
  ["overview", "Overview"],
  ["strengths", "What you did well"],
  ["improve", "What to improve"],
  ["topics", "Topics"],
  ["breakdown", "Breakdown"],
  ["communication", "Communication"],
  ["plan", "Improvement plan"],
  ["final", "Final assessment"],
] as const;

export function ReportView({ report, audience }: { report: CandidateReport; audience: "candidate" | "admin" }) {
  return (
    <article className="mx-auto max-w-4xl">
      <header className="pb-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Badge tone="brand" dot>
            Completed
          </Badge>
          <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={() => window.print()} className="no-print">
            Download report (PDF)
          </Button>
        </div>
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-ink">{audience === "admin" ? report.candidate.name : "Your interview report"}</h1>
        <p className="mt-2 text-base text-ink-2">{report.interviewTitle}</p>
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {[
            [audience === "admin" ? "Email" : "Candidate", audience === "admin" ? report.candidate.email : report.candidate.name],
            ["Role", report.role],
            ["Date", formatDate(report.completedAt)],
            ["Duration", formatDuration(report.durationMinutes)],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="text-ink-3">{label}</dt>
              <dd className="font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <SourceBanner report={report} />
        </div>
      </header>

      <nav aria-label="Report sections" className="sticky top-0 z-10 -mx-4 mb-10 overflow-x-auto border-y border-line bg-canvas/95 px-4 backdrop-blur sm:mx-0 sm:px-0 no-print">
        <ul className="flex gap-1 whitespace-nowrap py-2">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="rounded-md px-3 py-1.5 text-[13px] text-ink-3 hover:bg-sunken hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-16">
        <Section id="overview" eyebrow="Overall performance" title="How it went">
          <Overview report={report} />
        </Section>
        <Divider />
        <Section id="strengths" eyebrow="Strengths" title="What you did well" intro="Specific things you did well, each with evidence from your own answers.">
          <Strengths report={report} />
        </Section>
        <Divider />
        <Section id="improve" eyebrow="Growth areas" title="What you should improve" intro="Constructive, specific and actionable. Ordered by how much they matter.">
          <Improvements report={report} />
        </Section>
        <Divider />
        <Section id="topics" eyebrow="Topic-wise performance" title="How each topic went" intro="Select a topic to see what was asked and the feedback.">
          <Topics report={report} />
        </Section>
        <Divider />
        <Section id="breakdown" eyebrow="Question by question" title="Your interview breakdown" intro="Expand any question for your answer, what was right, what was missing and a stronger approach.">
          <Breakdown report={report} />
        </Section>
        <Divider />
        <Section id="communication" eyebrow="Communication" title="How you explained things" intro="Assessed separately from technical knowledge.">
          <Communication report={report} />
        </Section>
        <Divider />
        <Section id="plan" eyebrow="Roadmap" title="Your recommended improvement plan" intro="Built from the gaps found in this interview, in priority order.">
          <Roadmap report={report} />
        </Section>
        <Divider />
        <Section id="final" eyebrow="Summary" title="Final assessment from SIRI">
          <Final report={report} />
        </Section>
      </div>
    </article>
  );
}
