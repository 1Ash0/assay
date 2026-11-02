# assay M3 primer — revision 2 (what was actually built)

Supersedes the view descriptions in `primer.md` (Run Card, Constellation, Strata). Tags: `[verified in repo]` with path.

## 1. Where the numbers come from
`importFromFiles(files)` takes bytes, not paths, and splits lines on raw 0x0A bytes so byte offsets are exact. `[verified in repo]` `packages/assay-core/src/importers/claude-code-jsonl/parse.ts`
`buildRunView(run, report)` turns a run and its health report into everything the site shows. The site never computes a number. `[verified in repo]` `packages/assay-core/src/view/build.ts`

## 2. Fineness
Fineness = ⌊1000 × min(usage coverage, parsed telemetry, model identification)⌋, named after its weakest rate. Parsed telemetry = 1 − (unknown lines not in the catalogue) / all lines. Catalogued types (`attachment`, `queue-operation`, `custom-title`, …) are still kept as unknowns, flagged `catalogued`. `[verified in repo]` `health/health.ts`, `importers/claude-code-jsonl/catalogue.ts`
Try it: a run with 1 assistant turn and no usage block scores what, and why?

## 3. When copies disagree
The importer keeps the largest copy of each message. If D6 sees copies disagree on input tokens, the card carries `inputTokenRange {min, max}` and the tokens verdict drops to usable-with-caveats. `[verified in repo]` `health/health.ts` `inputTokenRangeOf`
Try it: one copy says 2, the other 195,000, the rest of the run is 104. What are min and max?

## 4. Redaction
Keys, ids (`msg_`, `toolu_`, uuids), ISO timestamps, numbers and short tokens survive; every other string becomes `‹redacted · N chars›`; file paths are reduced to their last segment. `[verified in repo]` `view/redact.ts`, `tests/view.test.ts`
Try it: why is a 20-character string under the key `title` redacted, but one under `type` kept?

## 5. The play layer
Missions run on `real-perturbed` files. A mission stamps CAUGHT only when the tamper is flagged and not presented as a point total. `[verified in repo]` `web/prototype/app.js` `showOutcome`
