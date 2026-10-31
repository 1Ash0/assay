# 2026-11-01 — M2 precision audit and R1 characterisation

Truth level: `real` for all corpus runs. `real-perturbed` for D1 perturbation attempt.
Date: 2026-11-01. Auditor: Asmit (blind pass not yet completed; single pass, builder-auditor; see threats).

---

## Corpus summary (9 sessions, all L1)

| Session | Project | Events | Unknowns | Compactions | Version | Claimed turns | Verified usage turns | Total input tokens | Cache hit rate |
|---|---|---|---|---|---|---|---|---|---|
| 453b573b | E--RL | 3218 | 3489 | 18 | 2.1.165 | 1048 | 1046 | 17042 | ~100% |
| 9e6a9543 | E--RL | 272 | 410 | 1 | 2.1.299 | 79 | 79 | 93 | ~100% |
| 2f1182fe | E--ctxagent | 1671 | 2137 | 1 | 2.1.299 | 434 | 432 | 868 | ~100% |
| 3ff3c7b6 | E--ctxagent | 1735 | 2156 | 1 | 2.1.299 | 449 | 447 | 900 | ~100% |
| c3170ecf | E--ctxagent | 5937 | 9096 | 8 | 2.1.299 | 1353 | 1348 | 2522 | ~100% |
| 435395c9 | E--surfacelab | 815 | 1893 | 3 | 2.1.308 | 258 | 257 | 330 | ~100% |
| 4a153124 | E--surfacelab | 4318 | 8553 | 9 | 2.1.308 | 1166 | 1162 | 2056 | ~100% |
| 3620a96a | e--m26-mp2 | 165 | 377 | 0 | 2.1.301 | 53 | 53 | 106 | ~100% |
| f6c8e47e | e--m26-mp2 | 244 | 432 | 0 | 2.1.301 | 51 | 51 | 102 | ~100% |

**Note on `totalInputTokens`**: the JSONL `usage.input_tokens` field counts only tokens *not* served from cache. The real context size per request = `input_tokens + cache_read_input_tokens`. For most sessions, `input_tokens` ≈ 2–20 and `cache_read_tokens` ≈ 100K–500K. The ValidityCard `totalInputTokens` therefore severely undercounts total context. The `cacheHitRate` ≈ 100% is correct by the formula but reflects this: almost all context is re-read from cache. This is a semantics finding — the field label is misleading. **Bug B11**: rename `totalInputTokens` to `nonCachedInputTokens` and add `totalContextTokens = input + cacheRead` to ValidityCard.

**Note on `claimedTurns ≈ verifiedUsageTurns`**: gap of 1–4 per session. Missing usage on a small number of LlmRequests — likely streaming-partial records where the final record had usage=0 or the event had no `usage` field at all.

---

## Detector findings aggregate (9 sessions)

| Detector | Severity | Total findings | Sessions affected | Precision assessment |
|---|---|---|---|---|
| D1 | warn | 0 | 0/9 | **Not triggered on this corpus** — see D1 analysis |
| D2 | info | 2642 | 9/9 | TP rate: **high** — every session has D2 deduplications. Verified: all real duplicate message.ids. No false positives found in sampled checks. |
| D3 | warn | 0 | 0/9 | Not triggered (no chain breaks in corpus after D3 fix) |
| D4 | warn | 200 | 5/9 | **Mixed** — see D4 analysis |
| D5 | info | 11 | 5/9 | **All `info` severity** (unknown/synthetic model). 0 `warn` (overflow). No false positive overflows. |
| D6 | info | 14 | 2/9 | TP: **high** — sampled D6 findings are real streaming-partial duplicates. 0 D6 `warn` in corpus (no input-token disagreements). |
| D7 | info | 13 | 5/9 | **Mixed** — see D7 analysis |
| D8 | warn | 0 | 0/9 | Not triggered (all sessions are single-project single-file) |
| D9 | info | 6 | 6/9 | TP rate: **high** — all 6 reversals verified as real; all are sub-second backward jumps (~0.5–1.3s). Likely late-appended tool-result events. |

95% Wilson CIs (n=9 sessions, all-or-nothing per session):
- D2: 9/9 sessions → CI [0.66, 1.00]
- D9: 6/9 sessions → CI [0.30, 0.93]
All other detectors: 0/9 or sparse, CIs not informative at n=9.

---

## D1 — subagent blind spot

**Real corpus: 0 findings in 9 sessions.**

Two reasons:
1. The only session with a subagent file is `453b573b` (v2.1.165). In this version, the main session file does not embed `agentId` references on user events — the subagent's events are entirely separate (the subagent file has `isSidechain=True`). `deriveEntities` skips sidechain events, so `entities.agents` is empty → D1 can never fire.
2. Newer-format sessions (v2.1.299+) in this corpus are main-only; none have subagent references.

**D1 perturbation result**: Imported `453b573b.jsonl` (main file only, subagent dir excluded). D1 did not fire — same reason as above (no agentId in main file).

**Conclusion**: D1 is logically correct but has **zero real corpus coverage**. It would fire on a v2.1.300+ session where the main file contains sidechain user events referencing a subagent whose file is absent. Such a session is not in the corpus. D1 confirmation is deferred to when a newer multi-subagent session is added to the corpus.

---

## D4 — orphan tool_use / tool_result

**200 findings across 5 sessions (0 in 4 sessions).**

**Root cause of most D4 findings: importer bug B10.**

In versions 2.1.299–2.1.301, Claude Code emits two consecutive assistant events per turn sharing the same `message.id`:
- First occurrence: `content = [{ type: "thinking", thinking: "...", signature: "..." }]` — no tool_use
- Second occurrence: `content = [{ type: "tool_use", id: "toolu_...", ... }]`

The importer's `seenMsgIds` gate processes ToolCalls only on the **first occurrence** of a `message.id`. For these sessions the first occurrence has thinking content only and no tool_use, so tool_use blocks are never extracted → D4 fires on every tool_result whose tool_use was silently dropped.

**Evidence**: Session `3620a96a`, 165 events, 0 compactions, 45 D4 findings. Verified manually: tool_use `toolu_016ZyBdSVqQCdA1hqDXePjGV` is present at line 28 (second occurrence of `msg_011Cg6ZfRptEqHz9`); tool_result at line 29. D4 fires because the importer processed line 27 (first occurrence, thinking only) and set seenMsgIds — line 28's tool_use was never read.

**B10 fix needed**: ToolCall extraction must run on the occurrence that actually has tool_use blocks, not necessarily the first occurrence. Options:
- (a) Collect tool_use blocks from ALL occurrences of a message.id (safe: tool_use ids are unique per turn).
- (b) Check if the first occurrence's content has tool_use before gating on seenMsgIds.

**Precision of D4 on real corpus**: ~0% TP — all 200 D4 findings are false positives caused by B10. D4 is logically correct for its intended case (missing tool_results after compaction or in-flight), but B10 makes it fire spuriously on thinking-first sessions.

**Sessions `2f1182fe`, `3ff3c7b6`, `4a153124`, `453b573b`**: 0 D4 findings — these are older sessions (v2.1.165, v2.1.299 ctxagent) that do not emit thinking blocks in the same pattern, or sessions where tool_use is in the first occurrence.

---

## D5 — context overflow

**11 `info` findings across 5 sessions. 0 `warn` findings.**

All 11 are "model unknown or synthetic — context-limit check skipped". No actual overflows detected.

Sampled `model` values producing D5 info: none have a named model ID — these are LlmRequests where `message.model` was absent in the raw event. In practice these are the subset of assistant events that lack a `model` field (streaming partial records, or tool-result-only responses).

**Conclusion**: D5 has 0 overflow detections on real corpus. The model table is not exercised. D5's `info` for missing model is working correctly (no false positives, no missed overflows on known models). Real overflow detection requires a session with inputTokens > 200K on haiku-4-5 or > 1M on other models — not present in corpus.

---

## D6 — usage disagreement

**14 `info` findings in 2 sessions. 0 `warn` findings.**

Session `453b573b`: 13 D6 info. Sampled: all real streaming-partial duplicates — first occurrence has `outputTokens=4`–`outputTokens=100`, second has the complete count. Max-usage selection correctly picks the second. These are true positives.

Session `3620a96a`: 1 D6 info. Same streaming pattern.

**0 D6 `warn` (inputToken disagreement)** across the whole corpus. The only input-token disagreements in the synthetic fixture were hand-crafted. Real Claude Code sessions do not exhibit input-token disagreement between duplicates — either it's a rare event or the threshold of >1 is never crossed naturally.

---

## D7 — compaction token change

**13 `info` findings in 5 sessions.**

All 13 are the "no preceding LlmRequest" branch (compaction at line near the start of a file, before any assistant event). This fires because the sessions were imported starting mid-conversation — the file's first event is not the session's first event.

**0 findings of `post-compaction inputTokens > pre-compaction`** in real corpus. The "post > pre is suspicious" branch never triggered.

**Precision**: the "no preceding LlmRequest" info is technically correct but not useful — it fires on every session that starts mid-conversation, which is nearly all of them. It is noise at L1. D7's useful branch (post > pre) has 0 findings and is unvalidated.

---

## D9 — timestamp reversal

**6 findings across 6 sessions.** One per session (detector stops at first reversal per file).

All 6 are sub-second reversals (0.3–1.3 seconds backward). Pattern: an assistant event at time T is followed by a user event at T−0.5s. This is consistent with Claude Code appending events out of strict time order — the user event's timestamp reflects when the tool call was issued, not when it was written to disk.

These are **true positives**: a real timestamp reversal did occur in the file as written. Whether it indicates a data quality problem depends on interpretation — the reversal is small and does not affect logical conversation order.

---

## R1 — cross-channel comparison (completed 2026-11-01)

Refer to `2026-10-31-r1-smoke-test.md` for infrastructure (L4 capture confirmed) and `2026-11-01-r1-channel-comparison.md` for the full token comparison.

**Summary**: OTel output found at `C:\Users\<user>\otel-r1\otel-output.jsonl` (26 JSONL lines, 192 log records, 21 spans). Two sessions compared:

- **2b152411**: exact agreement on all fields (input, output, cache_read, cache_create). R1-H1 confirmed.
- **93de073c**: 2/3 requests agree exactly. One haiku request (1342 input, 248 output) present in OTel but absent from JSONL.

**R1-F1**: `input_tokens` in JSONL = non-cached only. Both JSONL and OTel agree on this value. Total context = `input + cache_read` (must be computed; neither channel provides it as a single field).

**R1-F2 (new)**: Claude Code makes internal non-conversation API requests not captured in JSONL. OTel sees them. L1 JSONL therefore understates total API spend. Total cost accounting requires OTel (L3+).

---

## Bugs found during this audit

| ID | Severity | Description |
|---|---|---|
| B10 | High | ToolCall extraction uses first-occurrence only; thinking-first sessions (v2.1.299–2.1.301) put tool_use in second occurrence → all tool_calls dropped → 200 D4 false positives |
| B11 | Medium | `totalInputTokens` in ValidityCard counts only non-cached input; misleading name; real context = input + cacheRead |

---

## Threats to this audit

- Single-pass, builder-auditor. Blind second pass not done (required for R4 formal audit).
- n=9 sessions, 4 projects, 1 user. Wilson CIs are wide.
- Versions 2.1.165 and 2.1.299–2.1.308 only. D5 and D1 untested on newer versions.
- D4 precision is 0% due to B10, not because the detector logic is wrong.
- D7 useful branch (post > pre) is unvalidated — no real post > pre compaction seen.
