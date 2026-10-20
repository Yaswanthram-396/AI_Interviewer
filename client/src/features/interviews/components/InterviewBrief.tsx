import { BarChart3, Clock, ListChecks, Mic } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/display";
import { DIFFICULTIES, labelOf, type InterviewConfig } from "../types";
import { formatDuration } from "@/lib/format";

/** What a candidate sees before starting: the role, what is covered, how long it takes and how it works. */
export function InterviewBrief({ config }: { config: InterviewConfig }) {
  const facts = [
    { icon: Clock, label: "Duration", value: formatDuration(config.durationMinutes) },
    { icon: ListChecks, label: "Questions", value: `${config.mainQuestions} main, with follow-ups` },
    { icon: BarChart3, label: "Difficulty", value: labelOf(DIFFICULTIES, config.difficulty) },
    { icon: Mic, label: "Format", value: config.behavior.voice ? "Voice conversation" : "Text conversation" },
  ];
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4 [&>*]:bg-surface">
        {facts.map(({ icon: Icon, label, value }) => (
          <div key={label} className="p-4">
            <dt className="flex items-center gap-1.5 text-xs text-ink-3">
              <Icon className="size-3.5" aria-hidden />
              {label}
            </dt>
            <dd className="mt-1.5 text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <div>
        <Eyebrow>About this interview</Eyebrow>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{config.description}</p>
      </div>

      <div>
        <Eyebrow>Topics covered</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {config.topics.map((topic) => (
            <Badge key={topic.id} tone="neutral">
              {topic.name}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow>Before you start</Eyebrow>
        <p className="mt-2 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{config.instructions}</p>
        <ul className="mt-4 grid max-w-2xl gap-2 text-sm text-ink-2">
          <li className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-brand" aria-hidden />
            SIRI speaks first. Your microphone turns on automatically when it finishes.
          </li>
          {config.behavior.allowRepeat && (
            <li className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-brand" aria-hidden />
              You can ask SIRI to repeat or explain a question.
            </li>
          )}
          {config.behavior.allowSkip && (
            <li className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-brand" aria-hidden />
              You can skip a question; it will not count against you.
            </li>
          )}
          <li className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-brand" aria-hidden />
            Accents and small grammar slips are not penalised.
          </li>
        </ul>
      </div>
    </div>
  );
}
