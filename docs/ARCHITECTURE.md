# ARCHITECTURE — assay

## Shape
`assay-core` is a headless TypeScript library that runs identically in the CLI, a CI Action, an MCP server, and a browser worker. The web app and renderer only display what core computed. JSON Schema is emitted from zod so a Rust/WASM port is possible later (Later, needs evidence trigger).

```
capture channels ─▶ importers ─▶ canonical Run (raw offsets kept) ─▶ Health ─▶ graph ─▶ views
 L1 transcript JSONL     (tool,version)-keyed        │                 │         └▶ provenance, diff
 L2 hooks events                                     └▶ detectors ─────┘
 L3 OTel logs/spans/metrics
 L4 raw API bodies / proxy
```

## Capture Level (declared per run, shown first)
Computed by the importer from what was actually present, never assumed.
| Level | Means | Typical source |
|---|---|---|
| L0 | final text or export only | pasted/exported summaries |
| L1 | transcript events with uuids/parent links, usage per message | `~/.claude/projects/**/*.jsonl` (+ `subagents/` dir when present) |
| L2 | L1 + lifecycle hook events (compaction pre/post, subagent start/stop, instructions loaded) | hooks writing to a local log |
| L3 | structured events and spans with ids (`tool_use_id`, `request_id`, `agent_id`, `parent_agent_id`) and declared content flags | OTLP file/collector (traces are beta, off by default) |
| L4 | exact API request/response bodies | `OTEL_LOG_RAW_API_BODIES=file:<dir>`, capture proxy, or transcripts that record request params (2.1.300+ per changelog) |

A run also records **content flags** (which of prompts/responses/tool details/tool content/raw bodies were on) and **truncation** (`CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH` and any transcript GC). Capture Level is a vector `{level, flags, truncated, version, layout}`, shown as a one-line badge plus detail.

## Canonical schema (zod, versioned; raw-offset-preserving)
- `Run` {id, harness{tool,version,layout}, capture{...}, truth: real|real-perturbed|scripted|inferred, sources[], costStates[], rawApiRequestCount}
- `Source` {kind, path/uri, sha256, bytes, lines} — all derived data points back here
- `Event` {id, source, offset{file,line,byteStart,byteEnd}, ts, kind, parentId?, agentId?, raw}
- Entities derived from events, each with `evidence: Offset[]`:
  `Message`, `ToolCall`/`ToolResult` (linked by id), `LlmRequest` (usage incl. cache read/create), `Agent`/`Subagent` (agentId, parentAgentId, type, file), `Skill` (activation, trigger, source), `Compaction` (trigger, summaryOffset, summarizedTurnUuids? [v2.1.308+]), `McpCall` (server, tool), `Hook`, `Artifact` (path, first write, sha if available)
- `CostState` {evidence, totalCostUSD, totalAPIDurationMs, hasUnknownModelCost, modelUsage{model→{inputTokens,outputTokens,thinkingTokens,cacheReadInputTokens,cacheCreationInputTokens,costUSD}}}: runtime cost-state records (v2.1.308+, parsed from JSONL; see ADR-013). Multiple may appear; last record is the final cumulative accounting.
- `Unknown` {offset, reason}: any line/field the importer did not understand. Never dropped.
Edges: `observed` (explicit id link) or `matched` (exact string equality of a literal from a prior result). No other edge kinds exist in the type system.

## Importers (keyed by tool + version range)
- **claude-code-jsonl**: both subagent layouts (inline sidechain; `<session>/subagents/agent-<id>.jsonl`), compaction boundary + summary, usage per message, version detection from the `version` field, unknown-type reporting. Reads the whole session directory, not one file (undercount hazard).
- **otlp**: generic OTLP JSON/NDJSON file + Claude Code profile (events, spans, metrics) + TRAIL-compatible OpenInference attributes (schema pending dataset access).
- **hooks-log**: read the local hook event log (format ours; documented).
- **external-corpus adapters** (R3): TRAIL (gated), MAST-Data, AgentRx → canonical schema with their labels as `external-label` annotations, not events.
- **openinference**, **langfuse export**: Later.

## Health (Trace Health report)
Verdict `trustworthy | usable-with-caveats | do-not-trust-for:<metric list>` per metric family (tokens, structure, subagents). Each finding has a detector id, severity, evidence offsets, and a **validity card** (audited precision on real traces; scripted precision/recall reported separately and badged SYNTHETIC).

**ValidityCard** (shown before any metric): claimedTurns, verifiedUsageTurns, usageCoverageRate, modelIdentificationRate, totalInputTokens, totalContextTokens, totalOutputTokens, cacheHitRate, importerCoverage{totalLines,eventLines,unknownLines,unknownRatio}, observability{compaction,subagent,skill,costState → state/count/reason}, runtimeCostUSD (from last cost-state), runtimeCostHasUnknownModel, captureLevel, overallHealth, caveats[].

**ObservabilityState** (ADR-015): `observed` (events found) | `not-observed` (none found; L1 cannot confirm absence) | `verified-absent` (independent evidence). Reserved for future L2/L3 signals. At L1 all categories except those with events are `not-observed`.

### Detectors (deterministic; each carries evidence offsets)
- **D1** subagent blind spot: subagent referenced (agentId/tool result) but transcript file missing → token totals undercounted. Zero corpus hits yet (ADR-011); logic is correct.
- **D2** usage double-count: same `message.id` on multiple raw assistant lines. Canonicalized to max-usage occurrence; summing all lines inflates ~2.4-3.5×.
- **D3** chain break: `parentUuid` pointing to absent uuid (GC or truncation).
- **D4** orphan tool_use/tool_result: two exemptions — in-flight (unmatched tool_use at end-of-file) and post-compaction (tool_result whose tool_use was summarized). Uses `summarizedTurnUuids` for precise exemption when available (v2.1.308+, ADR-015); falls back to line-number comparison otherwise.
- **D5** context overflow: `inputTokens` exceeds the known model context limit. Unknown or synthetic model produces info-only; context limit table in detectors.ts.
- **D6** usage disagreement: `inputTokens` disagree across raw duplicates (warn); `outputTokens` differ (info — streaming-partial expected). Max-usage record selected in both cases.
- **D7** compaction token pattern: post-compaction `inputTokens` > pre-compaction (info; may indicate a large tool result rather than a failed compaction).
- **D8** session ID conflict: one source file contains >1 distinct non-empty `sessionId`.
- **D9** timestamp reversal: first backward timestamp transition per source file (info; equal timestamps allowed for streaming duplicates).
- **D10** api-request count mismatch: `rawApiRequestCount` vs `llmRequests.length` diff >2 (info). Count-based only; ID namespaces differ (ADR-014). Zero on pre-v2.1.308 sessions.
- **D-cost** cost-state cross-check: last cost-state `inputTokens` total vs JSONL usage total disagree >5% and >500 tokens (warn). Fires on v2.1.308+ sessions with cost-state records (ADR-013). Delta expected when runtime made internal routing calls not in the conversation transcript.

## Reconstruction (M4)
Rebuild "what the model saw at request N" from L1/L2 data; score against L4 bodies where available (R2). Output a fidelity score per layer category (System, CLAUDE.md, Memory, Skills, MCP, Rules, You, Files, Output, Claude, Hooks) with explicit unknowns.

## Provenance (M4)
For a chosen literal (path, command, id, error string), report `first_seen` in which result, which later calls reuse it, with raw offsets. Exact string equality only. A literal that appears with no prior source is reported as **unsourced**, not "hallucinated".

## Run Diff (M4)
Align by structural keys (step kind + tool + normalised args), not by text similarity. Report first divergence, then downstream differences (tools, tokens, artifacts). Alignment confidence is shown.

## Judge plane (optional, off by default)
Interface `Judge { id, version, ask(trace, questions) -> {answers, probabilities} }`. Adapters: Jev/System One (typed `choice`/`noul` questions; no text output; paper reports four questions per trace) and a generic LLM judge. Runs only after redaction; output rows carry `model-judged` + probability. Calibrated against R5 free structural labels (reliability curves). Cost model is configurable; do not hardcode a per-call price until verified from provider docs.

## Surfaces
- **CLI** `assay import|health|corpus|diff|prove` with JSON output and exit codes for CI.
- **CI Action**: assertions on Health and trace properties (Next).
- **MCP server**: read-only tools exposing Health and provenance queries (Later; evidence trigger).
- **Web** (static, local-first): Run Card, Constellation, Strata, Replay Theatre, Run Diff; data loaded locally in a worker; nothing uploaded.

## Repo layout
```
packages/assay-core/src/{schema,importers/{claude-code-jsonl,otlp,hooks-log,external},health,detectors,graph,reconstruct,provenance,diff,judge}
packages/assay-cli  packages/assay-stage  web/  spec/  corpus/{raw,meta,audits}  fixtures/{real,scripted}
results/  learn/  tests/  scripts/
```
Corpus `raw/` is gitignored and local only. `meta/` holds hashes, versions, flags, truth badges.

## Safety and privacy
Never commit raw traces. Redaction pass (paths, tokens, emails, env values) before any judge call or export. Log which content flags produced each corpus file. Hooks and OTel enabled only on our own machine, with a note in the notebook.
