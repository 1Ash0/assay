# DECISIONS — ADRs (append-only)

Format: ID · date · status · context · decision · consequences. Supersede, never edit.

## ADR-001 · 2026-10-30 · accepted · Thesis is trace trust, not another viewer
Context: viewers and token analyzers for Claude Code sessions already ship (context-analyzer, lm-assist, trajectory viewer, others). Decision: lead with Capture Level + Trace Health + validity lab; reach parity on viewing features but do not make "another viewer" the claim. Consequence: Health and the lab ship before views are polished.

## ADR-002 · 2026-10-30 · accepted · Truth ladder
Decision: four badges `real | real-perturbed | scripted | inferred`; scripted always SYNTHETIC; scripted precision/recall reported separately. Consequence: no synthetic hero examples; validity cards show two numbers.

## ADR-003 · 2026-10-30 · accepted · Real-data-first validity lab
Decision: R1-R6 on real captures precede scripted tests; scripted only for exact-fault injection and serializer equivalence. Consequence: M0 starts corpus capture immediately.

## ADR-004 · 2026-10-30 · accepted · No inferred edges; exact-match provenance
Decision: edges are `observed` or `matched` only; no embeddings or judge for primary outcomes. Consequence: Constellation may look sparser than competitors; every edge is defensible.

## ADR-005 · 2026-10-30 · accepted · Judge plane optional, off by default
Decision: Jev or any judge is a pluggable `Judge`; output labelled `model-judged` with probability; runs after redaction; calibrated against R5. Context: Jev paper results are mixed per benchmark, threshold split undisclosed, availability not described. Consequence: no core feature depends on Jev.

## ADR-006 · 2026-10-30 · accepted · Strata layers use Claude Code's official context categories
Decision: layer taxonomy = System, CLAUDE.md, Memory, Skills, MCP, Rules, You, Files, Output, Claude, Hooks (from the official context-window explainer, snippet level; re-verify in M0). Consequence: we do not invent categories; mismatches become findings.

## ADR-007 · 2026-10-30 · accepted · Version-keyed importers; whole-directory reads
Context: transcript layout and contents change often (subagent files, request params in transcripts, GC, dropped PDF bytes); Harbor undercounted ~80% by reading one file. Decision: importers keyed by (tool, version range), read the whole session directory, and degrade Capture Level visibly on unknown versions. Consequence: a version matrix test suite is part of M1.
Amendment 2026-10-30 (own-corpus census): (1) key by version **per line**, since versions change inside one file (2.1.299 -> 2.1.304 -> 2.1.309). (2) Read at the **project** level: resumed sessions copy lines from earlier files (uuid overlap up to 99.8%), so dedupe by uuid across files and resolve `requestRef`/blob hashes across files. (3) Session folders hold content outside the JSONL (`tool-results/` images and text). (4) Live files change while read: freeze a copy with a sha256 manifest before analysing. (5) Unknown line types seen in real data (bridge-session, atis-latch, frame-link, artifact-*, cost-state, queue-operation, api-request*) are modelled or explicitly ignored, never silently dropped.

## ADR-008 · 2026-10-30 · accepted · Capture channels are a ladder L0-L4 and include hooks and proxy
Context: context-analyzer uses hooks; a VS Code viewer uses a capture proxy; OTel offers raw bodies to file. Decision: Capture Level covers transcript, hooks, OTel, and raw bodies/proxy. Consequence: R1 can compare any pair of channels.

## ADR-009 · 2026-10-30 · accepted · Learning via `learn/` gate protocol
Decision: replaces chat learning for all three projects; see `LEARNING.md`. Consequence: milestones cannot close without `gate.md`.

## ADR-010 · 2026-10-30 · accepted · Engine in TypeScript, spec in JSON Schema
Decision: assay-core in TypeScript so the same code runs in CLI, CI, browser worker; JSON Schema generated from zod enables a later Rust/WASM port. Consequence: surfacelab (Python) stays separate; no shared runtime.

## Proposed (not yet accepted)
- ADR-P1 Interop with context-analyzer (decide after M0 source read).
- ADR-P2 Upstream OTel proposal for compaction and skill entities (decide after M0 repo check).
