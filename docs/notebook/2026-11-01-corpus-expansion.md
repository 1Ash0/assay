# Corpus expansion — 2026-11-01

**Goal:** broaden corpus for M3 from 1 user / 4 projects / 9 sessions to wider version and detector coverage before M3 work begins. Add mock scripted sessions for paths not reachable with available real data.

---

## Sessions added

### Real sessions (truth=real)

| File | Project | Version | Events | Unknowns | Compactions | Notes |
|---|---|---|---|---|---|---|
| `2b152411` | E--assay | v2.1.308 | 8 | 35 | 0 | D2 fires (thinking-first dup) |
| `334cd181` | E--assay | v2.1.309 | 9 | 58 | 0 | Clean |
| `d013da8e` | E--assay | v2.1.309 | 6 | 51 | 0 | Clean |
| `6973b17c` | E--assay | v2.1.308 | 4 | 24 | 0 | D5 fires (context overflow) |
| `93de073c` | E--assay | v2.1.308 | 7 | 38 | 0 | D2 fires (×2) |
| `37216832` | E--SPARK-Paper2 | **v2.1.177** | 5 | 11 | 0 | New version in corpus |
| `453b573b` (d1-trigger) | E--RL | **v2.1.165** | 3128 | 3487 | 18 | D2×many, D5, D7×9, D9, D-cost(ci) |

Note: `453b573b` was imported as main JSONL only (no subagents dir) to test D1 trigger. D1 did **not** fire — see D1 outcome below.

### Scripted sessions (truth=scripted, SYNTHETIC badge required)

| File | Purpose | Events | Unknowns | Notes |
|---|---|---|---|---|
| `scripted/pure-chat.jsonl` | Zero-tool path; test no-tool_use importer path | 9 | 1 (cost-state) | trustworthy, unknownRatio=0.09 |
| `scripted/high-unknown-ratio.jsonl` | importerCoverage.unknownRatio warn path | 5 | 8 | 53% unknown → caveat fires |
| `scripted/multi-compaction-precise.jsonl` | D4 precision path, 3 compactions | 24 | 1 | D4 fires on genuine orphan; NOT on UUID-exempted result |

---

## Version spread (corpus as of 2026-11-01)

| Version | Sessions | Source |
|---|---|---|
| 2.1.165 | 1 (d1-trigger) | E--RL (old project, main-only) |
| 2.1.177 | 1 (37216832) | E--SPARK-Paper2 |
| 2.1.308 | 7 | E--assay, E--RL, E--RIP (existing corpus) |
| 2.1.309 | 3 | E--assay |

---

## Detector coverage from this run

| Detector | Status | Session that triggered |
|---|---|---|
| D1 | **zero coverage** (see below) | — |
| D2 | ✓ real coverage | 2b152411, 93de073c, 37216832, d1-trigger (×many) |
| D3 | not triggered (no chain breaks in new sessions) | — |
| D4 | ✓ scripted coverage (genuine orphan) | sc-multi-comp |
| D4 | ✓ precision path tested: UUID-exempted orphan correctly NOT flagged | sc-multi-comp (mc-final-u → toolu_mc_000) |
| D5 | ✓ real coverage | 6973b17c, d1-trigger |
| D6 | not triggered | — |
| D7 | ✓ real coverage | d1-trigger (9 firings across compaction boundaries) |
| D8 | not triggered | — |
| D9 | ✓ real coverage | d1-trigger |
| D10 | not triggered (no api-request lines in new sessions) | — |
| D-cost | ✓ real coverage (captureIntegrity=true) | d1-trigger |
| D-cost | ✓ scripted coverage | sc-multi-comp |

---

## D1 outcome — cannot trigger with v2.1.165

**Expected:** import main JSONL of a multi-agent session without its subagents directory → D1 fires because main JSONL references absent subagents.

**Actual:** D1 did not fire. `run.subagentIds.length = 0` and `run.subagents.length = 0`.

**Root cause:** `453b573b` is at version 2.1.165. At this version, the main JSONL does not embed `isSidechain=true` markers or `agentId` fields on user events. The subagent content format at v2.1.165 appears to be entirely self-contained in each session file — the main session file has no cross-references to subagent files. D1's trigger condition (`isSidechain=true` user events in main file referencing absent subagent files) requires v2.1.303+ format where the main transcript explicitly marks sidechain events.

**Resolution:** D1 trigger needs a v2.1.303+ multi-agent session imported as main-only. No qualifying session is available in the current real corpus. Options for M3:
1. Capture a fresh multi-agent session at current version (v2.1.308+) and import main-only.
2. Create a scripted mock with `isSidechain=true` markers to confirm the detector logic fires.

The D1 scripted mock path is preferred to confirm detector logic before depending on a new capture session.

---

## Observability states across corpus

The `d1-trigger` session (v2.1.165) shows `comp=observed` (18 compactions detected) and `D-cost` firing with `captureIntegrity=true` — this is the first real session where D-cost fires. The implication: the runtime's cost-state accounting and the JSONL-summed token count disagree by 37% on this session, likely due to the very high unknown-line ratio (53%) masking actual usage events.

The `sc-high-unknown` mock correctly surfaced the 53% unknown ratio as a validity caveat (not a Finding) — the threshold for a caveat is 0.2 (20%); a Finding would require a higher threshold or a specific detector. This is acceptable behavior: high unknown ratio is a coverage concern, not a structural failure.

---

## Corpus state after expansion

- Users: 1 (Asmit)
- Projects: 4 (E--assay, E--SPARK-Paper2, E--RL, E--RIP)
- Sessions: 16 (9 pre-existing + 7 real new + 3 scripted)
- Versions covered: 2.1.165, 2.1.177, 2.1.308, 2.1.309
- Truth labels: `real` (16), `scripted` (3)
- D1 gap: still open; scripted mock needed (see above)
- D3 gap: no real chain-break sessions; scripted coverage not yet added
- D6 gap: no real duplicate-with-disagreement sessions
- D8 gap: no real empty-response sessions

Next action for M3: create a scripted D1 mock with `isSidechain=true` markers; capture a fresh real multi-agent session at v2.1.308+.
