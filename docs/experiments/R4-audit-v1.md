# EXP-R4 Detector audit v1 (preregistration, 2026-11-03, before any labels)
- **Question:** Are assay's detector findings on the real corpus true, as judged by a person reading the raw lines? Is that person's judgement stable over time?
- **Truth badge of data used:** `real`, meaning every session in `web/prototype/site-runs.json` labelled real.
- **Sample (fixed now):** findings stratified by detector and severity, up to **6 per stratum**.
  - Within a stratum, findings are ordered by SHA-256 of `assay-R4-v1:<session>:<detector>:<first offset line>:<message>`, and the first 6 are taken.
  - On the corpus as of 2026-11-03 there are 5,143 findings in 9 strata, which gives the sample in `results/R4/sheet.csv`.
- **Unit of analysis:** the finding (each is a separate claim about a specific line), with a CI by bootstrap over sessions. Findings cluster by session.
- **Labels:** for each finding, read the raw line(s) at its offset and answer:
  - `true`: the claim holds;
  - `false`: it does not;
  - `unsure`: the lines do not settle it.

  Add a note when the answer is not `true`.
- **Two passes:** pass 1 at any time; pass 2 at least **7 days later**, from a re-shuffled sheet (`sheet-pass2.csv`, the same items in another order), without looking at pass 1.
- **Primary metric (fixed now):** intra-rater agreement between the passes, as Cohen's kappa over {true, false, unsure}, with a bootstrap 95% CI over sessions (10,000, seed 26). Raw agreement is reported alongside.
- **Secondary:** audited precision per stratum = true ÷ (true + false), from items labelled the same in both passes. It is reported per detector, never pooled across detectors.
- **Stopping rule:** one comparison after pass 2.
- **Threats:**
  - The auditor is the builder (EVAL_DESIGN threat 4); mitigated by the two blind passes, not eliminated.
  - Strata with fewer than 6 findings (D1: 1, D4: 3) give precision with very wide intervals.
  - Info-level D2 findings (de-duplication) are nearly mechanical, so their precision says little.
- **What would change my mind:** kappa below 0.6, which would make the labels too unstable to use as truth for any detector.
- **Result artifact path:** `results/R4/agreement.json`, summarised in `R4-audit-v1.result.md`.
