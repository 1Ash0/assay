# assay M5 primer — calibration (unit 9) and the cumulative review

M5 ships what M0–M4 measured, so this primer has two halves:
- **Part A** covers the one new concept, unit 9, calibration.
- **Part B** is the cumulative review, built on what the code does today.

Every claim carries a tag. `[verified in repo]` means I opened the file named. `[from docs, check]` is an external concept to re-check with the tutor.

`questions.md`, `answers.md` and `paste-pack.md` follow once M4's code is final, so the excerpts they quote are real.

---

## Part A — Calibration (unit 9)

### A1. What calibration means
A model that says "70%" is *calibrated* if, among everything it labels 70%, about 70% turn out true. Calibration is separate from accuracy: a model can rank cases well and still be badly calibrated. `[from docs, check]`

### A2. Reliability curve
1. Bucket predictions by stated probability, for example into ten bins.
2. For each bin, plot the mean stated probability (x) against the fraction actually true (y).
3. A perfectly calibrated model lies on the diagonal.

Points under the diagonal mean overconfident; over it means underconfident. Bins with few cases are noisy, so show the count per bin. `[from docs, check]`

### A3. ECE (expected calibration error)
ECE = Σ over bins of (bin share of cases) × |accuracy in bin − mean confidence in bin|.
- One number, 0 is perfect.
- **Its weaknesses:** it depends on the binning, it can hide errors that cancel inside a bin, and it says nothing about ranking (use AUROC for that).

Report it with the curve, never instead of it. `[from docs, check]`

### A4. Why a judge threshold needs a declared split
Choosing the threshold on the same data you report on makes the reported number optimistic. You picked the cut that happened to fit those cases.
- The threshold is chosen on a calibration split.
- It is reported once on a held-out split.
- Both splits are declared before anyone looks.

The rule in assay: model-judged output is optional, off by default, labelled `model-judged` with its probability, and never mixed with deterministic verdicts. `[verified in repo]` `CLAUDE.md` Rule 6

### A5. The same discipline outside judges
R2 already uses it. The 6 dev sessions are for building rebuild rules, and the 14 held-out sessions are scored once, chosen by hash before scoring. `[verified in repo]` `docs/experiments/R2-reconstruction-v1.md`
- **Question to bring to the tutor:** why does choosing the split *by hash of the id* matter more than choosing it at random afterwards?

### A6. What truth a calibration curve can use here
R5 structural labels are computable facts, so they can be ground truth without a model. Examples: whether a literal appears in earlier tool results, a nonzero exit code, whether a tool_result is present. `[verified in repo]` `docs/EVAL_DESIGN.md` (R5)
- **Question:** why is "a literal appeared earlier" a valid truth for provenance, but not for "the model copied it from there"?

---

## Part B — Cumulative review

### B1. Capture Level comes before any number
L1 transcript, L2 hooks, L3 OTel, L4 raw bodies. An OTLP capture whose records match the session raises a run to L3. `[verified in repo]` `packages/assay-core/src/importers/otlp/index.ts`

**The new nuance from M4:** on 2.1.316 the wire sends thread deltas, and the raw-body log redacts some fields. So L4 is not a strict superset of L1 for context, though it is for side calls. `[verified in repo]` `docs/M4_PLAN.md` §1a, `scripts/l4-calibrate.mjs`

### B2. Request records verify themselves
- A blob's key is SHA-256 of its message as sorted-key JSON, with string content as one text block.
- `requestDigest` covers params, system, tools and messages, with the cache markers applied.
- A rebuilt request whose hash equals the digest is *sealed*: exact, byte for byte.

`[verified in repo]` `packages/assay-core/src/importers/claude-code-jsonl/requests.ts`
- **Question:** why is an *unresolved* request not a finding, while a *broken* one is (D11)?

### B3. Rule 7 in code
The importer declares a supported range and the versions it has checked. D0 warns outside the range, or when the version is missing. `assay catalogue check` lists what changed at each version. `[verified in repo]` `importers/claude-code-jsonl/support.ts`, `census.ts`, `health/detectors.ts`
- **Question:** why does the census report only types *first seen* at a version, and never types missing from one?

### B4. Fineness and the catalogue
Fineness = ⌊1000 × min(usage coverage, parsed telemetry, model identification)⌋. Catalogued and request-record lines leave the unparsed count but stay kept. `[verified in repo]` `health/health.ts`

### B5. Ranges, not false points
When copies disagree, the input total is a range and the tokens verdict drops (ADR-021). `[verified in repo]` `health/health.ts` `inputTokenRangeOf`

### B6. Counters versus findings
Capture-quality counters count and point; they change no verdict. A detector finding changes the verdict. `[verified in repo]` `health/quality.ts`
- **Question:** 232 duplicate uuids in one real session moved no number. How was that checked, and what would have changed if tool results had been duplicated?

### B7. Edges
Only `observed` (an explicit id link) and `matched` (exact string equality) edges exist. Nothing is inferred. `[verified in repo]` `CLAUDE.md` Rule 5

### B8. Statistics
- The unit of analysis is the session; CIs come from a bootstrap over sessions.
- A pooled rate is shown beside the per-session mean, never instead of it, because one large session would dominate it.

`[verified in repo]` `docs/experiments/R2-reconstruction-v1.md`

---

## How the gate runs
The same as before (`docs/LEARNING.md`):
1. Answer `questions.md` in `attempt.md`.
2. Grade with the tutor using `paste-pack.md`.
3. Paste the summary into `gate.md`.

The pass mark is at least 80%, with no zero on a core question. I then spot-check three of your explain-back claims against the repo.
