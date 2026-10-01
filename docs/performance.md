# Performance

**No latency benchmarks have been run.** There are no before/after numbers because the original implementation and the new one were never executed against real Deepgram, Vertex AI or Google TTS in this environment (no credentials). Nothing here should be read as a measured improvement.

## What is instrumented

`GET /api/metrics` (enabled only when `METRICS_TOKEN` is set; send `Authorization: Bearer <token>`) returns timings and counters from `server/realtime/metrics.js`. Percentiles are `null` until there are enough samples (p50 ≥ 5, p95 ≥ 20, p99 ≥ 100); a rolling window of the last 1000 samples is kept per metric.

| Metric | Meaning |
| --- | --- |
| `llm.duration_ms` | Time inside the LLM adapter, including retries |
| `tts.duration_ms` | Time inside the TTS adapter, including retries |
| `turn.total_ms` | Turn start (dequeue) to reply sent |
| `eot.final_to_commit_ms` | Delay added by the end-of-turn strategy after the last final fragment |
| `audio.sent_to_playback_ms` | Server send → client `playback_started` (network + decode) |
| counters | `turn.completed`, `turn.failed`, `turn.timeout`, `turn.cancelled`, `turn.duplicate`, `tts.error`, `stt.error`, `persist.error`, `eot.reason.*`, `ws.*` |

Not measurable with the current design, and therefore not reported: end of speech → final transcript (needs audio timestamps correlated with wall-clock), model time-to-first-token and TTS time-to-first-audio (no streaming path exists).

## Proposed method (not yet executed)

1. Run old (git `f95a54c`) and new builds against the same Vertex endpoint, voice and network, same scripted candidate audio.
2. Per run, ≥ 100 turns; record client-side "stopped speaking" → first audible sample (client timestamps) alongside server metrics.
3. Report p50/p95/p99 and error/timeout rates with sample counts.

Expected effect of the new end-of-turn defaults versus the old fixed 5 s debounce is a lower floor (about 1.2 s after `speech_final`), but this is design reasoning, not a measurement.
