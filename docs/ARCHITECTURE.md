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
- `Run` {id, harness{tool,version,layout}, capture{...}, truth: real|real-perturbed|scripted|inferred, sources[]}
- `Source` {kind, path/uri, sha256, bytes, lines} — all derived data points back here
- `Event` {id, source, offset{file,line,byteStart,byteEnd}, ts, kind, parentId?, agentId?, raw}
- Entities derived from events, each with `evidence: Offset[]`:
  `Message`, `ToolCall`/`ToolResult` (linked by id), `LlmRequest` (usage incl. cache read/create), `Agent`/`Subagent` (agentId, parentAgentId, type, file), `Skill` (activation, trigger, source), `Compaction` (trigger, pre/post tokens, summary offset), `McpCall` (server, tool), `Hook`, `Artifact` (path, first write, sha if available)
- `Unknown` {offset, reason}: any line/field the importer did not understand. Never dropped.
Edges: `observed` (explicit id link) or `matched` (exact string equality of a literal from a prior result). No other edge kinds exist in the type system.

## Importers (keyed by tool + version range)
- **claude-code-jsonl**: both subagent layouts (inline sidechain; `<session>/subagents/agent-<id>.jsonl`), compaction boundary + summary, usage per message, version detection from the `version` field, unknown-type reporting. Reads the whole session directory, not one file (undercount hazard).
- **otlp**: generic OTLP JSON/NDJSON file + Claude Code profile (events, spans, metrics) + TRAIL-compatible OpenInference attributes (schema pending dataset access).
- **hooks-log**: read the local hook event log (format ours; documented).
- **external-corpus adapters** (R3): TRAIL (gated), MAST-Data, AgentRx → canonical schema with their labels as `external-label` annotations, not events.
- **openinference**, **langfuse export**: Later.

## Health (Trace Health report)
Verdict `trustworthy | usable-with-caveats | do-not-trust-for:<metric list>` per metric family (tokens, structure, subagents, compaction, content). Each finding has a detector id, severity, evidence offsets, and a **validity card** (audited precision on real traces; scripted precision/recall reported separately and badged SYNTHETIC).

### Detectors v0.1 (deterministic)
- D1 **subagent blind spot**: subagent referenced (agentId/tool result) but file/events missing, or token totals only reachable via separate files.
- D2 **usage double-count**: same `message.id` with usage on multiple assistant lines. Measured 2026-10-30: usage is identical across the lines of one id (one exception in 1 id), so dedupe by `message.id`; line choice does not matter. Summing every line inflates totals about 2.4-3.5x.
- D3 **chain break**: `parentUuid` pointing to absent uuid (GC or truncation).
- D4 **orphan tool_use / tool_result**. An unmatched `tool_use` at the very end of a file is `in-flight` (live session), not a defect. Observed: it resolved on re-read.
- D5 **compaction anomaly**: boundary without summary, or `pre_tokens` inconsistent with preceding usage.
- D6 **time anomaly**: implausible gaps and large reversals. Plain non-monotonic order is NOT a defect on its own: in real files 5-10% of parent-chain edges have the child earlier than the parent. Define against a per-version baseline, after the cause is found (M0).
- D10 **dangling reference** (new, proposed): `requestRef` not resolving to an `api-request` id in the session directory (measured within-file: 100%, 94.6%, 100%, 30%, 5% resolve across sessions). Report as request-capture coverage; check cross-file resolution first.
- D7 **unknown schema**: unknown line types/fields for the detected version.
- D8 **cross-channel disagreement** (needs two channels): counts of tool calls, tokens, subagents, compactions differ beyond tolerance. First real case without OTel: transcript usage vs `cost-state` (see notebook 2026-10-30). `cost-state` is not ground truth.
- D9 **content blindness**: content flags off or content truncated, so provenance and reconstruction are limited (reported as capability loss, not an error).

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
