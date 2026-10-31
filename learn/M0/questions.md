# M0 questions — telemetry channels and session anatomy

Units covered: 1 (telemetry channels) and 2 (Claude Code session anatomy).
Anchored to real corpus excerpts and project docs.
Answer in `learn/M0/attempt.md`. One answer per question; no looking at `answers.md`.

---

## Q1 — Predict (Capture Level)

A researcher runs Claude Code and collects only the JSONL transcript. They count token usage by summing `message.usage.output_tokens` across all lines in the file.

Their session had two subagents. What is wrong with this measurement, and what Capture Level did they achieve?

*Anchor: `docs/PRIOR_ART.md` — Harbor PR #2247 entry; `docs/ARCHITECTURE.md` — Capture Level table.*

---

## Q2 — Explain why (truth ladder)

You publish a metric that says "tool call count agreement between JSONL and OTel is 99.2% (n=1)."

A reader asks: "Is that a `real` result or a `scripted` result?" What is the difference, and why does it matter for the number you just quoted?

*Anchor: `docs/EVAL_DESIGN.md` — truth ladder; `docs/experiments/R1-dual-capture-v1.md` — n and unit of analysis.*

---

## Q3 — Find the field (session anatomy)

Below is a real line from `corpus/frozen/E--surfacelab/435395c9-3ae5-4a23-9e36-407a507d6251.jsonl` (line 21, truncated):

```json
{
  "type": "api-request",
  "sessionId": "435395c9-3ae5-4a23-9e36-407a507d6251",
  "id": "2cb3a078-7c62-4e0b-b541-5342103a9f38",
  "timestamp": "2026-10-26T14:06:39.933Z",
  "version": "2.1.308",
  "params": { "model": "claude-sonnet-4-6", ... }
}
```

What field on this `api-request` line links it to the *response* that came back from the API? What field on the *response* line links back to this request? (Name both fields and the type of value each holds.)

*Anchor: `learn/M0/primer.md` — §5 requestRef and tail chains.*

---

## Q4 — What breaks (cost-state)

A tool sums `costState.totalCost` from the last line of a JSONL file and reports it as "cost of this session."

Describe one concrete scenario where this number is wrong, and explain which detector (D1–D10) is designed to surface the underlying cause.

*Anchor: `learn/M0/primer.md` — §4 cost-state deep dive; `docs/ARCHITECTURE.md` — detectors.*

---

## Q5 — Capture Level consequence

An analyst enables `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` but does NOT set `OTEL_LOG_RAW_API_BODIES`.

(a) What Capture Level do they achieve?
(b) Which R1 metric can they NOT compute, and why?

*Anchor: `docs/otel-setup.md` — Capture Level table; `docs/experiments/R1-dual-capture-v1.md` — secondary metrics.*

---

## Q6 — Explain why (lossless offsets, Rule 4)

Rule 4 says: "Raw offsets are lossless. Every derived entity and edge links to the exact raw bytes (file, line, byte range). Importers never drop an unknown field."

Why would dropping an unknown field violate provenance, even if the field isn't used by any detector?

*Anchor: `CLAUDE.md` — Rule 4; `docs/ARCHITECTURE.md` — provenance module.*

---

## Q7 — Predict (compaction anatomy)

A JSONL file has this sequence of consecutive lines (types only): `user`, `assistant`, `user`, `assistant`, `system`, `user`, `assistant`.

The `system` line has `subtype: "compact_boundary"`. The second `user` after it has `isCompactSummary: true`.

How many turns of real conversation are NOT present in this file as individual messages? What happened to them, and what does assay show in the Strata view to flag this?

*Anchor: `learn/M0/primer.md` — §2 Capture Level and §7 compaction anatomy in JSONL; `docs/PRIOR_ART.md` — OTel GenAI conventions, `gen_ai.conversation.compacted`.*

---

## Q8 — OTel vs JSONL disagreement

After running R1, you find that the JSONL reports 12 tool calls for the session, but OTel shows 10 `claude_code.tool` spans.

Name two plausible explanations for this discrepancy — one that would be a real bug in assay's importer, and one that would be expected and explainable.

*Anchor: `learn/M0/primer.md` — §8 D1–D10 detectors; `docs/experiments/R1-dual-capture-v1.md` — secondary metrics; `docs/otel-setup.md` — known issues.*

---

## Q9 — External corpus (TRAIL)

You want to run assay's OTel importer against the TRAIL dataset to check for import errors.

(a) What format are TRAIL traces in?
(b) What does the `labels` column give you that a plain import test would not?
(c) Name one thing TRAIL traces cannot help you test about the JSONL importer.

*Anchor: `docs/PRIOR_ART.md` — TRAIL entry (verified 2026-10-31); `docs/ROADMAP.md` — M2.*

---

## Q10 — Skill gap (instrumentation vs spec)

The OTel GenAI spec has a `Load skill span` with a `gen_ai.skill.name` attribute.

You run a Claude Code session that uses three Skill tool calls, then inspect the OTel output. You find `claude_code.tool` spans for each call but no `gen_ai.skill.name` attribute on any of them.

Is this a bug in assay's importer, a gap in the OTel spec, or a gap in Claude Code's instrumentation? Explain the distinction and say what evidence supports your answer.

*Anchor: `docs/PRIOR_ART.md` — OTel semconv-genai CORRECTION paragraph (E6, 2026-10-31); `learn/M0/primer.md` — §9 OTel semconv-genai.*

---

## Scoring note (for the gate)

Questions Q1, Q2, Q5, Q7 are **core-concept questions** (Capture Level and truth ladder). A score of 0 on any of these fails the gate regardless of total score. Gate threshold: ≥80% overall and no core-concept 0.
