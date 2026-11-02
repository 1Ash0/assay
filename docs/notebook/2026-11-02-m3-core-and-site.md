# M3 — core view model, fineness, forged usage, site on core — 2026-11-02

Claude Code versions in corpus: 2.1.165–2.1.309. Content flags unchanged (all false; L1 JSONL only).

## What I tried
- Moved every number the site shows into core: `buildRunView` (ADR-020), fs-free `importFromFiles` (ADR-019), `assay export-site` writing `web/prototype/data.js` and regenerating `results/<id>.health.json`.
- Redefined fineness around a record-type catalogue (ADR-022).
- Made disagreeing usage copies produce an input-token range and demote the tokens verdict (ADR-021).

## What happened
- **Fineness, old vs new.** Old definition: every real run 300–479, always bounded by importer coverage. New: real runs 724–1000, mostly bounded by *parsed telemetry* (uncatalogued types such as `api-request-blob`, `atis-latch`). One real run (`6973b17c`) scores **0**: one assistant turn and no usage block, so usage coverage is 0. That is the intended reading.
- **The forge finding was stale.** M3_PLAN §10.1 came from a results file whose source (543-line, sha `b285f329…`) no longer exists; `real-perturbed/d5-context-overflow.jsonl` on disk (sha `cdc69683…`) is the documented D5 perturbation (every copy rewritten, model set to haiku) and is caught by D5. To keep the one-copy case, I added `real-perturbed/d6-forged-copy.jsonl`: a copy of `3620a96a` with only the first copy of `msg_011Cg6ZfRptEqHz9yr2pZdXo` (line 26) changed from `input_tokens: 2` to `195000`. Originals untouched. Result: D6 warn, tokens verdict `usable-with-caveats`, input range **106–195,104**. Mission 02 now stamps CAUGHT.
- **Truth labels on disk are now right**: `results/` is regenerated with `real`, `real-perturbed` and `scripted` from `web/prototype/site-runs.json`.
- **A redaction bug.** Path regexes written through a shell heredoc lost their backslashes, so a Windows path reached the mission result card. Fixed, with tests for both path styles; `data.js` scanned for drive paths and `Users` fragments: none.
- **Parser rewrite**: lines are now split on raw 0x0A bytes; SHA-256 is computed in plain TS and matches Node's on a 3 MB corpus file.

## What I believe now
- The hallmark finally separates a clean run from a lossy one.
- Max-usage selection is only safe when copies agree; the range is the honest default.

## What would change my mind
- A catalogued type turning out to carry usage (it would have to leave the catalogue).
- A real session where the smallest copy, not the largest, is the true usage (then the range should be presented differently, not collapsed).

## Later the same day: corpus, subagents, OTel

- **Corpus grown from local sessions only.** Asmit has no other accounts, so the only real sessions are the ones on this machine. Six finished E--assay sessions (2.1.308–2.1.309) were copied read-only into `corpus/frozen/E--assay` (sha256 checked against source, logged in `corpus/MANIFEST.json`), and two already-frozen sessions (`ef28c299` E--RIP, `dc47743b` E--SPARK) joined the site list. Still 1 user; ≥3 users cannot be met from this machine. The active session (`f44a29f4`) was left out because it is still being written.
- **Real detector coverage gained:** D4 warn on `2ac7ce78` and `48ad08c2`; D-cost warn on several; D1 warn on `d1-trigger` (see next point).
- **Importer bug (ADR-024):** subagent transcripts were parsed and then skipped (`isSidechain`), and parents' `toolUseResult.agentId` was never read. Effect on real runs: `ef28c299` gained 28 requests (~1.1M context tokens), `453b573b` 16 (~711k). D1 now fires on `d1-trigger`, the real session that was frozen without its `subagents/` folder; ADR-011's "zero real D1 coverage" was this bug, not the corpus.
- **OTel (ADR-025):** the 2026-10-31 R1 capture was copied to `corpus/frozen/otel/`. `93de073c` stamps L3 and shows one OTel-only `generate_session_title` request (1,342 in / 248 out), reproducing R1-F2 from data; `2b152411` matches 3 of 3 by request_id. `6973b17c` (fineness 0) has an `api_error` / `api_retries_exhausted` in OTel, which explains its missing usage block.
- **Accessibility:** axe could not be loaded into the page here, so the pass was manual: every interactive element named, every SVG with a role, Traverse steps and Shelf dots now keyboard-operable. Colour contrast was not measured.

What would change my mind: a Claude Code version where sidechain lines also appear inline in the main file with different message ids (the dedup assumption in ADR-024 would then double count).

## Evening: M4 P0 and the first L4 calibration

- **Request records verify.** Transcripts from 2.1.299 store requests as a hash chain. Blob hash, shape hash and `requestDigest` all reproduce (sorted-key JSON SHA-256; `requestDigest` with cacheControl applied). Every request whose messages were all stored matched (4 of 4). ADR-026 makes them R2's ground truth; R2 is preregistered with a 6 / 14 dev / held-out split fixed before scoring.
- **L4 calibration on `cae68025`** (`scripts/l4-calibrate.mjs`, `results/L4-calibration-cae68025.json`). On 2.1.316 the wire uses server-side threads (`thread: create | continue`), so a raw body is only a delta. Replaying the chain:
  - params 9 of 9, system and tools 2 of 2, messages 25 of 26.
  - The differences are named and counted: a billing-header system block on the wire only; cache markers inline vs paths; one client-filled default (`replace_all: false`) in a re-sent `Edit` input; and 356 values the raw-body logger itself redacts.
  - 3 of 12 wire requests (1 title, 2 prompt suggestions) have no record.
- **What I believe now:** for the main thread, the transcript record is the better context ground truth than L4: L4 is delta-encoded and redacted, and the record is neither. L4 remains the only view of side calls and of client-filled defaults.
- **Side-session quality list triaged** (M4_PLAN §4a). Most counters go into P1. D-fork-dup is deferred because no fork session exists on this machine; building it from an issue summary would be a detector without a real fixture.
- **What would change my mind:** a second calibration (another version, or a session with subagents) where record and wire disagree beyond the four named differences.

## Late: M4 P1, request records in core

- **Two bugs found by checking real bytes.**
  - `api-request` lines were counted and then dropped, never kept (Rule 4). They are now kept and read.
  - The digest is taken after string content becomes a text block. Without that, 19 of 75 complete real requests showed as broken; with it, all 75 seal.
  - The scripted fixture had been built on the same wrong rule, so it could not catch it. It now starts with string content.
- **Corpus:** 21 sessions, 3,074 records; 75 sealed, 0 broken, 2,999 unresolved; 0 blobs or shapes fail their own key.
- **Rule 7 was never enforced in code.** Now: declared support (2.1.165–2.1.316, ten checked versions), D0, and `assay catalogue check` with a cumulative census.
  - The census shows `requestId` and `uuid` on `api-request` from 2.1.309. D10's "cannot link" premise holds only for older versions.
- **Counters:** `c3170ecf` writes 232 records twice, identical. Measured: no entity or edge is duplicated by it. Child-before-parent is a few milliseconds around compaction summaries.
- Fineness rose on every 2.1.299+ run (now 902–996 for most), bounded by `atis-latch`.
- **What would change my mind:** a version where a complete request breaks its seal (D11 would fire). That would mean the hash rule moved, and every seal from that version needs re-reading.

## Night: M4 P2–P5, each preregistered and scored once

- **P2 (R2).** Hash-gated rebuild: a candidate message counts only if it reproduces a hash a record names. On dev, lines rebuild 1,897 of 2,104 messages.
  - **Held-out primary, lines alone: 0.000.** Opening requests carry an environment system message and `tool_addition` tool definitions that no line holds, so nothing after them can seal from lines.
  - **Blobs plus rebuild: 0.997** (2,048 of 2,049); blobs alone 0.212.
  - The reported negative is the honest one; the combined number is the product.
- **P3.** Categories by literal markers from real attachments.
  - Held-out uncategorised: 0.09%.
  - Delta-measured token share: held-out 7.7%, dev 29.7%. I first wrote "chain breaks" as the cause, then measured: only 2 of 2,016 requests drop messages. The real causes are the unmeasurable opening request, and records with no usage link restarting the chain. Corrected in the result file.
- **P4.** Provenance agreement with an independent raw-file search: 0.974.
  - The disagreements matter more than the rate: the transcript holds text the model never received (`toolUseResult`, cleared thinking, bookkeeping lines).
  - So searching the raw file over-claims, and the `l1-lines` fallback is an upper bound.
- **P5 (T3).** The tool-name multiset key is stable under reorder, rename and rewrite: 60 of 60, and each perturbation was checked to have changed the input.
  - Detection 16 of 17. The miss is a run of identical steps, so the view must say "at or after".
- **Mistakes caught on the way:**
  - A slice edit deleted D0/D11 and later `census`; the typecheck caught both.
  - Heredocs ate regex backslashes twice; fixed with the Edit tool.
  - web-check caught a path tail that looked like an email, and an over-budget `data.js`. Both were fixed by stricter redaction and a compact view, not by loosening the checks.
- **What would change my mind:** a second L4 calibration on a later version showing the request record and the wire differ beyond the four named differences.
