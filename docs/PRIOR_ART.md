# PRIOR ART — what exists, what is verified, what is open

Verification levels:
- **[read]** full page or paper read in the research session
- **[read-summary]** read via an extraction summary in the research session (not the full raw page); re-verify before quoting
- **[snippet]** seen only as a search snippet or abstract
- **[secondhand]** reported by an article or another document

Rule: nothing from this file goes into a README, post or UI without being upgraded to [read] and re-checked at source (date it). Claude Code's first job in M0 is to do that.

## 1. Tools that already ship (crowded lanes) — parity first, then differentiate

| Tool | What it does | Level | Consequence |
|---|---|---|---|
| **context-analyzer / context-tracker** (manavgup, MIT, v1.0.0, PyPI: `context-tracker`, last commit 2026-07-21) | Claude Code hooks (PostToolUse, PostToolUseFailure, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, InstructionsLoaded) + transcripts → SQLite (sessions, api_calls, blocks, turns, hook_events, subagents, subagent_api_calls, tool_result_offloads); per-call token breakdown (API-reported ground truth); context growth chart with budget lines, autocompact threshold; cache-read churn; composition donut (Tool I/O / Conversation / System); message inspector; cross-session analytics; Codex CLI ingest; FastAPI dashboard + MCP server. Hook events written to `~/.claude/context-trace/<session_id>.jsonl`. Key metrics from own corpus: 4.3× cost scaling 63K→721K tokens, 30% stale context, 60%+ Tool I/O. Capture: L1+L2 only (no OTel, no proxy, no request bodies). No Capture Level, no truth ladder, no raw-offset provenance, no chain integrity, no version-keyed importers, no cross-channel disagreement. | **[read]** 2026-10-31 | **Closest to Strata.** Strata is not novel as "context over time". Confirmed differentiators: Capture Level/Health, truth ladder, lossless raw offsets, chain integrity, version-keyed importers, cross-channel disagreement (D8), OTel dual capture, Run Diff, reconstruction fidelity. Parity floor items context-tracker already ships: context growth, composition breakdown, cache-churn, cross-session analytics, message inspector, subagent summary. Interop possible via hook-event JSONL. |
| **lm-assist** (claude plugin) | Session viewer with subagent tree reconstructed from separate session files, thinking blocks, tool calls | [snippet] (Medium post) | Parity floor for tree view |
| **Coding Agent Trajectory Viewer** (VS Code ext., 102 installs) | Claude Code + Codex JSONL; optional **capture proxy** via `ANTHROPIC_BASE_URL` for full API capture; search, export unified JSON, usage dashboard | [snippet] | Proves the proxy is a real capture channel (our L4). Parity floor for search/export |
| **claude-code-transcripts / claude-code-timeline** (Simon Willison) | Transcript to HTML / timeline viewers | [snippet] | Parity floor for readable export |
| **Claude Code Session Viewer** (adityabawankule.io, in-browser) | Parses JSONL locally; turns, tool calls, subagent trees, "deduped token cost" | [snippet] | Token double-counting is a known hazard (detector D2); local-only privacy model is the bar |
| **claude-session-index** and others | Search/analyze across sessions | [snippet] | Atlas lane (Later) |
| **Harbor** (harbor-framework) | Eval harness (ATIF trajectory format) whose Claude Code parser missed subagent files entirely — PR #2247 fixes it by reading `subagents/*.jsonl` alongside main session files. On a real session (v2.1.78) with 4 subagents: **95 steps vs 25** and **2.61M vs 0.52M prompt tokens** before/after fix (~80% of prompt tokens were invisible). Subagent events carry `uuid`, `isSidechain: true`, `agentId`, per-message `model`/`usage`. | **[read]** 2026-10-31 | **Confirms D1 at scale (80% prompt tokens invisible).** Same fix assay's importer must ship. Dedup-by-uuid guards against any version that writes an event to both main and subagent files. |
| **Langfuse / Phoenix / OpenInference ecosystem** | General LLM tracing UIs | [snippet] | We do not replace them; OTLP importer lets assay read their exports |
| **Vercel Agent Runs** (eve agents) | Observability for eve-framework agent runs | [read-summary] (tool descriptions seen) | Adjacent, different harness |

## 2. Primary sources verified this session

### Jev paper — arXiv:2609.34862 (Wang, Gao; 28 Sep 2026; preprint, not peer-reviewed) — **[read]**
Table 2, threshold s≥3, revised labels, 4-benchmark means:

| Judge | Valid | Coverage% | P% | R% | F1% | Acc% |
|---|---|---|---|---|---|---|
| JEV | 4982 | 95.5 | 77.1 | 79.2 | **77.8** | 82.8 |
| GLM-5.2 (best generative) | 4927 | 94.4 | 91.9 | 64.1 | **74.1** | 86.5 |
| DS-V4-Flash | 5214 | 99.9 | 51.6 | 75.6 | 61.0 | 61.5 |
| DS-V4-Pro | 3070 | 58.8 | 93.3 | 49.4 | 56.3 | 92.1 |
| Qwen3-Next | 4926 | 94.4 | 92.0 | 37.2 | 49.4 | 76.4 |

Per dataset (F1): R-Judge JEV 88.5 vs GLM-5.2 93.4 (**JEV loses**); ATBench500 93.8 vs 85.9 (wins); TraceSafe 67.8 vs 72.4 (**loses**); MCPHunt 61.1 vs 44.9 (wins).
Caveats we must repeat when citing: one fixed threshold across models and benchmarks, **the split used to choose it is not disclosed (possible leakage)**; "revised labels" (resisted injections and signal-only reclassified from unsafe) with changed count not stated; latency and cost exclude failed calls; judge configs differ in instructions/serving; the authors suggest independently reviewed labels as future work; **the paper does not describe JEV as open or available**. JEV asks four typed questions per trace (score, authorization, safety_judgment, severity).
Consequence: Jev is a plausible cheap screening classifier for safety-style trace questions, with mixed per-benchmark evidence. It is not a general trace-quality judge. Our R5 calibration measures it on our traces.

### Claude Code OpenTelemetry — code.claude.com/docs/en/monitoring-usage — **[read-summary]** (extractor summary of the page; re-read raw page in M0)
- Events: `claude_code.compaction` (trigger, success, duration_ms, pre_tokens, post_tokens, error, precompute_reuse), `claude_code.subagent_completed` (agent_type, total_tokens, total_tool_uses, duration_ms, model, ...), `claude_code.skill_activated` (skill.name, invocation_trigger, skill.source, skill.kind, ...).
- Spans: `claude_code.llm_request` has `agent_id`, `parent_agent_id`, `workflow.run_id`; `claude_code.tool` has `skill_name`, `subagent_type`, `tool_use_id`.
- Correlation ids: `session.id`, `prompt.id`, `tool_use_id`, `request_id`, `client_request_id`.
- **Traces are beta and off by default** (needs `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` / `ENABLE_BETA_TRACING_DETAILED` per the page).
- Content flags, all **default off**: `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_ASSISTANT_RESPONSES`, `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_TOOL_CONTENT`, `OTEL_LOG_MANAGED_SETTINGS`, `OTEL_LOG_RAW_API_BODIES` (supports `file:<dir>`); `CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH` default 61440 (so content is truncated by default: a Capture Level fact).
- Docs warn tool details can hold the same sensitive content as the session.
- Metrics include `claude_code.token.usage` (cacheRead/cacheCreation types) and `claude_code.cost.usage`.

### Claude Code changelog — code.claude.com/docs/en/changelog — **[read]** 2026-10-31 (full page, 433 versions from 2.0.x through 2.1.314)
Relevant: 2.1.300 local transcripts also record each API request's system prompt, tools and parameters; `CLAUDE_CODE_TRANSCRIPT_LOCAL_GC` can drop messages from the saved transcript (changelog fixes in 2.1.296 for Unicode separators and 2.1.304 for disk-full trimming; first-introduction version not found) **[read]**; 2.1.299 PDF bytes no longer kept; OTel additions (tracing beta ~2.1.101, `TRACEPARENT` ~2.1.141, `agent_id`/`parent_agent_id` on tool spans ~2.1.145-208, raw API bodies `file:<dir>` ~2.1.274).
**Resolved (changelog read, 433 sections to 2.1.314):** the Reddit claim of a 2.1.207 change that stopped writing `~/.claude/sessions` has no matching changelog entry; 2.1.246 refers to cleaning stale entries in `~/.claude/sessions`, so the directory exists. Treat the claim as unverified/likely false; confirm empirically on own installs in M0. Other relevant entries: 2.1.304, 2.1.311 (out-of-order messages in `claude -p`/SDK), 2.1.307 (subagent placeholder usage), 2.1.309 (jq-unparseable transcripts), 2.1.208 (transcript size cut), 2.1.212 (effort level recorded).

### JSONL transcript format — **[read]** from several third-party viewers/posts; **no official schema found** (hooks page query returned nothing on schema or stability)
Top-level per line: `uuid`, `parentUuid`, `isSidechain`, `type`, `timestamp`, `sessionId`, `agentId` (subagent), `version`, `cwd`, `gitBranch`, `slug`. Message: `message.role`, `message.content[]` (text/tool_use/tool_result), `message.usage.{input_tokens,cache_creation_input_tokens,cache_read_input_tokens,output_tokens}`. Compaction: a `system` line with `subtype:"compact_boundary"` and `compactMetadata{trigger,pre_tokens}` then a `user` line with `isCompactSummary:true`. Location `~/.claude/projects/<munged-path>/<session-id>.jsonl`. **Two subagent layouts:** newer = `<session-id>/subagents/agent-<id>.jsonl` (top-level lines all `isSidechain:false`); older = inline `isSidechain:true`. Importer must support both and report which it saw.

### OTel GenAI semantic conventions — **[read]** 2026-10-31 (README.md and anthropic.md read at source; gen-ai-agent-spans.md saved but not yet parsed)
Repo: `open-telemetry/semantic-conventions-genai`, main branch, 9 branches, 0 tags, last commit Oct 28 2026 (commit 3fe8460). Status: **Development** on all docs. Docs tree: `client-inference.md`, `client-embeddings.md`, `gen-ai-events.md`, `gen-ai-exceptions.md`, `gen-ai-metrics.md`, `gen-ai-token-metrics.md`, `gen-ai-spans.md`, `gen-ai-agent-spans.md`, `anthropic.md`, `mcp.md`, `a2a.md`.

**Anthropic-specific conventions** (`anthropic.md`, read in full): `gen_ai.conversation.compacted` (boolean, Recommended) — a boolean flag on inference spans, set to `true` when context was compacted for this call; `gen_ai.request.reasoning.level` (low/medium/high); full token attributes including cache_read and cache_write (with note that Anthropic input_tokens excludes cached tokens, must add cache_read and cache_write to compute total). Tool/content attributes are opt-in.

**`gen_ai.operation.name` values** include: chat, create_agent, execute_tool, invoke_agent, invoke_workflow, plan, retrieval, create_memory, search_memory, upsert_memory — **no `compact` operation type**.

**Confirmed absent:** No compaction span type; no `compact` or `compress` operation name; no compaction metadata attributes (pre_tokens, post_tokens, dropped_tokens, duration_ms); no subagent lifecycle spans; no context-composition breakdown. `gen_ai.conversation.compacted` is the only compaction coverage — a boolean, not a structural entity. **Upstream-proposal opportunity for compaction confirmed** (ADR-P2 in roadmap). `[read]` 2026-10-31

**CORRECTION (E6, 2026-10-31): Skill spans DO exist.** `gen-ai-agent-spans.md` (172 KB, fully parsed) contains a `Load skill span` refinement (`gen_ai.execute_tool.load_skill.internal`) and a `Read skill resource span` refinement. Attributes: `gen_ai.skill.name`, `gen_ai.skill.description`, `gen_ai.skill.source.uri`. Frameworks targeted: Google ADK, OpenAI Agents, Strands, Agno. The gap is an **instrumentation gap in Claude Code**, not a spec gap — Claude Code's OTel instrumentation does not currently set `gen_ai.skill.name` on Skill tool calls. Gap 7 is now: compaction structural entity + context-composition breakdown (not skills). `[read]` 2026-10-31

### TRAIL — arXiv:2505.08638 (Deshpande et al., submitted 13 May 2025) — abstract **[read]**, schema **[read-preview]**
148 human-annotated traces from single and multi-agent systems (GAIA, SWE-bench), a formal error taxonomy; best model at publication, Gemini-2.5-pro, scored 11%. Dataset card (HF) [read-summary]: 118 GAIA + 30 SWE-Bench traces, 841 errors, 575 spans with at least one error, MIT licence, impact levels Low/Medium/High. **Corrections to earlier notes:** (a) "11%" is the paper-time best, not current state of the art; do not call it SOTA; (b) **HF dataset is gated** (approved access required; Asmit approved as of 2026-10-31). (c) Correct HF URL is `PatronusAI/TRAIL` (NOT `ServiceNow-AI/TRAIL` which 404s). Trace format: OTel/OpenInference-shaped JSON with `spans[]` and `child_spans[]`, Patronus SDK (`pat.*`) and OpenInference attributes. Labels schema: still unverified (truncated in preview). **Next action:** download one row from `PatronusAI/TRAIL` to read the labels column.

### Context categories (official) — code.claude.com/docs/en/context-window — **[snippet]**
The interactive explainer's legend names context sources: System, CLAUDE.md, Memory, Skills, MCP, Rules, You (user), Files, Output, Claude, Hooks; subagents get a separate context window and only a summary plus a small metadata trailer returns. **Use these as Strata's layer taxonomy** (ADR-006) instead of inventing ours.

## 3. Gaps we believe are open (each must survive M0 verification)
1. Capture Level / Trace Health as a reported property for coding-agent telemetry.
2. Cross-channel agreement (JSONL vs hooks vs OTel vs proxy) measured on the same run.
3. Reconstruction fidelity of "context at step N" scored against raw API bodies.
4. Exact-match literal provenance as the primary outcome (no judge).
5. Run Diff with first-divergence alignment for agent runs.
6. Version-matrix importer that degrades visibly instead of silently.
7. Missing OTel entity conventions for compaction structure and context-composition breakdown. (**Skills are covered** by `gen_ai.skill.name` + load/read skill spans — gap is instrumentation, not spec.)
"We believe" is deliberate. A tool may exist that we missed.

## Open verification tasks (M0, report before building)
1. ✅ Search GitHub, PyPI, npm, arXiv for each gap above. Read context-analyzer's source and docs. **Done 2026-10-31** — see notebook `2026-10-31-m0-research.md`.
2. ✅ Re-read raw code.claude.com monitoring page and the full changelog; record which version first wrote `subagents/` files and the first version with request bodies in transcripts. **Done 2026-10-31** — `agent_transcript_path` field from v2.0.42; request bodies from v2.1.300; see notebook.
3. ✅ Read Harbor PR #2247 at source. **Done 2026-10-31** — 80% of prompt tokens invisible without subagent file reads; confirmed D1. Reproducing on own corpus (453b573b) is pending (M1).
4. ✅ Verify tool_use / tool_result block field names and id linking on real local transcripts. **Done 2026-10-30/31** — confirmed on corpus; older versions embed tool_result in user message content, not top-level.
5. ✅ Check whether one assistant message appears on multiple JSONL lines (D2). **Done 2026-10-30** — confirmed: same message.id appears on multiple lines; usage is identical across them; dedupe by id.
6. ✅ Fetch OTel `semantic-conventions-genai` at the repo: status, agent spans, any compaction/skill/context entity. **Done 2026-10-31** — `gen_ai.conversation.compacted` boolean exists; no compaction span; no skill or context-composition entity. Upstream proposal opportunity confirmed.
7. ✅ Fetch MAST-Data and AgentRx schemas and licences. **Done 2026-10-31** — schemas read; licences: AgentRx CC-BY-4.0 confirmed; MAST-Data paper CC BY 4.0 per OpenReview (dataset HF card doesn't state it; GitHub `multi-agent-systems-failure-taxonomy/MAST` has no separate licence file — treat as CC BY 4.0 with caveat). TRAIL: MIT licence confirmed; labels schema still unverified (next: read `PatronusAI/TRAIL` with Asmit's HF credentials).
8. Get a Jev/System One answer: is it accessible, pricing, data-retention terms. **Outstanding.**
9. ✅ Run R1 smoke test. **Done 2026-10-31** — L3+L4 confirmed (otelcol 0.164.0, 127.0.0.1:4317). Prompt/response/API request telemetry observed. Raw body artifacts created and indexed. Exact raw-body correspondence not independently verified (open for R1-v2). See notebook `2026-10-31-r1-smoke-test.md`.
10. ✅ Read TRAIL labels schema. **Done 2026-10-31** — labels column verified from swe_bench row 0. Schema: `{trace_id, errors: [{category, location (span_id), evidence, description, impact: LOW|MEDIUM|HIGH}], scores: [{reliability_score, security_score, instruction_adherence_score, plan_opt_score, overall (float 1–5)}]}`. Human-annotated per trace. See PRIOR_ART TRAIL entry.

**MAST-Data / MAD (mcemri/MAST-Data, HuggingFace) — [read] 2026-10-31:** 1,642 traces, 7 MAS frameworks (AG2, MetaGPT, ChatDev, Magentic, AppWorld, HyperAgent, OpenManus), 8 benchmarks (ProgramDev/v2, GSM, Olympiad, GAIA, MMLU, Test-C, SWE-Bench-Lite), 5 LLMs (GPT-4o, Claude, GPT-4o-mini, Qwen, CodeLlama). Schema: `{mas_name, llm_name, benchmark_name, trace_id, trace: {key, index, trajectory}, mast_annotation: {14 codes → 0/1/null}}`. `trajectory` is plain-text log, NOT OTel. LLM-annotated (not human; 19-row human subset uses 4 incomparable taxonomy revisions). NOT gated. 202 MB. NeurIPS 2025 (Cemri et al.). Licence: CC BY 4.0 per OpenReview submission. GitHub repo is `multi-agent-systems-failure-taxonomy/MAST` (not `mcemri/MAST`). HF card does not state licence explicitly; treat as CC BY 4.0 with note. `[read]` 2026-10-31

**AgentRx (microsoft/AgentRx, HuggingFace) — [read] 2026-10-31:** 160 rows, CC-BY-4.0, **gated** (requires HF login and info-sharing agreement with Microsoft). 2 splits: `tau_retail`, `magentic_one`. Schema: `{trajectory_id, failure_summary, failures: [{failure_id, step_number, step_reason, failure_category, category_reason, failed_agent}], root_cause: {failure_id, reason_for_root_cause}, root_cause_failure_id, root_cause_reason, num_failures}`. 5.23 MB. arXiv 2602.02475 (Barke et al., Microsoft Research, Feb 2026). Focus: root-cause localization in failed trajectories, not trace-quality. CC-BY-4.0 permits research use.

**TRAIL — labels schema verified [read] 2026-10-31:** dataset `PatronusAI/TRAIL`, gated (approved access required). Configs: `default`, splits `gaia` (117 traces) and `swe_bench` (31 traces) = 148 total. Two string columns: `trace` and `labels`.

`trace` format: JSON with `trace_id`, nested `spans[]` → `child_spans[]`; OTel-style fields (`span_id`, `parent_span_id`, `span_kind`, `resource_attributes`, `span_attributes`, `logs[]`); Patronus SDK (`pat.*`) and OpenInference attributes (`llm.input_messages.N.message.{content,role}`, `llm.token_count.*`, `openinference.span.kind`). Roles seen: `assistant`, `tool-call`, `tool-response`. SWE-Bench sample was a smolagents CodeAct agent using a `python_interpreter` tool.

`labels` format — **verified from swe_bench row 0 (trace_id 58bfe9dde723516f4d9366eb6b4b6388)**:
```json
{
  "trace_id": "<string>",
  "errors": [
    {
      "category": "<string>",   // e.g. "Instruction Non-compliance", "Incorrect Problem Identification",
                                 // "Language-only", "Resource Exhaustion", "Tool Output Misinterpretation"
      "location": "<span_id>",  // hex span_id of the span containing the error
      "evidence": "<string>",   // verbatim code/text excerpt
      "description": "<string>",
      "impact": "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "scores": [
    {
      "reliability_score": <int>,
      "reliability_reasoning": "<string>",
      "security_score": <int>,
      "security_reasoning": "<string>",
      "instruction_adherence_score": <int>,
      "instruction_adherence_reasoning": "<string>",
      "plan_opt_score": <int>,
      "plan_opt_reasoning": "<string>",
      "overall": <float>
    }
  ]
}
```
Row 0 example: 6 errors in `errors[]`, categories include Instruction Non-compliance (×2), Incorrect Problem Identification, Language-only, Resource Exhaustion, Tool Output Misinterpretation; impacts LOW/MEDIUM/HIGH. One `scores` entry with overall 3.25/5. Score integers 1–5 (inferred; max seen is 5). TRAIL is OTel-shaped traces with human-annotated error+score labels per trace. Not Claude Code transcripts — useful for R3 (external corpus) and OTel importer testing. MIT licence. Note: SWE-bench traces embed full prompts and patches (9.04 MB trace strings).

**Jev access and cost check (30 Oct 2026) [read, vendor + secondary]:** early access with a waitlist; typesafe.ai blog and the LangChain guide confirm API use with a `TYPESAFE_API_KEY`, model `jev-latest`, request `{state, questions}` with `type: "noul"` questions, probabilities returned, all questions evaluated in parallel. Vendor pricing: input $0.042/MTok, output free. Vendor latency claim: 70-500 ms (our earlier ~1 s median came from the paper; treat both as unverified for our workload and measure ourselves). **Security caveat [secondary source, unverified]:** a HiddenLayer test reportedly steered Jev-based agents with indirect prompt injection (a planted ad changed click probabilities). Trace content is untrusted input, so a judge reading traces can be steered by them. Judge outputs stay `model-judged` and the injection case becomes a validity-lab test. Whether you have an API key is not something I can check from here.
