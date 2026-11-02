# DECISIONS — ADRs (append-only)

Format: ID · date · status · context · decision · consequences. Supersede, never edit.

## ADR-001 · 2026-10-30 · accepted · Thesis is trace trust, not another viewer
Context: viewers and token analyzers for Claude Code sessions already ship (context-analyzer, lm-assist, trajectory viewer, others). Decision: lead with Capture Level + Trace Health + validity lab; reach parity on viewing features but do not make "another viewer" the claim. Consequence: Health and the lab ship before views are polished.

## ADR-002 · 2026-10-30 · accepted · Truth ladder
Decision: four badges `real | real-perturbed | scripted | inferred`; scripted always SYNTHETIC; scripted precision/recall reported separately. Consequence: no synthetic hero examples; validity cards show two numbers.

## ADR-003 · 2026-10-30 · accepted · Real-data-first validity lab
Decision: R1-R6 on real captures precede scripted tests; scripted only for exact-fault injection and serializer equivalence. Consequence: M0 starts corpus capture immediately.

## ADR-004 · 2026-10-30 · accepted · No inferred edges; exact-match provenance
Decision: edges are `observed` or `matched` only; no embeddings or judge for primary outcomes. Consequence: Constellation may look sparser than competitors; every edge is defensible.

## ADR-005 · 2026-10-30 · accepted · Judge plane optional, off by default
Decision: Jev or any judge is a pluggable `Judge`; output labelled `model-judged` with probability; runs after redaction; calibrated against R5. Context: Jev paper results are mixed per benchmark, threshold split undisclosed, availability not described. Consequence: no core feature depends on Jev.

## ADR-006 · 2026-10-30 · accepted · Strata layers use Claude Code's official context categories
Decision: layer taxonomy = System, CLAUDE.md, Memory, Skills, MCP, Rules, You, Files, Output, Claude, Hooks (from the official context-window explainer, snippet level; re-verify in M0). Consequence: we do not invent categories; mismatches become findings.

## ADR-007 · 2026-10-30 · accepted · Version-keyed importers; whole-directory reads
Context: transcript layout and contents change often (subagent files, request params in transcripts, GC, dropped PDF bytes); Harbor undercounted ~80% by reading one file. Decision: importers keyed by (tool, version range), read the whole session directory, and degrade Capture Level visibly on unknown versions. Consequence: a version matrix test suite is part of M1.
Amendment 2026-10-30 (own-corpus census): (1) key by version **per line**, since versions change inside one file (2.1.299 -> 2.1.304 -> 2.1.309). (2) Read at the **project** level: resumed sessions copy lines from earlier files (uuid overlap up to 99.8%), so dedupe by uuid across files and resolve `requestRef`/blob hashes across files. (3) Session folders hold content outside the JSONL (`tool-results/` images and text). (4) Live files change while read: freeze a copy with a sha256 manifest before analysing. (5) Unknown line types seen in real data (bridge-session, atis-latch, frame-link, artifact-*, cost-state, queue-operation, api-request*) are modelled or explicitly ignored, never silently dropped.

## ADR-008 · 2026-10-30 · accepted · Capture channels are a ladder L0-L4 and include hooks and proxy
Context: context-analyzer uses hooks; a VS Code viewer uses a capture proxy; OTel offers raw bodies to file. Decision: Capture Level covers transcript, hooks, OTel, and raw bodies/proxy. Consequence: R1 can compare any pair of channels.

## ADR-009 · 2026-10-30 · accepted · Learning via `learn/` gate protocol
Decision: replaces chat learning for all three projects; see `LEARNING.md`. Consequence: milestones cannot close without `gate.md`.

## ADR-010 · 2026-10-30 · accepted · Engine in TypeScript, spec in JSON Schema
Decision: assay-core in TypeScript so the same code runs in CLI, CI, browser worker; JSON Schema generated from zod enables a later Rust/WASM port. Consequence: surfacelab (Python) stays separate; no shared runtime.

## ADR-011 · 2026-11-01 · accepted · D1 confirmation deferred; M2 closes without it
Context: M2 exit requires "D1 confirmed on at least one real undercount." After exhaustive corpus search (9 sessions, versions 2.1.165–2.1.308, including two projects with subagent directories), no session was found where the main JSONL file embeds `agentId` references on user events referencing an absent subagent file. In all observed versions the main file uses `isSidechain=true` to mark sidechain events and the subagent content lives entirely in the subagent's own file — D1's trigger condition. D1 logic is correct; the corpus simply lacks a qualifying session.
Decision: close M2 with D1 at zero-coverage status, documented in `2026-11-01-m2-precision-audit.md`. D1 confirmation moves to a corpus quality task: add ≥1 multi-agent session where the main file references a subagent that was not captured (e.g. by importing only the main file of a session with subagents). Corpus quality and variety improvements are a first-order M3 prep item.
Consequence: D1 remains logically correct but unvalidated on real data. Any D1 finding on new corpus additions must be spot-checked before reporting.

## ADR-012 · 2026-11-01 · accepted · R1-F2: OTel required for full API cost accounting
Context: R1 cross-channel comparison (2026-11-01) found that Claude Code makes internal non-conversation API calls (e.g. haiku tool-routing) not written to the JSONL transcript. OTel `claude_code.api_request` records and `claude_code.llm_request` spans capture these; L1 JSONL does not.
Decision: document in ROADMAP that total API spend (including internal calls) requires L3+ capture. The ValidityCard caveat for L1 is sufficient for M2; an explicit "internal-requests gap" caveat is added to L1 runs. OTel importer remains an M3 target.
Consequence: token totals on L1 runs carry a documented undercount caveat for cost (not for correctness of conversation-turn analysis).

## ADR-013 · 2026-11-01 · accepted · cost-state records are extracted, not filed as unknowns
Context: `cost-state` JSONL lines (v2.1.308+) contain the runtime's own accounting — `totalCostUSD`, `totalAPIDurationMs`, per-model breakdown with `inputTokens`, `outputTokens`, `thinkingTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `costUSD`. Previously filed as unknowns (raising the unknown ratio without benefit). The per-model breakdowns are the best independent cross-check available at L1.
Decision: parse `cost-state` records into a typed `CostState` entity (stored in `run.costStates`). Keep the last record as the final cumulative accounting. Use it as input to the D-cost detector and expose `runtimeCostUSD` on the ValidityCard.
Consequence: importer coverage ratio improves; D-cost cross-check is available on all v2.1.308+ sessions; `hasUnknownModelCost` flag surfaced.

## ADR-014 · 2026-11-01 · accepted · D10 is count-based, not link-based
Context: `api-request` records use a UUID namespace; `assistant.requestId` uses a `req_…` namespace. They never overlap. The originally proposed D10 (link `requestId` → `api-request.id`) cannot be implemented without a lookup table that doesn't exist in the JSONL.
Decision: respecify D10 as a count-based check — compare `rawApiRequestCount` (api-request lines in source) against `llmRequests.length`. A diff >2 is reported as info. Small diffs (≤2) are noise tolerance for session-start/end bookkeeping records.
Consequence: D10 gives a coverage signal without per-record linkage. Exact linkage is deferred until the UUID→requestId mapping is understood (Later).

## ADR-015 · 2026-11-01 · accepted · Three-way observability state for event categories
Context: a count of 0 for compactions, subagents, or skills is ambiguous: it could mean "none occurred" or "the capture level cannot tell." Reporting 0 as a fact misleads consumers into trusting a metric that may be undercount.
Decision: introduce `ObservabilityState = 'observed' | 'not-observed' | 'verified-absent'`. `not-observed` means the category was not seen but the capture level cannot rule it out. `verified-absent` requires independent evidence (e.g. a separate record type confirming no compaction happened). At L1, compaction/subagent/skill are `not-observed` when count=0, never `verified-absent`. The ValidityCard carries a per-category `observability` map with state, count, and a human-readable reason.
Consequence: no false confidence for consumers. `verified-absent` is reserved for future L2/L3 signals.

## ADR-016 · 2026-11-01 · accepted · capture-incomplete is a distinct observability state; captureIntegrity flag on findings
Context: with `not-observed` and `verified-absent` we could express "we didn't see it" and "we confirmed it didn't happen." But there is a third situation: affirmative evidence that a capture failure occurred (chain break, source disagreement, missing transcript). That is stronger than `not-observed` but not as strong as `verified-absent`. Conflating these hides real problems.
Decision: add `capture-incomplete` as a fourth `ObservabilityState`. Add `captureIntegrity?: boolean` to `Finding`. Detectors that are evidence of capture failure (D1, D3, D10, D-cost warn) set `captureIntegrity: true`. `buildValidityCard` promotes affected observability categories from `not-observed` to `capture-incomplete` when any `captureIntegrity` finding exists for that category. Add a `transcript` observability category driven by D3.
Consequence: ValidityCard can now distinguish "we didn't see any compaction events" from "we have evidence that events are missing." The CAPTURE_MATRIX doc formalises what each source can theoretically expose, separate from what was actually captured.

## ADR-017 · 2026-11-02 · accepted · M3 identity: the bench, the hallmark, and a play layer
Context: the M3 views were first designed as boards to read; that was rejected as a content dump. A playable prototype on all 23 results (`web/prototype/`) worked: committing to a call before the scan, the hallmark strip, per-detector figures and tamper missions explained trust faster than any copy (M3_PLAN §0).
Decision: the look is the prototype's "bench" (candidate B in M3_PLAN §3) with two rules from candidate A: red only for capture failure, and a verified colour distinct from observed. View names: Run Card becomes **Hallmark**, Strata **Core**, Constellation **Traverse**; Replay and Run Diff keep theirs. The play layer (Call it, bench scan, punch card, the four tamper missions) is M3 scope; new missions go to Later. Play state is local only and never compares people.
Consequence: DESIGN.md is rewritten around the bench. Every mechanic is a thin wrapper over a core result.

## ADR-018 · 2026-11-02 · accepted · Core at L1 shows four measured layers; the 11-category split moves to M4
Context: ADR-006 put Claude Code's official context categories in Strata. At L1 the JSONL only measures four token layers per request (cache read, cache write, uncached input, output); splitting them into 11 categories needs reconstruction, which Rule 5 forbids before M4's R2 work.
Decision: Core draws the four measured layers plus an "unlogged at L1" column naming the categories it cannot fill. The 11-category split is part of M4 reconstruction. Supersedes the M3 part of ADR-006.
Consequence: Core is honest at L1 and gains layers without a redesign once reconstruction lands.

## ADR-019 · 2026-11-02 · accepted · fs-free importer; M3 site is static and fed by core output
Context: `run.json` files reach 80 MB because every event embeds its raw line, so shipping them to a browser is wrong. M3_PLAN §7.5 also proposed a Vite + React rewrite of the web app, but the prototype already meets the views' needs and Asmit is happy with it.
Decision: core gains `importFromFiles(files: {path, bytes}[])` with no `fs`; the CLI's directory importer wraps it. The M3 site stays plain HTML/JS in `web/`, reading a view file that core builds (ADR-020). In-browser parsing of a dropped folder (Web Worker) and the React/Vite stack move to Later; the fs-free importer is the prerequisite and ships now.
Consequence: no number in the site is computed by the site's own data script; the throwaway `extract.py` is deleted.

## ADR-020 · 2026-11-02 · accepted · The view model lives in core
Decision: `packages/assay-core/src/view/` builds a `RunView` from a run and its health report: hallmark (all punches, fineness, bound and rates), transcript segments with per-segment event, unknown, finding and naive-usage counts, per-request usage, compaction anchors, findings with offsets, and redacted raw samples. `assay export-view <path> [--redact] [--truth]` writes one; `assay export-site` writes the site's data file from the corpus manifest. Redaction keeps keys, ids, ISO timestamps, numbers and short enum-like strings and replaces every other string with `‹redacted · N chars›`; a test asserts no free text survives.
Consequence: every figure on the site traces to core (Rules 3, 7).

## ADR-021 · 2026-11-02 · accepted · Disagreeing usage copies make the input total a range
Context: the "forge a giant prompt" mission rewrote one copy of a message to 195,000 input tokens. D6 flagged it, but max-usage selection kept the forged copy, so the run's input total went from 106 to 195,104 while the tokens verdict stayed trustworthy (M3_PLAN §10.1).
Decision: the ValidityCard carries `inputTokenRange {min, max}`: max is the importer's choice, min swaps in the smallest copy wherever copies disagree. A D6 warn demotes the tokens verdict to usable-with-caveats. Views show a point total only when min equals max; the mission stamps CAUGHT only when the forged value is no longer presented as a point total.
Consequence: a forged or stale copy can no longer hide inside a trustworthy number.

## ADR-022 · 2026-11-02 · accepted · Fineness measures lost telemetry, via a record-type catalogue
Context: fineness defined as ⌊1000 × min(usage coverage, 1 − unknownRatio, model identification)⌋ put every real run at 300–479, always bounded by importer coverage, because 53–86% of lines are harness metadata (`attachment`, `queue-operation`, `custom-title`, …) that carry no usage telemetry. It measured how many types we had named, not data lost.
Decision: a versioned catalogue (`importers/claude-code-jsonl/catalogue.ts`, named from the corpus, 2.1.165–2.1.309) marks known no-telemetry types. Their lines stay preserved as UnknownLines with `catalogued: true` (Rule 4) but leave the denominator. Fineness = ⌊1000 × min(usage coverage, 1 − unparsedTelemetryRatio, model identification)⌋, computed in core, with the bounding rate named. Uncatalogued types (`api-request-blob`, `atis-latch`, …) still count against it. Raw importer coverage stays on the certificate.
Consequence: fineness can now tell a clean run from a lossy one. A type enters the catalogue only after it has been seen and its fields checked.

## ADR-023 · 2026-11-02 · accepted · M3 learning gate recorded as passed by Asmit
Context: `learn/M3/` had no `attempt.md`, and Rule 11 blocks moving past an unpassed gate. On 2026-11-02 Asmit stated the gate is passed and asked for M3 to be completed.
Decision: record the gate as passed on Asmit's statement. The primer is revised to match ADR-017..022 so the material stays current; because `answers.md` was opened during an audit, its questions are replaced.
Consequence: M3 core work proceeds. The M4 gate follows the normal protocol.

## ADR-024 · 2026-11-02 · accepted · Subagent transcripts are derived; parents' agent references are read
Context: every line in a subagent transcript carries `isSidechain: true`, and the deriver skipped sidechain events, so subagent files were parsed and then ignored: their usage never reached any total (on real sessions, 28 requests and ~1.1M context tokens in `ef28c299`, 16 and ~711k in `453b573b`). Separately, a parent records the subagent it ran in `toolUseResult.agentId`, which the deriver never read, so no Agent entity existed for these sessions and D1 could not fire. This is why ADR-011 found zero real D1 coverage: `corpus/frozen/E--RL-d1-trigger` (a real session copied without its `subagents/` folder) should have fired and didn't.
Decision: sidechain events are derived like any other; message.id dedup prevents an inline copy and its file copy from counting twice. `toolUseResult.agentId` creates an Agent (observed reference); the file importer stamps `transcriptFile` when the matching file exists. Main-chain turn numbering ignores sidechain turns.
Consequence: token totals for runs with subagents rise to include them. D1 now fires on a real session (`d1-trigger`). Every result and the site data must be regenerated.

## ADR-025 · 2026-11-02 · accepted · OTLP importer (Claude Code profile); OTel raises a run to L3
Context: M1 listed an OTLP importer that was never built, so every run stamped L1 and R1-F2 (internal API calls the transcript never writes) was only a notebook finding.
Decision: `attachOtlp(run, files)` reads OTLP JSON file-exporter output (logs and spans), keeps records whose `session.id` equals the run id, and turns `api_request` log records into `run.otel.apiRequests`. They are joined to transcript requests only by exact `request_id` = `requestRef` equality (Rule 5). Any OTel record for the session raises capture to L3. The ValidityCard gains `otel` (matched, OTel-only with tokens, cost and query source, transcript-only), and a caveat names the OTel-only requests. fs-free, like the JSONL importer. Personal OTel attributes (email, account ids) are never copied into the run or the view.
Consequence: on the real R1 capture, `93de073c` stamps L3 and shows one OTel-only `generate_session_title` request (1,342 in / 248 out); `2b152411` matches 3 of 3. CLI: `--otlp <file>` on import and export-view, `otlp` per run in the site list.

## ADR-026 · 2026-11-02 · accepted · R2 ground truth is the transcript's own request records, digest-verified
Context: R2 assumed L4 raw API bodies as ground truth; none exist in the corpus. Transcripts from 2.1.299 on store every SDK request as a delta chain (`api-request-shape`, `api-request`, `api-request-blob`), and the hashes reproduce: blob hash = SHA-256 of sorted-key JSON (string content as one text block), and `requestDigest` = SHA-256 of `{...params, system, tools, messages}` with `cacheControl` applied. That held for 4 of 4 requests whose messages were all present (M4_PLAN §0).
Decision: R2 scores a rebuild from ordinary transcript lines against these records. Primary metric: digest-exact rate per session. Tokens per block come only from usage deltas between consecutive requests; any other split is labelled `inferred`. One L4 session calibrates the records against raw bodies before M4 exits. The M4 learning gate (unit 7) is recorded as passed on Asmit's statement of 2026-11-02, as in ADR-023.
Consequence: R2 needs no new capture to start, and a digest match is a proof of exact reconstruction. Coverage is only what the records cover: no subagent requests and no side calls such as title generation (OTel shows those). Truth and rebuild come from one client-written file (threat T-R2-1), so the L4 calibration is required for the exit.

## ADR-027 · 2026-11-02 · accepted · D11: a request record that disagrees with itself is a capture-integrity finding
Context: request records can be checked against their own hashes (ADR-026). A complete request whose rebuilt body misses its digest, or a blob or shape whose content misses its key, means the file was altered or the format changed, not that a message is merely missing.
Decision: D11 (warn, captureIntegrity) fires on broken seals and on failing blobs or shapes, with their offsets. Unresolved requests are not findings; the validity card's `requests` block counts them (records, sealed, broken, unresolved, no-shape, blobs failing, messages without a blob). `assay requests <path>` prints the seal per request and exits 2 on a broken seal or failing key. Request-record lines are kept as unknown lines with `parsedAs: 'request-record'` and leave the unparsed-telemetry count.
Consequence: on the real corpus (21 sessions, 3,074 records) D11 fires on none. Fineness rises for every 2.1.299+ run, because blobs and shapes are now parsed; site data and results must be regenerated.

## ADR-028 · 2026-11-02 · accepted · Rule 7 enforced: declared importer support, D0, and a format census
Context: Rule 7 requires importers keyed by (tool, version range), with an unknown version giving a degraded run and a visible warning. No code checked the version: every run was parsed best-effort, silently.
Decision: `importers/claude-code-jsonl/support.ts` declares the range (2.1.165–2.1.316) and the versions actually checked against the corpus. The validity card carries `version {value, support, range}`. D0 warns when a run's version is outside the range or missing, which demotes the overall verdict; a version inside the range but unchecked is info. `assay catalogue check` walks the corpus and `~/.claude/projects`, prints every version against the support, lists the record types and fields first seen at each version (against all earlier versions, since absence in a small sample is not a change), writes `results/catalogue/<version>.json` with `--results`, and exits 1 on any version outside the range.
Consequence: scripted fixtures and the two real fixtures with no version field now carry a D0 warn. The first census found that 2.1.309 adds `requestId` and `uuid` to `api-request` records (so D10's "cannot link" holds only before 2.1.309) and that 2.1.299 adds `wireToolInputs` to assistant lines (a lead for the client-filled defaults the L4 calibration found).

## ADR-029 · 2026-11-02 · accepted · Capture-quality counters on the validity card
Context: the side-session list (M4_PLAN §4a, item 3) asked for deterministic counters beside the Capture Level. Some overlap existing detectors (D3 orphan parents, D8 mixed session ids within a file, D9 file-order timestamp reversal), but measure something different.
Decision: `validity.captureQuality` counts, each with up to 5 first offsets and a "how this can mislead" line: duplicate uuids, duplicate requestId across files, sessionId different from the main transcript's name (subagent files carry the parent's id, so they are compared with it), child timestamped before its parent, parents that point nowhere (a parent kept as an unknown line counts as present), and uncatalogued record types by name. Counters only: no verdict changes, no findings.
Consequence: on the real corpus, `c3170ecf` has 232 duplicate uuids, which are identical records written again later in the file. Measured: no tool result, tool call, message, request or edge is duplicated by them, so no number is inflated; events keep both copies (Rule 4). Child-before-parent occurs 2–18 times in 9 sessions, by a few milliseconds around compaction summaries (harness ordering, not loss). Orphan parents agree with D3: zero everywhere. Offsets are 0-based; `assay requests` now prints 1-based line numbers.

## ADR-030 · 2026-11-02 · accepted · D10 joins by requestRef; cross-channel first disagreements; version canaries
Context: D10 compared counts because "api-request ids cannot be linked" (ADR-014). The census showed that assistant lines carry `requestRef` from 2.1.301, naming the `api-request` record written for them: an explicit id link.
Decision:
- **D10 joins exactly where refs exist.** It reports transcript requests whose record was never written, with offsets, and falls back to counts only for versions without refs. The requests block gains `requestsWithRef`, `linked`, `refWithoutRecord` and `recordWithoutRef`.
- **The OTel summary gains the first disagreements**, `firstOtelOnly` and `firstTranscriptOnly`, each at its own raw bytes.
- **Version canaries:** `tests/canary.test.ts` hashes the importer and Health output for one frozen real session per version. Only hashes are committed. The test fails when a change moves them, and skips without the corpus.

Consequence: on `17f6f5b7`, 13 of 20 requests name records that were never written, all before 10:17, so records cover only the later part of that session. That was invisible to the count rule. 4a153124's 170 records with no ref are all built on by later requests (interrupted or retried calls), so they are counted, not flagged. LlmRequest.requestRef's comment now says what it holds (the API request id), since the transcript's own `requestRef` field means something else.

## ADR-031 · 2026-11-02 · accepted · Hash-gated rebuild of request messages from transcript lines (R2 scorer frozen)
Context: R2 asks whether the request Claude Code sent can be rebuilt from ordinary transcript lines. Request records name every message by hash, so any rebuild can be checked exactly.
Decision: `reconstruct/rebuild.ts` turns lines into candidate messages, and a candidate is used only when its hash equals a hash a record names. The rules were found on the 6 R2 dev sessions only:
- streamed assistant lines joined by message.id, optionally with `wireToolInputs`;
- the tool results of one turn joined;
- string tool results trimmed;
- system-role rendered attachments appended to the last tool result;
- a human turn's rendered attachments placed before the prompt;
- a system-role attachment as its own unwrapped system message.

Each record now has three seals: `sealFromBlobs` (stored blobs only), `sealFromLines` (lines only, the preregistered primary) and `seal` (both). Tail entries name their source, rule and the lines used.

Frozen at the commit carrying this ADR; any rule change after the held-out score is a v2.

Consequence, dev set only:
- 1,897 of 2,104 distinct messages rebuild from lines.
- Blobs plus rebuild seal 1,016 of 1,016 requests, where blobs alone seal 28.
- Lines alone seal 0. A session's opening request carries an environment system message and `tool_addition` tool definitions that no ordinary line contains, and every later request keeps them.
- So exact whole-request reconstruction from L1 lines is not possible on these versions, whatever the rules. The preregistered primary metric is expected near 0, and will be reported as measured.

## ADR-032 · 2026-11-02 · accepted · Context categories by literal markers; tokens by usage deltas; spine.context filled
Context: ADR-018 deferred the 11 categories (System, CLAUDE.md, Memory, Skills, MCP, Rules, You, Files, Output, Claude, Hooks) to M4, because L1 measures only four token layers.
Decision:
- **Categories only for sealed requests.** For a sealed request, every block of the body gets a category by position: system, tools (MCP by the `mcp__` name), assistant (Claude), or tool result (Files for Read, by the tool_use id; otherwise Output). Injected text blocks get one by literal openings collected from real attachments on the dev sessions. Anything else is `uncategorised`.
- **Memory and Rules are reported as not separable,** never as zero: MEMORY.md travels inside the CLAUDE.md block, and no rules block was seen.
- **Tokens are measured only by usage deltas.** Along an unbroken append chain (same shape, every base message kept), total input minus the base's total is the exact cost of what was added. Its split across categories is by characters unless the addition is one category. Everything else is a characters split, labelled inferred.
- **`spine.context` carries** the total, the delta-measured amount and per-category measured and inferred tokens.

Consequence: R2 secondary results, held-out: uncategorised 0.09%, delta-measured token share 7.7% (dev 29.7%). The share is low because the opening request, mostly system prompt and tools, is never delta-measured, and records without a usage link restart the chain; dropped messages are rare (2 of 2,016). The Core can show categories for 2.1.299+ sessions; most of the split is drawn stippled, as inferred.

## ADR-033 · 2026-11-02 · accepted · Provenance of tool-call literals: request-based, with a labelled line fallback
Context: M4 needs exact-match provenance and unsourced-literal reporting, validated against R5 (P4 preregistration).
Decision: literals are string values of at least 8 characters plus path-like tokens, excluding `description` values and numbers.
- **For a call whose request is sealed,** each literal is looked up in exactly that request body (system, tools, messages), and the earliest occurrence becomes a `matched` edge.
- **Otherwise it is looked up in earlier transcript lines** (message content and rendered attachments only), labelled `l1-lines`.
- **`spine.provenance` carries both.** In the view, a path keeps only its last segment and any other literal becomes a length marker.

Consequence: held-out agreement with an independent raw-file search is 0.974. The disagreements show that the transcript file holds text the model never received (`toolUseResult`, cleared thinking, bookkeeping), so raw-file provenance over-claims and `l1-lines` is an upper bound. The site must label `l1-lines` provenance as such.

## ADR-034 · 2026-11-02 · accepted · Run Diff aligns steps by tool-name multisets (LCS, exact keys)
Context: M3's diff key was the flat tool-name sequence, so reordering two parallel calls would read as a divergence.
Decision: a step's key is the sorted multiset of its tool names. Runs are aligned by LCS over keys with exact equality (Rule 5) and report pairs, one-sided steps and the first divergence. `align` and `stepKey` are in core and in the browser bundle.
Consequence: T3 stability is 60 of 60 and detection 16 of 17. The miss is a run of identical steps, so the view shows the first divergence as "at or after" when neighbours share a key, and states that keys ignore inputs.

## ADR-035 · 2026-11-03 · accepted · Judge plane: interface, redaction and calibration in core; Groq adapter in a script; calibrated on TRAIL
Context: M5 includes the judge plane and a calibration study (LEARNING unit 9). Jev was set aside by Asmit. A Groq-hosted model was chosen. Rule 6: optional, off by default, `model-judged` with a probability, never mixed with deterministic verdicts, and only after redaction.
Decision:
- **Core holds the pieces that need no network:** the `Judge` interface, `redactForJudge` (identity fields dropped; emails, keys, long hex and home paths masked) and pure calibration maths (reliability bins, ECE, AUROC, F1 threshold, confusion).
- **The Groq adapter lives in `scripts/j1.mjs`**, reading keys only from `GROQ_API_KEY`/`GROQ_API_KEY_2` and caching answers.
- **Nothing in import, Health or the view calls a judge.**
- **The calibration study (J1) uses TRAIL's human span labels**, not our corpus. So no private trace leaves the machine, and the truth is human, not computed.
- **TRAIL is gated (no resharing)**, so it is gitignored, and results carry aggregates and hashed span ids only.

Consequence: the judge can be measured before it is trusted. The ROADMAP's "Jev calibration" becomes J1 on Groq. Asmit sets the keys in his own shell.

## ADR-036 · 2026-11-03 · accepted · assay check, assay assert and the CI Action; one exit-code contract
Context: M5 ships assay as a tool someone else runs. That needs one readable command, a rule gate for CI, and exit codes that mean the same thing everywhere.
Decision:
- **`assay check <session>`** prints one card, with Capture Level on the first line (Rule 1), then verdicts, fineness, tokens (context, plus uncached input or its range), seals and warn/error findings with 1-based lines. `--json` gives the full report.
- **`assay assert <session> --rules f.json`** checks optional rules: `minCaptureLevel`, `versionSupport`, `forbidSeverity`, `forbidDetectors`, `overallNot`, `maxInputTokens`, `minSealedShare` and `maxUnparsedTelemetry`. An unknown rule name is an error.
- **Exit codes:** 0 ok; 1 usage error or a failed rule; 2 do-not-trust or a broken seal.
- **`action.yml`** is a composite action wrapping `assert`. Inputs pass through environment variables, never shell interpolation.
- **`.github/workflows/check.yml`** runs `pnpm check`, and the action on a passing fixture and on a must-fail fixture.
- **The "% of lines not recognized" caveat now uses unparsed telemetry,** not the raw unknown share, which counted understood catalogued and request-record lines.

Consequence: CI sees scripted fixtures only (Rule 8), and a gate that cannot close fails the build.

## Proposed (not yet accepted)
- ADR-P1 Interop with context-analyzer (decide after M0 source read).
- ADR-P2 Upstream OTel proposal for compaction and skill entities (decide after M0 repo check).
