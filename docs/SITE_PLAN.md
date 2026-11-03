# SITE_PLAN — critique of the M5 site and the plan to productise it

Written 2026-11-03 after walking every view (`home.html`, Bench, Shelf, Tamper, Traverse, Replay, Diff) at 800×600, 1440×900 and 375×812, in both themes, on the current local `data.js`. Nothing here is built yet; this is the plan to approve (Rule 12).

## The one-line diagnosis

The site is honest and handsome but **it is a lab bench, not a product.** It shows everything core knows, in core's vocabulary (fineness, hallmark, held aside, D7, streaks, the Charge), and leaves the visitor to work out the answer to the only question they came with: *can I trust this run's numbers, and if not, which ones and why?*

## Critique

### First impression (2 seconds)
- **Landing:** the headline ("Assay the trace before you trust the number") and the live specimen card are right. The eye goes to the headline, then the hash `9e6a9543`, which means nothing to a newcomer.
- **Bench:** the eye lands on the L1 block on the left and the gates row, not on the verdict. The verdict ("usable, with caveats") sits in a small pill in the right column, below the fold of attention. The single most important output is the least prominent.
- Emotional read: serious, crafted, a little cryptic. It feels like an instrument for its author.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| The verdict is a small pill in the right rail; the page leads with capture-level scaffolding | 🔴 | A verdict header: one sentence ("Token totals usable with caveats; structure trustworthy"), Capture Level stamped beside it (Rule 1 still holds: level is shown first, in the same line) |
| Opening a run requires knowing the hash; chips show 8-char ids only | 🔴 | Name runs by what they were (first prompt summary is private, so: date · duration · turns · harness · verdict), hash as secondary text |
| Bench needs Space/play to show anything; before the scan the gates and verdict are blank | 🟡 | Land on the finished state; the scan becomes "Replay the assay". Animation is reward, not gate |
| Replay on the hero run says "Core box: no sealed requests…" and "The Charge · not reconstructed" — the flagship view's first screen is two empty states | 🟡 | Default Replay to a run with request records (2.1.299+ and sealed), or show one sealed example with a clear "this run has none; here is what it looks like on one that does" |
| Diff row "Input tokens 93 / 868" while Replay shows 75,724 tokens in: the label hides that this is uncached input only | 🟡 | Label it "uncached input", add context tokens beside it |
| Six tabs plus Punch card, Calls, Tamper counters, Open folder, Sound, Theme, ? — 13 controls in the top bar | 🟡 | Two levels: product nav (Runs · Run · Compare · Learn) and run-local tabs. Game counters move into Learn |
| Traverse: 79 steps on fixed tool rows; tiny marks, grey on near-black, no labels on hover until you find them | 🟡 | Make it the run's timeline in Run view (like Perfetto / Honeycomb waterfall), finding marks on it, click → Replay |
| Mobile: the tab bar scrolls sideways, and the capture-level panel comes before the specimen and the verdict | 🟡 | On phone, verdict card first, then findings list, then the rest |
| Content flags OFF ×5 take a third of the left rail on every run | 🟢 | Collapse into one line ("content capture: none") with a details toggle |

### Visual hierarchy
- **Eye goes first to:** the giant "L1" and the gate boxes. **Should go to:** the verdict and the one or two findings that matter.
- **Reading flow:** three columns compete (capture rail · bench · validity card). There is no primary column.
- **Emphasis:** everything is a card with the same border and the same mono caps label, so nothing reads as more important. Eleven gate boxes with mostly "0" get the same weight as the one with "47".

### Consistency
| Element | Issue | Recommendation |
|---|---|---|
| Vocabulary | hallmark, fineness, punch, held aside, Charge, streaks, specimen, shelf, bench: twelve metaphors for a newcomer to learn | Keep the assay identity in *visuals*, use plain words in *labels*: "Trust score" (fineness), "Not counted" (held aside), "What built this request" (Charge), "Where this came from" (streaks) |
| Detector ids | D1…D12 shown bare on the Bench; meaning only on hover | Name + id: "Lost subagent · D1" |
| Colour | Periwinkle used for assistant bars, L-level fill, REAL badge and "trustworthy" pill: one hue, four meanings (DESIGN.md says one meaning per colour) | Give truth badges their own hue; keep periwinkle for data |
| Labels | Mixed casing: spaced mono caps, sentence case, title case on buttons | One rule: mono caps only for axis/field labels |

### Accessibility
- **Contrast:** light theme muted text (hatched L2–L4 labels, gate "0"s, "line 0 / 683") is below 4.5:1 — already a known AA failure. Dark theme grey-on-near-black Traverse marks are below 3:1 for non-text.
- **Touch targets:** speed buttons and step arrows are ~32px; fine on desktop, small on phone (44px).
- **Readability:** body copy in the rails is 11–12px. Raise to 13–14px minimum.
- **Keyboard:** good (1–6, Space, j/k, t, d). Keep it, surface it in a command palette (Ctrl+K) rather than only `?`.

### What works (keep)
- **Honesty as design:** Capture Level first, absence drawn as absence, hatched "not captured" levels, truth badges. No competitor does this; Langfuse/LangSmith/Braintrust/Phoenix all draw whatever they ingest as if it were complete.
- **Every number opens its bytes.** The evidence rail is the moat.
- **The "Call the number" game** on the landing (guess the real token count, 5.52M naive vs 3.3M) is the best explanation of the problem anywhere on the site.
- **Tamper missions** with CAUGHT stamps: memorable and true.
- Type pairing (Bricolage + Plex Mono) and the bone/near-black palette give it its own identity.
- Table and Describe modes on every view.

## References and what to take from each

| Reference | Take |
|---|---|
| **Sentry issue page** | Lead with the verdict and the *one* thing wrong, then the evidence (stack trace ≈ our byte range), then context. Issue grouping across runs ≈ our findings across the shelf |
| **Honeycomb BubbleUp** | "Select the odd ones, show what's different": on the Shelf, pick runs with D6 and show which properties they share (version, layout, subagents) |
| **Perfetto UI** | Drag-drop a file onto the page as the primary intake; one shared timeline with zoom; Ctrl+P finder; `?` hotkeys. Our Traverse should become this |
| **Langfuse trace view** | Tree + timeline + detail split pane; the "trace log view" (whole run as one scrollable document, Ctrl+F) — we have the transcript; show it |
| **Braintrust** | Timeline replay with the failed span highlighted; "this step broke" as the entry point |
| **LangSmith / Phoenix** | Run list as a dense table with sortable columns and saved filters; the Shelf's specimen grid is pretty but unsortable |
| **Lighthouse / PageSpeed** | One score ring + "Opportunities" and "Diagnostics" lists, each expandable to evidence. The closest model for an *audit report* — which is what assay produces |
| **SSL Labs report** | Letter grade, then the reasons it was capped ("grade capped to B because…"). Our fineness is exactly a capped grade; say what capped it |
| **Stripe docs / Linear** | Calm density, one accent, keyboard-first, ⌘K |
| **GitHub Actions check annotations** | `assay assert` already emits exit codes; show the same result on the site as a PR-check style list (✓ / ✗ per rule) |


### Corrections after re-testing (2026-11-03)
Four items in the first draft were wrong and are removed above. A blank tab and a scan reset after a theme switch were artefacts of testing in a hidden pane, where animation frames pause. The `#pickdir` console error no longer occurs. The "7% of JSONL lines … the importer does not know" caveat is core's current wording (`health.ts`), not stale data.

## Decisions (owner, 2026-11-03; ADR-038)
1. Report is the default run view. **Yes.**
2. Plain labels, metaphors kept in visuals. **Yes.**
3. Public site data: **real runs as well**, as core's redacted export, never TRAIL, after a publish check.
Plus a new direction: retro-futurist, game-like, glossy and animated, with flowing reconstructions and their own inspirations for provenance and Run Diff.

## Visual direction: Phosphor
Cassette futurism (Alien and Blade Runner terminals) crossed with modern glass. A night ground with a horizon glow, glass panels with a top highlight, phosphor colours that glow on the dark theme, CRT scanlines, and a squared display face (Chakra Petch). Light theme is cool lab paper with the same hues deepened to AA. Colour still carries one meaning each (see DESIGN.md).

| Source | What we take |
|---|---|
| React Bits: Line Waves, Flux Lines, Beams, Radar | Hero background on the landing (decorative, CSS or canvas, still under reduced motion) |
| React Bits: Tech Text, Decrypted/Scramble text | Numbers that "decode" into place when the scan reaches them; redacted strings that scramble then settle on `‹redacted · N chars›` |
| React Bits: Holo Card, Spotlight card | The verdict card and the run cards on Runs: a glossy sheen that follows the pointer |
| React Bits: Count Up, Gradient text | Trust score and token totals counting up from 0 when they enter view |
| 21st.dev: animated tabs, bento grids, command palette | The two-level nav, the Report's bento layout, Ctrl+K |
| Framer showcase sites (Linear-style, scroll-linked) | Landing sections that pin and play as you scroll: the naive count racing ahead, then snapping back to the real number |
| Sankey and alluvial charts; Observable's flow diagrams | **Reconstruction** as a flowing stream: transcript blocks pour into the request body, each band a category, settling into the sealed request; the seal stamps when the hash matches |
| Git blame, Figma version history, Sourcegraph references | **Provenance**: each literal in a tool call draws a glowing thread back to the line where it first appeared, threads fading with distance |
| Diff tools (Kaleidoscope, GitHub split diff), DNA sequence alignment viewers | **Run Diff**: two lanes as tracks, matched steps joined by glowing ribbons, the first divergence as a pulsing fork marker, gaps drawn as empty slots |
| Lighthouse score ring, SSL Labs grade | The Report header: trust score ring that fills, with the bounding rate named |
| Perfetto, Honeycomb waterfall | The run timeline with zoom and findings pinned on it |

## Revised plan
Each step is a shippable commit within the Rule 12 budget. The site only displays what core computed. Every animation is either decorative (encodes nothing) or driven by a result field.

### S1 — Fix and found (done in this commit)
- Diff shows context tokens and labels the old row "uncached input".
- Replay on a run without request records offers a run that has sealed ones.
- Data regenerated; `pnpm check` and `web-check` pass.
- `theme.css`: Phosphor tokens, fonts, glass panels, scanlines, reduced-motion guard, shared by both pages. Light theme muted text darkened toward AA (to be measured in S4).

### S2 — Report (default run view)
- Header: run name (date · harness · turns · duration), truth badge, Capture Level, trust score ring with what capped it, verdict in one sentence.
- Three answers (tokens, structure, subagents) as glossy cards, each with its reason and "show bytes".
- What went wrong: named findings with line and byte range, jump to the transcript.
- What the record can't tell you, with the command that captures more.
- Numbers you can quote, counting up, ranges and ≥ marks kept.
- "Replay the assay" opens the existing scan.

### S3 — Reconstruction, provenance, Run Diff
- **Rebuild flow:** for a sealed request, the transcript lines stream into category bands (canvas, from `context` and `rebuild` fields), the stack settles, the digest prints character by character and the seal strikes. Unsealed requests show the gap instead of a flow.
- **Provenance threads:** literals connect to their first occurrence with animated threads; `l1-lines` threads are dashed and labelled upper bound.
- **Run Diff tracks:** ribbons for exact-key matches, a pulsing fork at the first divergence ("at or after" when ambiguous), side-by-side step cards on hover.

### S4 — Runs, landing, learn, polish
- Runs: sortable table plus a gallery of holo cards; drop to open; the pattern view (what do these runs share).
- Landing: animated hero background, scroll-pinned "Call the number", how it works in three steps, the `assay check` card.
- Learn: Tamper missions, punch card and calls.
- ⌘K palette, glossary popovers, phone layout, AA contrast measured in both themes.
- Publish: the redacted export with real runs, after a check that fails on any unredacted string; TRAIL excluded.

## Status (2026-11-03, second pass)
Palette re-chosen after the owner asked for less generic colours: NieR:Automata's restrained bone-on-black HUD, Alien: Isolation's phosphor terminals and Teenage Engineering's instrument labels, instead of neon cyan and magenta. Built: Report (default), plain navigation with Ctrl K, Rebuild flow with seal, Compare ribbons and twin pairing, landing waves and decode text, HUD panels with corner brackets, scanlines and a refresh band, phone top bar. Not yet: provenance threads drawn between literals (streaks are still a list), Timeline glow and zoom, the Runs table and pattern view, Play as a separate Learn area, glossary popovers, measured AA contrast, the publish step and its redaction check.

## Status (2026-11-03, third pass: ready to publish)
Built: provenance threads under the streaks; Timeline glow; Runs as a sortable table with a gallery toggle and a detector filter that states what the matching runs share; Learn (missions, punch card and calls moved out of the top bar); glossary tips on Capture Level, trust score, sealed and truth; `pnpm publish-site` builds `dist/site`, refuses on any unredacted string, path, email or secret-like token, and leaves out TRAIL runs.

Audit fixes:
- The landing said eleven gates; core has fourteen, and the count is now derived from the list. It said every run is L1; the twins are L3. It showed an outdated CLI command.
- Red marked ordinary warnings on both pages; now amber, red only for capture failure. Verified used the data colour; now mint.
- "Claude Code before 2.1.299 writes no request records" was false both ways in the corpus (one 2.1.165 run has records; several 2.1.308/309 runs have none). Reworded in the CLI and the site.
- Absolute corpus paths reached data.js through validity offsets, and a diff line passed redaction. Both fixed in core, with tests; web-check now sees escaped paths.
- Light-theme accents failed AA on the page ground; now 5.3:1 or better, mute 4.95:1.
- The landing hero overflowed at phone width; no view scrolls sideways at 375px now.

Still open: Timeline zoom; publishing itself (owner decision: where, and when).
