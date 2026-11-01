# assay M3 questions

8 questions anchored to real repo excerpts. Answer all of them in `attempt.md` before asking to see `answers.md`.

Rules: no looking at `answers.md` first. Use the primer, the repo, and your own reasoning. Write your answers in `attempt.md` — one section per question.

---

## Q1 — Predict the output (edge types)

Look at this excerpt from `packages/assay-core/src/schema/entities.ts:88-93`:

```typescript
// Edge kinds: only these two exist
export const EdgeKindSchema = z.enum(['observed', 'matched'])
export type EdgeKind = z.infer<typeof EdgeKindSchema>

export const EdgeSchema = z.object({
  kind: EdgeKindSchema,
```

A developer proposes adding a third edge kind: `'inferred'`, for edges established by cosine similarity between two tool outputs (similarity > 0.9). They argue it would make the Constellation "more connected and useful."

**Question:** What would go wrong if this change were made and inferred edges were drawn in the Constellation without a visible label? Give two specific problems — one about what the user would believe, and one about how it would affect assay's core claim.

---

## Q2 — Find the bug

Look at `packages/assay-core/src/importers/claude-code-jsonl/derive.ts:117-120`:

```typescript
if (ev.kind === 'assistant' && !seenMsgIds.has(msgId)) {
  seenMsgIds.add(msgId)
  turnIndex++
}
```

And at lines 128-170 (the ToolCall extraction block), which runs for ALL assistant occurrences, guarded only by `seenToolIds`.

**Question:** Suppose a session on Claude Code v2.1.299 has 4 turns. Each turn emits two assistant lines with the same `message.id` — first a thinking-only line, then a tool_use line. What does `turnIndex` equal after processing all 4 turns? What does it equal if the gate at line 117 were instead `if (ev.kind === 'assistant')` (no seenMsgIds check)? Which is correct, and why?

---

## Q3 — Explain why (rendering rule)

The DESIGN.md global rules include:

> 4. Depth (z) never encodes a quantity. 3D is for structure (lanes, nesting, time), not magnitude.

**Question:** Strata shows context window usage over time. A designer proposes: "Let's make turns where context is larger appear taller in z, so users can see at a glance which turns were the heaviest." Why does assay reject this, even though it would make the pattern immediately visible? What would a user get wrong as a result?

---

## Q4 — Capture Level consequence

Look at `packages/assay-core/src/health/health.ts:104-108`:

```typescript
if (run.capture.level < 3)
  caveats.push(`Capture Level ${run.capture.level}: internal non-conversation API calls (e.g. tool-routing requests) not captured — token totals understate full API spend; OTel (L3+) required for complete cost accounting`)
if (run.capture.level < 2)
  caveats.push(`Capture Level ${run.capture.level}: tool content and request bodies not captured`)
```

**Question:** A user runs `assay health` on a session at L1 and sees a `totalContextTokens` of 120,000. Their OTel collector later reports a total context of 122,500 for the same session. Which of the two caveats above explains this discrepancy? Name the R1 finding that confirmed it on real data. What kind of requests are responsible for the extra 2,500 tokens?

---

## Q5 — What breaks if X changes

The Constellation layout rule (from DESIGN.md) is: "No inferred edges are drawn. Edge styles: solid = observed, dashed = matched."

**Question:** Suppose a bug causes `matched` edges to be drawn as solid lines, visually identical to `observed` edges. A user looks at a Constellation and sees a solid line connecting a `Read` tool call to a later `Edit` tool call. What does the user incorrectly conclude? What would they need to do to catch the error, and why is that harder than it sounds?

---

## Q6 — Predict behaviour (ValidityCard)

Look at `packages/assay-core/src/health/health.ts:73-78`:

```typescript
const totalContextTokens = totalInputTokens + totalCacheRead
const denom = totalContextTokens
const cacheHitRate = denom > 0 ? totalCacheRead / denom : null
```

A brand-new session's first turn has `input_tokens = 5000` and `cache_read_input_tokens = 0` (nothing cached yet). After the second turn: `input_tokens = 2`, `cache_read_input_tokens = 4998`.

**Question:** What is the `cacheHitRate` after the first turn only? What is it after both turns are summed? Why does the second turn's `input_tokens` drop to 2 even though the context grew?

---

## Q7 — Capture Level + truth ladder (combined)

The DESIGN.md rules:
> 1. Capture Level badge + Health verdict are the first thing visible on any run screen.
> 2. Truth badge on every run; `scripted` always carries a persistent SYNTHETIC ribbon.

**Question:** The assay landing page currently shows a placeholder. A developer wants to make it look impressive by rendering the Constellation from `fixtures/real/session-detectors.jsonl` (a synthetic fixture created for detector testing). Two rules are violated. Name both rules, explain why each is violated for this specific case, and say what the correct choice for the landing page fixture is.

---

## Q8 — Design a view (open-ended)

The Strata view shows context window composition over time with 11 source categories. After a compaction, the view renders a visible collapse: the bar narrows dramatically with pre- and post-compaction token counts shown.

**Question:** A user looks at Strata for a session that had a compaction at turn 40. Before turn 40, the "Files" layer is large (40K tokens). After turn 40, it drops to 5K tokens. The user concludes: "Claude forgot most of the file content at compaction."

Is this conclusion justified? What is the correct interpretation? What additional information would Strata need to show (or caveat) to avoid this misreading? (Hint: think about what L1 capture can and cannot tell you about what the compaction summary preserved.)
