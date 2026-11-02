# M3 PLAN — "The Assay Office" (proposed, awaiting approval)

Status: **proposed 2026-11-02, revision 2 (same day)**. Nothing here is built into `packages/` or `web/` proper; a throwaway prototype lives in `web/prototype/` (uncommitted). On approval this becomes ADR-017..021, a DESIGN.md rewrite, a revised `learn/M3/` primer, and a notebook entry (pivot protocol, Rule 10). Every phase below is cut into commits under ~150 lines (Rule 12).

---

## 0. Revision 2: what the playable prototype changed

Revision 1 described views to read. A first attempt at showing it (the "Assay Furnace" design canvas) was rejected as a content dump: it explained a game instead of being one. A playable prototype (`web/prototype/`: `home.html` landing, `index.html` bench, `extract.py` → `data.js`) was then built on all 23 runs in `results/` and checked on desktop and phone. What it taught, and what this revision changes:

1. **Trust is easier to read when you have to commit first.** Watching a scan is passive. Asking "would you trust these numbers?" *before* the hallmark strikes makes the capture plate and the tape worth reading. This becomes a first-class mechanic (§5.0), not decoration.
2. **The hallmark works as the unit of brand and of meaning.** A strip of punches (sponsor · capture · fineness · truth · date · verdict), stamped at the end of a scan, did more for the 30-second test than any card. It replaces the free-floating verdict stamp, which also collided with other UI.
3. **Detector figures earn their place.** Small figures drawn from each finding's own numbers (D2 duplicate copies, D6 range, D-cost balance, D1 no-recovery box) were readable at a glance where the message list wasn't. §6 stands, now with evidence.
4. **Doing the damage yourself is the strongest explanation.** The tamper missions (real perturbed files) taught D1/D6 faster than any copy, and one of them exposed a real gap (§10).
5. **Copy must stay short.** Every paragraph that explained instead of labelling was cut. Labels, verbs and numbers with sources only.
6. **Nothing in revision 1 is sacred.** Names, type and palette below are now *candidates* to be settled by the look-test, with the prototype's look as the second candidate.

---

## 1. What M3 has to prove

M2 established that the telemetry can be trusted *to a stated degree*. M3 has to make that degree **visible faster than a number can be read**, and make every gap look like a gap. The bar is not "a nice dashboard". The bar is:

> A stranger opens a real run and, within 30 seconds, can say what was captured, what was lost, and which numbers they must not trust, before they have read a single metric.

Everything below is judged against that sentence and against the 13 rules in `CLAUDE.md`.

---

## 2. What the research says (and what we take from it)

| Source | What it does | What we take | What we refuse |
|---|---|---|---|
| **Claude Code docs, "Explore the context window"** (code.claude.com/docs/en/context-window) | Interactive timeline of what enters context. Tags each item `full` / `brief` / `hidden` (what the user sees vs what only Claude sees). Token counts are explicitly **illustrative**. | The three-visibility idea (user saw / model saw / record proves) becomes the Replay layout. It's also our sharpest positioning: **the official explainer is simulated; assay shows the measured version and labels what it cannot measure.** | Illustrative numbers. |
| **Song & Szafir, "Where's My Data?" (VIS 2018)** | Crowd studies of missing-data displays. Designs that **break visual continuity** at missing data gave more accurate answers; highlighting missing values raised perceived quality; **zero-filled bars are indistinguishable from true zeros**. | Rule 9 now has evidence behind it. A D1 undercount must never render as a short bar. Missing data must interrupt the shape. | Interpolation, smoothing, zero-fill. |
| **AgentLens (Lu et al., 2024)** | Hierarchical temporal view of agent behaviour. Segments timelines with LLM summaries + embedding change-points; "implicit causes" are cosine-similarity edges. | Hierarchical zoom (run → epoch → turn → event) is right. | The segmentation and causes are model-inferred. We segment **deterministically at compaction boundaries** and draw only `observed`/`matched` edges (ADR-004). This contrast is a selling point. |
| **AgentGUI (arXiv 2607.26300, 2026)** | Agent-run interface; activity feed, wall-clock overview, per-call token console, files tab. User study: 38% faster, 80%→93% accuracy vs baseline. | Evidence that separating "what happened" (feed) from "what it cost" (console) helps comprehension. Our Replay keeps those as separate, synchronised panes. | The pixel-office metaphor (decorative, encodes nothing). |
| **Inspect AI log viewer / Docent (Transluce)** | Transcript-first viewers, LLM-assisted search and clustering. | Transcript readability is parity floor. | LLM summaries in primary views (Rule 6). |
| **Marey's train schedule (1885)** | x = time, y = stations, each train is a line; slope = speed, horizontal run = dwell, crossings = meetings. | The **Traverse** view (§5.3): agents are trains, tools are stations, dwell = observed tool latency. A timestamp reversal (D9) becomes a line that runs *backwards*. Nobody draws agent traces this way. | — |
| **Perfetto UI** | Track-based trace viewer, WASD zoom, area selection, track finder. | Keyboard model and "track" mental model for power users. | Flame-graph density as the primary view (hides gaps). |
| **Hallmarking (UK assay offices)** | Every hallmark has compulsory punches: sponsor (who is responsible), **millesimal fineness** (purity, marked to the *lowest* standard of the article), assay office, and an optional date letter. | The **Hallmark** (§5.1) is the Run Card's first line. "Marked to the lowest standard" is exactly our epistemics. | — |
| **Core-logging conventions (ODP/IODP, Energistics standard legend)** | Borehole logs draw lithology as patterned columns; intervals of **no recovery** are a standard legend item; unconformities mark lost record. | The **Core** view (§5.2) and a single cross-view legend for epistemic states (§4). | — |
| **surfacelab Observatory** (our own) | Dusk 3D instrument: glass beads, brass hairlines, evidence rail, channel declarations, table/describe modes, capture mode. | **Rules only:** evidence rail, per-scene channel declaration, table + describe mode, deterministic capture, quality tiers, "what would make this bad". | **The look:** no dusk sky, no glass beads, no brass, no Cormorant/DM Mono, no galaxy/constellation, no force layouts. |
| **21st.dev** (via web; the 21st MCP isn't connected in this session) | React/Tailwind component marketplace. | **Chrome only:** ⌘K palette (cmdk-based), filterable data table + row-detail sheet (OpenStatus data-table blocks, TanStack-based), tabs. Fully restyled, logged in a component register. | Any scene built from a component. |
| **NYT "You Draw It" (2015–17)** *(rev 2)* | Readers draw their guess of a curve before the real data is revealed. | **Predict, then reveal:** "Call the number" on the landing and "Call it" on the bench. Committing first makes the reveal stick. | Guesses that change any computed value. |
| **Return of the Obra Dinn** *(rev 2)* | A logbook that fills only as you prove facts. | The **punch card**: a detector is earned the first time you watch it fire. Gates that never fired stay visible as an honest blank. | The guessing loop as a scoring mechanic for trust. |
| **Into the Breach** *(rev 2)* | Perfect information: every threat is telegraphed before it acts. | Each gate states what it checks before the scan runs (hover/focus). | Turn-based waiting. |
| **Opus Magnum** *(rev 2)* | A deterministic machine you can step, rewind and replay. | The bench scan: step, scrub, replay; same run, same result, every time. | Leaderboards (trust is not a competition). |
| **Explorable explanations (Bret Victor, Nicky Case)** *(rev 2)* | Readers learn a system by poking it. | **Tamper missions:** you break a real file and see which gate notices. | Long explanatory prose between interactions. |

---

## 3. Identity: the Assay Office

surfacelab is an **observatory at dusk** (you look *up* at something distant). assay is an **assay office in daylight** (you put a specimen on the bench and test it). That gives a different stance, different materials and a different light.

- **Light theme "Assay paper"** is primary: warm paper ground, graphite rules, ink. **Dark theme "Touchstone"** (the black stone assayers streak gold on) is first-class, not an inversion.
- **Materials:** punched hallmarks, specimen tags, ledger rules, core boxes, geological pattern fills. **No glow anywhere.** Emphasis comes from ink weight and pattern, not light.
- **Motion:** mechanical, not floaty. Things *stamp*, *slide in a tray* and *index*. There's a short ease with no overshoot and no inertia. Reduced motion means instant.
- **Type** (Google Fonts, all distinct from surfacelab):
  - Display: **Fraunces** (variable, engraved feel), used for run titles and big numbers only.
  - Text: **Public Sans** (a standards-document face, fits a certificate).
  - Data: **JetBrains Mono** (tabular figures, distinct 0/O and 1/l for ids and offsets).
- **Palette: mineral pigments**, each with exactly one meaning:

| Token | Light | Dark | Meaning (only this) |
|---|---|---|---|
| `--paper` / `--touchstone` | `#F3F1EA` | `#111214` | ground |
| `--ink` | `#17181B` | `#E9E6DD` | text, observed marks |
| `--graphite` | `#5B5E66` | `#9A9CA3` | secondary text, rules |
| `--azurite` | `#2B5BA8` | `#7FA6E8` | `observed` edges and links |
| `--malachite` | `#2E7D57` | `#6CC79A` | verified (trustworthy, verified-absent) |
| `--ochre` | `#A8741A` | `#E2B04F` | caveat, `matched` edges, usable-with-caveats |
| `--cinnabar` | `#B83A26` | `#F07A62` | capture failure only (`capture-incomplete`, do-not-trust) |
| strata ramp | sandstone → siltstone → shale → basalt | tuned per theme | the 4 measured token layers (§5.2) |

Final hex values get set in a **look-test** (one real run rendered in both themes on a phone, with a CVD simulation) before ADR-017 is accepted. Colour is never the only channel: every semantic colour has a fixed pattern (§4).

**Revision 2: two candidates go into the look-test.**

| | A: mineral (above) | B: prototype "bench" |
|---|---|---|
| Type | Fraunces / Public Sans / JetBrains Mono | Bricolage Grotesque (display + text) / IBM Plex Mono |
| Ground | paper `#F3F1EA` / touchstone `#111214` | bone `#E9E5DA` with dot grid / `#11100C` |
| Accents | azurite, malachite, ochre, cinnabar | cobalt, ochre, vermilion |
| Character | engraved, certificate | instrument, punched, chunkier and more product-like |

Whichever wins, two rules from A are kept because the prototype broke them and it showed:
- **One meaning per colour.** The prototype used vermilion for *every* `warn` finding and for do-not-trust. Red is reserved for capture failure (`captureIntegrity`, `capture-incomplete`, do-not-trust); other warnings use ochre.
- **A separate "verified" colour.** The prototype reused cobalt for `real`, `observed` and `trustworthy`. Those need distinct marks.

**Motion, amended:** mechanical by default, with one exception. *Stamping* events (a punch landing, a gate firing, a mission result) may overshoot once, because that tactile beat is what makes the bench feel like a game. Nothing else springs, and reduced motion still means instant.

---

## 4. One visual grammar for epistemic state (used by every view)

This is the core of "masterclass": **the same five marks mean the same thing everywhere**, so a reader learns them once on the Hallmark and reads every other view correctly.

| State | Mark (pattern, colour-independent) | Source field |
|---|---|---|
| **observed** | solid fill / solid line | event present, `observed` edge |
| **matched** | dashed line | `matched` edge (exact string) |
| **not-observed** | empty outlined box ("not logged") | `ObservabilityState = not-observed` |
| **verified-absent** | box with a single diagonal and the word *nil* | `verified-absent` |
| **capture-incomplete** | **no-recovery box**: X across the interval, cinnabar | `capture-incomplete`, any `captureIntegrity` finding |
| **inferred / reconstructed** (M4) | stipple, with its fidelity written as a number | reserved; not drawn in M3 |

Plus two run-level marks: the **truth punch** in the Hallmark (`real` solid, `real-perturbed` with a P countermark, `scripted` with a **SYNTHETIC ribbon across every view, which can't be dismissed**) and the **Capture Level punch** (L1–L4).

---

## 5. The views

All views share **one spine**: the ordered index of LlmRequests (turns), computed in core. Every view is a different reading of the same spine, so selection carries across views (select turn 412 in Core, switch to Traverse, and it's still selected). Compaction boundaries cut the spine into **epochs**, which give deterministic segmentation.

Each view declares its channels (taken from surfacelab's discipline) and ships **table mode (`t`)**, **describe mode (`d`)** and the **evidence rail**.

### 5.0 The play layer *(rev 2)*: how a stranger meets the views

The views below are what you *read*. The play layer is how you get to them without being lectured. Every mechanic is a thin wrapper over a core result; none of them computes anything (Rule 7). Prototyped in `web/prototype/`.

| Mechanic | What you do | What it is backed by | Where |
|---|---|---|---|
| **Landing** | See one real run's hallmark stamp in, with one real finding and its byte range; play one round of "Call the number". | `export-view --redact` of one real run (Rule 2, DESIGN "Site") | `/` |
| **Call the number** | A real session's sum-every-line output total is shown; drag to where you think the true total is; reveal. Hit = within 15%. | naive vs deduplicated totals + D2 count from the view model | landing |
| **The bench (intake scan)** | Press Space: a head reads the transcript left to right, gates count as it passes their findings, the context curve fills, the hallmark punches stamp at the end. Step, scrub, replay. | per-segment event/unknown/finding counts and per-request usage on the spine | bench |
| **Call it** | Before the scan: "Would you trust this session's numbers?" (trust / with caveats / don't). The hallmark judges the call; streak kept locally. | `overall` verdict | bench |
| **Punch card** | A detector is punched the first time you watch it fire; unpunched ones offer "hunt →" to a run where it fires; never-fired ones say so. | findings per run across the corpus | bench, `p` |
| **Tamper missions** | Pick a damage (count every line, lose a subagent, forge a prompt, make copies disagree), do it, hand it over, see the before/after diff. | the `real-perturbed` corpus files and their health results | bench |

Guardrails for the play layer:
- Calls, punches and mission results are **local only** (browser storage), never a leaderboard, never sent anywhere.
- A mission reports **what gets through** as plainly as what is caught (§10). It may not stamp CAUGHT unless the tamper is both flagged *and* kept out of the totals; otherwise it stamps **FLAGGED** and names the leak.
- Copy is labels, verbs and numbers with their source file. No paragraph explains what an interaction can show.
- The play layer is skippable: every view is reachable directly, and table/describe modes work without playing anything.

### 5.1 Hallmark & Certificate (was "Run Card"), 2D, the trust statement

First paint, top line: a strip of punched marks, read left to right like a real hallmark:

```
[ CC 2.1.308 ]  [ L1 ]  [ 470 ]  [ real ]  [ 2026·10 ]
  sponsor        capture  fineness  truth     date letter
```

- **Fineness** = ⌊1000 × min(usageCoverageRate, 1 − unknownRatio, modelIdentificationRate)⌋, **marked to the lowest standard**, exactly like a hallmark. The punch names which rate bounded it ("bounded by importer coverage"). Computed in core (Rule 7). A v2.1.165 run with 53% unknown lines stamps **470**, and you know not to trust it before reading anything else.
- Below the punches is the **Certificate**: one verdict row per metric family (tokens, structure, subagents) with its state mark, then **Assay notes** (findings) ordered by severity, each with detector id, one-line meaning and an offset link.
- **"Not counted" footnotes** are the caveats, set like certificate small print and never collapsed.
- The observability block (compaction, subagent, skill, costState, transcript) is drawn as five specimen boxes using §4 marks.
- **Per-detector specimens:** each finding opens a small, purpose-built figure (§6) instead of a generic list row.
- *(rev 2)* A sixth punch, **verdict**, closes the strip. Sponsor, capture and truth are stamped at intake; fineness, date and verdict stay blank (dashed) until the scan completes, so nothing that depends on detectors appears early.
- *(rev 2)* **Fineness, measured on the corpus** (prototype stand-in in `extract.py`, same formula): every real run scores 300–479, and every one is bounded by **importer coverage** (53–86% of lines are unknown record types such as `attachment`, `queue-operation`, `custom-title`). That makes fineness, as defined, mostly a measure of how many record types the importer names. Either that is the honest headline (and P1 should add importers for the common unknown types), or the formula should separate "lines we didn't parse" from "data we lost". This is decision 4 in §11.

Channels: none quantitative except the numbers themselves. Fallback: it already is the fallback; this view must work with no JS canvas at all.

### 5.2 Core (was "Strata"), 2D first, the context window over time

A **borehole log**. Time runs **down** (as depth does in a core, and as scrolling does on a phone). Each turn is a horizontal slice; slice **width = total context tokens** for that request, split into the **4 layers we actually measure at L1**: cache-read, cache-write, uncached input, output. Each layer has a ramp colour and a lithology pattern.

- **Casing:** a vertical rule at the model's context limit (from core's limit table). Slices that cross it are D5.
- **Unconformity:** each compaction is drawn as a wavy erosion line across the core, with pre/post widths labelled. D7 is flagged on the line.
- **No-recovery boxes:** intervals with capture failure (D3 chain break, missing transcript) are drawn as X'd boxes. They are never interpolated.
- **Branch holes:** subagents deviate as side cores. A subagent referenced with no file (D1) is a branch hole that is **entirely a no-recovery box**: dashed outline, "?" width, the referencing event's offset. It is **never drawn as a thin core**, because Song & Szafir show that reads as "small".
- **The 11 official categories** (System, CLAUDE.md, Memory, …) appear as a **lithology column to the right, drawn as `not-observed` boxes labelled "unlogged at L1, needs reconstruction (M4)"**. This is a scope change from DESIGN.md, which promises the 11-layer split in M3. We can't do that honestly without M4 reconstruction, so it needs an ADR (ADR-018). It's shown as visibly *unlogged* rather than missing, so the reader sees the gap.
- **Core tray (the 3D view):** for long runs (the corpus has runs with 1,166 turns), an overview lays the core into a **core tray**: one row per epoch, laid side by side in a box, the way real cores are stored. The camera tilts over the tray. 3D is used for structure only (rows); width still encodes tokens in the slice plane. Depth never encodes a quantity (Rule 13).

Channels: y = turn (time), x-width = tokens, fill/pattern = layer, line style = §4 state. No quantity on z.

### 5.3 Traverse (was "Constellation"), Marey diagram, who did what and how it links

A Marey chart for agents. **x = time** (wall clock from event `ts`), **y = stations = tools** (Read, Edit, Bash, Grep, Agent, MCP:…, ordered by first use), and **each agent is a line** (main in ink, subagents in their own line style plus a label).

- A **horizontal run** at a station = an observed tool span (tool_use ts → tool_result ts). Its length is the latency, read off the x-axis.
- A **diagonal** = the model thinking between tools.
- **D4 orphan:** the line enters a station and never leaves, drawn as an open bracket. Exemptions show their reason glyph (in-flight, compacted).
- **D9 timestamp reversal:** the line visibly runs **backwards**. Marey's layout makes this impossible to miss without any extra encoding.
- **Edges:** only `observed` (tool_use_id, parentUuid, agentId) in azurite solid. `matched` (dashed, ochre) arrives with M4 provenance and is hidden in M3, not faked.
- **3D option:** each agent's Marey sheet is its own plane, stacked in z (z = which agent; structure, not magnitude). The spawn link (Agent tool call → subagent sheet) runs between planes. Toggle to a flat 2D view at any time.

This replaces the "constellation of beads" idea entirely: it is a readable diagram with real axes, not a graph you have to orbit to understand.

### 5.4 Replay, step through what each party could see

Three synchronised columns per step (step = one spine turn):

1. **Terminal**: what the user saw (prompts, assistant text, tool names: the official doc's `full`/`brief` items).
2. **Context**: what the model had, as the Core slice for this turn plus, at L1, the content shown as an **unlogged** box with the measured token totals. (M4 fills this with reconstruction and fidelity.)
3. **Record**: the raw JSONL lines for this step, with file, line and byte range, read directly from the user's file (§7). This is the evidence rail made into a column.

The Core view doubles as the replay scrubber (a minimap down the side). Keyboard: `j/k` step, `J/K` epoch, `/` search, `t` `d` modes.

### 5.5 Run Diff (stub, as ROADMAP requires)

Two hallmarks side by side, then the two cores aligned by spine index, with no alignment claims (structural alignment is M4) and a visible "alignment not computed" notice.

---

## 6. Every detector gets its own specimen figure

| Detector | Specimen figure (opens from the Certificate; also appears in-place in Core/Traverse) |
|---|---|
| **D1** subagent blind spot | Branch hole as a no-recovery box; referencing event offset; "token totals are a **lower bound**". The headline total gets a ≥ sign. |
| **D2** double count | The canonical slice with its raw duplicates shown as ghost strikes behind it (×n). Toggle "naive sum" to overlay the inflated width, hatched, with the inflation factor. |
| **D3** chain break | The parentUuid thread drawn as a line that **tears** at the missing uuid, with the gap's byte offset. |
| **D4** orphan | Open bracket at a Traverse station, with the exemption logic shown step by step (in-flight? compacted by UUID? line fallback?). |
| **D5** overflow | A slice punching through the casing, with the limit's source cited. Unknown model shows "casing unknown": a dashed casing, never a guessed one. |
| **D6** disagreement | A min–max range rule of the duplicate values, with the selected (max) value marked. |
| **D7** compaction pattern | An unconformity with pre and post widths. When post > pre, the line is drawn rising, with the note "may be a large tool result". |
| **D8** session-id conflict | One core box carrying two sample tags. |
| **D9** timestamp reversal | A backward Marey segment, with both timestamps. |
| **D10** api-request count | Two tally ledgers (api-request vs LlmRequest) side by side, with the diff and the "ids are disjoint (ADR-014)" note. |
| **D-cost** | An **assay balance**: runtime cost-state on one pan, JSONL sum on the other, exact numbers on both, % difference. No tilt animation; the beam angle is not the readout, the numbers are. |

Each figure has **two-sided tests**: it must render the failure mark when the detector fired and must not render it when it didn't (taken from surfacelab §11).

*(rev 2)* Prototyped from finding messages: D1, D2, D4, D5, D6, D7, D9, D-cost. That parsing is a hack; the view model must carry each figure's numbers as typed fields (duplicate count, value range, both cost totals, pre/post tokens, both timestamps). D3, D8 and D10 have **never fired on the corpus**, so their figures need scripted fixtures (marked SYNTHETIC) to be tested at all.

---

## 7. Architecture changes this needs

1. **Browser-first ingestion (ADR-019).** Today `importClaudeCodeDir` reads with `fs`. Real `run.json` files are up to **80 MB** because every event embeds its raw JSON, so shipping run.json to a browser is wrong. Instead:
   - Core gains an **fs-free entry point**: `importFromFiles(files: {path, bytes}[])`. The current fs function becomes a thin wrapper (the CLI is unchanged).
   - The web app runs assay-core **in a Web Worker** on a dropped folder (folder drop keeps the whole-directory read, so D1 stays honest). Nothing is uploaded, which matches ARCHITECTURE "Surfaces".
   - The **evidence rail reads the exact bytes** with `File.slice(byteStart, byteEnd)` from the user's own file. Lossless offsets (Rule 4) become something you can see.
2. **A view model in core (`packages/assay-core/src/view/`).** It contains `buildRunView(run, report)`: the spine, epochs, per-turn layer widths, tool spans with observed latency (joined from event `ts`), Marey stations, finding anchors on the spine, hallmark fields (fineness and its bounding rate), and the context-limit table export. All numbers the web shows come from here (Rule 7). There's a zod schema, emitted JSON Schema and tests.
3. **`assay export-view <path> [--redact]`.** This produces a small, content-free view model. `--redact` drops paths, prompts, tool inputs and ids (keeping only shapes, counts and offsets), so the public landing can show **one real run** (Rule 2, DESIGN "Site") without publishing a trace (Rule 8).
4. **`assay-stage`**: a small three.js (vanilla) package used only for the two 3D options (core tray, Traverse planes). It's our own code, not surfacelab's engine (that respects DESIGN.md's "extract shared materials only after a second consumer").
5. **Web stack:** Vite + React + TypeScript strict + Tailwind (needed for 21st chrome) + cmdk + TanStack Table. The 2D views are Canvas2D (Core, Traverse at scale) with SVG for figures and labels. Quality tiers and capture mode follow the surfacelab pattern.
6. **Regenerate `results/`** from current core. The stored health JSON predates `totalContextTokens`, `observability` and so on. *(rev 2)* The regenerated files must also carry the right `truth`: the `sc-*` and `perturbed-health/*` results on disk say `truth=real` (the prototype relabels them from their folder and says so on screen).
7. *(rev 2)* **The view model also carries the play layer's inputs:** the transcript cut into fixed segments (event kinds, unknowns, findings per segment), sum-every-line vs deduplicated totals per segment, the hallmark (all six punches, fineness bound and all three rates), and each figure's typed numbers. `web/prototype/extract.py` is the throwaway spec for these fields and is deleted once P1 lands.
8. *(rev 2)* **Redaction rule, proven in the prototype:** keep keys, ids (`msg_`, `toolu_`, `req_`, uuids), ISO timestamps, numbers and short enum-like strings; replace every other string with `‹redacted · N chars›`. Structure stays exact, so the byte view is still useful. `--redact` adopts this and gets a test that no free-text survives.
9. *(rev 2)* **Privacy debt:** `results/` is untracked but not gitignored, and its run files embed raw lines including user prompts. Gitignore it (or move it under `corpus/`) before any commit touches the web.

---

## 8. Phases (each a short run of small commits)

| Phase | Contents | Exit check |
|---|---|---|
| **P0 Docs and gate** | ADR-017 identity and view names; ADR-018 Core at L1 (11-category split moves to M4); ADR-019 browser-first ingestion; ADR-020 view model; DESIGN.md rewrite; notebook entry; **revise `learn/M3/` primer and questions to match this plan**; regenerate results | docs consistent; gate material ready |
| **P1 Core** | fs-free importer; `view/` RunView builder + schema + tests; hallmark/fineness; latency spans; export-view + `--redact` | `make check` green; RunView for every corpus run; redaction test (no path or prompt survives) |
| **P2 Shell** | Vite app, tokens, both themes, folder drop → worker, evidence rail with byte slices, ⌘K, table/describe framework, SYNTHETIC ribbon, keyboard map | real run opens locally; rail shows exact bytes |
| **P3 Hallmark & Certificate** | punches, certificate, observability boxes, D1–D10 + D-cost specimen figures | two-sided tests per detector; Capture Level before any number (Rule 1 test) |
| **P3b Bench + play layer** *(rev 2)* | intake scan (tape, gates, context curve, meters, transport), Call it, punch card, tamper missions with FLAGGED/CAUGHT rule | same run, same scan, every time (deterministic test); no mechanic reads a value the view model doesn't carry |
| **P3c Landing** *(rev 2)* | landing from one redacted real run; Call the number; gate rack; capture ladder; shelf strip | no raw text in the landing bundle (redaction test); phone check |
| **P4 Core** | 2D log, casing, unconformities, no-recovery, branch holes, unlogged column; then the core tray in assay-stage | 1,166-turn run renders at the stated budget; phone scroll works |
| **P5 Traverse** | 2D Marey, orphan brackets, reversal, observed edges; then 3D planes | D4/D9 fixtures render their marks |
| **P6 Replay + Diff stub** | three columns, scrubber, Diff stub | step through a real run end to end |
| **P7 Exit** | axe + keyboard walk-through, perf/bundle budget in `make web-check`, look-test and phone check, visual regression in capture mode, informal 3-person 30-second Hallmark test | ROADMAP M3 exit criteria |

**Carry-ins from the M3 prep list (not blocking views):** OTel importer (unlocks a real L3 punch and the R1-F2 caveat), and the corpus asks (a real D1 session, ≥3 users). These are human actions or later phases; the views are designed so that an L3 run simply stamps `L3` and fills cells that are `not-observed` today.

---

## 9. What would make this bad (check at every review)

A dashboard of cards with KPIs; any glow; any chart that shows a token total for a run with a D1 finding without the ≥ mark; a missing interval drawn thin instead of X'd; a smooth line across a compaction; an edge that isn't `observed`/`matched`; a 3D view you need to orbit to understand; anything that looks like surfacelab; a scripted run without its ribbon; a number the web computed itself; default shadcn styling left in. *(rev 2)* A content dump (boards that explain instead of letting you do); explanatory paragraphs between interactions; a score that compares people; a mission stamped CAUGHT while the tampered value still sits in the total; red used for anything but capture failure; motion that isn't a stamp, a scan or a step.

---

## 10. Findings from the prototype that need their own follow-up *(rev 2)*

1. **Forged usage survives deduplication.** Mission "Forge a giant prompt" (`d5-perturbed`, from `3620a96a`): one copy of a message is rewritten to `inputTokens = 195000`. D6 flags the disagreement (warn), but max-usage selection keeps the forged copy, so total input tokens go from 106 to 195,104. D5 stays quiet because 195k is under the model's 1M window. Candidate ADR: when D6 fires on `inputTokens`, mark the affected totals as a range (min–max) instead of choosing max, or demote the tokens verdict.
2. **`truth` labels on disk are wrong** for scripted and perturbed results (§7.6).
3. **`results/` privacy** (§7.9).
4. **D1 has zero real coverage** (ADR-011 still stands); the landing's gate rack shows "0 of 16 real" for D1, which is honest but weak. The M3 prep corpus ask is now visible to every visitor.

---

## 11. Decisions needed from you before P0

1. **Identity and names:** "Assay Office" look, and the renames Run Card → **Hallmark**, Strata → **Core**, Constellation → **Traverse** (Replay and Run Diff keep their names). Or keep the old names with the new designs.
2. **Core at L1 (ADR-018):** accept that the 11-category split moves to M4 and M3 shows 4 measured layers plus an "unlogged" column.
3. **Learning gate sequencing:** `docs/LEARNING.md` says no core-module code in a milestone whose gate is unpassed, and `learn/M3/` has no `attempt.md` yet. The existing primer describes the old Constellation/Strata. Proposal: I revise the primer in P0, you take the gate, and P1 core code starts after you pass it. P2 web-shell work (not a core module) can run in parallel.
4. **Fineness formula** (§5.1): accept min-of-three-rates, or choose a different definition. *(rev 2)* On the real corpus it is always bounded by importer coverage (300–479); decide whether that is the intended headline.
5. *(rev 2)* **Look-test candidates** (§3): mineral (A) vs bench (B), with the one-meaning-per-colour rule applied to both.
6. *(rev 2)* **Play layer in M3** (§5.0, P3b/P3c): accept it as M3 scope, or move parts (punch card, missions) to Later in ROADMAP (Rule 10 scope fence).
7. *(rev 2)* **Forged-usage gap** (§10.1): ADR now, or log as an M4 item.

### 11a. Recommended answers *(rev 3, proposed by Claude, pending Asmit's sign-off)*

1. **Names: accept.** Hallmark, Core, Traverse. The hallmark proved itself as the unit of meaning in the prototype; the other two names are short verbs-of-place that fit it. Replay and Run Diff unchanged.
2. **Core at L1: accept ADR-018.** Four measured layers plus an "unlogged at L1" column. Drawing 11 categories now would need inference that Rule 5 forbids.
3. **Gate: accept as proposed.** Primer revised in P0 (with fresh questions, since `answers.md` was opened during an earlier audit), gate taken, P1 core code after a pass. P2 web shell runs in parallel.
4. **Fineness: change the formula.** As defined it measures how many record types the importer has names for (every real run lands at 300–479), not data loss. Proposal: a versioned **record-type catalogue** in the importer marks types known to carry no telemetry (`attachment`, `queue-operation`, `custom-title`, …) as *parsed-and-set-aside*; they stay preserved and flagged (Rule 4) but leave the denominator. Fineness = ⌊1000 × min(usageCoverageRate, modelIdentificationRate, 1 − unparsedTelemetryRatio)⌋. Unknown types not in the catalogue still count against it. Raw importer coverage moves to the certificate as its own line.
5. **Look: B (bench)**, with A's two rules applied (red only for capture failure; a distinct verified colour). B is the one that was playable on real data, reads as a product and is unlike surfacelab and the other projects; A's certificate type can survive in the Certificate block if the look-test wants it.
6. **Play layer: in M3 scope**, all of it: Call it, bench scan, punch card and the four existing missions. They are thin wrappers over core results and are the strongest explanation found so far. New missions go to Later.
7. **Forged usage: ADR now (ADR-021).** It is a live trust bug, not a feature. When D6 fires on `inputTokens`, the affected totals become a min–max range and the tokens verdict drops to usable-with-caveats; the mission stamps CAUGHT only once the forged value no longer sits in a point total. Two-sided tests.
