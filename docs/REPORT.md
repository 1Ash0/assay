# What Claude Code's telemetry does and does not tell you

*assay findings report, 2026-11-03. One user, one machine, Claude Code 2.1.165–2.1.316. Every number below names its row in `docs/CLAIMS.md`, which `pnpm claims` checks against the artifact it came from.*

## The question
Before you chart an agent's token use, cost or behaviour, you need to know whether the telemetry can be trusted, and what it leaves out. assay answers that first: every run gets a Capture Level (L1 transcript … L4 raw API bodies), a truth label, and detectors that check the data against itself.

## Findings

### 1. The transcript proves its own requests, from 2.1.299 on
Claude Code writes every API request into the session transcript as a delta chain of hashed records. The hashes reproduce:
- each message's key is SHA-256 of its sorted-key JSON;
- each request's digest covers the full body.

So a request rebuilt by assay can be **proven** exact, byte for byte, with no other capture channel.

On 14 held-out sessions (2,049 requests [r2-requests]):

| | per-session mean |
|---|---|
| Stored message blobs alone | 21.2% sealed [r2-blobs] |
| Blobs plus assay's hash-gated rebuild from transcript lines | **99.7%** sealed [r2-combined] |
| Transcript lines alone | **0%** [r2-primary] |

The 0% is the preregistered primary metric, reported as measured. A session's opening request carries a large environment message and the full tool definitions, and no ordinary transcript line contains them. Exact context reconstruction from the visible transcript is impossible on these versions; it needs the request records.

### 2. A raw-body capture (L4) is not a superset of the transcript
Two calibrations compare the transcript's request records with `OTEL_LOG_RAW_API_BODIES`.
- **On 2.1.316 the wire sends only the new messages** (`thread: continue`), so raw bodies have to be replayed to recover context.
- **The raw-body logger redacts**: 356 values in one session [l4a-redacted].
- **For main-thread requests, record and wire agree** on 25 of 26 messages [l4a-messages, l4a-compared], apart from named differences: a billing header on the wire only; cache markers stored differently; and **tool-call inputs that differ in both directions**, a default filled in on the wire in one session and a client-rewritten `cd …` command in the record in another [l4b-messages].
- **What only L4 sees:** in the subagent session, 5 raw requests have no transcript record [l4b-subagent-unpaired]: 3 Explore subagent calls, a title generation and a prompt suggestion. Subagent requests and side calls are visible only at L4.

### 3. The transcript holds text the model never received
Provenance asks whether each literal a tool call used appeared earlier in what the model had. assay's request-based answer agrees with an independent raw-file search **97.4%** of the time, over 16,207 literals [p4-agree, p4-literals].

The disagreements are the finding. The transcript file contains the client's structured copy of tool results (`toolUseResult`), cleared thinking, and bookkeeping lines, none of them sent to the model. **Searching the raw transcript over-claims provenance.** 42.5% of literals have no earlier exact occurrence [p4-unsourced], mostly composed commands. That is a count, never an error.

### 4. Run Diff is stable, and twins diverge
Aligning two runs by the multiset of tool names per step survived all 60 benign perturbations [t3-stable, t3-pairs]: reordered parallel calls, renamed paths, duplicate records. It found 16 of 17 real changes [t3-detected]; the miss is a run of identical steps.

The first recorded twin pair (same prompt, same commit) diverged at step 1: one run read the file first, the other ran a single shell command. 417k against 161k input tokens.

### 5. What the categories say, and how much is measured
For sealed requests, assay splits context into the official categories by literal markers, with 0.09% uncategorised [r2-uncat]. Only 7.7% of input tokens are *measured* by usage deltas [r2-delta]; the rest is split by characters and drawn as inferred. The opening request, mostly system prompt and tools, can never be delta-measured.

## Threats (read before quoting any number)
- **One user, one machine, one task style.** The ≥3-users criterion is not met.
- **Versions 2.1.301–2.1.316 for every request-record result.** D0 and `assay catalogue check` flag later versions.
- **R2's truth and rebuild come from one client-written file.** The two L4 calibrations bound this for the main thread, not for subagents.
- **The detector audit (R4) is not finished.** Precision per detector is unreported until both blind passes are done.
- **Judge calibration (J1, on TRAIL)** is preregistered; its result goes into `docs/CLAIMS.md` once run.

## Reproduce
`pnpm results` regenerates every artifact from a local corpus and checks every claim. The corpus itself is never published (Rule 8).
