# DESIGN — assay views and visual rules

Reuses the Dusk Observatory design language (tokens, type, motion principles) from surfacelab `docs/DESIGN.md` §2. Own renderer (`assay-stage`); shared materials with surfacelab's stage are extracted only after a second consumer exists (ADR).

## Global rules
1. Capture Level badge + Health verdict are the first thing visible on any run screen.
2. Truth badge on every run; `scripted` always carries a persistent SYNTHETIC ribbon.
3. Every element opens the evidence rail: raw file, line, byte range, and the raw JSON.
4. Depth (z) never encodes a quantity. 3D is for structure (lanes, nesting, time), not magnitude.
5. Every view has table mode and describe mode (text, screen-reader first).
6. Reduced motion respected; deterministic clock for captures.
7. The web displays what core computed; it never recomputes statistics or Health.
8. No inferred edges are drawn. Edge styles: solid = `observed`, dashed = `matched`.
9. Missing data is drawn as visible absence (hatched gap), never smoothed over.

## Views
- **Run Card** (2D): Capture Level, Health verdict, anomaly list with detector ids and validity-card links, totals with "what's not counted" footnotes, entry points to other views.
- **Constellation** (3D): agents, tool calls, skills, MCP calls, artifacts as one graph. x = time, agent lanes on y, artifacts pinned at first write. This is the knowledge graph. Filters by entity kind and by edge type.
- **Strata** (3D): context window over time (x), layers by official source category (System, CLAUDE.md, Memory, Skills, MCP, Rules, You, Files, Output, Claude, Hooks). Compaction renders as a visible collapse with pre/post tokens. Subagents are branching columns with their own windows. Where reconstruction is incomplete the layer is hatched with its fidelity score. Differentiator versus existing growth charts: layered by source, fidelity-scored, capture-aware.
- **Replay Theatre**: step through a run; evidence rail follows the step; shows what is known to be in context at that step and what is unknown.
- **Run Diff**: two runs aligned; first divergence marker; downstream differences list.
- **Atlas** (Later): corpus-level graph; force layout allowed here only, with the notice.
- **2D only:** flat timeline and provenance threads.

## Accessibility and performance
Keyboard navigation of all entities; contrast checked on both themes; large-graph LoD with a clear "N hidden" indicator; GPU picking maps to evidence rail; budget set in M3 and tested in `make web-check`.

## Site
Landing shows one real Run Card (`real` badge) and one Health finding with its raw offset. No synthetic example is ever the hero.
