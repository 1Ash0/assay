# DRAFT: proposal for open-telemetry/semantic-conventions (GenAI); not posted

**Title:** GenAI agent spans: link a request to its parent agent request, mark side calls, and represent context compaction

**Context.** Measuring a coding agent from OTel needs three things the current GenAI conventions (status Development) do not name. Observed with Claude Code 2.1.316 beta tracing against its own transcripts and raw request bodies:
1. **Subagent requests.** A subagent's model calls should carry an attribute linking them to the parent agent request that spawned them (for example `gen_ai.agent.parent_request.id`), so totals can be rolled up without reading vendor files.
2. **Side calls.** Requests made by the harness, not the agent loop (titles, suggestions, classifiers), should be marked (for example `gen_ai.request.purpose`), so they can be counted or excluded on purpose. Today they are distinguishable only by a vendor `query_source` value.
3. **Compaction.** When the context is summarised and replaced, an event should record it (tokens before and after, summary size), because token curves otherwise show an unexplained drop.

**Evidence.** The assay findings report (`docs/REPORT.md`), sections 2 and 5. Aggregate counts only.
