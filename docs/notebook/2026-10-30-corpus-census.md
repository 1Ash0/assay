# 2026-10-30 — Own-corpus census (surfacelab 2 sessions, ctxagent 3 sessions)

Truth level: `real`. Source: structure-only reports produced by Claude Code on Asmit's machine (Windows, `~/.claude/projects/E--surfacelab`, `E--ctxagent`). No message content was read. Tags: `measured` unless stated.

## Corpus
5 sessions, ~188 MB, ~41k lines, Claude Code 2.1.299 / 2.1.304 / 2.1.308 / 2.1.309. Capture Level: **L1 only** (no OTel variables, no OTel output on disk). 0 invalid JSON lines. Dual capture (R1) NOT yet possible.

## Findings
1. **Request bodies are in the transcripts.** Types `api-request`, `api-request-blob`, `api-request-shape` exist. `api-request` first appears at 2.1.304 in these files (none under 2.1.299; 2.1.300-2.1.303 unobserved). Consistent with the changelog's 2.1.300 entry. `api-request` keys: type, sessionId, id, timestamp, version, querySource, shapeHash, params{model,betas,max_tokens,thinking,context_management,output_config}, keep, tail, cacheControl, requestDigest, base. `base` is non-null on almost all lines (an earlier 'null' was a sampling error). `tail` items are all strings; 49-65% of distinct values match a blob `hash` in the same file; the rest are unresolved (other files? `[unverified]`). Assistant lines carry `requestRef`: resolves to an api-request id for 100% / 94.6% (surfacelab) and 100% / 30% / 5% (ctxagent) of lines. `requestId` is a separate id space. `entrypoint` is `claude-desktop` on every line censused, so the corpus is Desktop-originated only. Blobs: `{hash, message{role, content[]}}`, no version field. How a full request is reconstructed (base + tail + blobs) is `[unverified]`.
2. **Version changes mid-file** (e.g. 2.1.299 -> 2.1.304 at line 12183). Importers must be keyed per line, not per file.
3. **No subagents in this corpus.** `isSidechain` false on every line, no `subagents/` folders. D1 cannot be tested on real data from these sessions.
4. **Sibling folders hold content outside the JSONL:** `tool-results/` with images (up to 46 jpg + 6 png) and text. A JSONL-only parser misses them (supports whole-directory parsing, ADR-007). A `.json` file in each sibling folder: contents unchecked.
5. **Compaction is clean:** `compact_boundary` count equals `isCompactSummary` count in every file (12 surfacelab, 10 ctxagent). `compactMetadata` keys: trigger, preTokens, postTokens, cumulativeDroppedTokens, durationMs, preservedSegment, preservedMessages, runningTurnSends, plus optional precomputed / preCompactDiscoveredTools / preCompactArtifactReadVersions.
6. **Chain integrity looks healthy:** 0 orphan `parentUuid`; 2 unmatched `tool_use` (live-session artefacts, confirmed in the third census). No D3 positive in real data, so D3 needs R6 perturbation.
7. **Timestamps go backwards routinely:** adjacent line pairs going backwards per session: 71, 435, 256, 261, 800 (rates not computed; total line counts per file not yet taken). A naive D6 would false-positive constantly. Cause `[unverified]`; check along the parent chain and by line type before defining D6.
8. **D2 is real:** summing `message.usage` over every assistant line inflates totals about 2.4-3.5x versus counting each `message.id` once (one API message spans several lines). Which line's usage to take per id (first/last/max) is untested.
9. **`cost-state` disagrees with transcript sums (cross-channel disagreement, D8):** close for 435395c9 and c3170ecf (cache within ~1-4%; output +10% / +4%), far below for 4a153124 (output 0.56x, cache read 0.33x of distinct sums), far above for 2f1182fe and 3ff3c7b6 (output ~4.6x, cache read ~3.1x). Input tokens differ by about 10x to 170x in all five (cost-state higher). The ctxagent cost-state input totals are near-identical across three sessions (~147k), so cost-state may not be a per-session ledger. `[unverified]`. Do not use cost-state as ground truth yet.
10. **Sessions share prefixes:** 2f1182fe and 3ff3c7b6 have the same minimum timestamp (2026-10-20T20:53:58Z). Likely a resumed/forked copy of earlier messages `[unverified]`. Aggregating files naively would double count.
11. **Privacy:** `bridge-session` lines carry account and organization UUID fields. Redact before sharing or judge calls.

## Third census (same day) — what it settled
- D2: usage is identical across all lines of a `message.id` (1 exception). Dedupe by id; line choice irrelevant.
- `cost-state` is written rarely (1-4 lines per file), no timestamp. Series can drop (c3170ecf: 74k, 1.47M, 0, 1.65M output). In 4a153124 the two cost-states sit at lines 6454 and 12729 of 12755 and differ by only 8.5k output tokens, while the file's own sums are ~1.04M. Chain-cumulative hypothesis fits the ctxagent continuations (startTime 10-19, files start 10-20) but fails for 4a153124. Unresolved.
- Unmatched `tool_use` seen earlier were live-session artefacts (in-flight Bash; one resolved on re-read; one was the census call itself).
- Backward timestamps: later line is mostly `assistant` (~75-85%), then `attachment`. Child earlier than parent on 5.5-10.1% of parent-chain edges. Cause unknown.
- Overlap: 3ff3c7b6 is a near-superset of 2f1182fe (99.8%); both reuse ~2,019 lines from c3170ecf. Surfacelab 435395c9 vs 4a153124: 404 shared. Two more projects (E--RL, e--m26-mp2-...) have 2 sessions each, 0 overlap, not yet censused.
- No `Task`/`Agent` tool_use anywhere; only `TaskStop` (1 and 17). D1 needs a deliberate scratch session.
- Sibling `.json` holds only `customTitle`.
- The census runs inside a live session and writes into the corpus it reads. Freeze copies first.

## Next (fourth census, after freezing)
Split 4a153124 distinct-id output by line range (before/after line 6454) against its two cost-states; usage of uuids unique to 2f1182fe against the cost-state delta from c3170ecf; backward pairs split by same-`message.id` vs not, with delta magnitudes; resolve `requestRef` and tail hashes across all files in the project; type of `base`; tool-name histogram; census E--RL and e--m26-mp2.
