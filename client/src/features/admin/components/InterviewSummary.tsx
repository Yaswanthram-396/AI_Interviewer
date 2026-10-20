import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/display";
import { DIFFICULTIES, INTERVIEW_TYPES, PERSONALITIES, labelOf, type BehaviorConfig, type InterviewConfig } from "@/features/interviews/types";
import { topicQuestionTotal } from "@/features/interviews/validation";
import { formatDuration } from "@/lib/format";

const BEHAVIOR_LABELS: [keyof Omit<BehaviorConfig, "personality">, string][] = [
  ["contextualFollowUps", "Contextual follow-ups"],
  ["adaptiveDifficulty", "Adaptive difficulty"],
  ["clarifications", "Clarification questions"],
  ["allowRepeat", "Question repetition"],
  ["allowSkip", "Skipping questions"],
  ["voice", "Voice interaction"],
  ["interruptions", "Interruption handling"],
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[170px_1fr] sm:gap-4">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Read-only view of a configuration: used for the pre-publish review and the interview details page. */
export function InterviewSummary({ config }: { config: InterviewConfig }) {
  return (
    <div className="space-y-8">
      <div>
        <Eyebrow>Interview</Eyebrow>
        <dl className="mt-2 divide-y divide-line">
          <Row label="Title">{config.title || <span className="text-ink-3">Not set</span>}</Row>
          <Row label="Role">
            {config.role || <span className="text-ink-3">Not set</span>}
            {config.department && <span className="text-ink-3"> · {config.department}</span>}
            {config.company && <span className="text-ink-3"> · {config.company}</span>}
          </Row>
          <Row label="Description">{config.description || <span className="text-ink-3">Not set</span>}</Row>
          <Row label="Instructions">
            <span className="whitespace-pre-line">{config.instructions}</span>
          </Row>
        </dl>
      </div>

      <div>
        <Eyebrow>Configuration</Eyebrow>
        <dl className="mt-2 divide-y divide-line">
          <Row label="Type">{labelOf(INTERVIEW_TYPES, config.type)}</Row>
          <Row label="Difficulty">{labelOf(DIFFICULTIES, config.difficulty)}</Row>
          <Row label="Duration">{formatDuration(config.durationMinutes)}</Row>
          <Row label="Questions">
            {config.mainQuestions} main questions, up to {config.maxFollowUps} follow-ups each
            {topicQuestionTotal(config.topics) !== config.mainQuestions && <span className="text-accent-ink"> (topics total {topicQuestionTotal(config.topics)})</span>}
          </Row>
          <Row label="Language">{config.language}</Row>
        </dl>
      </div>

      <div>
        <Eyebrow>Topics</Eyebrow>
        {config.topics.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No topics selected.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {config.topics.map((topic) => (
              <li key={topic.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="font-medium text-ink">{topic.name}</span>
                <span className="tnum text-ink-3">
                  {topic.weight}% · {topic.questions} q · {labelOf(DIFFICULTIES, topic.difficulty)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Eyebrow>SIRI behaviour</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {config.behavior.personality.map((personality) => (
            <Badge key={personality} tone="brand">
              {labelOf(PERSONALITIES, personality)}
            </Badge>
          ))}
        </div>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {BEHAVIOR_LABELS.map(([key, label]) => (
            <li key={key} className="flex items-center gap-2 text-sm text-ink-2">
              {config.behavior[key] ? <Check className="size-3.5 text-brand" aria-label="On" /> : <Minus className="size-3.5 text-ink-3" aria-label="Off" />}
              <span className={config.behavior[key] ? "" : "text-ink-3"}>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
