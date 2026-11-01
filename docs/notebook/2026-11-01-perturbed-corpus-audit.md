# Perturbed Corpus Audit — 2026-11-01

## Purpose
Cover detector gaps in the real corpus: D1 (subagent blind spot), D5-warn (context overflow), D6-warn (input-token disagreement). No qualifying real session existed for any of these in the 9-session corpus.

## Methodology
Each fixture is a minimal perturbation of a real session:
- Source session is read-only; the fixture is a separate file.
- Exactly one targeted change per fixture (to the smallest set of fields needed to trigger the detector).
- Truth badge: `real-perturbed`.
- Perturbation documented here and in the filename.

## Fixtures

### `corpus/frozen/real-perturbed/d1-subagent-blind-spot.jsonl`
- **Base**: `453b573b` (E--RL), v2.1.170
- **Perturbation**: `agentId: 'perturbed-agent-d1test'` injected on the first user event
- **No subagent file created** → D1 sees a referenced agent with no transcript file
- **Verified**: D1-warn fires → `overall=do-not-trust-for:subagent-token-totals`

### `corpus/frozen/real-perturbed/d5-context-overflow.jsonl`
- **Base**: `3620a96a` (e--m26-mp2), v2.1.301 (thinking-first pattern: two assistant lines per message.id)
- **Perturbation**: ALL occurrences of `msg_011Cg6ZfRptEqHz9yr2pZdXo` modified:
  - `input_tokens = 210000` (exceeds 200K haiku-4-5 limit)
  - `cache_read_input_tokens = 0`
  - `model = 'claude-haiku-4-5-20251001'` (200K context limit)
- **Why all occurrences**: thinking-first sessions produce two JSONL lines per message.id; max-usage canonicalization picks whichever has higher `inputTokens + outputTokens`. Modifying only one could leave the other as the selected record with non-overflowing values.
- **Verified**: D5-warn fires → `inputTokens 210000 exceeds claude-haiku-4-5-20251001 context limit 200000`; session-average check also fires.

### `corpus/frozen/real-perturbed/d6-input-disagree.jsonl`
- **Base**: `453b573b` (E--RL), v2.1.170
- **Perturbation**: Second occurrence of `msg_01XEsqiu`'s `input_tokens` bumped +5 (3 → 8)
- **Verified**: D6-warn fires → `inputTokens disagree across 3 duplicates (range 3–8)`

## New real sessions added

| Session | Project | Lines | Version | Compactions | Layout | D-findings |
|---------|---------|-------|---------|-------------|--------|------------|
| `dc47743b` | E--SPARK | 912 | 2.1.165 | 2 | main-only | D2×110 D5×92 D9×1 (all info) |
| `ef28c299` | E--RIP | 3845 | 2.1.165 | 7 | subagent-files | D2×495 D5×3 D6×23 D7×3 D9×1 (all info) |

Both `usable-with-caveats`. E--RIP has `layout=subagent-files` — the first corpus session with a subagent directory.

## Corpus coverage after this work

| Detector | Real coverage | Perturbed coverage | Status |
|----------|---------------|-------------------|--------|
| D1 | 0 (no version embeds agentId in main) | d1-subagent-blind-spot | ✓ |
| D2 | all sessions (streaming dups) | — | ✓ |
| D5 | 0 (all sessions below limit) | d5-context-overflow | ✓ |
| D6 | 453b573b (inp disagree = info) | d6-input-disagree (warn) | ✓ |
| D7 | ef28c299 (info) | — | partial |

## Notes
- D5-warn perturbation changed model from `claude-sonnet-5-5` (1M limit) to `claude-haiku-4-5-20251001` (200K limit). This is a larger perturbation than ideal, but necessary because no haiku session exists in the corpus and sonnet-5-5 can't overflow at 210K.
- All three perturbed fixtures use LF line endings (matching source sessions). PowerShell's default `open(..., 'w')` produces CRLF on Windows — fixtures are written with `newline='\n'` to match the importer's expectations.
