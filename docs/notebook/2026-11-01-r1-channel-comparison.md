# 2026-11-01 — R1 cross-channel comparison: JSONL vs OTel

Truth level: `real`. Date: 2026-11-01. Auditor: Asmit (single pass, builder-auditor).

OTel output: `C:\Users\<user>\otel-r1\otel-output.jsonl` (local, not committed — Rule 8).
JSONL sessions: `~/.claude/projects/E--assay/{session}.jsonl` (corpus, local).

---

## Capture context

OTel was captured with `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` on 2026-10-31 using an OTLP file exporter.
The collector wrote 26 JSONL lines: `resourceLogs` (192 log records) + `resourceSpans` (21 spans).
Three Claude Code sessions were active during the capture window:
- `6973b17c` — no api_request records (likely setup/auth only)
- `93de073c` — 3 api_request records (haiku + 2 sonnet)
- `2b152411` — 3 api_request records (3 sonnet)

Both `93de073c` and `2b152411` have matching JSONL files in `~/.claude/projects/E--assay/`.

---

## Comparison table

### Session 2b152411 — perfect agreement

| Metric         | JSONL   | OTel    | Diff |
|----------------|---------|---------|------|
| requests       | 3       | 3       | 0    |
| input_tokens   | 6       | 6       | 0    |
| output_tokens  | 479     | 479     | 0    |
| cache_read     | 100713  | 100713  | 0    |
| cache_create   | 47181   | 47181   | 0    |
| context (in+cr)| 100719  | 100719  | 0    |

**Result: exact agreement on all fields.** R1-H1 (channels agree within ±5% on input_tokens after D2 deduplication) is **confirmed** for this session. Agreement extends to cache_read and cache_create as well.

### Session 93de073c — one request absent from JSONL

| Metric         | JSONL   | OTel    | Diff    |
|----------------|---------|---------|---------|
| requests       | 2       | 3       | -1      |
| input_tokens   | 4       | 1346    | -1342   |
| output_tokens  | 1056    | 1304    | -248    |
| cache_read     | 46981   | 46981   | 0       |
| cache_create   | 80414   | 80414   | 0       |
| context        | 46985   | 48327   | -1342   |

The 2 JSONL requests match 2 of the 3 OTel records exactly (both sonnet, same token counts). The missing record is the haiku request: `input_tokens=1342, output_tokens=248, cache_read=0, cache_create=0`.

**Finding R1-F2**: Claude Code makes internal requests (e.g. via haiku for tool-routing or summarization) that are **not written to the conversation JSONL**. OTel captures these; JSONL does not. This is a genuine capture gap at L1: JSONL understates total API spend by omitting non-conversation requests.

---

## Findings summary

| ID    | Description                                                                                          |
|-------|------------------------------------------------------------------------------------------------------|
| R1-F1 | `input_tokens` in JSONL = non-cached tokens only. Both JSONL and OTel agree on this value. Neither headline field reports total context — compute as `input + cache_read`. |
| R1-F2 | Claude Code makes internal (non-conversation) API requests not captured in JSONL. OTel sees them. Haiku example: 1342 input + 248 output absent from JSONL for session 93de073c. |

---

## Implications for assay

1. **L1 JSONL captures only conversation-turn LlmRequests.** Internal requests (tool routing, haiku helpers) are invisible at L1. Total API cost requires OTel (L3+).
2. **D2 deduplication is correct**: the two JSONL sonnet requests have duplicate message.ids (thinking-first pattern). After max-usage selection they collapse to 2, matching OTel's 2 sonnet records.
3. **cache_read and cache_create agree exactly** across both sessions: these fields are faithfully written to JSONL and match OTel.
4. **OTel importer would add L3 channel to capture.** Primary value: surfacing internal haiku calls and confirming total API spend. Secondary value: span timing (llm_request span durations).

---

## Threats to this analysis

- Single session pair where JSONL and OTel sessions are linked by session.id (confirmed). Could not test sessions outside the E--assay project.
- R1-F2 is based on one haiku request. May be a one-off (e.g. a startup check) rather than systematic. Needs more sessions.
- Max-usage deduplication in the comparison script is a simplified re-implementation, not the assay importer. Results should match but are not bit-for-bit the same path.
