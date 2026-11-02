# ROADMAP — assay

Nothing from the converged design is dropped; items are sequenced. Each "Later" item needs an evidence trigger and an ADR before it moves up.

## Parity floor (crowded lanes: reach this, then differentiate)
Search/filter within a run; readable subagent tree; per-call token and cache numbers; compaction markers; export to a shareable static HTML; local-only parsing. These are table stakes (context-analyzer, lm-assist, trajectory viewer, session viewers). They come bundled with M3 views, not as separate bets.

## M0 — Verify and start the corpus (before any build)
Human actions (Asmit): request TRAIL access on Hugging Face; turn on capture for ctxcheck/surfacelab sessions (OTel logs + hooks log; choose content flags deliberately and log them in `notebook/`); answer whether Jev/System One is accessible.
Claude Code: run the Open verification tasks in `PRIOR_ART.md`; install context-analyzer and run it on one session; write `learn/M0/`; confirm the truth ladder and capture levels as written; look-test (prototype one Strata still from real data to check the idea is worth 3D).
**Exit:** verification report in notebook; PRIOR_ART levels upgraded with dates; at least 5 real sessions in corpus with Capture Level recorded; Claude Code JSONL tool_use/tool_result field linking verified on our own files; ADR for any gap that turned out already shipped; M0 gate passed.

## M1 — Canonical schema, importers, Health skeleton
zod schema with raw offsets and `Unknown`; claude-code-jsonl importer (both subagent layouts, whole-directory read, version detect); otlp importer (generic + Claude Code profile); Capture Level computation; Health verdict; fixtures (real, redacted); CLI `import` and `health`.
**Exit:** lossless round-trip on corpus (event counts and offsets match source line counts); every unknown line surfaced; Health runs on all corpus files; gate passed.

## M2 — Detectors and validity lab ✓ closed 2026-11-01
D1-D9 with validity cards; R1 dual capture report; R3 external corpus import (TRAIL/MAST/AgentRx as access allows); R5 structural labels; R6 perturbations; scripted T1 and T3 (SYNTHETIC badge); R4 first audit pass.
**Exit:** audited precision per detector with CIs and n; at least one R1 disagreement characterised; D1 confirmed on at least one real undercount; threats list updated; gate passed.

**Actual exit status (ADR-011):** D1 confirmed as logically correct but zero corpus coverage — no qualifying multi-agent session found in 9-session corpus across versions 2.1.165–2.1.308. Exit criterion waived; D1 confirmation moves to corpus quality task in M3 prep. All other criteria met: D2–D9 precision audited with CIs (notebook `2026-11-01-m2-precision-audit.md`); R1 characterised with two real disagreements (R1-F1: both channels understate total context; R1-F2: OTel captures internal haiku calls absent from JSONL — see `2026-11-01-r1-channel-comparison.md`); B10/B11 found and fixed; ValidityCard with totalContextTokens and cacheHitRate shipped.

**M2 hardening (2026-11-01, post-close):** ADR-013/014/015. Added: `CostState` entity (cost-state records parsed from JSONL; D-cost cross-check detector); `summarizedTurnUuids` on Compaction for precise D4 exemption; D10 count-based api-request check; `ObservabilityState` three-way classification on ValidityCard; `usageCoverageRate`, `modelIdentificationRate`, `importerCoverage`, `observability`, `runtimeCostUSD` on ValidityCard. All 35 tests pass.

**Capture-pipeline hardening (2026-11-01, post-close):** ADR-016. `ObservabilityState` extended to four states: added `capture-incomplete` for affirmative capture failure evidence. `captureIntegrity: boolean` flag on `Finding` — D1/D3/D10/D-cost warn set it. `buildValidityCard` promotes affected observability categories when `captureIntegrity` findings exist. Added `transcript` observability category (D3-driven). Created `docs/CAPTURE_MATRIX.md`: per-category × per-source capability matrix, verified gaps, open capture tests.

## M3 — Engine and views
assay-stage renderer (instanced beads, LoD, GPU picking); Run Card (Health first); Constellation; Strata (official categories; compaction collapse; subagent columns); Replay Theatre; Run Diff stub; table and describe modes; local-only web app; phone check.
**Exit:** every view driven by a core result field; evidence rail opens raw offsets; accessibility checks pass; informal 3-person comprehension check on Run Card; gate passed.

**M3 status (2026-11-02, ADR-017..023):** core and site landed; views partly built.
- Done: fs-free importer (ADR-019); `RunView` in core with redaction and tests (ADR-020); `assay export-view` / `export-site`; fineness via record-type catalogue (ADR-022); input-token range on D6 disagreement (ADR-021, shown on real-perturbed `d6-forged-copy`: 106–195,104); `results/` regenerated with correct truth labels and gitignored; the bench site (hallmark, certificate, detector figures, Core at L1, shelf, play layer, landing) reads only core output; DESIGN.md rewritten; gate recorded (ADR-023).
- Also done: Traverse (Marey), Replay (three columns, exact bytes from a dropped file), Run Diff stub (exact tool-sequence divergence), local folder drop running core in a worker (`pnpm build:web`).
- M4 hooks in place: every spine step carries `context: null` (reconstruction) and `provenance: null`; `RunView.m4` holds run-level slots; Replay's "What it was made of" box must reconcile to the step's measured total; Run Diff's key is `spine.toolSequence` with `firstDivergence`.
- Also done (late 2026-11-02): OTLP importer and L3 (ADR-025, closes the M1 carry-over and R1-F2 surfacing); subagent transcripts counted and D1 firing on real data (ADR-024, closes ADR-011's gap); 8 more real sessions on the site; `pnpm check` with JSON-Schema drift, `pnpm web`, `pnpm web-check` (Makefile wraps them); manual a11y and keyboard pass.
- Open for exit (human): informal 3-person 30-second hallmark test; phone check; ≥3 users in the corpus (not possible from this machine). Colour contrast now measured (`pnpm contrast`, 2026-11-02): dark theme passes all text pairs; light theme fails AA text for `verm` (4.18 on ground, 3.75 on verm-soft) and `ochre` (3.65-4.23 across grounds), and the `u` (user) mark is 1.9-2.2:1 against light grounds (2.8-3.0 in dark). Not yet in `pnpm check` because it would fail; needs a palette decision (darken light-theme verm/ochre, give `u` a stronger fill or an outline), then add it to `check`. Site data is 6 MB for 32 runs (budget 8 MB in web-check).

**M3 prep — corpus quality (carry in from M2):**
- Add ≥1 multi-agent session where main file references an absent subagent (to confirm D1 on real data — ADR-011).
- Add ≥1 session with a context overflow on a known model (to confirm D5 warn branch).
- Add ≥1 session with input-token disagreement across duplicates >1 (to confirm D6 warn branch).
- Broaden to ≥3 users and ≥5 projects. Current corpus: 1 user, 4 projects, 9 sessions.
- OTel importer (L3 channel): enables surfacing R1-F2 internal calls in Health output.
- R1-F2 caveat in ValidityCard for L1 runs: "token totals exclude internal non-conversation API calls; full cost accounting requires OTel (L3+)."

## M4 — Reconstruction, provenance, Run Diff
R2 reconstruction fidelity; exact-match provenance and unsourced-literal reporting; Run Diff with first divergence; R4 second audit pass and agreement report.
**Exit:** R2 number with threats; provenance validated against R5; Run Diff alignment stability from T3; gate passed.

**M4 status (2026-11-02):** P0 done (plan rev 2, ADR-026, R2 preregistered with a held-out split, catalogue to 2.1.316). L4 calibration done on `cae68025` (M4_PLAN §1a). P1 done (ADR-027..030). P2–P5 built and scored (ADR-031..034):
- **R2 primary (lines only) 0.000.** The opening request holds content no line has. Blobs plus rebuild seal 0.997 of held-out requests.
- **P4 provenance agreement 0.974.** Raw-file search over-claims.
- **T3 stability 60/60, detection 16/17.**

Open for exit:
- P6, drawing the Charge, the Core box, streak lines and twin lanes on the site; site data is at 7.9 of 8 MB, so P6 must move per-step detail out of `data.js`;
- R4 audit passes;
- more twin pairs (one pair recorded 2026-11-03; it diverges at step 1);
- the gate. Gate unit 7 recorded as passed on Asmit's statement (ADR-026).

## M5 — Ship
CLI polish; trace assertions + CI Action; judge-plane interface and Jev calibration study if access verified; docs; write-up of R1/R2 findings; upstream issue drafts (OTel GenAI: compaction/skill entities) if gaps confirmed.
**Exit:** reproducible `results/`; README claims all at [read]/own-artifact level; cumulative gate passed.

**M5 status (2026-11-03):** built per `docs/M5_PLAN.md`:
- R4 audit sheet (preregistered);
- `assay corpus add|audit|stats`, `assay check`, `assay assert`, the CI Action (ADR-036);
- the judge plane and the J1 runner on TRAIL (ADR-035, preregistered);
- `pnpm results` with `results/RUN.json`, and the claims ledger in `pnpm check`;
- `docs/REPORT.md`, upstream drafts, README, LICENSE.

Waiting on Asmit:
- Groq keys set in his shell, then `node scripts/j1.mjs run`;
- the GitHub CLI installed and signed in, for the private remote;
- R4 passes 1 and 2;
- the cumulative gate (P8, deferred by Asmit).

## Later (each needs evidence trigger + ADR)
Atlas (cross-run corpus graph; the only force layout, with a "proximity is not meaning" notice) · MCP server · OpenInference/Langfuse importers · WASM/Rust parser · T5 comprehension study · interop with context-analyzer · other harnesses (Codex) · hosted backend (cut unless a trigger appears) · D-fork-dup, the fork-subagent duplicate detector (trigger: a real session with an `isFork` meta file; M4_PLAN §4a) · changelog watcher, off by default (trigger: a format change missed by the census).

## Scope fence
Anything not on this page goes to Later. A feature that needs a judge model for a primary outcome is out of scope for core.
