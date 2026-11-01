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
| `scripted/d1-subagent-absent.jsonl` | D1 trigger: agentId in main JSONL, no subagent file | 6 | 1 (cost-state) | D1 fires ✓, subagent=capture-incomplete, captureIntegrity=true |

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
| D1 | ✓ **scripted coverage** | sc-d1-subagent-absent |
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

## D1 outcome — scripted mock confirmed ✓

**Trigger mechanism** (clarified after audit): D1 fires when a non-sidechain user/assistant event has an `agentId` field pointing to an absent subagent file. `isSidechain=true` lines are NOT needed — those are sidechain events that `derive.ts` skips entirely. The relevant events are main-conversation events that carry `agentId`, which is how Claude Code tags the tool_result wrapper when returning a subagent's output to the main context.

**v2.1.165 attempt (d1-trigger):** failed because that version does not embed `agentId` on main-conversation events. The subagent transcript format at v2.1.165 places sidechain events (with `isSidechain=true`) directly into the main file, but the main-conversation events carry no `agentId` reference back. Importer correctly detects this as `main-only` layout with no agent entries.

**Scripted mock `d1-subagent-absent.jsonl`:** adds a user event (non-sidechain, `isSidechain` absent) with `agentId: "d1mock-agent-aaaa-bbbb-cccc-000000000001"`. No subagent file provided. Result:
- D1 fires: `warn`, `captureIntegrity: true`
- `observability.subagent = capture-incomplete` (promoted from not-observed by captureIntegrity)
- Overall verdict: `do-not-trust-for:subagent-token-totals` ✓

**D1 detector logic confirmed correct.** Real-data trigger still needs a v2.1.303+ multi-agent session imported without its subagent file; that remains a corpus quality goal for M3 capture.

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
