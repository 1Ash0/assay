# LEARNING — the `learn/` gate protocol (all three projects)

Replaces chat-based learning. Claude Code produces the learning artifacts inside the repo; Asmit studies with an external tutor (GPT) via paste packs; results come back as files; Claude Code checks them against the repo before a milestone can close.

## Per milestone Claude Code writes `learn/<milestone>/`
- `primer.md` concept primer for this milestone. Every claim tagged `[verified in repo]` (checked against code in this repo, with path) or `[from docs, check]` (external, needs re-check). No untagged claims.
- `questions.md` anchored to real excerpts (`path:line`) from this repo, 8-12 questions: predict, explain why, find the bug, what breaks if X changes. Includes at least two about Capture Level / truth-ladder consequences.
- `answers.md` model answers and rubric. **Withheld**: Claude Code does not show or open it until Asmit has answered in `attempt.md`.
- `paste-pack.md` self-contained for the tutor: tutor instruction (quiz me one question at a time, no hints before an attempt, grade against the rubric, be strict), primer, questions, rubric, excerpts. **No raw traces, no secrets, no real prompts**; corpus excerpts are replaced by fixtures.
- Asmit pastes the graded transcript summary into `gate.md` (score per question, weak areas, one-paragraph explain-back in his own words).

## Gate rule
Milestone cannot close until: `attempt.md` exists, `gate.md` shows pass (>=80% and no question scored 0 on a core-concept question), and Claude Code has spot-checked three of Asmit's explain-back claims against the repo and noted agreement or corrections in `gate.md`. Failed gate = a short remediation primer, then a retake with new questions.

## Concept map (units, in order)
1. **Telemetry channels**: transcript vs hooks vs OTel vs proxy; what each can and cannot see; why Capture Level exists.
2. **Claude Code session anatomy**: uuid/parentUuid, sidechains, subagent files, compaction boundary/summary, usage fields.
3. **OTel basics**: spans vs events vs metrics; ids and correlation; beta status; content flags and truncation.
4. **Canonical schema + lossless offsets**: why derived data must point at raw bytes.
5. **Detectors and validity cards**: precision/recall, audited vs scripted, why scripted numbers are second-class.
6. **Graph semantics**: observed vs matched edges; why no inferred edges.
7. **Context categories and Strata**: what reconstruction can and cannot recover.
8. **Statistics**: clustered CIs by session, agreement, preregistration.
9. **Calibration**: reliability curves, ECE, why a judge threshold needs a declared split.
10. **Rendering honesty**: depth never encodes quantity; table and describe modes.

## Mapping to milestones
M0 units 1-2 · M1 units 3-4 · M2 units 5, 8 · M3 units 6, 10 · M4 units 7 · M5 unit 9 plus a cumulative review.

## Explain-backs
`docs/understanding/<unit>.md` in Asmit's own words (no pasting tutor text); `LEDGER.md` lists unit, date, gate score, open gaps. Claude Code appends ledger rows only after a passed gate.

## What Claude Code must not do
Write code for a core module in a milestone whose gate is unpassed. Reveal `answers.md` early. Put raw traces into any paste pack. Mark a claim `[verified in repo]` without having opened the file.
