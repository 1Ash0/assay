# PROJECT — assay

## The question
**Can you trust the telemetry of a coding-agent run, and what does it fail to tell you?**
Everything else (graphs, replay, diff) is built on the answer, because a beautiful view of incomplete data is worse than no view.

## Why this exists (evidence, with levels; see PRIOR_ART.md)
- A Harbor parser that read only the top-level Claude Code session file missed about 80% of prompt tokens on a real 4-subagent session, because newer Claude Code writes each subagent to a separate file. **[read]** (harbor-framework PR #2247, read at source 2026-10-31 and re-fetched live 2026-11-02; author-reported on Claude Code 2.1.78: 2.61M vs 0.52M prompt tokens, 95 vs 25 steps; not independently reproduced by us, own-corpus reproduction tracked in PRIOR_ART.md.)
- Claude Code's transcript format is barely documented and changes constantly: 2.1.300 added per-request system prompt, tools and parameters to local transcripts; a transcript GC (`CLAUDE_CODE_TRANSCRIPT_LOCAL_GC`, fixes in 2.1.296/2.1.304) can drop messages from the saved transcript; 2.1.299 stopped keeping PDF bytes. **[read]** (full changelog).
- OTel traces for Claude Code are explicitly beta and off by default; content capture is off by default per flag. **[read-summary]** (docs monitoring page).
- No tool found reports **capture level or data-quality** for these sources (context-analyzer's page does not state it). **[read-summary]**, "we believe" gap.

## Novel contributions (what we build that nobody ships together)
1. **Capture Level + Trace Health report** on every run (what was captured, what was lost, what is unknowable) before any metric.
2. **Truth ladder:** every number labelled `real | real-perturbed | scripted | inferred`.
3. **Validity lab built on real data first:** dual capture (JSONL + OTel of the same run), reconstruction fidelity against raw API bodies, external human-labelled traces (TRAIL, MAST, AgentRx), own audited corpus, free structural labels; scripted fault injection only for exact precision/recall.
4. **Exact-match literal provenance** (no judge model for primary outcomes).
5. **Run Diff** with first-divergence alignment.
6. **Harness-native entities as first-class:** Skill, Subagent, Compaction, MCP call, Hook, plus the official context-source categories as Strata layers.
7. **Cross-channel disagreement as a finding:** where JSONL, hooks, OTel and proxy disagree about the same run is published as results and, where appropriate, upstream issues.

Crowded does not mean closed. Viewers and token analyzers exist; none of the above is claimed as shipped by them (each claim is gated by `PRIOR_ART.md` open tasks). Where a lane is crowded we reach **parity first, then differentiate** (see ROADMAP "parity floor").

## Layers
- **A. Capture and health:** importers, Capture Level, Trace Health detectors.
- **B. Understanding:** Run Card, Constellation, Strata, Replay Theatre.
- **C. Verification:** provenance, reconstruction, Run Diff, assertions, CI.
- **D. Validity lab:** the research artifact; its results are the project's credibility.
- **E. Optional judge plane:** Jev or any classifier, calibrated against D.

## Non-goals (v0.1)
Hosted backend; live monitoring service; modifying agent behaviour; replacing Langfuse/Phoenix; judging whether an agent was "good"; storing anyone else's traces.

## Success criteria
- M2: Health flags, on the own corpus, every undercount we can independently confirm (e.g. missing subagent files), with validity cards showing audited precision.
- M2: R1 dual-capture report published with at least one disagreement characterised.
- M3: Run Card first-paint shows Capture Level before any number; a stranger can read it in 30 seconds (T5-lite with 3 people, informal).
- M4: R2 reconstruction fidelity reported with a number and its threats.
- Throughout: Asmit can explain every core module (learning gates).

## Alignment (not goals, but chosen)
Atlan: provenance/lineage framing; IRIS/research: R1 and R2 are publishable findings with free ground truth; GSoC 2027: dual-capture mismatches and missing entity conventions (compaction, skill) become upstream proposals against OTel GenAI (now in `semantic-conventions-genai`, status Development).
