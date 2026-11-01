# assay M3 primer

**How to use this file:** Paste the whole thing into a GPT chat with the instruction: "Teach me this material interactively. Quiz me one section at a time. Ask me a question and wait for my answer before giving feedback. Do not give hints before I attempt. Grade strictly."

Every claim is tagged `[verified in repo]` (checked against the actual source file, with path) or `[from docs, check]` (read in docs but not measured on real data).

---

## What M3 is about

M3 builds the views: the things a human actually sees when they inspect a run. By the end of M3, assay will have a working web app with four views — Run Card, Constellation, Strata, Replay Theatre — each driven entirely by what `assay-core` already computed. No statistics happen in the renderer. No edges are inferred. The renderer is a display; core is the brain.

Two new conceptual units are introduced here that weren't needed before:

- **Unit 6 — Graph semantics:** what kinds of relationships exist in an agent trace, which ones assay draws, and which ones it refuses to draw — and why.
- **Unit 10 — Rendering honesty:** the visual rules that prevent a chart from lying even when the underlying data is incomplete.

---

## Section 1 — The data pipeline recap (where views plug in)

Before diving into views, it helps to see where they sit:

```
capture channels
      │
      ▼
  importers  ──────────────────────────► canonical Run
  (claude-code-jsonl, otlp, …)              │
                                            │  derives
                                            ▼
                                        Entities + Edges
                                        (Message, ToolCall, ToolResult,
                                         LlmRequest, Agent, Skill,
                                         Compaction, …)
                                            │
                                            ▼
                                        Health / detectors
                                        (D1–D9, ValidityCard)
                                            │
                                            ▼
                                        ◄── VIEWS read from here
                                        Run Card, Constellation,
                                        Strata, Replay Theatre
```

The views never recompute anything. They read the `Run` object (which already has entities, edges, findings, and the ValidityCard) and render it. `[verified in repo — DESIGN.md rule 7]`

---

## Section 2 — Unit 6: graph semantics

### What is the Constellation?

The Constellation is assay's graph view. Every entity in a run — messages, tool calls, tool results, skills, agents, MCP calls, artifacts — is a node. Every relationship between them is an edge.

It answers the question: **"who called what, and can you prove it?"**

### Only two kinds of edges exist

This is the most important rule in assay:

| Edge kind | Meaning | How it's established |
|-----------|---------|---------------------|
| `observed` | An explicit ID links A to B in the raw data | A `tool_use_id` in a `tool_result` matching a `tool_use` block; a `parentUuid` link; an `agentId` reference |
| `matched` | A literal string from result A appears verbatim in input B | Exact string equality — a file path, an error message, a function name |

**No other edge kind exists in the type system.** `[verified in repo — packages/assay-core/src/schema/entities.ts, edge type definition]`

### Why no "inferred" edges?

Consider two alternatives:

**Embedding similarity:** You embed two tool outputs and find they're 0.87 cosine-similar. Does that mean they're related? Maybe. But you can't tell a user "this call caused this outcome" based on a similarity score. If you draw that edge, you've introduced a claim that isn't in the data — and you've hidden that claim inside a visual.

**Judge model:** You ask a model "does this tool result flow into this later call?" and it says yes. Now you have a probability, not a fact. If you draw that edge without labelling it as model-judged, you've misled the user about what the data says.

**assay's rule:** inferred edges are refused entirely for primary outcomes. A `matched` edge is the weakest allowed claim, and it requires exact string equality — not fuzzy, not semantic, not model-judged. `[from docs, check — ARCHITECTURE.md, ADR-004]`

### What this looks like in practice

In a real session, most tool calls link `observed` — the `tool_use_id` in the tool result directly references the tool call. This is the tight chain:

```
Message (assistant)
  └─observed─► ToolCall (toolu_abc123, name="Bash")
                              │
Message (user)                │
  └─observed─► ToolResult (tool_use_id="toolu_abc123")
```

A `matched` edge appears when a later message's input literally contains a string that first appeared as a tool result output — for example, a file path returned by `ls` that appears verbatim in the next `Read` call's input. `[from docs, check — ARCHITECTURE.md edge kinds]`

### Missing data is drawn as visible absence

If a `tool_use` has no matching `tool_result`, assay doesn't fill the gap. It draws the node and marks it with the `orphan` status from D4. The user sees the missing link explicitly — a hatched gap, not a smooth connection. `[from docs, check — DESIGN.md rule 9]`

### The Constellation layout

- x-axis: time (turn index)
- y-axis: agent lanes (main session on one lane, each subagent on its own lane below)
- Artifacts are pinned at the turn where they were first written

Edge styles:
- Solid line = `observed`
- Dashed line = `matched`

No inferred edges ever appear, regardless of how "obvious" the connection looks. `[verified in repo — DESIGN.md rule 8]`

---

## Section 3 — Unit 6 continued: why this matters for trust

Imagine two users looking at a Constellation:

**User A (using a tool with inferred edges):** sees a rich graph where every tool call appears connected to its outcomes. Looks complete. Feels like a full picture. But 30% of those edges are model guesses. When the user makes a decision based on "the graph shows X caused Y," they're trusting a probability they were never told about.

**User B (using assay):** sees the same graph with some missing links — hatched gaps where D4 fired, dashed lines where only a string match connects two nodes. It looks slightly sparse. But every edge is defensible. The user knows exactly what was directly observed vs inferred, and can click any edge to see its raw offset.

The sparseness is honest. The density of other tools is a lie. This is assay's core claim. `[from docs, check — ADR-004 consequences]`

---

## Section 4 — Unit 10: rendering honesty

### The three rules for 3D views

assay uses 3D views (Constellation, Strata). Three rules govern all of them:

**Rule 1: Depth never encodes a quantity.**

In many 3D visualisations, the z-axis encodes something — token count, importance, confidence. In assay it does not. Depth is used only for structure: separating lanes, nesting levels, time layers. If you push something "back" in z, that doesn't mean it's less important or smaller. It means it's in a different structural category.

Why: a viewer cannot reliably compare z-depths at a glance the way they compare bar heights. Using z for magnitude introduces visual ambiguity that cannot be corrected without close inspection. `[from docs, check — DESIGN.md rule 4]`

**Rule 2: Every view has a table mode and a describe mode.**

Table mode: the same data as a flat, sortable table. Screen-reader accessible. No visual encoding — just numbers.

Describe mode: a plain-English paragraph summary of the run. Designed to be read aloud or passed to an accessibility tool.

Why: 3D views are not accessible by default. A user with screen-reader software, or a CI system that processes text output, needs a way to consume the same data without relying on GPU rendering. `[from docs, check — DESIGN.md rules 5, 6]`

**Rule 3: Every view has an evidence rail.**

Click any entity, edge, or finding and you see:
- The raw source file
- The line number
- The byte range
- The raw JSON of that event

This is the lossless-offsets principle from M1 applied to the UI. Provenance is not just a data property — it's a UI affordance. `[from docs, check — DESIGN.md rule 3]`

### Missing data is visible, never smoothed

**Hatched regions:** If Strata shows a layer's token count but the importer couldn't determine which tokens came from which source category (because we're at L1 and reconstruction isn't done), that layer is rendered with a hatch pattern and a fidelity score. The user sees "this region is approximate" rather than a confident-looking solid colour.

**Capture Level badge first:** Before any metric is shown, the Capture Level badge appears. This is global rule 1 — not optional, not deferrable, not hidden behind a toggle. `[from docs, check — DESIGN.md global rule 1]`

**Truth badge on every run:** Every run carries its truth badge (`real`, `real-perturbed`, `scripted`). A synthetic fixture used for detector testing will always show "SYNTHETIC" as a persistent ribbon. It can never be promoted to a real example in any UI. `[from docs, check — DESIGN.md global rule 2]`

### What Strata shows

Strata is the context-window-over-time view. Think of it as a stacked bar chart that grows rightward across turns, where each bar is divided into layers:

| Layer | What it contains |
|-------|-----------------|
| System | The system prompt |
| CLAUDE.md | The project instruction file |
| Memory | Memory files loaded |
| Skills | Skill content loaded into context |
| MCP | MCP server descriptions |
| Rules | Rules injected by hooks or settings |
| You | Your messages (user turn content) |
| Files | File content you passed in |
| Output | Claude's prior outputs now in context |
| Claude | Claude's injected prefills |
| Hooks | Hook output injected into context |

When a compaction happens, the view renders a visible collapse — the bar narrows dramatically, the pre-compaction tokens shown next to the post-compaction tokens, so the viewer sees "we just lost a lot of history." `[from docs, check — DESIGN.md Strata description]`

**The key differentiator from existing tools (context-tracker):** context-tracker shows total context growth and a coarse composition donut (Tool I/O / Conversation / System). Strata shows all 11 categories with fidelity scores per layer and a visible compaction collapse. Subagents get their own branching columns. `[verified in repo — M0 primer Section 10, context-analyzer comparison]`

### What the Run Card is

The Run Card is the entry point — a 2D summary screen that appears before the 3D views. It contains:

1. Capture Level badge (always first)
2. Health verdict (trustworthy / usable-with-caveats / do-not-trust-for)
3. ValidityCard numbers: claimed turns, verified usage turns, totalContextTokens, cacheHitRate, caveats
4. Anomaly list: each D1–D9 finding with detector ID and a link to the validity card
5. "What's not counted" footnotes — explicit about what the numbers exclude
6. Entry points to Constellation, Strata, Replay Theatre

**The Run Card is the trust statement.** A user who only looks at the Run Card and never opens the 3D views should still understand what they can and cannot trust about this run's data. `[from docs, check — DESIGN.md Run Card description]`

---

## Section 5 — The assay-stage renderer

`assay-stage` is the 3D renderer package. Key design constraints:

- **Instanced beads:** each entity is a bead (a small sphere/box). Instancing means all beads of the same kind share a single draw call — this lets the renderer handle sessions with thousands of events without dropping frames. `[from docs, check — ROADMAP.md M3 description]`
- **Level of Detail (LoD):** at high zoom, beads show full detail (type, id, timestamp). Zoomed out, they collapse into lane-level aggregates with a clear "N hidden" indicator. The count is always shown — nothing disappears silently.
- **GPU picking:** clicking a pixel asks the GPU what entity is at that pixel (via a colour-buffer technique). This maps every click directly to an entity ID, which then opens the evidence rail. No DOM event propagation, no bounding-box guessing.

The renderer is a display layer only. `assay-stage` receives the `Run` object and draws it. It never calls health checks, never modifies entities, never adds edges. `[from docs, check — ARCHITECTURE.md pipeline]`

---

## Section 6 — Parity floor: what assay must ship before claiming novelty

From M0 (Section 10 of the M0 primer): assay must reach feature parity with `context-tracker` before the differentiation argument lands. The parity items are:

| Feature | context-tracker status | assay status |
|---------|----------------------|--------------|
| Context growth chart | Shipped | In M3 (Strata) |
| Composition breakdown | Ships (3 categories) | In M3 (11 categories) |
| Cache-churn chart | Shipped | In M3 (Strata + ValidityCard) |
| Cross-session analytics | Shipped | Deferred to M4/M5 (Run Diff) |
| Message inspector | Shipped | Replay Theatre (M3) |
| Subagent summary | Partial (no % invisible) | D1 + Constellation (M3) |
| Capture Level | Absent | Core claim — Run Card |
| Truth badge | Absent | Core claim — every run |
| Raw offset evidence rail | Absent | Core claim — every entity |
| Lossless import | Absent | M1 done |
| D1–D9 detectors | Absent | M2 done |

M3 closes the parity gap for viewing features and adds the differentiating claims on top. `[verified in repo — M0 primer Section 10 comparison table]`

---

## Section 7 — Key things that can go wrong in M3

**Forgetting to show Capture Level first.** If any view shows a metric before the Capture Level badge, it violates CLAUDE.md Rule 1. This is the single most important UI invariant.

**Encoding magnitude in z.** Easy mistake when placing elements — "let's make higher-token turns taller in z." This violates Rule 4. z is structure, not magnitude.

**Drawing an implied edge.** A tool call's output looks like it clearly caused the next call's input. Tempting to draw an arrow. Don't. If there's no `tool_use_id` link and the exact string doesn't appear verbatim in the next input, there is no edge. Draw nothing.

**Smoothing over a gap.** A compaction drops context. A layer that was 50K tokens before is now 5K. If Strata just shows the post-compaction value without marking the discontinuity, the user sees a slow decline instead of a cliff. This violates Rule 9 (missing data is drawn as visible absence).

**Scripted data appearing as a hero example.** If the landing page shows a Constellation from a synthetic fixture (to make it look nice and well-connected), it violates CLAUDE.md Rule 2. The landing page must show a real run.

---

## Key terms for M3

| Term | Definition |
|------|-----------|
| `observed` edge | An edge backed by an explicit ID link in the raw data (e.g., `tool_use_id`) |
| `matched` edge | An edge backed by exact string equality between a prior result and a later input |
| Constellation | The 3D graph view: agents, tools, skills, artifacts as nodes; time on x, agent lanes on y |
| Strata | The 3D context-window view: token layers over time, compaction collapses, subagent columns |
| Run Card | The 2D entry point: Capture Level badge first, Health verdict, ValidityCard, anomaly list |
| Replay Theatre | Step-by-step playback of a run; evidence rail follows each step |
| assay-stage | The renderer package: instanced beads, LoD, GPU picking; display only — never recomputes |
| instanced beads | A rendering technique where all entities of the same kind share one GPU draw call |
| LoD | Level of Detail — aggregated view at high zoom-out; always shows a count, never hides silently |
| GPU picking | Technique to map a pixel click to an entity by reading a colour-ID buffer |
| evidence rail | The UI panel showing raw file / line / byte range / raw JSON for any clicked entity |
| table mode | Flat sortable table view of the same data a 3D view shows |
| describe mode | Plain-English text summary of a run; screen-reader accessible |
| hatched region | Visual indicator for data that is present but incomplete (fidelity < 1.0) |
| parity floor | The set of features assay must match before differentiation claims are credible |
| SYNTHETIC ribbon | Persistent visual marker on any view or card driven by scripted data |
