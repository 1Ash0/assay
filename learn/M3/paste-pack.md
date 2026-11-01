# assay M3 paste pack

**Instructions for tutor (GPT):** You are helping me study the assay project — a telemetry trust toolkit for Claude Code sessions. Quiz me on the material below. Ask me one question at a time in the order listed. Wait for my full answer before responding. Do not give hints or partial answers before I attempt. Grade each answer strictly against the rubric provided. After each answer, tell me: (1) what I got right, (2) what I missed, (3) my score for that question. Keep a running total. At the end, tell me my total score, which questions were core-concept questions (Q1, Q3, Q7), and whether I passed (≥80% overall AND no zero on a core-concept question).

---

## Background: what assay is

assay is a TypeScript CLI/library that imports Claude Code session transcripts (JSONL files) and answers "can you trust this telemetry, and what does it fail to tell you?" It does this by:

1. Parsing sessions losslessly (every raw offset preserved)
2. Running health detectors (D1–D9) that find specific data quality problems
3. Producing a ValidityCard with caveats about what the numbers can and cannot mean
4. Displaying results in views (Run Card, Constellation, Strata, Replay Theatre)

The two key conceptual units for M3 are:
- **Graph semantics:** only `observed` edges (explicit ID links) and `matched` edges (exact string equality) exist. No inferred edges ever appear.
- **Rendering honesty:** Capture Level badge is always first; depth never encodes quantity; every view has table/describe mode; missing data is drawn as visible absence, never smoothed.

---

## Key code excerpts (from the actual repo)

**Edge types — `packages/assay-core/src/schema/entities.ts:88-93`:**
```typescript
// Edge kinds: only these two exist
export const EdgeKindSchema = z.enum(['observed', 'matched'])
export type EdgeKind = z.infer<typeof EdgeKindSchema>

export const EdgeSchema = z.object({
  kind: EdgeKindSchema,
```

**Turn deduplication — `packages/assay-core/src/importers/claude-code-jsonl/derive.ts:117-120`:**
```typescript
if (ev.kind === 'assistant' && !seenMsgIds.has(msgId)) {
  seenMsgIds.add(msgId)
  turnIndex++
}
```

And the ToolCall block runs for ALL assistant occurrences (lines 128-170), guarded by `seenToolIds` only.

**Capture Level caveats — `packages/assay-core/src/health/health.ts:104-108`:**
```typescript
if (run.capture.level < 3)
  caveats.push(`Capture Level ${run.capture.level}: internal non-conversation API calls (e.g. tool-routing requests) not captured — token totals understate full API spend; OTel (L3+) required for complete cost accounting`)
if (run.capture.level < 2)
  caveats.push(`Capture Level ${run.capture.level}: tool content and request bodies not captured`)
```

**cacheHitRate — `packages/assay-core/src/health/health.ts:73-78`:**
```typescript
const totalContextTokens = totalInputTokens + totalCacheRead
const denom = totalContextTokens
const cacheHitRate = denom > 0 ? totalCacheRead / denom : null
```

---

## Design rules (from `docs/DESIGN.md`)

1. Capture Level badge + Health verdict are the first thing visible on any run screen.
2. Truth badge on every run; `scripted` always carries a persistent SYNTHETIC ribbon.
3. Every element opens the evidence rail: raw file, line, byte range, raw JSON.
4. Depth (z) never encodes a quantity. 3D is for structure, not magnitude.
5. Every view has table mode and describe mode.
6. Reduced motion respected.
7. The web displays what core computed; it never recomputes statistics or Health.
8. No inferred edges are drawn. Edge styles: solid = `observed`, dashed = `matched`.
9. Missing data is drawn as visible absence (hatched gap), never smoothed over.

Landing page rule: "Landing shows one real Run Card (`real` badge) and one Health finding with its raw offset. No synthetic example is ever the hero."

---

## The questions

---

### Q1 — Predict the output (edge types) [5 points — CORE CONCEPT]

A developer proposes adding a third edge kind `'inferred'` for edges established by cosine similarity > 0.9 between two tool outputs. They argue it would make the Constellation "more connected and useful." They plan to draw these edges without a visible label, indistinguishable from `observed` edges.

What would go wrong? Give two specific problems — one about what the user would believe, and one about how it would affect assay's core claim.

**Rubric:**
- 2 pts: correctly identifies that user would confuse estimated relationship with directly-observed relationship
- 2 pts: correctly identifies the raw-offset / provenance gap (inferred edge has no byte range to click through to)
- 1 pt: mentions the core claim / differentiation argument or ADR-004

---

### Q2 — Find the bug [4 points]

In Claude Code v2.1.299, each turn emits two assistant JSONL lines with the same `message.id` — first a thinking-only line, then a tool_use line. A session has 4 turns like this.

Using the code excerpt at `derive.ts:117-120`:
1. What is `turnIndex` after all 4 turns with the current gate?
2. What would it be if the gate were removed (bare `if (ev.kind === 'assistant')`)?
3. Which is correct and why?

**Rubric:**
- 1 pt: current code = 4
- 1 pt: without gate = 8
- 2 pts: correct explanation (one message.id = one API call = one turn; two JSONL lines is a format artifact)

---

### Q3 — Explain why (rendering rule) [4 points — CORE CONCEPT]

A designer proposes making turns with larger context appear taller in the z-axis in Strata, so users can immediately see which turns were the heaviest. Why does assay's design reject this? What would a user get wrong as a result?

**Rubric:**
- 2 pts: explains why z is unreliable for magnitude (foreshortening, occlusion, no shared baseline)
- 2 pts: explains the specific error a user would make

---

### Q4 — Capture Level consequence [4 points]

A user at L1 sees `totalContextTokens = 120,000`. Their OTel collector shows 122,500 for the same session. Which caveat in `health.ts:104-108` explains the 2,500 difference? What R1 finding confirmed this on real data? What are the extra 2,500 tokens from?

**Rubric:**
- 1 pt: identifies the `< 3` caveat (not the `< 2` one)
- 1 pt: names R1-F2 (or accurately describes the finding)
- 2 pts: correctly identifies internal non-conversation API calls as the source

---

### Q5 — What breaks if X changes [4 points]

A bug causes `matched` edges to render as solid lines, visually identical to `observed` edges. A user sees a solid line from a `Read` tool call to a later `Edit`. What do they incorrectly conclude? Why is catching this harder than it sounds?

**Rubric:**
- 2 pts: correctly identifies the wrong conclusion (causal/ID link vs string reuse)
- 2 pts: explains why catching it is hard (no visual incentive to check; conceptual knowledge required)

---

### Q6 — Predict behaviour (ValidityCard) [5 points]

Turn 1: `input_tokens = 5000`, `cache_read_input_tokens = 0`.
Turn 2: `input_tokens = 2`, `cache_read_input_tokens = 4998`.

Using `health.ts:73-78`:
1. What is `cacheHitRate` after turn 1 only?
2. What is it after both turns are summed?
3. Why does turn 2's `input_tokens` drop to 2 even though context grew?

**Rubric:**
- 1 pt: after turn 1 = 0.0
- 1 pt: after both = ~0.50
- 3 pts: correct explanation (cache serves most context; only uncached portion counted; B11 / totalContextTokens)

---

### Q7 — Capture Level + truth ladder [5 points — CORE CONCEPT]

A developer wants to use `fixtures/real/session-detectors.jsonl` as the Constellation on assay's landing page. Two design rules are violated. Name both, explain why each is violated for this specific fixture, and say what the correct landing page content is.

**Rubric:**
- 2 pts: Rule 2 violated (session-detectors.jsonl is scripted/synthetic; scripted data cannot be a hero example)
- 2 pts: Rule 1 violated (Constellation is downstream; Capture Level + Health verdict must appear first)
- 1 pt: correct alternative stated (real run, Run Card, Capture Level badge first, one Health finding with raw offset)

---

### Q8 — Design a view (open-ended) [5 points]

A user looks at Strata for a session that had a compaction at turn 40. Before turn 40, the "Files" layer is 40K tokens. After, it's 5K tokens. The user concludes: "Claude forgot most of the file content at compaction."

Is this justified? What is the correct interpretation? What should Strata show or caveat to prevent this misreading?

**Rubric:**
- 2 pts: identifies that at L1 you see count change but not whether content was dropped vs summarised
- 2 pts: states correct interpretation (compaction summary — model chose what to keep; 5K might be compressed, not dropped)
- 1 pt: proposes hatch pattern / fidelity score below 1.0 for post-compaction layers

---

## Pass threshold

Total points: 36. Pass: ≥29/36 AND no zero on Q1, Q3, or Q7.
