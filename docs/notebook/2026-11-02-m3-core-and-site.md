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
