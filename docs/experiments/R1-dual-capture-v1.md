# Preregistration: R1 — Dual-capture agreement (v1)

**Status:** Preregistered 2026-10-31. Do not run until this file is committed. Do not modify primary metric or n after running begins.

## Hypothesis

A single Claude Code session captured simultaneously at L1 (JSONL transcript) and L3 (OTel spans/logs) will show agreement on token counts and span structure, with quantifiable discrepancies attributable to known causes (chain-cumulative cost-state, content truncation, beta-flag defaults).

## Primary metric

Token-count agreement between JSONL `message.usage.output_tokens` sum (deduplicated by `message.id`) and OTel `claude_code.token.usage` events for the same session, expressed as:

```
ratio = |otel_output_tokens - jsonl_output_tokens| / jsonl_output_tokens
```

**Preregistered threshold:** ratio < 0.02 (2%) is agreement; ≥ 0.02 is a discrepancy requiring explanation.

## Secondary metrics

1. requestRef resolution rate (% of JSONL `api-request` lines with a matching OTel `claude_code.llm_request` span by `request_id`)
2. Compaction detection parity: `gen_ai.conversation.compacted=true` spans in OTel agree with `isCompactSummary=true` lines in JSONL (same count, adjacent timestamps)
3. Tool call count agreement: `claude_code.tool` OTel spans vs JSONL `tool_use` content blocks

## Session protocol

1. Run from this document: `docs/otel-setup.md`.
2. Capture flags: `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`, `OTEL_LOG_USER_PROMPTS=1`, `OTEL_LOG_ASSISTANT_RESPONSES=1`, `OTEL_LOG_TOOL_DETAILS=1`, `OTEL_LOG_TOOL_CONTENT=1`, `OTEL_LOG_RAW_API_BODIES=file:<dir>`.
3. Task: a realistic coding task with ≥ 10 tool calls (mix of Read, Write/Edit, Bash). Stop session after task completes normally. Do NOT force a compaction during R1 (confounding).
4. Claude Code version: record exact version from `claude --version` before the run.
5. Freeze both files (JSONL + OTel output) within 5 minutes of session end. Record sha256 of each.
6. Do not look at the data before freezing — no peeking.

## n and unit of analysis

**n = 1 session** for R1 (smoke test). Unit of analysis is the session, not the span or line. R1 is a feasibility check, not a powered study. A confirmatory R1-v2 will preregister n ≥ 5.

## Content flag choice rationale

All content flags on for R1 to maximize what we can check. Future sessions may use a narrower set. Rule 8 applies: output stays local, never committed.

## Planned analysis

```
# Load JSONL
jsonl = read_jsonl(session_path)
ids = deduplicate_by_id(jsonl)
jsonl_output = sum(m.usage.output_tokens for m in ids if m.usage)

# Load OTel
otel = read_otel(collector_output_path)
otel_output = sum(e.value for e in otel if e.name == "claude_code.token.usage" and e.attributes.type == "output")

ratio = abs(otel_output - jsonl_output) / jsonl_output
```

Record also: total input tokens, cache read tokens, cache write tokens — same ratio check.

## Threats to validity

- Chain-cumulative cost-state: if the session is part of a chain, the JSONL cost-state will include prior sessions. Use the per-message sum (not cost-state) as the JSONL number.
- Content truncation: `OTEL_LOG_RAW_API_BODIES` bodies may be truncated if > max_length. Check file sizes.
- Version bugs: 2.1.307 subagent placeholder usage. Use ≥ 2.1.308.
- OTel transport loss: UDP drops are possible with gRPC but rare locally.

## Success criteria

- Primary ratio < 0.02: agreement confirmed.
- At least one `requestRef` resolved between JSONL and OTel: cross-channel linking is possible.
- Discrepancies (if any) have a plausible explanation documented in the notebook.

## Open questions for R1-v2

- Does compaction detection parity hold across multiple sessions?
- Does subagent usage appear in OTel (via `claude_code.subagent_completed`) and does it match the subagent JSONL file?
- Does `gen_ai.skill.name` appear on Skill tool OTel spans, or is the instrumentation gap confirmed?
