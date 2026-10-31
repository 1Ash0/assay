# assay M0 primer

**How to use this file:** Copy the whole thing into a GPT chat with the instruction "Teach me this material interactively. Quiz me section by section, wait for my answers, then correct me. Don't give me the answers first." Come back to this doc when you want to check what a term actually means.

Every claim is tagged `[verified in repo]` (I checked the actual JSONL files in the corpus) or `[from docs, check]` (read at source but not measured on corpus) or `[hypothesis]` (plausible but not yet measured).

---

## Section 1 — What assay is and why it exists

Claude Code (the tool you're using right now) writes a record of every conversation to a file on disk. That record is called the **JSONL transcript**. It contains your messages, Claude's responses, every tool call, token counts, and more.

The problem: **that record can lie, or at least mislead you.** Four reasons:

1. **Subagent blind spot.** When Claude Code spawns a sub-agent (like a fork), the sub-agent's work is written to a *separate file* — `subagents/agent-<id>.jsonl`. If you only look at the main file, you miss that sub-agent's steps entirely. On a real session with four sub-agents, ~80% of the prompt tokens were invisible. `[verified in repo — harbor PR #2247 read, corpus file 453b573b has one subagent]`

2. **Double-counted costs.** The same API call can appear on multiple lines in the JSONL with the same `message.id`. If you naively sum token counts across all lines, you count each call multiple times. The fix is to deduplicate by `message.id` before summing. `[verified in repo]`

3. **Compaction drops context.** When the context window fills up, Claude Code runs a "compact" operation — it summarises old messages and drops them. A flag called `isCompactSummary: true` appears in the transcript but the original messages are gone. You cannot reconstruct what was said before compaction from the transcript alone at that point. `[verified in repo]`

4. **The cost-state is chain-wide, not session-wide.** Every JSONL file contains a `costState` line showing cumulative token spend. But that cumulative total includes ALL prior sessions in the same chain (e.g., if this is a continuation of yesterday's session). So if you compare the cost-state's output token count against the output tokens you sum from this file, they won't match — and that's expected, not a bug. `[verified in repo — census 4a/4b confirmed this exactly]`

**assay's job:** before answering any question about a run ("how much did this cost?", "what did Claude actually see?"), it first tells you how trustworthy the telemetry is and what it's missing.

---

## Section 2 — Capture Level (L0 through L4)

Think of capture levels as how deep you went when recording a session. Each level includes everything below it.

| Level | What you have | How to get it |
|---|---|---|
| **L0** | Only the final text output | You didn't record anything |
| **L1** | The JSONL transcript file | Always written by Claude Code to `~/.claude/projects/<project>/<session-uuid>.jsonl` |
| **L2** | L1 + hook events | Set up Claude Code hooks (PreCompact, PostCompact, SubagentStart, SubagentStop, etc.) — they write to `~/.claude/context-trace/<session_id>.jsonl` |
| **L3** | L1+L2 + OTel spans/logs | Enable `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`, point at a collector |
| **L4** | L1+L2+L3 + raw API request/response bodies | Also enable `OTEL_LOG_RAW_API_BODIES=file:/path/to/dir` |

**Why does the level matter?** Because every metric you report is only as good as what you captured. If you say "this session used 500K tokens," that number means something different at L1 (from the transcript, which may be incomplete) vs L4 (from the raw API bodies, which are ground truth). assay shows the Capture Level on every run before any metric, so you always know what you're reading. `[from docs, check]`

**Key practical fact:** At L3/L4, content is **truncated** at 61,440 bytes by default unless you raise `CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH`. So even with OTel enabled, long tool results or prompts are cut off. This is a Capture Level fact you must declare. `[from docs, check]`

---

## Section 3 — The JSONL file: what's actually in it

The JSONL transcript is a text file where **each line is a JSON object**. (JSONL = JSON Lines.) There are many different line types. Here are the main ones and what they mean:

### Line types you'll see most often

**`assistant` lines** — Claude's response:
```json
{
  "uuid": "abc123",
  "parentUuid": "xyz789",
  "type": "assistant",
  "timestamp": "2026-10-31T12:00:00.000Z",
  "sessionId": "session-uuid",
  "version": "2.1.309",
  "message": {
    "role": "assistant",
    "content": [{"type": "text", "text": "..."}],
    "usage": {
      "input_tokens": 1000,
      "cache_read_input_tokens": 50000,
      "cache_write_input_tokens": 200,
      "output_tokens": 300
    }
  }
}
```
`[verified in repo]`

**`user` lines** — your message (or a tool result):
```json
{
  "uuid": "xyz789",
  "parentUuid": "def456",
  "type": "user",
  "message": {
    "role": "user",
    "content": [{"type": "text", "text": "your message"}]
  }
}
```

**`api-request` lines** (v2.1.300+) — a snapshot of what was actually sent to the API:
```json
{
  "type": "api-request",
  "uuid": "req123",
  "base": "prior-api-request-uuid-or-null",
  "tail": ["sha256hash1", "sha256hash2"]
}
```
`base` points to the previous `api-request` in the chain (the full prior context snapshot). `tail` is a list of SHA256 hashes pointing to `api-request-blob` entries that hold the actual message bodies. This is how reconstruction works — you follow the chain. `[verified in repo — census 4e]`

**`api-request-blob` lines** — the actual message blobs referenced by `tail`:
```json
{
  "type": "api-request-blob",
  "hash": "sha256hash1",
  "sessionId": "...",
  "message": {...full message object...}
}
```
`[verified in repo — census 4d]`

**`costState` lines** — chain-wide cumulative totals (see Section 1 for the gotcha):
```json
{
  "type": "costState",
  "costUSD": 2.45,
  "output_tokens": 593597,
  ...
}
```

**Compaction lines** — two consecutive lines:
1. A `system` line with `subtype: "compact_boundary"` and `compactMetadata: {trigger, pre_tokens}`
2. A `user` line with `isCompactSummary: true`

In **older versions** (≤ ~2.1.181), you may see `isCompactSummary: true` without a matching `compact_boundary` — the compaction protocol changed. `[verified in repo — 453b573b]`

### The parent-child chain

Every line has `uuid` and `parentUuid`. This forms a tree: each response is a child of the request that triggered it. When you see backward timestamps (a later line having an earlier timestamp than the one before it), it's because two different message chains are interleaved in the file — they cross different `message.id` values, never within the same message. `[verified in repo — census 4c]`

### Older vs newer: tool results

**Before ~v2.1.300**, tool results appear *inside* the `user` message content:
```json
{"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "...", "content": "..."}]}}
```

**In newer versions**, tool results are top-level `tool_result` lines. Any chain-integrity check must handle both formats. `[verified in repo — 453b573b uses old format]`

---

## Section 4 — Cost-state deep dive: why the numbers don't add up

This confused me too, so let me be very explicit.

**Scenario:** You have a session file `4a153124.jsonl`. You sum all the output tokens from distinct message IDs: you get 374,547 before a certain point and 678,599 after. Total = 1,053,146.

But the `costState` line says output tokens = 593,597 (for one model).

**Why don't they match?**

Because the cost-state started counting from the *beginning of the chain* — which includes one or more earlier sessions that you don't have in this file. By the time this session file starts, the cost-state already shows 585,098 tokens from prior sessions in the chain. Your file adds only ~8,499 more tokens (the delta between the two cost-state snapshots in this file).

**Mental model:** cost-state is like an odometer on a car. If you buy a used car, the odometer shows the total miles ever driven, not just the miles you drove. The transcript file is just the miles from the last leg of the trip.

**Confirmation:** `[verified in repo — census 4a and 4b confirm this exactly with a 5-token rounding difference]`

**Implication for D8 (cross-channel disagreement):** If you compare the cost-state's output tokens against the per-message sum from this file, you get a ratio of ~0.56 — which looks like a 44% discrepancy. It's not a bug. It's the expected artifact of a chain-scoped numerator vs a file-scoped denominator. assay's D8 detector must account for this.

---

## Section 5 — requestRef and tail hash chains

When Claude Code writes `api-request` lines (v2.1.300+), it builds a linked list of context snapshots. Here's how to read it:

```
api-request A  →  base: null  (first request, no prior context)
                   tail: [hash1, hash2, hash3]
                          ↓       ↓       ↓
                         blob1  blob2  blob3  (actual message content)

api-request B  →  base: A's uuid  (continuation — full prior context from A)
                   tail: [hash4]
                          ↓
                         blob4  (new message since A)
```

**Why this matters:** To reconstruct "what did the model actually receive at request B?", you need:
- blob1, blob2, blob3 (from request A's tail)
- blob4 (from request B's tail)

Some of those blobs may be from *earlier sessions in a different project* — 40–54% of tail hashes are "dangling" (unresolvable within the current project). Full reconstruction requires blobs that may span multiple projects and sessions. `[verified in repo — census 4d]`

**The `base` field is always a UUID or null** — never an array or object. Null = first request in a chain. `[verified in repo — census 4e]`

---

## Section 6 — Subagent blind spot (Detector D1)

When Claude Code's Agent tool is called, it spawns a sub-agent that:
- Has its own separate JSONL file at `subagents/agent-<id>.jsonl`
- Contains `isSidechain: true` in its lines
- Has its own `usage` (input/output token counts) **separate from the main session**

If you only read the main JSONL file, **you miss everything the sub-agent did**. This is not a small omission — a sub-agent running a complex task can use far more tokens than the orchestrating session.

**Real measurement (Harbor PR #2247):** A session with 4 sub-agents showed:
- Before fix: 25 steps, 0.52M prompt tokens
- After fix (reading subagent files): 95 steps, 2.61M prompt tokens
- The sub-agents used ~80% of the total prompt tokens `[from docs, check — Harbor PR read]`

**assay's D1 check** quantifies this: it reports what % of the session's total usage came from sub-agent files, and flags "subagent blind spot" if sub-agent files exist but weren't included in the count.

**Corpus confirmation:** `453b573b.jsonl` has 1 Agent tool call and a sibling file `subagents/agent-aee3375cea411869d.jsonl` at version 2.1.181. D1 is testable on real data. `[verified in repo — census 4g]`

**Version note:** Sub-agent files have existed since at least v2.0.42 (when `agent_transcript_path` was added to SubagentStop hooks). The corpus confirms them at v2.1.181. `[from docs, check]`

---

## Section 7 — The ten detectors (D1–D10)

assay runs a fixed set of checks on every imported session. Here's what each one looks for and why it matters:

| Detector | Name | What it looks for | Why it matters |
|---|---|---|---|
| **D1** | Subagent blind spot | Sub-agent files exist but are not in the import | You're missing tool calls and tokens |
| **D2** | Usage double-count | Same `message.id` summed more than once | Cost estimates wrong |
| **D3** | Chain break | A `parentUuid` that points to a line not in any loaded file | Part of the conversation is missing |
| **D4** | Orphan tool | A `tool_use` with no matching `tool_result` (or vice versa) | Tool call outcome unknown |
| **D5** | Compaction anomaly | A `compact_boundary` with no following `isCompactSummary`, or vice versa | Compaction event incomplete |
| **D6** | Time anomaly | Backward timestamp within a single parent-chain edge (not just adjacent lines) | Clock skew or ordering bug |
| **D7** | Unknown schema | A line type or field the importer doesn't recognise | Format version advanced; importer is guessing |
| **D8** | Cross-channel disagreement | OTel token count vs JSONL token count differs by > 2% (after correcting for chain-cumulative cost-state) | The two capture channels disagree |
| **D9** | Content blindness | Tool calls present but no content flags set → content is all blank | You captured the skeleton, not the body |
| **D10** | Dangling reference | A `requestRef` that doesn't resolve to any `api-request` in scope | Reconstruction chain is broken |

**D6 detail:** D6 must use parent-chain edges, not adjacent file lines. All backward-timestamp pairs in the corpus cross different `message.id` values — they are never within a single API call. A naive "adjacent lines" check would false-positive on ~2–8% of lines. `[verified in repo — census 4c]`

**D8 detail:** The ratio check must exclude the chain-cumulative artifact (see Section 4). Use per-message sums, not cost-state values. `[verified in repo]`

---

## Section 8 — Truth ladder badges

Every number or claim in assay carries a badge showing how trustworthy its source is:

| Badge | Meaning |
|---|---|
| `real` | From a real production session (read-only copy) |
| `real-perturbed` | Real session with deliberate modifications (e.g., a field deleted to test a detector) |
| `scripted` | A hand-crafted synthetic fixture |
| `inferred` | Derived by reasoning, not directly observed |

**Why this matters:** A finding from a scripted fixture (like "D1 fires when the subagent file is missing") is very different from "D1 fired on this production session with real usage data." Scripted data never appears as a production example in any UI or report. `[from docs, check — CLAUDE.md rule 2]`

**Where you see these:** Every chart, table, and health-check verdict in assay shows the badge. No metric appears without it.

---

## Section 9 — OTel semconv-genai: the upstream standard

OpenTelemetry is the industry standard for collecting traces from services. There's a separate repository, `open-telemetry/semantic-conventions-genai`, that defines what GenAI spans should look like. **Status: all Development** (not stable yet). `[from docs, check]`

### Key spans defined

| Span | Operation name | Kind | What it covers |
|---|---|---|---|
| Create agent | `create_agent` | CLIENT | Creating a remote agent (e.g., OpenAI Assistant) |
| Invoke agent (client) | `invoke_agent` | CLIENT | Calling an agent from outside |
| Invoke agent (internal) | `invoke_agent` | INTERNAL | An agent invoking another agent |
| Invoke workflow | `invoke_workflow` | INTERNAL | Named workflow execution |
| Plan | `plan` | INTERNAL | Agent planning step |
| Execute tool | `execute_tool` | INTERNAL | Any tool call |
| Load skill | `execute_tool` refinement | INTERNAL | Loading a skill into context |

### Key attributes

- `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.agent.version`
- `gen_ai.skill.name`, `gen_ai.skill.description`, `gen_ai.skill.source.uri` — for skill loading
- `gen_ai.conversation.compacted` (boolean) — was this call made after a compaction?

### What's NOT in the spec (Gap 7)

- No **compaction span** (the compaction event itself has no span — only a boolean flag on the next inference span)
- No **structural compaction metadata** (no pre_tokens, post_tokens, dropped_tokens, duration_ms on a span)
- No **context-composition breakdown** (no span showing how many tokens came from System prompt, CLAUDE.md, tools, conversation history, etc.)
- No **subagent lifecycle spans** specific to Claude Code's `subagents/*.jsonl` model

**What IS in the spec (corrected from earlier notes):** Skill loading spans exist (`Load skill span`, `Read skill resource span`). The gap is that Claude Code's current OTel instrumentation doesn't set `gen_ai.skill.name` on Skill tool calls — that's an instrumentation gap, not a spec gap.

**Why this matters for assay:** assay could contribute upstream proposals for compaction spans and context-composition breakdown (ADR-P2). `[from docs, check]`

### Claude Code's own OTel events (not in the generic spec)

Claude Code emits proprietary OTel events outside the generic spec:
- `claude_code.compaction` — trigger, success, duration_ms, pre_tokens, post_tokens
- `claude_code.subagent_completed` — agent_type, total_tokens, model, duration_ms
- `claude_code.skill_activated` — skill.name, invocation_trigger, skill.source
- `claude_code.llm_request` span — has `agent_id`, `parent_agent_id`, `workflow.run_id`
- `claude_code.tool` span — has `skill_name`, `subagent_type`, `tool_use_id`

These are what R1 will capture. `[from docs, check — monitoring page read]`

---

## Section 10 — context-analyzer vs assay

`context-analyzer` (PyPI: `context-tracker`, MIT, v1.0.0) is the closest existing tool to assay's Strata view. You need to know what it already does so you understand what assay adds.

### What context-analyzer already ships

- Context growth chart with budget lines (200K / 500K / 700K / 1M tokens) and autocompact threshold marker
- Cache-read churn chart (per-call re-read cost)
- Composition donut: Tool I/O vs Conversation vs System prefix
- Message inspector with collapsible content
- Cross-session analytics: cost/call vs peak context scatter, session comparison bar chart
- Subagent summary table (not quantified blind spot)
- FastAPI dashboard + MCP server

It uses L1 + L2 (JSONL transcripts + hooks). No OTel (L3), no proxy/raw bodies (L4). `[from docs, check — source read]`

### What assay adds (the differentiators)

| assay capability | context-tracker |
|---|---|
| Capture Level declaration on every run | Absent |
| Truth-ladder badge on every number | Absent |
| Lossless raw-offset provenance (every entity links to byte range) | Absent |
| Chain integrity checks (D3, D4) | Absent |
| Quantified subagent blind-spot (D1) | Partial (has subagent tables, not the % invisible) |
| Usage dedup by message.id (D2) | Addressed (uses API-reported counts directly) |
| Version-keyed importers | Absent |
| Cross-channel disagreement (D8) | Absent |
| requestRef / tail hash resolution | Absent |
| OTel dual capture (R1) | Absent |
| Run Diff | Absent |
| Reconstruction fidelity (R2) | Absent |

**Parity floor:** assay must ship context growth, composition breakdown, cache-churn, cross-session analytics, and message inspector *before* claiming novelty over context-tracker. `[from docs, check]`

---

## Section 11 — External datasets (MAST, AgentRx, TRAIL)

These are labelled datasets of agent traces used for assay's R3 validity lab (testing detectors on external corpora).

### MAST-Data (mcemri/MAST-Data on HuggingFace)

- 1,642 traces from 7 multi-agent frameworks (MetaGPT, ChatDev, AG2, etc.)
- 14 failure codes in 3 groups: Specification (5), Inter-Agent Misalignment (6), Task Verification (3)
- LLM-annotated (not human; 19-row human subset exists)
- **Format:** plain-text trajectory, NOT OTel. A plain-text importer would be needed for assay.
- **NOT gated.** 202 MB. NeurIPS 2025 Datasets track. CC BY 4.0.
- Useful for: testing failure-mode detectors on multi-agent traces `[from docs, check]`

### AgentRx (microsoft/AgentRx on HuggingFace)

- 160 failed trajectories with step-level failure + root-cause annotations
- 2 splits: `tau_retail`, `magentic_one`
- **Format:** structured JSON (trajectory_id, failures list with step_number/failure_category, root_cause)
- **GATED** (HF login + share-info agreement with Microsoft). CC-BY-4.0. 5.23 MB.
- Useful for: grounding detector output at the step level `[from docs, check]`

### TRAIL (PatronusAI/TRAIL on HuggingFace)

- 148 traces from smolagents-based agents (118 GAIA + 30 SWE-Bench)
- 1,987 OTel spans; 575 with at least one error; 841 total annotated errors
- **Format: OTel / OpenInference-shaped JSON** (`spans[]`, `child_spans[]`, Patronus SDK attributes). This is the only dataset that would directly exercise assay's OTel importer.
- **GATED** (MIT licence, but must accept terms). Asmit has access.
- Labels schema: still unverified (next human action: download one row and inspect)
- Best model at publication: Gemini-2.5-Pro at 11% joint accuracy
- Useful for: R3 external corpus, OTel importer testing `[from docs, check]`

---

## Section 12 — Milestones and gates

assay develops in milestones M0–M5. A milestone cannot close until its learning gate passes.

**M0** (current): verify and corpus. Goals:
- Verify all prior-art claims at source `[in progress — most done]`
- Freeze a corpus of real Claude Code sessions `[done — 9 sessions, 4 projects]`
- Run one R1 smoke test (OTel dual capture) `[outstanding — needs human action]`

The **learning gate** for M0 is this primer. When you can answer the gate questions correctly (using this file and the repo, not memory), M0 can close.

**M1**: build the importer + health checks. This is when the code gets written.

**M2–M5**: parsers, detectors, UI, validity lab.

---

## Key terms glossary

| Term | Definition |
|---|---|
| JSONL | JSON Lines — a text file where each line is a separate JSON object |
| Capture Level | L0–L4 scale of how much of a session was captured |
| Truth ladder | `real` / `real-perturbed` / `scripted` / `inferred` badge on every metric |
| cost-state | Chain-cumulative token/cost total in the JSONL — includes prior sessions |
| requestRef | An `api-request` line's UUID, used to link context snapshots in a chain |
| tail hash | SHA256 hash in `api-request.tail[]` pointing to an `api-request-blob` |
| compact_boundary | A system line marking where compaction happened (v2.1.296+) |
| isCompactSummary | Boolean on a user line marking the post-compaction summary message |
| isSidechain | Boolean on lines in a subagent file indicating they're from a sub-agent |
| D1–D10 | assay's 10 health-check detectors (see Section 7) |
| Strata | assay's main view — token usage broken down by layer over time |
| Constellation | assay's graph view — only `observed` and `matched` edges, no inferred edges |
| Run Diff | Side-by-side comparison of two runs with first-divergence alignment |
| OTel | OpenTelemetry — an open standard for collecting traces, metrics, logs |
| semconv-genai | `open-telemetry/semantic-conventions-genai` — GenAI conventions repo |
| gen_ai.conversation.compacted | Boolean OTel attribute: was context compacted for this inference call? |
| gen_ai.skill.name | OTel attribute for the name of a skill loaded by an agent |
| MAST | Multi-Agent System Failure Taxonomy — 14 failure codes from UC Berkeley |
| TRAIL | Trace Reasoning and Agentic Issue Localization — 148 OTel traces from Patronus AI |
| AgentRx | 160 failed agent trajectories from Microsoft Research with root-cause labels |
| Harbor | Eval harness for Claude Code; PR #2247 fixed subagent file parsing |
| context-tracker | PyPI package for Claude Code context analysis (parity floor for assay) |
