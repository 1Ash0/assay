# EVAL DESIGN — the validity lab

Purpose: show whether assay's Health findings and views are right, on real data first. The lab is a research artifact in its own right.

## Truth ladder (applies to every run, number, example)
| Badge | Meaning | Allowed in |
|---|---|---|
| `real` | actual harness capture; tool+version recorded | headline claims |
| `real-perturbed` | real run plus a logged mechanical edit (delete a subagent file, drop N lines, strip content) | robustness tests |
| `scripted` | puppet emitter with fixed tool calls and no pretend model text | detector tests and serializer equivalence only; always SYNTHETIC badge |
| `inferred` | reconstructed, not observed | always visibly marked |
Scripted precision/recall is reported separately from audited precision on real traces. Scripted runs never appear as production examples.

## Real-data experiments
- **R1 Dual capture.** One real Claude Code session captured simultaneously as JSONL and OTel (+ hooks log). Compare: tool-call counts, token totals (per message, per agent, cache read/create), compaction events, subagent nesting and totals, skill activations. Every disagreement is characterised (importer bug, version quirk, channel limit, true Claude Code inconsistency). Report per-field agreement rate across n sessions. Prereq: choose content flags deliberately; traces are beta.
- **R2 Reconstruction fidelity.** Rebuild context-at-step-N from L1/L2; score against L4 raw API bodies (free ground truth). Metrics: exact-block match rate per layer category, token-count error against API-reported `usage.input_tokens`, unknown share. Note: transcripts from 2.1.300+ may already hold request params, so L1 vs L4 may overlap; record which version each session used.
- **R3 External truth.** Import TRAIL (gated, 148 traces, human labels), MAST-Data, AgentRx into the canonical schema. Success = lossless round-trip (counts, ids, offsets) and Health runs without crashing; their labels attach as `external-label`. Their harnesses differ from Claude Code; we claim schema validity only, not detector validity, from R3 alone.
- **R4 Own corpus.** ctxcheck and surfacelab build sessions plus ongoing work, with OTel capture on. Asmit blind-audits a random sample in two passes separated by at least 7 days; report intra-rater agreement (Cohen's kappa or raw agreement with CI) before using the labels as truth.
- **R5 Free structural labels.** Computable facts: a literal appears or not in prior tool results; exit code nonzero; tokens non-decreasing within an agent; tool_result present. Used (a) as ground truth for detectors where definable and (b) to draw judge calibration curves without LLM-labelled truth.
- **R6 Perturbation on real (`real-perturbed`).** Delete `subagents/` directory, truncate lines, strip fields, flip version string. Health must flag the right detector with the right severity. Report detection rate per perturbation class.

## Scripted experiments (exact-fault only)
- **T1 Seeded fault injection.** Puppet emitter writes known faults; exact precision/recall per detector with CIs; SYNTHETIC badge.
- **T3 Perturbation stability.** Serializer equivalence (same run through JSONL and OTLP emitters yields the same canonical Run modulo declared channel limits); alignment stability for Run Diff under benign perturbation.
- **T5 (Later, evidence trigger).** Comprehension study: do users reading Run Card first notice capture limits? Needs ADR and a human-subjects check.

## Judge calibration study (Next; needs verified Jev access)
Plot Jev (or other judge) probability against R5 truth: reliability curve, ECE, per-question AUROC, threshold chosen on a held-out split **declared in advance** (the Jev paper does not declare its split; we do). Report as `model-judged`. Compare to a trivial deterministic baseline.

## Statistics rules
- Unit of analysis is the **session** (clustered CIs by session); lines and spans are not independent.
- Report n, number of sessions, versions covered, and Capture Level mix next to every rate.
- Wilson/Clopper-Pearson CIs for proportions; bootstrap over sessions for agreement. No p-hunting; primary metric preregistered in `docs/experiments/`.
- Never pool across Claude Code versions without showing the per-version split.

## Threats to validity (keep updated)
1. Claude Code changes weekly; findings are version-scoped and may expire. Record version in every result.
2. OTel traces are beta; behaviour may differ from final.
3. Small, single-user corpus; one repo style; we state it, we do not generalise.
4. Auditor is the builder (R4); mitigated by blind passes and agreement reporting, not eliminated.
5. External corpora come from other harnesses; transferability limited.
6. Hooks and OTel may themselves alter timing or content (observer effect); R1 records overhead.
7. Judge results depend on provider version and an undisclosed threshold split in the source paper.
8. Extractor-summarised prior-art numbers may be wrong; PRIOR_ART levels govern.

## Preregistration
Each experiment copies `docs/experiments/TEMPLATE.md` before any live capture: question, sessions/n, primary metric, analysis, stopping rule, what would change our mind.
