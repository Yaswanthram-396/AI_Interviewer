"use client";

import { Badge, type Tone } from "@/components/ui/Badge";
import { useScoringSettings } from "../reportStore";
import { LEVEL_LABEL, performanceLevel, type PerformanceLevel } from "../scoring";

const TONE: Record<PerformanceLevel, Tone> = { excellent: "brand", strong: "brand", good: "neutral", "needs-improvement": "accent", poor: "accent" };

/** Short label for the level, e.g. "Strong". */
export const shortLevel = (level: PerformanceLevel) => LEVEL_LABEL[level].replace(/ Performance$/, "");

/** Performance level for a score, using the admin-configured thresholds. */
export function PerformanceBadge({ score }: { score: number }) {
  const { thresholds } = useScoringSettings();
  const level = performanceLevel(score, thresholds);
  return <Badge tone={TONE[level]}>{shortLevel(level)}</Badge>;
}
