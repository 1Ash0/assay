# DESIGN — assay views and visual rules

Rewritten 2026-11-02 for M3 (ADR-017). The look is the **bench**: a playable instrument on which you put a session and assay it. Its own identity, not surfacelab's Dusk Observatory. The site is `web/prototype/` (ADR-019), fed by `assay export-site`.

## Global rules
1. Capture Level is stamped before any number (Rule 1). On the hallmark it is the second punch, struck at intake.
2. Truth on every run; `scripted` always carries the SYNTHETIC ribbon, `real-perturbed` its own tag.
3. Every number opens the evidence rail: file name, line, byte range, sha256, and the redacted raw record.
4. The site displays what core computed (`RunView`, ADR-020); it never recomputes Health or totals.
5. Edges: solid = `observed`, dashed = `matched`. Nothing else is drawn.
6. Missing data is drawn as absence (dashed box, X'd box for capture failure), never as a short bar or a smoothed line.
7. A total with disagreeing copies (D6, ADR-021) is shown as a range, never as one number. A D1 total carries ≥.
8. Depth never encodes a quantity.
9. Every view has table mode (`t`) and describe mode (`d`).
10. Reduced motion means instant. Data motion is a stamp, a scan, a step, a rebuild or a flow along an observed edge; decorative motion encodes nothing (ADR-038).

## Colour and type (Phosphor, ADR-038; tokens in `web/prototype/theme.css`)
- One meaning per colour. Vermilion is reserved for capture failure (`captureIntegrity`, `capture-incomplete`, do-not-trust); amber for other warnings; mint for verified and sealed; cyan for data; magenta for interaction, never data.
- Chakra Petch for display, IBM Plex Sans for text, JetBrains Mono for data. Night ground with glass panels and scanlines in dark; cool paper in light.

## The hallmark
Six punches read left to right: sponsor (harness version) · capture · fineness · truth · date letter · verdict. Sponsor, capture and truth strike at intake; fineness, date and verdict stay dashed until the scan completes.
**Fineness** (ADR-022) = ⌊1000 × min(usage coverage, parsed telemetry, model identification)⌋, marked to the lowest standard; the punch names the bounding rate. Catalogued no-telemetry record types are preserved but leave the denominator.

## Views
- **Bench** (intake scan): a head reads the transcript left to right in 140 segments; detector gates count as it passes their findings; the context curve fills; the hallmark strikes at the end. Step, scrub, replay. Same run, same scan, every time.
- **Certificate**: verdict per metric family, assay notes (findings by severity, each with an offset), "not counted" footnotes, the observability boxes, and per-detector figures (D1 no-recovery box, D2 copies, D6 range, D-cost balance, …).
- **Core**: four measured token layers per request at L1, plus an "unlogged at L1" column (ADR-018). The 11-category split is M4.
- **Shelf**: every run in the corpus as a specimen, filterable by truth and verdict.
- **Traverse**: a Marey chart of who did what, when.
- **Replay** (M4, P6), around the selected step:
  - **Core box:** one column per request with category bands at measured height; dashed means not reconstructed, a wavy line means compaction.
  - **The Charge:** the selected request's make-up, with a Rebuild play that lays the blocks back and strikes the seal. The seal is core's digest check and appears only for sealed requests; categories mostly split by characters are stippled.
  - **Streaks:** each tool call's literals and where each first appeared, with `l1-lines` labelled as an upper bound.
- **Run Diff**: twin lanes from core's `align` (ADR-034), with ribbons for exact key matches and the first divergence shown as "at or after" when neighbours share a key. The view says that keys ignore inputs, and whether the pair is a recorded twin.
- **Site data**: `data.js` holds what the bench and shelf draw; each run's spine is in `runs/<id>.json` (gitignored, scanned by web-check), loaded on first use.

## Play layer (ADR-017)
Call it (commit to a verdict before the hallmark strikes), the punch card (detectors you have watched fire), and tamper missions on `real-perturbed` files. A mission stamps CAUGHT only when the tamper is flagged *and* kept out of point totals; otherwise FLAGGED, naming the leak. All play state is local; nothing compares people. Copy is labels, verbs and numbers with their source.

## Site
The landing shows one real run's hallmark and one real finding with its byte range. No synthetic run is ever the hero. Raw samples on the site are redacted by core (keys, ids, timestamps, numbers and short tokens survive; every other string becomes `‹redacted · N chars›`).
