# OTel setup guide — R1 smoke test

Covers: how to enable Claude Code's beta tracing, which environment variables to set, what each flag captures, and how to verify the output. Follow this before running R1 (dual-capture session).

## Prerequisites

Claude Code ≥ 2.1.101 (tracing first shipped). Prefer ≥ 2.1.208 (effort level recorded) and ≥ 2.1.274 (raw API bodies to file). Check with `claude --version`.

You need an OTLP collector. The simplest is a local `collector.yaml` writing to files:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
exporters:
  file:
    path: ./otel-output.jsonl
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [file]
    logs:
      receivers: [otlp]
      exporters: [file]
```

Start collector: `otelcol --config collector.yaml`

If you don't have `otelcol`: `pip install opentelemetry-collector-contrib` or use the Docker image `otel/opentelemetry-collector-contrib:latest`.

## Required environment variables

```bash
# Enable beta tracing (required)
export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1

# Point at your local collector
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc

# Optional: service name for the trace (shows up in spans)
export OTEL_SERVICE_NAME=assay-r1-test
```

## Content flags (all default OFF — choose deliberately)

| Flag | What it captures | Privacy risk | R1 recommendation |
|---|---|---|---|
| `OTEL_LOG_USER_PROMPTS=1` | Your typed messages to Claude | High (user text) | Enable for R1; keep off in prod |
| `OTEL_LOG_ASSISTANT_RESPONSES=1` | Claude's replies | High | Enable for R1 |
| `OTEL_LOG_TOOL_DETAILS=1` | Tool names, arguments, results | Medium | Enable for R1 |
| `OTEL_LOG_TOOL_CONTENT=1` | Full tool result content | High (file content) | Enable for R1 |
| `OTEL_LOG_MANAGED_SETTINGS=1` | Settings/config | Low | Optional |
| `OTEL_LOG_RAW_API_BODIES=file:/path/to/dir` | Raw HTTP request/response bodies | Very high | R1: use a dedicated dir; never commit |

Content is **truncated** at `CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH` (default 61440 bytes). Set higher if you need full content:

```bash
export CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH=1048576  # 1 MB
```

## Full R1 command block

```bash
export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_SERVICE_NAME=assay-r1-test
export OTEL_LOG_USER_PROMPTS=1
export OTEL_LOG_ASSISTANT_RESPONSES=1
export OTEL_LOG_TOOL_DETAILS=1
export OTEL_LOG_TOOL_CONTENT=1
# Raw bodies: point to an empty dir you control, never in the repo
export OTEL_LOG_RAW_API_BODIES=file:/path/to/raw-bodies/

claude  # or claude -p "your task"
```

Run a short but realistic task (≥5 tool calls, ideally with one file write, one read, one bash command). Stop the session. Then compare:

1. `~/.claude/projects/<project>/<session-uuid>.jsonl` — the JSONL transcript (L1)
2. Your collector's output file — OTel spans/logs (L3)
3. The raw-bodies directory — per-request JSON files (L4)

## What to look for

- Every `api-request` line in the JSONL should have a corresponding `claude_code.llm_request` span in OTel with matching `session.id` and `request_id`.
- Token counts should agree between JSONL `message.usage` and OTel `claude_code.token.usage` metric.
- If there are discrepancies, record them in the notebook — that's D8 (cross-channel disagreement).
- `gen_ai.conversation.compacted` boolean on inference spans indicates a compaction occurred. Compare against `isCompactSummary` lines in the JSONL.

## Capture Level after R1

| Channel | Flag | Level |
|---|---|---|
| JSONL transcript | always | L1 |
| Hook events | (not set here) | — |
| OTel spans/logs | `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` | L3 |
| Raw API bodies | `OTEL_LOG_RAW_API_BODIES` | L4 |

A session with JSONL + OTel + raw bodies is **Capture Level L4** — the highest available without a network proxy.

## Known issues / version notes

- **2.1.307**: subagent transcripts previously recorded placeholder usage; upgrade before R1 for accurate subagent metrics.
- **2.1.309**: some sessions produced jq-unparseable transcripts; upgrade before R1.
- **2.1.300+**: transcripts also record system prompt and tools in `api-request` lines; useful for R2.
- **E--RL (Desktop 2.1.165–2.1.299)**: no `api-request` lines emitted; may be version- or entrypoint-specific.

## Privacy reminder

Rule 8: corpus and traces stay local; paste packs and posts never contain raw traces; secrets never in the repo. The raw-bodies directory must be outside the project and listed in `.gitignore`. Never commit any OTel output or raw-body files.
