# 2026-10-31 — R1 smoke test results

Truth level: `real` (live session capture). Source: user-run test per `docs/otel-setup.md`.

## Collector

- Version: otelcol 0.164.0
- Endpoint: 127.0.0.1:4317 (local, grpc)
- Status: PASS

## Results

| Check | Level | Result |
|---|---|---|
| Prompt event observed | L3 (OTel) | PASS |
| Assistant response event observed | L3 (OTel) | PASS |
| API request telemetry observed | L3 (OTel) | PASS |
| Request artifact created | L4 (raw body) | PASS |
| Response artifact created | L4 (raw body) | PASS |
| Index metadata verified | L4 (raw body) | PASS |
| Exact raw-body correspondence | L4 (raw body) | NOT INDEPENDENTLY VERIFIED |
| Unique test phrase in telemetry | L1 crosscheck | PASS |
| Displayed response matched expected | L1 crosscheck | PASS |

## Capture Level achieved

**L4** — JSONL transcript (L1) + OTel spans/logs (L3) + raw API body artifacts (L4). Hook events (L2) not stated; treat as L3/L4 without L2.

## Open item

"Exact raw-body correspondence: NOT INDEPENDENTLY VERIFIED" — the raw body files exist and are indexed, but we have not yet confirmed that their content byte-for-byte matches the API request/response observed in the OTel spans. This is the R1 secondary metric (requestRef resolution). Record for R1-v2.

## Security note

Raw telemetry and body files may contain sensitive information (prompts, responses, file content). Kept local per Rule 8. Not committed to repo.
