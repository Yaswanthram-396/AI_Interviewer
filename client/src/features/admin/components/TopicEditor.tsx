"use client";

import { useState, type KeyboardEvent } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/form";
import { makeTopic, TOPIC_SUGGESTIONS } from "@/features/interviews/defaults";
import type { TopicConfig, TopicDifficulty } from "@/features/interviews/types";
import { evenWeights, topicQuestionTotal, topicWeightTotal } from "@/features/interviews/validation";

interface TopicEditorProps {
  topics: TopicConfig[];
  mainQuestions: number;
  onChange: (topics: TopicConfig[]) => void;
  onMainQuestionsChange: (count: number) => void;
  error?: string;
}

const DIFFICULTY_OPTIONS: { value: TopicDifficulty; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const toNumber = (raw: string) => (raw === "" ? 0 : Math.max(0, Math.round(Number(raw)) || 0));

/**
 * Tag-style topic input plus an editable list. The weightage meter makes the "must total 100%"
 * rule visible while editing, and question counts are reconciled with the interview's total.
 */
export function TopicEditor({ topics, mainQuestions, onChange, onMainQuestionsChange, error }: TopicEditorProps) {
  const [draft, setDraft] = useState("");
  const weightTotal = topicWeightTotal(topics);
  const questionTotal = topicQuestionTotal(topics);
  const weightOk = weightTotal === 100;

  const existing = new Set(topics.map((topic) => topic.name.trim().toLowerCase()));
  const suggestions = TOPIC_SUGGESTIONS.filter((name) => !existing.has(name.toLowerCase()));

  const add = (rawName: string) => {
    const name = rawName.trim();
    if (!name || existing.has(name.toLowerCase())) return;
    // A new topic starts at 0% so it never silently disturbs the weights already set.
    onChange([...topics, makeTopic(name, 0, 1)]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && draft === "" && topics.length > 0) {
      onChange(topics.slice(0, -1));
    }
  };

  const patch = (id: string, change: Partial<TopicConfig>) => onChange(topics.map((topic) => (topic.id === id ? { ...topic, ...change } : topic)));

  return (
    <div>
      <div className="rounded-md border border-line-strong bg-surface p-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
        <div className="flex flex-wrap items-center gap-1.5">
          {topics.map((topic) => (
            <span key={topic.id} className="inline-flex items-center gap-1 rounded-md bg-brand-soft py-1 pl-2.5 pr-1 text-[13px] font-medium text-brand">
              {topic.name || "Untitled"}
              <button type="button" onClick={() => onChange(topics.filter((item) => item.id !== topic.id))} className="rounded p-0.5 hover:bg-brand/10" aria-label={`Remove ${topic.name}`}>
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => add(draft)}
            placeholder={topics.length ? "Add another topic…" : "Type a topic and press Enter"}
            aria-label="Add a topic or skill"
            className="h-7 min-w-40 flex-1 bg-transparent px-1.5 text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-3">Suggestions:</span>
          {suggestions.slice(0, 8).map((name) => (
            <button key={name} type="button" onClick={() => add(name)} className="inline-flex items-center gap-1 rounded-md border border-line-strong px-2 py-0.5 text-xs text-ink-2 hover:border-brand/50 hover:text-brand">
              <Plus className="size-3" aria-hidden />
              {name}
            </button>
          ))}
        </div>
      )}

      {topics.length > 0 && (
        <div className="mt-6">
          <div className="hidden grid-cols-[1fr_88px_140px_88px_32px] gap-3 px-1 pb-2 text-xs font-medium text-ink-3 sm:grid">
            <span>Topic</span>
            <span>Weight %</span>
            <span>Difficulty</span>
            <span>Questions</span>
            <span />
          </div>
          <ul className="divide-y divide-line rounded-md border border-line">
            {topics.map((topic) => (
              <li key={topic.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_88px_140px_88px_32px] sm:items-center">
                <Input value={topic.name} onChange={(event) => patch(topic.id, { name: event.target.value })} aria-label="Topic name" />
                <Input type="number" min={0} max={100} inputMode="numeric" value={topic.weight} onChange={(event) => patch(topic.id, { weight: Math.min(100, toNumber(event.target.value)) })} aria-label={`${topic.name} weight percent`} className="tnum" />
                <Select value={topic.difficulty} onChange={(event) => patch(topic.id, { difficulty: event.target.value as TopicDifficulty })} aria-label={`${topic.name} difficulty`}>
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Input type="number" min={0} max={10} inputMode="numeric" value={topic.questions} onChange={(event) => patch(topic.id, { questions: Math.min(10, toNumber(event.target.value)) })} aria-label={`${topic.name} number of questions`} className="tnum" />
                <button type="button" onClick={() => onChange(topics.filter((item) => item.id !== topic.id))} className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-danger" aria-label={`Remove ${topic.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className={cn("flex items-center gap-2 text-sm font-medium", weightOk ? "text-brand" : "text-accent-ink")} role="status">
              {weightOk ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertCircle className="size-4" aria-hidden />}
              <span className="tnum">Weightage {weightTotal}%</span>
              <span className="font-normal text-ink-3">{weightOk ? "balanced" : weightTotal > 100 ? `${weightTotal - 100}% over` : `${100 - weightTotal}% left to assign`}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" icon={<Wand2 className="size-3.5" />} onClick={() => onChange(topics.map((topic, index) => ({ ...topic, weight: evenWeights(topics.length)[index] })))}>
                Distribute evenly
              </Button>
              <span className={cn("tnum text-[13px]", questionTotal === mainQuestions ? "text-ink-3" : "text-accent-ink")}>
                {questionTotal} {questionTotal === 1 ? "question" : "questions"} across topics
              </span>
              {questionTotal !== mainQuestions && questionTotal > 0 && (
                <Button size="sm" variant="ghost" onClick={() => onMainQuestionsChange(questionTotal)}>
                  Set main questions to {questionTotal}
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className={cn("h-full rounded-full transition-all", weightOk ? "bg-brand" : weightTotal > 100 ? "bg-danger" : "bg-accent")} style={{ width: `${Math.min(100, weightTotal)}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
