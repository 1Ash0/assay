# CLAUDE.md — assay

Working name. A trace-trust toolkit for coding-agent runs: it answers **"can you trust this telemetry, and what does it fail to tell you?"** before it answers anything else. Read `docs/PROJECT.md` for the why.

**Keep this file short. Detail lives in `docs/`. Open the doc you need; do not preload everything.**

## Docs index
- `docs/PROJECT.md` thesis, novel contributions, non-goals, success criteria
- `docs/PRIOR_ART.md` what exists, verification levels, open verification tasks (READ FIRST in M0)
- `docs/ARCHITECTURE.md` assay-core, capture channels, canonical schema, detectors, repo layout
- `docs/EVAL_DESIGN.md` the validity lab (R1-R5, scripted T1/T3), truth ladder, statistics, threats
- `docs/LEARNING.md` the `learn/` gate protocol (replaces chat learning)
- `docs/ROADMAP.md` milestones M0-M5 with exit criteria, scope fence
- `docs/CAPTURE_MATRIX.md` per-category × per-source capability matrix; verified gaps; open capture tests
- `docs/DESIGN.md` views, truth-ladder badges, 3D rules, accessibility
- `docs/DECISIONS.md` ADRs (append-only)
- `docs/CHANGES.md` what changed versus the earlier design, and why
- `docs/understanding/` explain-backs and `LEDGER.md` · `docs/notebook/` lab notebook · `docs/experiments/` preregistrations

## Commands (create in M1; keep names stable)
- `make check` lint + types + tests (offline) + JSON-Schema drift
- `make test` offline, fixtures only
- `assay import <path|otlp-file> --profile claude-code` then `assay health <run>`
- `assay requests <session>` seal per transcript request record (ADR-026/027)
- `assay catalogue check [dir…] [--results results]` versions and record formats vs importer support (Rule 7; exit 1 outside range)
- `assay corpus add|audit|stats` · `make web` · `make web-check`
- `assay export-site web/prototype/site-runs.json --out web/prototype/data.js --results results` regenerates the site data and `results/` from the local corpus

## Rules that cannot be broken
1. **Capture Level is declared on every run** and shown before any metric. No chart without it.
2. **Truth ladder badges** (`real`, `real-perturbed`, `scripted`, `inferred`) on every run, number and example. Scripted data never appears as a production example.
3. **No number without an artifact.** Every figure traces to `results/` or `corpus/`. Prior-art numbers stay at their verification level until upgraded.
4. **Raw offsets are lossless.** Every derived entity and edge links to the exact raw bytes (file, line, byte range). Importers never drop an unknown field; they preserve and flag it.
5. **No inferred edges in the Constellation.** Only `observed` (explicit id link) and `matched` (exact string equality). No embeddings, no judge model for primary outcomes.
6. **Model-judged output (Jev or any judge) is optional, off by default, labelled `model-judged` with probability, never mixed with deterministic verdicts, runs only after redaction.**
7. **Format versions are first-class.** Importers are keyed by (tool, version range). Unknown version = degraded Capture Level plus a visible warning, never a silent best-effort parse.
8. **Privacy:** corpus and traces stay local; paste packs and posts never contain raw traces; secrets never in the repo. Content-capture flags are chosen deliberately and logged per run.
9. **Preregister** validity-lab experiments; n and the primary metric fixed in advance. Unit of analysis is the session, not the line or the span.
10. **Pivot protocol:** direction changes need an ADR, doc updates and a notebook entry. **Scope fence:** out-of-scope ideas go to Later in `docs/ROADMAP.md`. Nothing is deleted from scope; it is sequenced.
11. **Learning gates** (`docs/LEARNING.md`): no moving past an unpassed gate.
12. **Small diffs.** Over ~150 lines needs an approved plan. Commits conventional and explainable by me.
13. **Honest 3D:** depth never encodes a quantity; every visual is driven by a result field; every view has an evidence rail, a table mode and a describe mode.

## Layout (details in ARCHITECTURE.md)
`packages/assay-core/{schema,importers,health,graph,detectors,reconstruct,provenance,diff}` · `packages/assay-cli` · `packages/assay-stage` · `web/` · `corpus/` · `fixtures/` · `results/` · `learn/` · `spec/` (JSON Schema) · `tests/`

## Style
TypeScript strict, pnpm workspaces, zod to JSON-Schema as single source of truth for the schema, vitest. Readable over clever. Comments say why, not what.
