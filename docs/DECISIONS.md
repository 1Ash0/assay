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

## ADR-011 · 2026-11-01 · accepted · D1 confirmation deferred; M2 closes without it
Context: M2 exit requires "D1 confirmed on at least one real undercount." After exhaustive corpus search (9 sessions, versions 2.1.165–2.1.308, including two projects with subagent directories), no session was found where the main JSONL file embeds `agentId` references on user events referencing an absent subagent file. In all observed versions the main file uses `isSidechain=true` to mark sidechain events and the subagent content lives entirely in the subagent's own file — D1's trigger condition. D1 logic is correct; the corpus simply lacks a qualifying session.
Decision: close M2 with D1 at zero-coverage status, documented in `2026-11-01-m2-precision-audit.md`. D1 confirmation moves to a corpus quality task: add ≥1 multi-agent session where the main file references a subagent that was not captured (e.g. by importing only the main file of a session with subagents). Corpus quality and variety improvements are a first-order M3 prep item.
Consequence: D1 remains logically correct but unvalidated on real data. Any D1 finding on new corpus additions must be spot-checked before reporting.

## ADR-012 · 2026-11-01 · accepted · R1-F2: OTel required for full API cost accounting
Context: R1 cross-channel comparison (2026-11-01) found that Claude Code makes internal non-conversation API calls (e.g. haiku tool-routing) not written to the JSONL transcript. OTel `claude_code.api_request` records and `claude_code.llm_request` spans capture these; L1 JSONL does not.
Decision: document in ROADMAP that total API spend (including internal calls) requires L3+ capture. The ValidityCard caveat for L1 is sufficient for M2; an explicit "internal-requests gap" caveat is added to L1 runs. OTel importer remains an M3 target.
Consequence: token totals on L1 runs carry a documented undercount caveat for cost (not for correctness of conversation-turn analysis).

## Proposed (not yet accepted)
- ADR-P1 Interop with context-analyzer (decide after M0 source read).
- ADR-P2 Upstream OTel proposal for compaction and skill entities (decide after M0 repo check).
