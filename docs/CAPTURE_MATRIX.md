# CAPTURE_MATRIX — What each source can actually expose

This document answers a different question from Capture Level.

**Capture Level** (L0–L4) describes what was actually captured for a specific run.  
**Capture Matrix** describes what each source type *can theoretically expose* for each event category — and what has been verified against real Claude Code data.

The cells use three values:
- **✓ verified** — we have confirmed this with real corpus data
- **~ partial** — the source exposes some but not all of this category; specific gaps noted
- **✗ not-exposed** — the source does not emit records for this category
- **? unverified** — unknown; needs a capture test (see Open tasks below)

---

## Matrix (Claude Code, versions 2.1.165–2.1.308+)

| Event category | L1: JSONL transcript | L2: hooks events | L3: OTel spans/metrics | L4: raw API bodies |
|---|---|---|---|---|
| **LLM requests** (per turn) | ✓ verified — `assistant` lines with `message.usage`; deduplicated by `message.id` | ? unverified | ✓ verified (R1-F2) — `claude_code.llm_request` spans | ✓ if proxy/OTel body capture on |
| **LLM requests** (internal routing, non-conversation) | ✗ not-exposed — haiku tool-routing calls absent from transcript (ADR-012) | ? unverified | ✓ verified (R1-F2) — appear in OTel as separate spans | ✓ if proxy on |
| **Token usage** (input, output, cache) | ✓ verified — `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` per assistant line | ~ partial — `total_tokens_reminder` in attachment events gives a runtime counter; not per-request | ✓ verified (R1-F1 and R1-F2) | ✓ if bodies captured |
| **Token usage** (thinking tokens) | ~ partial — present in some versions via cost-state records; not on individual assistant lines | ? unverified | ? unverified | ✓ if response body captured |
| **Cost (USD)** | ~ partial — `cost-state` records (v2.1.308+) give `totalCostUSD` and per-model `costUSD`; not per-request | ✗ not-exposed | ? unverified | ✗ (cost is runtime-computed, not in API response) |
| **Tool calls** (identity, name) | ✓ verified — `tool_use` blocks in `message.content` | ? unverified | ✓ if instrumented | ~ partial (in request body if bodies captured) |
| **Tool results** (content) | ~ partial — `tool_result` blocks in user events; content depends on `toolContent` flag | ? unverified | ✓ if instrumented | ~ partial (in response body if captured) |
| **Compaction** (boundary) | ✓ verified — `type: user, isCompactSummary: true` or `type: summary` events | ? unverified — lifecycle hooks may emit a compaction signal | ? unverified | ✗ not in API bodies |
| **Compaction** (which turns were summarized) | ~ partial — `summarizedTurnPromptUuids` present on some compaction events (v2.1.308+) | ? unverified | ? unverified | ✗ |
| **Compaction** (pre/post token counts) | ✗ not-exposed — `usage: {}` on compaction lines; no token fields (verified in corpus) | ? unverified | ? unverified | ✗ |
| **Skills** (invocation) | ~ partial — inferred from `Skill` tool_use blocks; only invoked skills, not loaded ones | ? unverified — skill loading may appear in hooks | ? unverified | ? unverified |
| **Skills** (listing, available) | ~ partial — `skill_listing` attachment subtype present in some sessions | ? unverified | ✗ | ✗ |
| **Subagents** (spawning) | ~ partial — `agentId` on user events; subagent transcript in separate file; no explicit spawn event | ? unverified — hooks may emit a subagent-start signal | ? unverified | ✗ |
| **Subagents** (parent-child relationship) | ~ partial — `parentAgentId` field if present; not always emitted | ? unverified | ? unverified | ✗ |
| **Session lifecycle** (start/end) | ~ partial — first/last events give approximate boundaries; no explicit start/end record | ? unverified — hooks likely expose session lifecycle | ? unverified | ✗ |
| **Context files** (which files were attached) | ~ partial — `file` attachment subtype in user events; content behind `toolContent` flag | ? unverified | ? unverified | ✓ if bodies captured |
| **Memory files** | ~ partial — `nested_memory` attachment subtype in user events | ? unverified | ? unverified | ✓ if bodies captured |
| **MCP tool calls** | ✓ verified — appear as `tool_use` blocks with MCP tool names | ? unverified | ? unverified | ✓ if request bodies captured |
| **api-request records** (UUID) | ~ partial — `api-request` lines present in some sessions; UUID namespace differs from `requestId` (ADR-014) | ? unverified | ✓ verified | ? |
| **Request/response latency** | ✗ not-exposed | ? unverified | ✓ via span duration | ✗ |
| **Errors and interruptions** | ~ partial — some error conditions appear as system events | ? unverified | ? unverified | ? unverified |

---

## Verified gaps (findings from R1 and corpus analysis)

| Gap | Evidence | Detector | Source |
|---|---|---|---|
| Internal routing calls (haiku tool-routing) absent from JSONL | R1-F2 cross-channel comparison | D-cost (cost-state vs JSONL token divergence) | ADR-012 |
| Compaction pre/post token counts never emitted | `usage: {}` on all compaction lines across corpus | D7 uses surrounding LlmRequests instead | notebook 2026-11-01 |
| `summarizedTurnPromptUuids` only on last compaction of v2.1.308+ sessions | One occurrence in E--RIP corpus | D4 falls back to line-number comparison | notebook 2026-11-01 |
| cost-state records only on v2.1.308+ | Absent from v2.1.165 sessions | ObservabilityState not-observed | corpus census |
| `requestId` (req_…) cannot be joined to `api-request` UUID | Namespace mismatch confirmed in all real sessions | D10 count-based only | ADR-014 |

---

## Open verification tasks (each needs a capture test)

A capture test: trigger the event deliberately in a test session, capture with the source under test, verify the record appears.

1. **Hooks + compaction**: does a lifecycle hook emit a compaction event with pre/post counts?
2. **Hooks + subagent spawn**: does a hook emit a subagent-start event with parentAgentId?
3. **OTel + cost**: does OTel emit per-request cost, or only cumulative?
4. **OTel + skills**: are skill invocations emitted as spans?
5. **Thinking tokens in JSONL**: do any JSONL versions expose thinking tokens per request (not just via cost-state)?
6. **Session start/end hooks**: are there explicit lifecycle events for session boundaries?
7. **attachment subtypes**: full census of `attachment` record subtypes across versions (known: `file`, `skill_listing`, `invoked_skills`, `total_tokens_reminder`, `nested_memory`; others unknown).

Results of each test belong in `docs/notebook/` with the date and version string.

---

## How to read this in the context of Capture Level

Capture Level tells you what sources were active for a run. This matrix tells you what questions each source can answer. Together they determine what a ValidityCard can honestly assert.

Example: a run at L1 with no cost-state records can report per-turn token usage but cannot report total cost, thinking tokens, or internal routing calls. The ValidityCard's `observability.costState` will be `not-observed`, and the caveats will note the L1 internal-routing gap.

Example: a run at L1 where D-cost fires means cost-state and JSONL disagree. The `observability.costState` state is promoted to `capture-incomplete` — stronger than `not-observed`, because we have affirmative evidence that one source is missing records.
