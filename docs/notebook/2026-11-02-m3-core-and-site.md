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
