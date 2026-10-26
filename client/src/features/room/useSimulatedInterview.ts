"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TurnPhase } from "@/features/interview/interviewTurnMachine";
import type { InterviewRecord } from "@/features/interviews/types";
import { generateReport, type AskedQuestion } from "@/features/reports/generateReport";
import type { CandidateReport } from "@/features/reports/types";
import { plannedQuestions } from "@/features/simulation/askedFromScores";
import { INTRO_ANSWER } from "@/features/simulation/knowledge";
import type { RoomMessage } from "./RoomView";

export interface SimulatedPlanItem {
  topic: string;
  knowledgeIndex: number;
  text: string;
  difficulty: AskedQuestion["difficulty"];
  strongAnswer: string;
  partialAnswer: string;
}

/** One planned question per topic slot, in the order the admin configured the topics. */
export function buildQuestionPlan(topics: InterviewRecord["topics"]): SimulatedPlanItem[] {
  return topics.flatMap((topic) =>
    plannedQuestions(topic.name, topic.questions).map((item) => ({
      topic: topic.name,
      knowledgeIndex: item.knowledgeIndex,
      text: item.text,
      difficulty: item.difficulty,
      strongAnswer: item.strongAnswer,
      partialAnswer: item.partialAnswer,
    })),
  );
}

/** Small stable hash so the same candidate and interview always get the same simulated answers. */
export function seedOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function pickAnswer(item: SimulatedPlanItem, seed: number): { text: string; score: number } {
  const strong = seed % 10 < 6;
  return strong ? { text: item.strongAnswer, score: 8 + (seed % 2) } : { text: item.partialAnswer, score: 5 + (seed % 2) };
}

const ACKNOWLEDGEMENTS = ["Thanks for that.", "Understood.", "Good, let's continue.", "Appreciated.", "Alright."];

interface Options {
  interview: InterviewRecord;
  candidate: { name: string; email: string };
  /** Called once with the finished report (or null if nothing was answered). */
  onFinished: (report: CandidateReport | null) => void;
}

/**
 * A scripted SIRI conversation for interviews that are not connected to the live backend. It uses
 * the same phases as the live room, but every answer and score comes from authored content: the
 * resulting report is labelled "Simulated evaluation".
 */
export function useSimulatedInterview({ interview, candidate, onFinished }: Options) {
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [phase, setPhase] = useState<TurnPhase>("IDLE");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [micLive, setMicLive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [questionNo, setQuestionNo] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const run = useRef({ cancelled: false, stopAnswer: null as null | (() => void), asked: [] as AskedQuestion[], startedAt: 0, finished: false });
  const total = interview.topics.reduce((sum, topic) => sum + topic.questions, 0);
  const totalSeconds = interview.durationMinutes * 60;

  const finish = useCallback(() => {
    const state = run.current;
    if (state.finished) return;
    state.finished = true;
    state.cancelled = true;
    setMicLive(false);
    setMicLevel(0);
    setLiveTranscript("");
    setPhase("IDLE");
    setCompleted(true);
    if (state.asked.length === 0) return onFinished(null);
    onFinished(
      generateReport({
        id: `rep_sim_${interview.id}_${Date.now().toString(36)}`,
        interviewId: interview.id,
        interviewTitle: interview.title,
        role: interview.role,
        candidate,
        completedAt: new Date().toISOString(),
        durationMinutes: Math.max(1, Math.round((Date.now() - state.startedAt) / 60000)),
        source: "simulated",
        topics: interview.topics.map(({ name, weight }) => ({ name, weight })),
        asked: state.asked,
      }),
    );
  }, [interview, candidate, onFinished]);

  const start = useCallback(() => {
    const state = run.current;
    if (state.startedAt) return;
    state.startedAt = Date.now();
    setStarted(true);

    const sleep = (ms: number) =>
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(!state.cancelled), ms);
        // Resolving early on cancel keeps unmounting instant.
        const poll = setInterval(() => {
          if (state.cancelled) {
            clearTimeout(timer);
            clearInterval(poll);
            resolve(false);
          }
        }, 100);
        setTimeout(() => clearInterval(poll), ms + 50);
      });

    const say = async (text: string) => {
      setMessages((all) => [...all, { id: `ai-${all.length}`, sender: "ai", text }]);
      setPhase("AI_SPEAKING");
      return sleep(Math.min(9000, Math.max(2600, text.length * 38))); // roughly how long speech takes
    };

    const listen = async (answer: string) => {
      setPhase("LISTENING");
      if (!(await sleep(900))) return false;
      setMicLive(true);
      const words = answer.split(" ");
      let shown = 0;
      const stopped = new Promise<void>((resolve) => (state.stopAnswer = resolve));
      let early = false;
      void stopped.then(() => (early = true));
      while (shown < words.length && !early && !state.cancelled) {
        shown += 1;
        setLiveTranscript(words.slice(0, shown).join(" "));
        setMicLevel(0.25 + ((shown * 7919) % 100) / 160);
        await sleep(150);
      }
      state.stopAnswer = null;
      setMicLive(false);
      setMicLevel(0);
      const spoken = words.slice(0, Math.max(1, shown)).join(" ");
      setLiveTranscript("");
      if (state.cancelled) return false;
      setMessages((all) => [...all, { id: `you-${all.length}`, sender: "candidate", text: spoken }]);
      setPhase("PROCESSING");
      return sleep(1300);
    };

    void (async () => {
      const plan = buildQuestionPlan(interview.topics);
      if (!(await say(`Hello ${candidate.name.split(" ")[0]}, I'm SIRI. Thanks for joining the ${interview.title} interview. To begin, please introduce yourself and tell me about your background.`))) return;
      if (!(await listen(INTRO_ANSWER))) return;

      for (let index = 0; index < plan.length; index += 1) {
        if (state.cancelled) return;
        const item = plan[index];
        setQuestionNo(index + 1);
        const lead = ACKNOWLEDGEMENTS[index % ACKNOWLEDGEMENTS.length];
        if (!(await say(`${lead} ${item.text}`))) return;
        const picked = pickAnswer(item, seedOf(`${interview.id}:${candidate.email}:${index}`));
        if (!(await listen(picked.text))) return;
        state.asked.push({ topic: item.topic, text: item.text, difficulty: item.difficulty, answer: picked.text, score: picked.score, knowledgeIndex: item.knowledgeIndex });
      }

      if (await say("That concludes our interview. Thank you for your time. I'm preparing your report now.")) {
        await sleep(1200);
        finish();
      }
    })();
  }, [interview, candidate, finish]);

  // Clock.
  useEffect(() => {
    if (!started || completed) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - run.current.startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [started, completed]);

  useEffect(() => {
    if (started && !completed && elapsed >= totalSeconds) finish();
  }, [elapsed, totalSeconds, started, completed, finish]);

  // Stop the script if the page is left.
  useEffect(() => {
    const state = run.current;
    return () => {
      state.cancelled = true;
    };
  }, []);

  const toggleMic = useCallback(() => run.current.stopAnswer?.(), []);

  const micState: "off" | "starting" | "live" | "muted" = phase === "AI_SPEAKING" ? "muted" : micLive ? "live" : phase === "LISTENING" ? "starting" : "off";

  return {
    started,
    completed,
    phase,
    messages,
    liveTranscript,
    micState,
    micLevel,
    question: started ? { current: Math.max(1, questionNo), total: Math.max(1, total) } : null,
    remainingSeconds: Math.max(0, totalSeconds - elapsed),
    totalSeconds,
    start,
    toggleMic,
    end: finish,
  };
}
