# M5 plan — Ship

Drafted 2026-11-03. Nothing is built until Asmit approves it (Rule 12). The exit criteria are in ROADMAP: reproducible `results/`, README claims all at `[read]` or own-artifact level, and the cumulative gate passed. TRAIL and further site work come after M5.

## 0. Where things stand (checked in the repo, 2026-11-03)
- **M4 is built and scored.** Still open: the R4 audit passes (Asmit; at least 7 days apart) and the M4 gate, recorded on Asmit's word in ADR-026 (`learn/M4/` was never written).
- **Missing although documented:**
  - `assay corpus add|audit|stats` (listed in CLAUDE.md, never built);
  - the CI Action and trace assertions (ARCHITECTURE: "Next").
- **Missing for shipping:** no README, no LICENSE, no `.github/`, no git remote.
- **Results today come from five separate scripts**, each run by hand: `r2-score`, `p4-score`, `t3-score`, `l4-calibrate`, and `catalogue check`. Nothing ties a published number to the artifact it came from.

## 1. Decisions (my picks; change any)
1. **Ship = a local-first tool someone else can run on their own sessions,** plus a written report of what we found. Hosting is out of scope (ROADMAP Later).
2. **Every published number goes through a claims ledger.** `docs/CLAIMS.md` lists each number with its artifact path and JSON pointer, and `pnpm claims` fails when a claim and its artifact disagree. This is Rule 3 made mechanical.
3. **One command regenerates every result:** `pnpm results`, which records the commit and the corpus manifest hash. The corpus stays local, so "reproducible" means reproducible on a machine with the corpus. Without it, the command says so and checks only the scripted fixtures.
4. **Trace assertions come before the CI Action.** `assay assert <session> --rules assay.rules.json` is the product; the Action is a thin wrapper around it.
5. **Judge plane: interface only, off, no adapter.** You set Jev aside, and a generic judge needs an API key and a calibration study. That moves to ROADMAP Later with an ADR, and the M5 exit drops "judge-plane interface" accordingly.
6. **Upstream issues are drafts only.** Posting them is outward-facing and yours to do (OTel GenAI semconv; Claude Code transcript gaps).
7. **License: MIT** unless you want something else; it's your call.

## 2. Phases (each under ~150 lines where possible)
| Phase | What | Ends with |
|---|---|---|
| P0 | M4 close-out: R4 audit sheet (sample drawn by hash, blank labels, instructions); `learn/M4/` written so the gate can actually run; this plan approved | you can start R4 pass 1 |
| P1 | `assay corpus add` (copy read-only, sha check, MANIFEST entry, truth label, refuses the active session), `audit` (every manifest file still matches its sha), `stats` (sessions, versions, capture levels, users) | CLAUDE.md commands true |
| P2 | `assay check <session>`: one human-readable card (Capture Level first, verdicts, seals, findings with lines; `--json`); consistent exit codes across the CLI | a stranger's first command |
| P3 | `assay assert`: JSON rules (min capture level, forbidden detectors, required seal share, max tokens, no unknown version), each failure naming its rule and offset; fixtures and tests | CI-ready check |
| P4 | CI Action: `action.yml` (composite, runs `assay assert` on given paths), plus an example workflow on scripted fixtures only | Action runs locally under `act` or in a dry run |
| P5 | `pnpm results` plus the claims ledger and `pnpm claims` in `pnpm check` | every number traced |
| P6 | Report `docs/REPORT.md` (R1, R2, P4, T3, both L4 calibrations, twins, with threats and one-user caveat); upstream issue drafts in `docs/upstream/`; published as an Artifact page if you want to share it | the write-up |
| P7 | README (what it answers, install, the commands, privacy, claims at verification level), LICENSE, CHANGES; `npm pack` dry run of the CLI | M5 exit, minus the cumulative gate |
| P8 | Cumulative gate material: `learn/M5/questions.md`, `answers.md` (withheld) and `paste-pack.md`, built from real excerpts | gate ready for you |

## 3. Risks
- **R4 needs 7 days between passes.** If it starts today, M4 can close on 2026-11-10 at the earliest, and M5 work can run in parallel until then.
- **One user.** Every claim in the README and report carries it; the ≥3-users criterion stays unmet and is stated.
- **Format drift.** By the time anyone else runs this, Claude Code will be past 2.1.316. D0 and `assay catalogue check` exist for exactly that, and the README says so.

## 4. After M5
- TRAIL integration.
- Site improvements: the hallmark test with 3 people, a phone check, colour contrast (light theme fails AA today: `pnpm contrast`).

## 5. Needs Asmit
1. Approve the plan, or change it.
2. License choice (default MIT).
3. Whether to create a GitHub remote. The Action is only useful there, and creating one is yours to do.
4. R4 pass 1 when P0 is done.
