# EXP-R2 Reconstruction fidelity v1 — result (2026-11-02)

The preregistration is `R2-reconstruction-v1.md`, unchanged. The scorer is `scripts/r2-score.mjs`, run once on the held-out set with the rebuild frozen at `99e56df` (ADR-031). The full output is in `results/R2-reconstruction-v1.json` (local, gitignored).

## Primary metric (preregistered)
**Digest-exact rate from transcript lines alone:**
- held-out: **0.000**, 95% CI [0.000, 0.000], over 14 sessions and 2,049 requests;
- dev: 0.000.

No request can be rebuilt exactly from ordinary transcript lines. This is a property of the data, not of the rules.
- A session's opening request carries an environment system message and `tool_addition` blocks with full tool definitions.
- No ordinary line holds them: the transcript names deferred tools but never writes their schemas.
- Every later request keeps those messages, so one missing opener blocks every request after it.

This was predicted from the dev set before the held-out score (ADR-031). The result is reported as measured, and no rule was added after scoring.

## Reported alongside (not primary)
| | held-out (14 sessions) | dev (6) |
|---|---|---|
| Blobs plus rebuild, per-session mean | **0.997** [0.991, 1.000] | 1.000 |
| Blobs plus rebuild, pooled | 2,048 / 2,049 | 1,016 / 1,016 |
| Stored blobs alone, per-session mean | 0.212 [0.074, 0.384] | 0.169 |
| Broken seals | 0 | 0 |

- **Blobs plus rebuild is the product result.** On 2.1.299+ sessions, assay recovers the exact context of almost every request, proven by the record's own digest: stored blobs cover the client-injected parts, and hash-matched rebuilds from lines cover the rest.
- **The generalization gap is small:** dev 1.000 against held-out 0.997. The single unsealed held-out request is `c438a9b3`, line 202, unresolved with 1 of 43 messages missing; it was looked at only after scoring.
- **Secondary metrics come in P3.** Block-exact rate per category, measured-token share and uncategorised share need the category markers and delta attribution, and will be added to this file from the same frozen rebuild.

## Threats, as preregistered
- **T-R2-1:** the truth and the rebuild come from one client-written file. The L4 calibration (`M4_PLAN.md` §1a) found the record equal to the wire for the main thread, apart from four named differences.
- **T-R2-2:** one user, one machine.
- **T-R2-3:** 2.1.301–2.1.316 only.
- **T-R2-4:** sessions before 2.1.299 have no truth; their rebuild is unverified and must be labelled `inferred`.

Two disclosures:
- Two held-out sessions (`334cd181`, `6973b17c`) are version canaries, so their importer output was hashed during development. Their rebuild numbers were not looked at.
- During P1, corpus-wide seal counts were printed for all sessions, before any rebuild rule existed.

## What this changes
- **The R2 question as preregistered has a clear negative answer:** L1 lines alone cannot reproduce the request.
- **The useful answer is the combined one.** It holds only where request records exist (2.1.299+), and it is exact where it holds.
- **For older sessions, the context view must say "not reconstructable from the transcript".** It must not show a partial rebuild as if it were the context.

## Secondary metrics (preregistered), added after the primary
Computed by the same scorer run from the same frozen rebuild, with category markers and delta attribution (ADR-032) written after the primary was scored. The primary is unchanged on rerun (0.000).

| | held-out | dev |
|---|---|---|
| Uncategorised share of sealed-request characters | **0.09%** [0.01%, 0.23%] | 0.00% |
| Share of input tokens measured by a usage delta | **7.7%** [3.4%, 13.1%] | 29.7% [17.8%, 44.3%] |

- **Uncategorised is small on held-out data**, so the markers, taken from dev attachments, carry over. 'You' is assigned by exclusion and is an upper bound on the user's own text (one skill body without a standard opening is known to land there).
- **Measured tokens are a small share, and the dev/held-out gap is large.** A delta is measured only along an unbroken append chain. Held-out sessions break the chain more often (requests that drop earlier messages), so most of their category tokens are a characters split, drawn as inferred.
- **Within a measured delta, the split across categories is still by characters**, because nearly every addition mixes an assistant message with tool results. No category total is "measured" except where an addition was one category.
- **The preregistered "block-exact rate per category" is reported at message level** (the rebuild is hash-gated per message; 1,897 of 2,104 distinct dev messages), because a block cannot be checked on its own: only a whole message has a hash.
