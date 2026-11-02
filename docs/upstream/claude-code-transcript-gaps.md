# DRAFT: issue for anthropics/claude-code (not posted; Asmit posts if he wants)

**Title:** Transcript request records: subagent and side-call requests are not recorded, and tool inputs can differ from what was sent

**Version:** 2.1.316 (also seen on 2.1.301–2.1.309), Windows 11.

**What happens.** Since 2.1.299 the session JSONL stores each SDK request as `api-request` / `api-request-shape` / `api-request-blob` records, whose hashes reproduce, so they work as an exact local record of what was sent. Compared with `OTEL_LOG_RAW_API_BODIES` on the same sessions, three gaps:
1. **Subagent requests have no records.** An Explore subagent made 3 requests, all present in the raw bodies; its `subagents/agent-*.jsonl` contains no `api-request` records.
2. **Side calls have no records.** `generate_session_title` and `prompt_suggestion` requests appear in raw bodies and OTel, never in the transcript.
3. **Tool inputs in the record can differ from the wire,** in both directions:
   - one session's record holds `cd <cwd> && <command>` where the wire re-sent `<command>`;
   - another's wire carries a filled-in default (`"replace_all": false`) that the record lacks.

**Why it matters.** Anyone accounting tokens, cost or context from the transcript undercounts subagent and side-call usage, and cannot tell which tool input the model actually saw on later turns.

**Ask.**
- Write request records for subagent and side-call requests, or state that they are excluded.
- Record tool inputs exactly as re-sent, or mark the rewritten ones.

**Evidence.** Counts from a local calibration (no transcripts attached; they contain private content). Method: `scripts/l4-calibrate.mjs` in assay.
