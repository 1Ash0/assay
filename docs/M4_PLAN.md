# M4 plan — reconstruction, provenance, Run Diff (rev 2)

Rev 2, 2026-11-02, after a self-critique of rev 1 and a design pass. Exit criteria are in ROADMAP M4.

## 0. The finding that shapes M4: transcripts already record the requests, and they verify

From 2.1.299 on, Claude Code writes every API request into the transcript as a delta chain:
- `api-request-shape` holds `system` and `tools`;
- each `api-request` holds `params` plus `base` (the previous request), `keep` (how many of its messages stay) and `tail` (hashes of the new messages), along with `cacheControl` paths and a `requestDigest`;
- `api-request-blob` holds one message, keyed by its hash.

The corpus has **3,173 such records in 22 session files** (2.1.299–2.1.316, all one layout). Two of those files are real-perturbed copies of `3620a96a`, so there are 20 distinct real sessions.

Verified 2026-11-02 (scratch scripts; P1 turns them into tests):
- **Blob hash** = SHA-256 of the message as sorted-key JSON, after a string `content` becomes one text block. 1,052 of 1,052 and 72 of 72 check, in two sessions.
- **Shape hash** = SHA-256 of the shape the same way.
- **`requestDigest`** = SHA-256 of `{...params, system, tools, messages}` as sorted-key JSON, with each `cacheControl` value set at its path. **Every request whose messages we hold matches: 4 of 4** (in `3620a96a` and `ef76e3fc`).
- Most requests cannot yet be checked, because some tail messages are not stored as blobs.
  - The first gap examined is the user message that carries a tool result *plus the attachments merged into it*.
  - One missing message breaks the chain for every later request: built 2 of 54, 2 of 7 and 0 of 44 in three sessions.

**What this means.** Rebuilding those missing messages from ordinary transcript lines *is* the reconstruction problem. When our rebuild makes a request hash to its `requestDigest`, the rebuild is proven exact, byte for byte, with no model and no estimate.

## 1. Is this self-check as accurate as an L4 capture?

**For the requests it covers: yes.** `OTEL_LOG_RAW_API_BODIES` is also written by the Claude Code client, from the same body. A digest match proves we hold that body exactly, apart from JSON key order. Neither L4 nor the self-check sees anything the API server adds after the request leaves.

**Where it falls short of L4:**
1. **Coverage.** The records are 3,164 `sdk` and 9 `repl_main_thread` requests.
   - Subagent transcripts carry none (0 files).
   - Side calls such as `generate_session_title` are not recorded: OTel showed one in each of `93de073c` and `ef76e3fc`.
   - L4 would cover those; the self-check cannot.
2. **Unverified on purpose-built ground truth.** We have never compared a request record with a raw body from the same request. The digest proves internal consistency, not that the record is the body sent.
3. **The field set is the client's.** If the client hashes before adding something (headers, a late beta flag), the digest would still match while the wire body differs.

**Recommendation.** Treat the self-check as R2's ground truth, and calibrate it once against real L4.
- You record one 20-minute session with your collector running and `OTEL_LOG_RAW_API_BODIES=file:E:\assay-otel\raw`.
- Then we check every request the session records against its raw body.
- If they agree, the self-check is L4-equivalent for the covered requests, and that is written into the result. If not, the differences become findings.

This is the one thing in M4 that needs you, and it is cheap.

### 1a. Calibration result (done 2026-11-02, `cae68025`, 2.1.316)
Run with `node scripts/l4-calibrate.mjs`; output in `results/L4-calibration-cae68025.json`; raw bodies frozen in `corpus/frozen/l4/2026-11-02-cae68025/`.

- **The wire protocol has changed, which makes L4 weaker than assumed.** On 2.1.316 the client sends `thread: {type: create | continue, previous_message_id}`, and a `continue` body carries only the new messages; the history lives on the server. A raw body is therefore not the context. To compare, the wire chain has to be replayed: the previous messages, plus the previous response, plus the new messages.
- **Pairing.** 9 of 9 main-thread wire requests pair to exactly one record each. A pair requires the record's tail hashes to appear among the wire messages.
- **Agreement.** params 9 of 9; system 2 of 2 and tools 2 of 2 (only `create` bodies carry them); messages **25 of 26** where both sides hold the message.
- **The differences, all counted:**
  - **A billing header.** Every wire body starts its system with `x-anthropic-billing-header: cc_version=…` (9 blocks). The record never has it, so it is `not_captured` in the transcript.
  - **Cache markers.** They sit inline on the wire and as paths in the record; this difference is expected.
  - **Defaults filled in.** An `Edit` tool call in the history the client sends carries `"replace_all": false`. The model's output, as stored in the blob, has no such field: the client fills defaults into the history it re-sends. This is the 1 of 26.
  - **The raw-body logger redacts.** 356 leaves were replaced by `<REDACTED>` (thinking) or `[account memory text not recorded]` (some tool-schema fields). In those places **the transcript record holds more than L4.**
- **Coverage.**
  - 3 of 12 wire requests have no record: 1 `generate_session_title` and 2 `prompt_suggestion`. That confirms the side-call gap and adds a second kind of side call.
  - 64 recorded messages are not stored as blobs. L4 has them, so this session can score R2's rebuild of exactly those messages.

**Verdict.** For the main thread, the record equals the wire request apart from the four named, counted differences. It is the better ground truth for context, because L4 is both delta-encoded and redacted. L4 stays essential for side calls and for the defaults the client fills in. That holds for n = 1 session, one version and one user, and the result says so.

## 2. Self-critique of rev 1

| Rev 1 said | Problem | Rev 2 |
|---|---|---|
| R2 ground truth from the transcript | Circular: the rebuild and the truth come from the same file, written by the same client. | Keep it, because the digest makes it a proof rather than an agreement. Add the L4 calibration (§1). State the circularity as threat T-R2-1. |
| Token error against `usage.input_tokens` | We have no tokenizer, so any per-block token count would be an estimate dressed as a measurement. | **Measured attribution by deltas.** When a request keeps all of the previous request's messages, its total input (input + cache read + cache write) minus the previous total is exactly the token cost of what was appended. Blocks get *measured* tokens that way. Only the first request's split between system, tools and messages needs an estimate, drawn stippled as `inferred` with the method named. |
| 11 categories by markers | The marker list is invented by us and could silently misfile. | Every marker is a fixture with its source line. `uncategorised` is a first-class category with its own share. A category is drawn only for blocks that are digest-verified or explicitly rebuilt. |
| Provenance by exact literal match | Short or common strings (`src`, `true`, `npm`) match everywhere. "Matched" is not "caused". "Unsourced" is not "hallucinated": `npm install` needs no source. | Minimum length and an exclusion list, both fixed in the preregistration. Copy says "appeared earlier at …", never "came from". Unsourced literals are reported, never called errors. R5 checks only the claim we make: the literal does or does not appear earlier. |
| Run Diff with T3 stability | We have **no real pair of runs of the same task.** Diffing unrelated sessions produces noise that looks like insight. | T3 on scripted perturbations as planned. For real data, a **twin-run protocol**: the same prompt in the same repo state, run twice. Until then the Diff view says "no twin pair in corpus", and pairs only runs marked as twins. |
| Reconstruction for pre-2.1.299 sessions | No ground truth there at all. | Those runs get reconstruction labelled `inferred`, with the fidelity measured on 2.1.299+ attached as a number (DESIGN rule: inferred carries its fidelity). |
| One phase list | About 1,700 lines across seven phases, with nothing in between to show anyone. | Each phase ends in something playable on the site, not only in core. |

Threats carried into the preregistration:
- **T-R2-1 Circularity:** the rebuild and the truth come from one client-written file.
- **T-R2-2 One user, one machine:** every request-record session is Asmit's.
- **T-R2-3 Version drift:** the format may change after 2.1.316.
- **T-R2-4 Selection:** only sessions on 2.1.299 or later have truth.

## 3. Decisions

1. **R2 truth is the request records, digest-verified, calibrated once against L4** (ADR-026; EVAL_DESIGN R2 updated).
2. **R2 primary metric: digest-exact rate.** It is the share of recorded requests whose rebuilt body hashes to `requestDigest`, computed per session and averaged over sessions. Unit of analysis is the session (Rule 9).
   - Secondary: block-exact rate per category; measured-token share explained; uncategorised share.
   - n = every real session with request records frozen by the preregistration date.
3. **Token attribution by deltas only.** Any estimate is labelled `inferred`.
4. **The 11 categories by fixture-backed exact markers**, with `uncategorised` visible.
5. **Provenance: exact literals,** with the minimum length and exclusions preregistered and R5-validated. Copy never claims cause.
6. **Run Diff:** exact tool-sequence alignment, T3 stability from scripted perturbations, and twin runs for real data.
7. **The catalogue moves to 2.1.316** first. `tools-used` is set aside; the request-record types become parsed in P1.
   - `cost-state` is **not** metadata. It holds the client's own cumulative per-model usage and cost, so it becomes a new cross-check in P1 (our totals against the client's), not a set-aside type.
8. **Gate (unit 7)** recorded as passed on Asmit's statement, 2026-11-02.

## 4. Design — the assay of a request

The M3 identity stays (the bench, the hallmark, bone and near-black, vermilion only for capture failure). M4 adds three instruments, each from the assay and geology world the site already speaks.

Anthropic's own docs page "Explore the context window" (code.claude.com/docs/en/context-window) shows a *simulated* fill timeline. Ours must look and mean something different: **the recorded request, rebuilt and sealed.**

### 4.1 The Charge (Replay and Core): rebuilding a request until it seals
In fire assay the *charge* is everything loaded into the crucible.
- For the selected step, the request is drawn as a vertical stack of its real blocks, in API order: system, tools, then messages. Height is the measured token cost from deltas; a stippled height means inferred.
- **The play.** Press *rebuild* and the stack assembles block by block from the transcript lines that produced it. Each block shows its source line and byte range as it lands.
  - When the last block lands, core hashes the result. If it equals `requestDigest`, the hallmark-style **seal** strikes: "sealed · digest 7a12…dd".
  - If a block cannot be rebuilt, it stays an open frame where it belongs, and the seal does not strike.
  - The motion is honest: the seal is the actual hash comparison, not decoration.
- Colour is by category (11 plus uncategorised); a block's state is shown by its outline, never by its colour. The states are sealed (solid), rebuilt but unsealed (single line) and not rebuilt (dashed frame).

### 4.2 The Core, real at last: columns, unconformities, a scrubber
The Core becomes the session drawn as a row of request columns, like drill cores laid side by side in a core box.
- Bands are the 11 categories at measured heights, so you can see CLAUDE.md as a thin constant stratum while tool results thicken.
- A **compaction is an unconformity**: geology's term for a gap in the rock record, drawn as the wavy line geologists use. The columns after it start lower.
- Scrub along the box and the Charge follows. Click a band and every column highlights the same category.
- The comparison is by height on one 2D axis; depth encodes nothing (Rule 13).

### 4.3 Streak lines (provenance): the touchstone test
Assayers rub gold on a touchstone and read the streak.
- In Replay, each literal in a tool call (a path, a command, an id) is underlined.
- Hover or focus it and a thin dashed streak runs back to its earliest exact occurrence: an ochre `matched` edge, the only kind allowed.
- A literal with no earlier occurrence gets an **open ring**, not red, not an error, labelled "no earlier occurrence".
- The streak panel lists the literals with occurrence counts, like a mineral assemblage.
- Inspiration: Ted Nelson's visible transclusion links between parallel documents, and the read pile-up of a genome browser.

### 4.4 Twin lanes (Run Diff): synteny and a dotplot
From comparative genomics (JBrowse 2's linear synteny and dotplot views).
- Two runs are drawn as horizontal lanes, joined by ribbons wherever their tool sequences match exactly.
- The **first divergence** is where the ribbons stop: a cut mark, then both sides' Charge for that step, side by side.
- A **dotplot** gives the whole-run overview. The diagonal means identical; offsets mean shifted; scatter means divergence.
- Playable: drag either lane to re-anchor, and the ribbons recompute by exact match only.

### 4.5 Play
- **Seal it**: pick a step, predict whether it will seal, then rebuild. The punch card records seals you have watched strike and blocks that refused.
- **Streak hunt**: find an unsourced literal in a real run before the panel reveals the count.
- All of it is local, and nothing compares people.

### Rules carried forward
- Every visual is driven by a result field.
- Table mode and describe mode exist for the Charge, the Core box, the streaks and the lanes.
- Reduced motion means the seal appears without animation.
- Raw text on the site stays redacted by core; the Charge shows block categories, sizes and offsets, not prompt text, unless redacted.
- `web-check` gains a scan for system-prompt fragments and the user's email, which do appear in request records.

## 4a. Quality items from the side session (2026-11-02), triaged against the code and real bytes

| Item | Exists already? | Decision |
|---|---|---|
| 1 D-fork-dup | No. **No fork session exists on this machine**: no `isFork` meta file and no `fork-context-ref` record anywhere in `~/.claude/projects` or `corpus/`. The source is an issue read as a summary. | **Deferred** until a real fork session is captured. Building it from an issue description would be a detector with no real fixture. D2's cross-file message.id dedup already keeps an exact copy from counting twice; the fork case must be tested against it when it appears. ROADMAP Later. |
| 2a `assay catalogue check` | No | **P1.** Exits non-zero on a version outside the importer's range. |
| 2b unknown-key census | Partly: unknown types are kept and flagged | **P1.** Per version, the record types and field names; diffed against the previous version into `results/catalogue/<version>.json`. |
| 2c changelog watcher | No | **Later**, off by default (network, human review). |
| 2d canary per version | No | **P1, local only.** A real session cannot go into the repo (Rule 8), so the canary is the importer-output hash of a frozen corpus file, checked when the corpus is present and skipped visibly when not. |
| 3 capture-quality counters | Orphan parent = D3; subagent expected vs read = D1; unknown type count = catalogue | **P1:** duplicate uuid, duplicate requestId across files, sessionId mismatch (flag, never rewrite), non-monotonic timestamps within a parent chain. Each carries a false-positive line. |
| 4 three usage numbers | Partly: the D6 range, D2 dedup, OTel-only tokens | **P3:** `as_written`, `deduped` and `unattributed` (OTel-only) shown together on the certificate and in the Core. |
| 5 cross-channel check | Mostly (ADR-025: matched, OTel-only, transcript-only) | **P1:** add the first disagreement linked to raw bytes on both sides. |
| 6 reconstruction ledger | No | **P2.** Every request field gets a status (`captured_exact`, `captured_derived`, `version_dependent`, `not_captured`) with its reason. The calibration fixes the first entries: billing header `not_captured`; cache markers `captured_derived`; client-filled tool defaults `version_dependent`; side calls `not_captured`. |

Each item that changes a published number gets an ADR, a CHANGES.md line and a notebook entry.

## 5. Phases (each ends playable)

| Phase | What | Size | Ends with |
|---|---|---|---|
| P0 | This plan; ADR-026; EVAL_DESIGN R2; R2 preregistration; catalogue to 2.1.316; gate recorded | docs, ~30 code | plan approved |
| P1 | Request-record importer: shapes, blobs, chain, digest check; `RequestRecord` with offsets; tests from the corpus findings. Plus the quality items: catalogue check, census, local canary, the four new counters, cross-channel first disagreement (§4a) | ~250 + ~300 | the CLI prints sealed / unsealed per request; `assay catalogue check` |
| P2 | Reconstruction of missing messages from lines (tool results plus merged attachments); R2 scorer; `results/R2-*.json` | ~300 | the R2 number; the Charge with the seal on the site |
| P3 | Delta token attribution; 11-category markers; `spine.context` | ~250 | the Core box with real bands and unconformities |
| P4 | Provenance literals; `spine.provenance`; R5 validation | ~250 | streak lines in Replay |
| P5 | T3 perturbation set; twin-run protocol; full Run Diff | ~250 | twin lanes and dotplot |
| P6 | L4 calibration (needs your one session); R4 audit sheet; notebook; ROADMAP | docs | M4 exit |

## 6. Needs Asmit
1. ~~One L4 calibration session~~ Done 2026-11-02 (§1a). A second on a later version would test T-R2-3.
2. Two twin runs (the same prompt twice) when convenient, for the real Diff.
3. R4 audit passes, at least 7 days apart.
