# Claims ledger

Every number assay publishes (README, report, site copy) is a row here, pointing at the artifact it comes from (Rule 3). `pnpm claims` reads each artifact and fails when the value written here and the artifact disagree beyond the tolerance. Artifacts live in `results/` (local, gitignored), so a claim whose artifact is absent, as in CI, is reported **unchecked**, never passed. Regenerate every artifact with `pnpm results`.

| id | claim | artifact | pointer | value | tol |
|---|---|---|---|---|---|
| r2-primary | R2 held-out: requests rebuilt exactly from transcript lines alone | results/R2-reconstruction-v1.json | /heldOut/summary/primary_linesOnly/mean | 0 | 0 |
| r2-combined | R2 held-out: requests sealed by stored blobs plus rebuild (per-session mean) | results/R2-reconstruction-v1.json | /heldOut/summary/combined_blobsPlusRebuild/mean | 0.997 | 0.0005 |
| r2-blobs | R2 held-out: requests sealed by stored blobs alone | results/R2-reconstruction-v1.json | /heldOut/summary/blobsOnly/mean | 0.212 | 0.0005 |
| r2-requests | R2 held-out request count | results/R2-reconstruction-v1.json | /heldOut/summary/requests | 2049 | 0 |
| r2-uncat | R2 held-out: uncategorised share of sealed-request characters | results/R2-reconstruction-v1.json | /heldOut/summary/secondary_uncategorisedShare/mean | 0.0009 | 0.00005 |
| r2-delta | R2 held-out: input tokens measured by usage deltas | results/R2-reconstruction-v1.json | /heldOut/summary/secondary_deltaMeasuredTokenShare/mean | 0.077 | 0.0005 |
| p4-agree | P4 held-out: provenance agreement with an independent raw-file search | results/P4-provenance-v1.json | /heldOut/summary/primary_agreement/mean | 0.974 | 0.0005 |
| p4-unsourced | P4 held-out: literals with no earlier exact occurrence | results/P4-provenance-v1.json | /heldOut/summary/unsourcedShare/mean | 0.425 | 0.0005 |
| p4-literals | P4 held-out literal count | results/P4-provenance-v1.json | /heldOut/summary/literals | 16207 | 0 |
| t3-stable | T3: benign perturbation pairs aligned identically | results/T3-diff-stability-v1.json | /stablePairs | 60 | 0 |
| t3-pairs | T3: benign perturbation pairs | results/T3-diff-stability-v1.json | /pairs | 60 | 0 |
| t3-detected | T3: negative controls detected | results/T3-diff-stability-v1.json | /detected | 16/17 | 0 |
| l4a-messages | L4 calibration 1 (`cae68025`): messages equal between record and wire | results/L4-calibration-cae68025.json | /messages/equal | 25 | 0 |
| l4a-compared | L4 calibration 1: messages compared | results/L4-calibration-cae68025.json | /messages/compared | 26 | 0 |
| l4a-redacted | L4 calibration 1: values the raw-body logger redacted | results/L4-calibration-cae68025.json | /redactedLeaves | 356 | 0 |
| l4b-messages | L4 calibration 2 (twin A): messages equal between record and wire | results/L4-calibration-ff627b48.json | /messages/equal | 10 | 0 |
| l4b-subagent-unpaired | L4 calibration 2 (subagent session): raw requests with no transcript record | results/L4-calibration-257eafee.json | /unpaired/length | 5 | 0 |
| trail-traces | TRAIL: traces read by the TRAIL importer | results/TRAIL-health.json | /traces | 148 | 0 |
| trail-overcount | TRAIL: tokens from summing every span ÷ tokens from LLM calls only | results/TRAIL-health.json | /naiveOvercount | 1.814 | 0.0005 |
| trail-agent-disagree | TRAIL: agent spans whose token total disagrees with the LLM calls beneath them | results/TRAIL-health.json | /agentTotalsDisagreeing | 177 | 0 |
| trail-agent-totals | TRAIL: agent spans carrying a token total | results/TRAIL-health.json | /agentSpansWithTotals | 202 | 0 |
| positives-fired | Known positives (one documented change to a real session) caught by D3, D8, D11 and D0 | results/detector-positives.json | /fired | 4 | 0 |
| j1-answered | J1: TRAIL spans the judge answered, of 600 | results/J1-judge-calibration-v1.json | /sample/answered | 589 | 0 |
| j1-ece | J1: held-out ECE of the judge's probability (model-judged) | results/J1-judge-calibration-v1.json | /primary_ece_heldOut/value | 0.428 | 0.0005 |
| j1-auroc | J1: held-out AUROC of the judge (model-judged) | results/J1-judge-calibration-v1.json | /auroc_heldOut | 0.480 | 0.0005 |
