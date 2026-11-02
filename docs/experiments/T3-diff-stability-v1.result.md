# EXP-T3 Run Diff alignment stability v1 — result (2026-11-02)

The preregistration is `T3-diff-stability-v1.md`, unchanged. Alignment was frozen at `1d8c082`, and the scorer `scripts/t3-score.mjs` was run once. Output: `results/T3-diff-stability-v1.json` (local).

## Primary
**Stability: 60 of 60** (session, benign perturbation) pairs aligned identically to the original, so the per-session mean is 1.000, 95% CI [1.000, 1.000].

| Perturbation | Stable | Actually changed the input |
|---|---|---|
| reorder (parallel tool-call lines reversed) | 20 / 20 | 15 sessions, 1,138 messages |
| rename (`scratchpad` → `scratchpaX`) | 20 / 20 | 17 sessions |
| rewrite (every fifth assistant message's first line written twice) | 20 / 20 | 20 sessions |

The check that a perturbation actually changed the input was added after scoring. For sessions where reorder or rename changed nothing, stability is trivially true, and those sessions say nothing about the key.

## Secondary
**Detection: 16 of 17** negative controls found at the expected step; mean 0.941, 95% CI [0.824, 1.000]. Three sessions have no main-file tool call.

The one miss is `3ff3c7b6`. The deleted call was alone in its step (212), and step 213 has the same key, so LCS aligns the following step into the gap and the first divergence shows at 213. The preregistration named this case. An exact-key alignment cannot tell which of two identical steps went missing.

## What this means for Run Diff
- **The key, the multiset of tool names per step, is stable** under reordering, renaming and duplicate records.
- **The first divergence can be off by the length of a run of identical steps.** The view must show it as "at or after step N" when the steps around it share a key.
- **Keys ignore tool inputs.** Two runs that call the same tools on different files align perfectly, so the view states this and points to provenance for inputs.
- **No real twin runs exist yet.** This measures stability only; the twin-run protocol is in `M4_PLAN.md` §5b.
