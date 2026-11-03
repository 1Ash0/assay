# EXP-J1 Judge calibration on TRAIL v1 — result (2026-11-03)

The preregistration is `J1-judge-calibration-v1.md` with Amendments 1 and 2, both written before any scoring. The runner and scorer are `scripts/j1.mjs`; the full output is `results/J1-judge-calibration-v1.json` (local, gitignored; aggregates and per-span p by hashed id, no TRAIL text). Every number here is `model-judged`.

## Run
- Judge: `openai/gpt-oss-120b` on Groq for all 600 answers (Amendment 1). No answer came from the fallback model.
- 589 answered, 11 unanswered (the model returned no usable JSON). Rate-limit and network failures were retried, never counted (Amendment 2).
- Split by trace: 210 calibration spans, 379 held-out spans with 59 positives.

## Primary metric (preregistered)
**Held-out ECE: 0.428**, 95% CI [0.355, 0.497] (10 bins, bootstrap over traces, 10,000, seed 26).

The judge's probabilities are not usable as probabilities. Its answers pile up at the two ends: 168 of 379 held-out spans got p below 0.2 and 177 got p of 0.8 or more. The error rate in those groups is about the same (0.13–0.19 at the bottom, 0.15–0.21 at the top), near the base rate of 0.16.

## Secondary
| held-out | judge | deterministic baseline |
|---|---|---|
| AUROC | **0.480** | — |
| threshold | 0.1 (best F1 on calibration) | status or Error/Exception/Traceback text |
| precision | 0.159 | 0.260 |
| recall | 0.932 | 0.576 |
| F1 | 0.271 | 0.358 |

- AUROC 0.48 is chance: the judge does not even rank error spans above the others.
- The threshold picked on calibration (0.1) flags 347 of 379 held-out spans, so its high recall comes from flagging almost everything.
- The one-line deterministic rule beats it on precision and F1.

## Against the preregistered bar
The bar was ECE under 0.05 with AUROC above 0.8. Neither is met, by a wide margin. **The judge, as asked, does not detect TRAIL's span-level errors.**

## Threats, as preregistered
Truncation to 6,000 characters; one annotation pass (an unlabelled span is not proof of no error); elicited probabilities; possible contamination; one judge model, and not the one first preregistered (Amendment 1). One more is now visible: TRAIL often places an error on the span where it was annotated, which need not be the span whose own text shows it, so a span-only judge is at a disadvantage by design.

## What this changes
- Rule 6 stands, with evidence: judge output stays optional, off by default and apart from deterministic verdicts. Nothing on the site or in `assay check` uses it.
- A v2, if any, needs its own preregistration (for example, giving the judge the parent and sibling spans). It is not run here.
