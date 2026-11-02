# assay

**Can you trust this coding-agent telemetry, and what does it fail to tell you?**

assay reads Claude Code sessions and answers that before it answers anything else. Every run gets:
- **a Capture Level:** L1 transcript, L2 hooks, L3 OTel, L4 raw API bodies, stated before any number;
- **a truth label:** `real`, `real-perturbed` or `scripted`;
- **detectors** that check the data against itself, with every finding pointing at the exact bytes it came from.

Then it rebuilds what the model was actually sent, proves the rebuild against the transcript's own hashes, and traces where each tool-call literal first appeared.

It runs locally. Your sessions never leave your machine.

## Try it
```bash
pnpm install
pnpm --filter @assay/core build && pnpm --filter @assay/cli build
node packages/assay-cli/dist/cli.js check ~/.claude/projects/<project>/<session>.jsonl
```
The first line is always the Capture Level:
```
capture   L1 of L4 · truth real · claude-code 2.1.316 (checked, importer 2.1.165–2.1.316)
overall   usable-with-caveats
requests  7 recorded · sealed 7 (blobs alone 2, lines alone 0) · broken 0 · unresolved 0
```

## Commands
| | |
|---|---|
| `assay check <session> [--otlp f] [--json]` | One card: Capture Level, verdicts, fineness, seals, findings with line numbers |
| `assay assert <session> --rules rules.json` | Rule gate for CI (see `assay.rules.example.json`); exit 0 ok, 1 rule failed, 2 do-not-trust |
| `assay requests <session>` | Seal of every request record: sealed, broken, unresolved |
| `assay catalogue check` | Every Claude Code version on this machine against the importer's support, and record formats first seen at each |
| `assay corpus add\|audit\|stats` | Freeze finished sessions read-only, with checksums |
| `assay export-site …` / `pnpm web` | Build the local explorer (`web/prototype/`) |
| `pnpm results` | Regenerate every result from your local corpus, then check every claim |

**CI.** `uses: <owner>/assay@<ref>` with `paths:` and `rules:` runs `assay assert` (see `action.yml`).

## What we found (one user, one machine)
- On Claude Code 2.1.299+, the transcript's own request records let assay prove **99.7%** of held-out requests exact [r2-combined]. From the visible transcript lines alone the rate is **0%** [r2-primary], because opening requests carry tool definitions no line contains.
- Tool-call provenance from the requests agrees with an independent raw-file search **97.4%** of the time [p4-agree]. The transcript holds text the model never received, so raw-file search over-claims.
- Raw-body capture (L4) is not a superset of the transcript. It sees subagent and side calls the transcript never records [l4b-subagent-unpaired], but its logger redacts [l4a-redacted].
- Run Diff alignment is stable under 60 of 60 benign perturbations [t3-stable].

Read `docs/REPORT.md` before quoting any of these: threats, version range and the one-user limit are there. Every bracketed id is a row in `docs/CLAIMS.md`, and `pnpm claims` checks it against its artifact.

## Privacy
- Sessions, OTel captures and raw bodies stay in `corpus/` and `results/`, both gitignored.
- The explorer shows only data redacted by core: paths are reduced to file names, and free text becomes length markers.
- The optional judge (`scripts/j1.mjs`) sees only redacted input, reads API keys from the environment, and is off by default.

## Status
M0–M4 are built. M5 (ship) is in progress: see `docs/ROADMAP.md`. Design rules are in `CLAUDE.md`, decisions in `docs/DECISIONS.md`.

## License
MIT. TRAIL, used for judge calibration, is a separate gated dataset; it is not included here and must not be reshared.
