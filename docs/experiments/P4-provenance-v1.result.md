# EXP-P4 Provenance of tool-call literals v1 — result (2026-11-02)

The preregistration is `P4-provenance-v1.md`, unchanged. Extraction was frozen at `725f2a5`, and the scorer `scripts/p4-score.mjs` (`10149f8`) was run once. Output: `results/P4-provenance-v1.json` (local).

## Primary metric (preregistered)
**Agreement between assay's claim (found / unsourced) and the independent raw-file byte search:**
- held-out: **0.974**, 95% CI [0.960, 0.986], over 10 sessions with literals and 16,207 literals;
- dev: 0.971.

Four held-out sessions have no tool calls in their main file.

## Secondary
| | held-out | dev |
|---|---|---|
| Unsourced share of literals | 0.42 [0.38, 0.48] | 0.66 |
| Found in the request, not in the file before the call | 153 | 0 |
| Found in the file before the call, not by assay | 428 | 196 |
| Tool calls checked against a sealed request / against earlier lines | 1,993 / 3,727 | 1,085 / 0 |

## The disagreements carry the information
Classified after scoring, across both sets: where the file's first occurrence sits, for literals assay calls unsourced.
- **A tool-result line, mostly in its `toolUseResult` field:** the client's structured copy of the result, which is not sent to the model. Of 12 sampled, 8 were only there; 4 were in the line's `message.content`, where the content sent differed.
- **An earlier assistant message (140):** text that is not in the re-sent history, consistent with thinking being cleared before re-sending.
- **Client bookkeeping lines** (file-history snapshots, prompt snapshots, request records, mode and title lines): never sent.
- **The assistant message's own earlier line (24):** the model wrote the literal itself, in the same response, before the call.

"Found in the request, not in the file" (153, held-out) is text only the request holds, such as the system prompt or tool definitions.

## What this changes
- **The preregistered change-my-mind condition is met, in a specific way.** The transcript file holds text the model never received, so provenance by searching the raw transcript over-claims. assay's request-based provenance is the strict one.
- **assay's `l1-lines` fallback is an upper bound.** Used for calls without a sealed request (all of them before 2.1.299), it searches only message content and rendered attachments, never `toolUseResult` or bookkeeping, but tool-result content in a line can still differ from what was sent.
- **"Unsourced" stays a count, not an error.** 42% of held-out literals have no earlier exact occurrence, mostly composed commands and absolute paths built from relative ones.

## Threats
- The 8-character minimum and the path regex are choices.
- High agreement is partly trivial: paths echoed from earlier tool results are found by both methods.
- One user; 2.1.299–2.1.316 for the request-based half.
- Disclosure: during development the l1-lines fallback was timed on `ef28c299` (held-out), and its literal and sourced counts were printed. No rule changed afterwards.
