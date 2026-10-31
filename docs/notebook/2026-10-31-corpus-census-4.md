# 2026-10-31 — Fourth corpus census (frozen copies, all four projects)

Truth level: `real`. Source: frozen copies in `corpus/frozen/` (sha256-manifested, ADR-007 amendment).
No message text read. Tags: `measured` unless stated.

## Corpus snapshot (frozen 2026-10-31)

| Project | Session | Lines | Size | Versions | Entrypoint |
|---|---|---|---|---|---|
| E--surfacelab | 435395c9 | 2,708 | 8.2 MB | 2.1.299 | claude-desktop |
| E--surfacelab | 4a153124 | 12,871 | 60 MB | 2.1.299→2.1.309 | claude-desktop |
| E--ctxagent | 2f1182fe | 3,808 | 27 MB | 2.1.304–2.1.309 | claude-desktop |
| E--ctxagent | 3ff3c7b6 | 3,891 | 28 MB | 2.1.308–2.1.309 | claude-desktop |
| E--ctxagent | c3170ecf | 15,033 | 60 MB | 2.1.304–2.1.309 | claude-desktop |
| E--RL | 453b573b | 6,615 | 29 MB | 2.1.165–2.1.299 | claude-desktop |
| E--RL | 9e6a9543 | 682 | 3.2 MB | 2.1.299 | claude-desktop |
| e--m26-mp2 | 3620a96a | 542 | 2.8 MB | 2.1.301 | claude-vscode |
| e--m26-mp2 | f6c8e47e | 676 | 2.9 MB | 2.1.301 | claude-vscode |

Live-file drift during copy: both live files (4a153124 and 3ff3c7b6) were stable — no byte change between pre-copy record and post-copy check. `measured`

Note: 4a153124 grew from 12,755 lines (3rd census, live) to 12,871 lines (frozen) — 116 new lines from continued activity between censuses.

## 4a — 4a153124: output tokens split at cost-state boundary

Cost-state lines at L6454 and L12729 (confirmed in frozen copy, matching the live-file positions from the 3rd census). `measured`

Transcript sums (distinct-id dedup):

| Range | Distinct IDs | Output tokens | Cache-read tokens |
|---|---|---|---|
| Before L6454 | 634 | 374,547 | 82,183,654 |
| From L6454 | 532 | 678,599 | 241,153,024 |
| **Combined** | **1,166** | **1,053,146** | **323,336,678** |

Cost-state model breakdown:

| CS line | sonnet-4-6 out | opus-5-5 out | sonnet-5-5 out | **Total** |
|---|---|---|---|---|
| L6454 | 556,375 | 28,723 | — | **585,098** |
| L12729 | 556,375 | 29,099 | 8,123 | **593,597** |
| Delta L6454→L12729 | 0 | +376 | +8,123 | **+8,499** |

**Key finding.** `measured` The cost-state at L6454 (585k output) *exceeds* the before-L6454 transcript sum (374k). The delta between the two cost-states is only 8,499 tokens, but the after-L6454 transcript portion contains 678,599 output tokens. This is irreconcilable with the cost-state being a running sum of *this file's* API calls.

**Conclusion.** The cost-state accumulates from a prior session chain (the `startTime` field is constant across both: `1793023593700` ms ≈ 2026-10-26 UTC). The cost-state already included ~585k output tokens from earlier sessions in the chain before the first line of this file was written. The cost-state is not a per-file or even a per-session ledger; it is a per-chain ledger. The D8 ratio (cost-state output / transcript sum) of ~0.56 is an artifact of the numerator coming from the chain and the denominator coming only from this file. `measured`

## 4b — 2f1182fe unique IDs vs cost-state delta

| Metric | Value |
|---|---|
| Distinct message IDs in 2f1182fe | 434 |
| Distinct message IDs in c3170ecf | 1,353 |
| IDs in 2f1182fe only (not in c3170ecf) | **91** |
| Usage for those 91 IDs: output tokens | **72,016** |
| Usage for those 91 IDs: cache-read tokens | 67,584,924 |
| Cost-state delta (opus-5-5 output, 2f1182fe minus c3170ecf last) | **72,021** |

`measured` The cost-state delta matches the unique-to-2f usage to within 5 tokens (72,021 − 72,016 = 5). The sonnet-5-5 output tokens are identical in both cost-states (630,217), confirming the 91 unique messages were all processed by opus-5-5.

**Conclusion.** The chain-cumulative hypothesis is confirmed for ctxagent: 2f1182fe is a direct continuation of c3170ecf, and its cost-state includes every prior session. The 5-token rounding gap is consistent with server-side rounding at cost-state write time. `measured`

## 4c — Backward timestamps: same vs different message.id

**All 9 files: `same_id = 0` in every file.** Every backward adjacent-line pair crosses a different `message.id`. `measured`

| File | Total backward | Same-id | Diff-id | <1 s | 1–10 s | >10 s |
|---|---|---|---|---|---|---|
| 435395c9 | 71 | 0 | 71 | 67 | 4 | 0 |
| 4a153124 | 398 | 0 | 398 | 351 | 13 | 34 |
| 2f1182fe | 255 | 0 | 255 | 252 | 1 | 2 |
| 3ff3c7b6 | 262 | 0 | 262 | 259 | 1 | 2 |
| c3170ecf | 735 | 0 | 735 | 689 | 14 | 32 |
| 453b573b | 218 | 0 | 218 | 160 | 5 | 53 |
| 9e6a9543 | 21 | 0 | 21 | 20 | 1 | 0 |
| 3620a96a | 9 | 0 | 9 | 7 | 0 | 2 |
| f6c8e47e | 24 | 0 | 24 | 23 | 1 | 0 |

The 3rd census counted 71, 435, 256, 261, 800 for the 5 surfacelab/ctxagent files. The current counts (71, 398, 255, 262, 735) are slightly lower — attributable to different timestamp-missing handling and the 4a153124 freeze snapshot predating the 3rd census (the file grew between the two). `measured`

**Implication for D6.** A naive backward-timestamp detector firing on any adjacent backward pair would false-positive constantly (~2–8% rate per file). D6 must be defined relative to same-chain parent edges, not adjacent line pairs. `hypothesis` (needs parent-chain analysis to confirm rate under that rule)

The >10 s outliers (34 in 4a153124, 53 in 453b573b) warrant separate investigation — they may mark compaction events or long tool calls. `hypothesis`

## 4d — requestRef and tail hash resolution (corrected; uses api-request-blob)

The 3rd census used only per-file blob counts. This census uses all files in each project, correcting the blob type (`api-request-blob`, not `blob`).

| Project | api-requests | blobs | Tail total | Tail resolved | Tail pct | requestRef total | requestRef resolved | rr pct |
|---|---|---|---|---|---|---|---|---|
| E--surfacelab | 1,564 | 1,601 | 4,301 | 2,183 | 50.8% | 2,956 | 2,956 | **100%** |
| E--ctxagent | 336 | 1,055 | 6,298 | 3,801 | 60.4% | 1,832 | 1,832 | **100%** |
| E--RL | 0 | 0 | 0 | n/a | — | 0 | n/a | — |
| e--m26-mp2 | 105 | 132 | 312 | 144 | 46.2% | 253 | 253 | **100%** |

`measured`

**requestRef is 100% resolved at project level.** The 3rd census showed 30% and 5% for two ctxagent files — those were within-file rates. Cross-file resolution confirms ADR-007 amendment: dedupe and resolve at the *project* level. `measured`

**Tail hashes: 40–54% are dangling within the project.** These point to blobs from prior sessions outside the project scope — the user's cached context from earlier work in other projects. Full reconstruction requires blobs from session chains that may span multiple projects. ADR-007 amendment item (2) "read at the project level" partially helps but cannot resolve cross-project tails. `measured`

**E--RL has no api-request or api-request-blob lines.** Versions 2.1.165–2.1.299 on Desktop do not emit these types in the corpus examined. (e--m26-mp2 at 2.1.301 on VS Code does.) Whether this is version-gated or entrypoint-gated is `[unverified]`. Note: surfacelab 435395c9 at 2.1.299 Desktop *does* have 315 api-requests — so E--RL's absence may be version-specific within 2.1.299 or session-specific. `hypothesis`

## 4e — Type of `base` field: UUID pointing to prior api-request

`base` is a string (UUID) or null across all files with api-requests. `measured`

| File | null | string | array | object |
|---|---|---|---|---|
| 435395c9 | 4 | 311 | 0 | 0 |
| 4a153124 | 13 | 1,236 | 0 | 0 |
| 2f1182fe | 1 | 104 | 0 | 0 |
| 3ff3c7b6 | 3 | 13 | 0 | 0 |
| c3170ecf | 1 | 214 | 0 | 0 |
| 3620a96a | 1 | 53 | 0 | 0 |
| f6c8e47e | 1 | 50 | 0 | 0 |

**`base` is a UUID pointing to a prior `api-request.id`.** Within each project, 100% of string base values resolve to an api-request in the same project (checked for surfacelab: 1,547/1,547). The null base values are root requests — the first in a chain with no prior base. `measured`

This corrects the 1st census claim that `base` was "[unverified]" and resolves the hypothesis about what it points at. The reconstruction chain is: `api-request.base` → prior `api-request` (full prior context snapshot) + `api-request.tail` → `api-request-blob` items (message-level blobs).

## 4f — Tool-name histogram (all projects combined)

**Built-in tools:**

| Tool | Count | Tool | Count |
|---|---|---|---|
| Bash | 2,053 | Glob | 53 |
| Write | 739 | Grep | 51 |
| Edit | 710 | ToolSearch | 27 |
| Read | 598 | Artifact | 24 |
| PowerShell | 397 | SendUserFile | 16 |
| TaskStop | 11 | Skill | 14 |
| Agent | 1 | Monitor | 1 |

`PowerShell` (397) confirms the corpus is Windows Desktop. `Agent` appears exactly once — see §4g. `TaskStop` (11) present, `TaskCreate`/`TaskUpdate` each ≤ 3, no `Task` by itself. `measured`

**MCP server prefixes (call count):**

| Prefix | Count | Interpretation |
|---|---|---|
| ccd_turn | 603 | Claude Code Desktop harness |
| Claude_Browser | 394 | In-app browser |
| 3d09d5f0-... | 101 | Firecrawl |
| terminal | 72 | Terminal MCP |
| Claude_Preview | 37 | Browser preview |
| cbdec149-... | 13 | Unknown server (unresolved UUID) |
| ccd_session | 12 | Session management |
| visualize | 6 | Visualization |
| claude_ai_Firecrawl | 2 | Legacy Firecrawl name |
| 5096872d-... | 2 | Unknown server |

## 4g — E--RL and e--m26 census basics

### E--RL — Desktop, 2.1.165 through 2.1.299

**453b573b (6,615 lines):** spans 4 versions, the widest version range in the corpus. Importers must key by version per line. `measured`

`compact_boundary = 0` but `isCompactSummary = 18`. In this version range, compaction wrote `isCompactSummary` annotations but no `compact_boundary` markers. The compaction protocol differs from the 2.1.304+ pattern where they appear in equal counts. `measured`

1,044 "unmatched tool_use" in the chain-integrity check — this is an artefact of the check logic. In this version, tool results are embedded inside `user` message content (no top-level `tool_result` line type). The check must be version-aware. `measured`

**9e6a9543 (682 lines):** contains `bridge-session` (38 lines), absent from 453b573b and all other files except c3170ecf (in the 3rd census). No api-request types.

**FIRST SUBAGENT IN CORPUS.** `measured` 453b573b has 1 `Agent` tool_use call and a sibling subagent file at `subagents/agent-aee3375cea411869d.jsonl` (272,370 bytes, 92 lines, version 2.1.181, `isSidechain=true`). Types in subagent: assistant=52, user=38, attachment=2 — minimal type set, no api-request or cost-state. D1 can now be tested on real data. This corrects the 3rd census claim "No subagents in this corpus."

### e--m26-mp2 — VS Code, 2.1.301

Both files have `api-request`, `api-request-blob`, and `api-request-shape` types — these appear to be VS Code-specific at this version (Desktop 2.1.299 in E--RL does not emit them; Desktop 2.1.299 in surfacelab does). Entrypoint is `claude-vscode`, not `claude-desktop`. `measured`

No `compact_boundary` or `isCompactSummary` — no compaction in these sessions.

No `mode`, `custom-title`, `agent-name` types (Desktop-specific). Both have `ai-title` and `atis-latch`. `measured`

Unmatched tool_use: 51 and 83 — same tool_result-in-user-message format as E--RL (no top-level `tool_result` lines). `measured`

## Corrections to prior census claims

| Prior claim | Corrected finding | Tag |
|---|---|---|
| "No subagents in this corpus" (3rd census) | E--RL/453b573b has 1 Agent call + subagent file. D1 testable on real data. | `measured` |
| `base` "[unverified]" — possibly null on almost all or array/dict | `base` is always string (UUID) or null; string = prior `api-request.id` (100% within-project); null = root | `measured` |
| requestRef resolution 30% / 5% for two ctxagent files | 30%/5% were within-file rates; cross-project resolution is 100% for all projects | `measured` |
| Backward timestamps: cause unknown, check along parent chain | All backward pairs cross different `message.id` — they are NOT within one API call | `measured` |
| Cost-state divergence for 4a153124: unresolved | Cost-state is chain-cumulative; confirmed by 4b exact match and 4a split analysis | `measured` |
| Blob type is `blob` | Blob type is `api-request-blob` (has fields: type, sessionId, hash, message) | `measured` |
| Chain integrity check: unmatched tool_use = live artefacts | In older versions (≤2.1.299/2.1.301), tool results are in user message content, not top-level `tool_result` lines. Chain check must be version-aware. | `measured` |

## Open items

- Why does Desktop 2.1.299 have api-requests in surfacelab but not E--RL? `[unverified]` — investigate session start conditions or project-specific settings.
- Dangling tail hashes (40–54%): what projects/sessions do they originate from? Cross-project blob lookup needed.
- Backward >10 s outliers (34 in 4a153124, 53 in 453b573b): do these coincide with compaction or long tool calls? `[unverified]`
- D1 verification: compare 453b573b assistant usage with the subagent file's message totals to quantify the blind-spot size.
- `bridge-session` present in 9e6a9543 (38 lines) — content and role not yet described.
- Two unknown MCP server prefixes (`cbdec149-...`, `5096872d-...`).
