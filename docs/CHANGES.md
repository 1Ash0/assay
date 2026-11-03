# CHANGES — what changed versus the earlier assay design, and why

Principle kept: nothing was reduced. Every earlier idea is still in scope; some are sequenced or sharpened by what verification found.

## Corrections to earlier claims
| Earlier claim | Now | Why |
|---|---|---|
| Jev F1 77.8 avg, best generative 74.1 | Confirmed [read], plus per-dataset truth: JEV **loses** on R-Judge (88.5 vs 93.4) and TraceSafe (67.8 vs 72.4), wins ATBench500 and MCPHunt | Table 3 of arXiv:2609.34862 |
| Jev results are solid | Preprint; fixed threshold s≥3; split used to pick it undisclosed (leakage risk); labels revised by authors; not described as available | Paper limitations |
| $0.000195/call | Do not hardcode; cost formula seen, per-call figure not re-verified | Appendix C unchecked |
| TRAIL best model 11% (implied SOTA) | 11% was best at publication (May 2025), not current SOTA | Abstract |
| TRAIL importable now | Dataset is **gated**; schema unverified until access | HF access denied |
| Subagents are inline sidechains | Two layouts; newer writes separate `subagents/agent-<id>.jsonl`; parsing only the main file undercounts (~80% of prompt tokens in one case) | Harbor PR, viewer posts |
| OTel attributes (monitoring page) | Verified at summary level; **traces are beta and off by default**; content flags default off; content truncated at 61440 by default | Docs query |
| OTel GenAI conventions live at opentelemetry.io | Moved to `semantic-conventions-genai` (v1.42.0, ~12 Jun 2026); Development status | Moved-page stubs + articles |

| "2.1.232 added transcript GC" | Version approximate: 2.1.232 changelog entries are unrelated; GC is confirmed only via 2.1.296 and 2.1.304 fixes | Full changelog read |
| "2.1.207 stopped writing ~/.claude/sessions" | No changelog support; dir exists (2.1.246). Unverified, likely false | Full changelog read |

| TRAIL schema unverified | Now partly read: splits gaia 117 / swe_bench 31; columns `trace`, `labels`; OTel/OpenInference-shaped JSON; labels schema still unseen | HF viewer preview, 30 Oct |
| Jev latency ~1 s | Vendor claims 70-500 ms; ~1 s was from the paper; measure ourselves | typesafe.ai blog |

## New findings that change the plan (all additive)
1. **context-analyzer exists** (hooks + SQLite + context growth chart + MCP server). Strata is no longer claimed novel as "context over time"; it is differentiated by official-category layers, fidelity scores, and capture-awareness (ADR-006).
2. **Capture ladder gained two channels:** hooks and proxy/raw bodies (ADR-008). Capture Level is now concrete L0-L4.
3. **Format churn is a first-class risk:** 2.1.300 request params in transcripts (R2 may be easier), transcript GC dropping messages (new detector D3; seen in 2.1.296 and 2.1.304 fixes), 2.1.299 PDFs dropped. Version-keyed importers (ADR-007).
4. **New detectors:** D1 subagent blind spot, D2 usage double-count (hypothesis), D3 chain break, D9 content blindness.
5. **New lab item R6** (real-perturbed): delete/truncate/strip real captures and require Health to catch them.
6. **Parity floor** added to ROADMAP so crowded lanes are met, not skipped.
7. **Judge study tightened:** we declare the threshold split in advance, which the Jev paper did not.
8. **Learning protocol replaced** by `learn/` gates with withheld answers and repo-checked claims.
9. **Corpus capture starts at M0** with deliberate content flags.

## Unchanged
Thesis, truth ladder, validity-lab structure (R1-R5, T1, T3, T5), exact-match provenance, Run Diff, harness-native entities, Constellation edge rules, Atlas (Later), MCP server (Later), engine split (core + stage), milestone shape M0-M5, alignment goals.

## 2026-10-30 corpus census (additive)
- ADR-007 amended (per-line version, project-level reads, cross-file refs, freeze).
- D2 narrowed to dedupe-by-id; D4 gains in-flight rule; D6 loosened until cause found; D8 first real case; D10 dangling-reference proposed.
- Corrected: `api-request.base` is not null; earlier unmatched tool_use were live artefacts.

## 2026-10-31 M0 research — E series (additive)
- **Harbor PR #2247 read** ([read] upgraded): 80% of prompt tokens invisible without subagent file reads. Real session: 2.61M vs 0.52M tokens, 95 vs 25 steps with 4 subagents. Dedup-by-uuid needed.
- **MAST-Data licence confirmed**: CC BY 4.0 per OpenReview NeurIPS submission. GitHub is `multi-agent-systems-failure-taxonomy/MAST`.
- **Skill spans corrected**: OTel spec DOES have `Load skill span` + `Read skill resource span` + `gen_ai.skill.name` attribute. Gap 7 narrowed to compaction structure + context-composition breakdown only.
- **TRAIL**: MIT licence confirmed. Splits now 118 GAIA + 30 SWE-Bench (HF card). Labels schema still unverified (next: Asmit downloads with HF credentials).

## 2026-10-31 M0 research — A through D (additive)
- **context-analyzer source read** (upgraded [read-summary] → [read]): confirmed L1+L2 only, confirmed parity items (context growth, cache churn, composition, cross-session), confirmed differentiators (Capture Level, truth ladder, raw offsets, chain integrity, version-keyed importers, D8, OTel, Run Diff).
- **OTel semconv-genai spec read** (upgraded [snippet] → [read]): `gen_ai.conversation.compacted` (boolean) exists in Anthropic conventions. No `compact` operation type, no compaction span, no skill entity — upstream-proposal opportunity (Gap 7) confirmed at source.
- **MAST-Data schema read** ([read] new): 1,642 traces, 14 MAST failure codes, LLM-annotated, plain-text trajectory, NeurIPS 2025, not gated. Licence unverified.
- **AgentRx schema read** ([read] new): 160 failed trajectories, step-level failure+root-cause annotations, CC-BY-4.0, gated. Microsoft Research, arXiv 2602.02475.
- **TRAIL URL corrected:** `PatronusAI/TRAIL` (not `ServiceNow-AI/TRAIL`). Labels schema still unverified; Asmit has HF access.
- **Subagent file-layout version pinned:** `agent_transcript_path` field in SubagentStop hooks from v2.0.42; corpus confirms v2.1.181. Prior "[unverified]" upgraded to [read].
- **Changelog fully read** (upgraded [read-summary] → [read]).

## 2026-10-31 fourth census — frozen corpus, all four projects (additive)
- **Cost-state is chain-cumulative, not per-session:** confirmed by split analysis (4a) and exact delta match (4b). D8 ratio is an artefact of the denominator being file-scoped.
- **All backward timestamp pairs cross different message.ids.** D6 must use parent-chain edges, not adjacent-line pairs.
- **requestRef resolves 100% at project level** (was 30%/5% within-file for continuation sessions). Cross-file resolution mandatory (ADR-007).
- **`base` is a UUID → prior `api-request.id` (100% within project), never array/dict.** Root requests have null base. Corrects "[unverified]" tag.
- **Blob type is `api-request-blob`** (not `blob`), with fields type/sessionId/hash/message.
- **Tail hashes 46–60% resolved within project;** 40–54% dangle outside project scope.
- **First subagent in corpus:** E--RL/453b573b has 1 Agent call + `subagents/agent-aee3375cea411869d.jsonl`. D1 testable on real data. Corrects "No subagents in this corpus."
- **Chain integrity check is version-sensitive:** older versions embed tool results in user message content; top-level `tool_result` line type not present. Check must key by version.
- **compact_boundary absent in older RL sessions** (isCompactSummary present without matching compact_boundary markers).
- **api-request / api-request-blob absent from E--RL Desktop sessions** despite 2.1.299; VS Code 2.1.301 (e--m26) has them. Entrypoint or per-session setting difference. `[unverified]`
- Corpus extended to 9 sessions across 4 projects: added E--RL (2 Desktop sessions, 2.1.165–2.1.299) and e--m26-mp2 (2 VS Code sessions, 2.1.301).
- 2026-11-02 (M4 P1): `api-request` lines are kept and read (they were dropped); request-record lines count as parsed, so fineness rises for 2.1.299+ runs (ADR-026/027). D0 version warning on runs outside 2.1.165–2.1.316 or without a version (ADR-028). D10 is an exact join on requestRef where refs exist (ADR-030). Canary hashes first recorded the same day; any later move needs a line here.
- 2026-11-02 (M4 P2): hash-gated rebuild fills request messages from transcript lines (ADR-031); request seals rise from blobs-only to blobs+rebuild, so canaries for 2.1.301, 2.1.309 and 2.1.316 were re-recorded. Validity card gains sealedFromBlobs, sealedFromLines, messagesRebuilt.
- 2026-11-03 (TRAIL, ADR-037): new OpenInference/smolagents importer; D12 (agent token totals vs their LLM calls); D1 scoped to Claude Code (its premise is subagent files); version support keyed by tool; LlmRequest gains an optional model; a caveat when content is truncated at the source. Claude Code results unchanged (canaries hold).
