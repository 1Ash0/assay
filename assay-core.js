"use strict";
var AssayCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/assay-core/src/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    align: () => align,
    buildRunView: () => buildRunView,
    importFromFiles: () => importFromFiles,
    runHealth: () => runHealth,
    stepKey: () => stepKey
  });

  // packages/assay-core/src/importers/claude-code-jsonl/derive.ts
  function deriveEntities(events) {
    const toolCalls = [];
    const toolResults = [];
    const messagesByMsgId = /* @__PURE__ */ new Map();
    const llmRequestsByMsgId = /* @__PURE__ */ new Map();
    const agents = /* @__PURE__ */ new Map();
    const compactions = [];
    const skills = [];
    const edges = [];
    let turnIndex = 0;
    const seenMsgIds = /* @__PURE__ */ new Set();
    const seenToolIds = /* @__PURE__ */ new Set();
    for (const ev of events) {
      const obj = ev.raw;
      const evOffset = ev.offset;
      if (ev.kind === "summary") {
        const summarizedUuids = obj["summarizedTurnPromptUuids"];
        compactions.push({
          evidence: [evOffset],
          turnIndex,
          summaryOffset: evOffset,
          summarizedTurnUuids: Array.isArray(summarizedUuids) ? summarizedUuids.filter((u) => typeof u === "string") : void 0
        });
        continue;
      }
      if (ev.kind !== "user" && ev.kind !== "assistant") continue;
      const sidechain = obj["isSidechain"] === true;
      const messageId = typeof obj["message"] === "object" && obj["message"] !== null ? obj["message"]["id"] : void 0;
      const msgId = messageId ?? ev.id;
      if (!messagesByMsgId.has(msgId)) {
        messagesByMsgId.set(msgId, {
          evidence: [evOffset],
          id: msgId,
          role: ev.kind,
          agentId: ev.agentId,
          sessionId: ev.sessionId,
          parentId: ev.parentId,
          ts: ev.ts
        });
        if (ev.parentId) {
          edges.push({ kind: "observed", fromId: ev.parentId, toId: msgId, evidence: [evOffset] });
        }
      }
      if (ev.kind === "assistant") {
        const msg = typeof obj["message"] === "object" && obj["message"] !== null ? obj["message"] : null;
        if (msg) {
          const usage = extractUsage(msg);
          if (usage) {
            const existing = llmRequestsByMsgId.get(msgId);
            const existingTotal = existing ? existing.usage.inputTokens + existing.usage.outputTokens : -1;
            const newTotal = usage.inputTokens + usage.outputTokens;
            if (newTotal > existingTotal) {
              llmRequestsByMsgId.set(msgId, {
                evidence: [evOffset],
                messageId: msgId,
                usage,
                requestRef: typeof obj["requestId"] === "string" ? obj["requestId"] : void 0
              });
            }
          }
        }
      }
      if (ev.kind === "assistant" && !seenMsgIds.has(msgId)) {
        seenMsgIds.add(msgId);
        if (!sidechain) turnIndex++;
      }
      if (ev.kind === "assistant") {
        const msg = typeof obj["message"] === "object" && obj["message"] !== null ? obj["message"] : null;
        if (msg) {
          const content = msg["content"];
          if (Array.isArray(content)) {
            for (const block of content) {
              if (typeof block === "object" && block !== null && block["type"] === "tool_use") {
                const b = block;
                const toolId = typeof b["id"] === "string" ? b["id"] : `tool:${ev.id}`;
                if (seenToolIds.has(toolId)) continue;
                seenToolIds.add(toolId);
                toolCalls.push({
                  evidence: [evOffset],
                  id: toolId,
                  name: typeof b["name"] === "string" ? b["name"] : "unknown",
                  messageId: msgId,
                  agentId: ev.agentId
                });
                edges.push({ kind: "observed", fromId: msgId, toId: toolId, evidence: [evOffset] });
                if (typeof b["name"] === "string" && b["name"] === "Skill") {
                  const input = b["input"];
                  const skillName = input && typeof input["skill"] === "string" ? input["skill"] : "unknown";
                  skills.push({
                    evidence: [evOffset],
                    name: skillName,
                    trigger: msgId
                  });
                }
              }
            }
          }
        }
      }
      if (ev.kind === "user") {
        if (!seenMsgIds.has(msgId)) {
          seenMsgIds.add(msgId);
          const msg = typeof obj["message"] === "object" && obj["message"] !== null ? obj["message"] : null;
          const content = msg?.["content"];
          if (Array.isArray(content)) {
            for (const block of content) {
              if (typeof block === "object" && block !== null && block["type"] === "tool_result") {
                const b = block;
                const toolUseId = typeof b["tool_use_id"] === "string" ? b["tool_use_id"] : "";
                if (!toolUseId) continue;
                toolResults.push({
                  evidence: [evOffset],
                  toolUseId,
                  messageId: msgId,
                  isError: b["is_error"] === true
                });
                edges.push({ kind: "observed", fromId: msgId, toId: toolUseId, evidence: [evOffset] });
              }
            }
          }
        }
        const tur = obj["toolUseResult"];
        const refId = tur && typeof tur["agentId"] === "string" ? tur["agentId"] : void 0;
        if (refId && !agents.has(refId)) {
          agents.set(refId, { evidence: [evOffset], agentId: refId, parentAgentId: ev.agentId, type: "subagent" });
        }
        if (ev.agentId && !agents.has(ev.agentId)) {
          agents.set(ev.agentId, {
            evidence: [evOffset],
            agentId: ev.agentId,
            parentAgentId: void 0,
            type: "subagent"
          });
        }
      }
    }
    return {
      messages: Array.from(messagesByMsgId.values()),
      toolCalls,
      toolResults,
      llmRequests: Array.from(llmRequestsByMsgId.values()),
      agents: Array.from(agents.values()),
      compactions,
      skills,
      edges
    };
  }
  function extractUsage(msg) {
    const u = msg["usage"];
    if (typeof u !== "object" || u === null) return null;
    const usage = u;
    return {
      inputTokens: num(usage["input_tokens"]),
      outputTokens: num(usage["output_tokens"]),
      cacheReadTokens: num(usage["cache_read_input_tokens"]),
      cacheWriteTokens: num(usage["cache_creation_input_tokens"])
    };
  }
  function num(v) {
    return typeof v === "number" ? v : 0;
  }

  // packages/assay-core/src/importers/claude-code-jsonl/catalogue.ts
  var SET_ASIDE_TYPES = /* @__PURE__ */ new Set([
    "attachment",
    "last-prompt",
    "mode",
    "permission-mode",
    "custom-title",
    "ai-title",
    "agent-name",
    "queue-operation",
    "bridge-session",
    "frame-link",
    "file-history-delta",
    "file-history-snapshot",
    "tools-used"
    // running list of tool names; no usage (2.1.316)
  ]);

  // packages/assay-core/src/importers/claude-code-jsonl/sha256.ts
  var K = new Uint32Array([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  function sha256Hex(data) {
    const h = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
    const len = data.length;
    const padded = new Uint8Array(len + 9 + 63 >> 6 << 6);
    padded.set(data);
    padded[len] = 128;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(len / 536870912));
    view.setUint32(padded.length - 4, len << 3 >>> 0);
    const w = new Uint32Array(64);
    const rotr = (x, n) => x >>> n | x << 32 - n;
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a2 = w[i - 15], b2 = w[i - 2];
        const s0 = rotr(a2, 7) ^ rotr(a2, 18) ^ a2 >>> 3;
        const s1 = rotr(b2, 17) ^ rotr(b2, 19) ^ b2 >>> 10;
        w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + (e & f ^ ~e & g) + K[i] + w[i] >>> 0;
        const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
        hh = g;
        g = f;
        f = e;
        e = d + t1 >>> 0;
        d = c;
        c = b;
        b = a;
        a = t1 + t2 >>> 0;
      }
      const out = [a, b, c, d, e, f, g, hh];
      for (let i = 0; i < 8; i++) h[i] = h[i] + out[i] >>> 0;
    }
    return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
  }

  // packages/assay-core/src/importers/claude-code-jsonl/parse.ts
  var KNOWN_TYPES = /* @__PURE__ */ new Set(["user", "assistant", "system", "summary"]);
  var PARSED_METADATA_TYPES = /* @__PURE__ */ new Set([
    "cost-state"
    // runtime cost/usage accounting (v2.1.308+)
  ]);
  var decoder = new TextDecoder("utf-8");
  function parseJsonlBytes(filePath, raw) {
    const sha256 = sha256Hex(raw);
    const bytes = raw.length;
    const events = [];
    const unknowns = [];
    const costStates = [];
    let apiRequestCount = 0;
    let lineNum = 0;
    let lineStart = 0;
    while (lineStart <= bytes) {
      let nl = raw.indexOf(10, lineStart);
      if (nl === -1) nl = bytes;
      const lineEnd = nl;
      const lineText = decoder.decode(raw.subarray(lineStart, lineEnd));
      const next = nl + 1;
      const advance = () => {
        lineNum++;
        lineStart = next;
      };
      const trimmed = lineText.trim();
      if (!trimmed) {
        advance();
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        unknowns.push({
          offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
          reason: "json-parse-error",
          raw: lineText
        });
        advance();
        continue;
      }
      if (typeof parsed !== "object" || parsed === null) {
        unknowns.push({
          offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
          reason: "not-an-object",
          raw: lineText
        });
        advance();
        continue;
      }
      const obj = parsed;
      const type = obj["type"];
      if (typeof type !== "string" || !KNOWN_TYPES.has(type)) {
        if (type === "cost-state") {
          const mu = obj["modelUsage"];
          if (typeof mu === "object" && mu !== null) {
            const modelUsage = {};
            for (const [model, entry] of Object.entries(mu)) {
              if (typeof entry === "object" && entry !== null) {
                const e = entry;
                modelUsage[model] = {
                  inputTokens: num2(e["inputTokens"]),
                  outputTokens: num2(e["outputTokens"]),
                  thinkingTokens: num2(e["thinkingTokens"]),
                  cacheReadInputTokens: num2(e["cacheReadInputTokens"]),
                  cacheCreationInputTokens: num2(e["cacheCreationInputTokens"]),
                  costUSD: typeof e["costUSD"] === "number" ? e["costUSD"] : 0
                };
              }
            }
            costStates.push({
              totalCostUSD: typeof obj["totalCostUSD"] === "number" ? obj["totalCostUSD"] : 0,
              totalAPIDurationMs: num2(obj["totalAPIDuration"]),
              hasUnknownModelCost: obj["hasUnknownModelCost"] === true,
              modelUsage,
              sourceLine: lineNum,
              sourceFile: filePath,
              byteStart: lineStart,
              byteEnd: lineEnd
            });
          }
        } else if (type === "api-request") {
          apiRequestCount++;
        }
        if (typeof type !== "string" || !PARSED_METADATA_TYPES.has(type)) {
          unknowns.push({
            offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
            reason: `unknown-type:${String(type ?? "missing")}`,
            raw: lineText,
            ...typeof type === "string" && SET_ASIDE_TYPES.has(type) ? { catalogued: true } : {}
          });
        }
        advance();
        continue;
      }
      const id = typeof obj["uuid"] === "string" ? obj["uuid"] : `${filePath}:${lineNum}`;
      const kind = type === "summary" || type === "user" && obj["isCompactSummary"] === true ? "summary" : type;
      events.push({
        id,
        sourceFile: filePath,
        offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
        ts: typeof obj["timestamp"] === "string" ? Date.parse(obj["timestamp"]) : void 0,
        kind,
        parentId: typeof obj["parentUuid"] === "string" ? obj["parentUuid"] : void 0,
        agentId: typeof obj["agentId"] === "string" ? obj["agentId"] : void 0,
        sessionId: typeof obj["sessionId"] === "string" ? obj["sessionId"] : void 0,
        raw: obj
      });
      advance();
    }
    return { path: filePath, sha256, bytes, lines: lineNum, events, unknowns, costStates, apiRequestCount };
  }
  function makeOffset(file, line, byteStart, byteEnd) {
    return { file, line, byteStart, byteEnd };
  }
  function num2(v) {
    return typeof v === "number" ? v : 0;
  }

  // packages/assay-core/src/reconstruct/categories.ts
  var CATEGORIES = [
    "System",
    "CLAUDE.md",
    "Memory",
    "Skills",
    "MCP",
    "Rules",
    "You",
    "Files",
    "Output",
    "Claude",
    "Hooks",
    "uncategorised"
  ];
  var NOT_SEPARABLE = {
    Memory: "sent inside the CLAUDE.md instructions block; counted there",
    Rules: "no rules block seen in the corpus; no marker"
  };
  var MARKERS = [
    ["Codebase and user instructions are shown below", "CLAUDE.md"],
    ["Instruction files were re-read", "CLAUDE.md"],
    ["The following skills are available", "Skills"],
    ["The following skills were invoked", "Skills"],
    ["# MCP Server Instructions", "MCP"],
    ["The following MCP servers", "MCP"],
    ["The following deferred tools", "MCP"],
    ["The following tools just became available", "MCP"],
    ["SessionStart hook additional context", "Hooks"],
    ["PostToolUse:", "Hooks"],
    ["PreToolUse:", "Hooks"],
    ["Called the Read tool with the following input", "Files"],
    ["Result of calling the Read tool", "Files"],
    ["# Environment", "System"],
    ["Today's date is", "System"],
    ["The date has changed", "System"],
    ["You are powered by the model named", "System"],
    ["## Auto Mode Active", "System"],
    ["<total_tokens>", "System"],
    ["The task tools haven", "System"],
    ["The user hasn't heard from you", "System"],
    ["Attribution for git commits", "System"],
    ["As you answer the user's questions", "System"],
    ["Available agent types for the Agent tool", "System"],
    ["[SYSTEM NOTIFICATION", "System"],
    ["<artifact-view-context", "System"],
    // The compaction summary is model-written history carried forward.
    ["This session is being continued from a previous conversation", "Claude"],
    // A slash command or skill invocation, and the skill text it loads.
    ["<command-message>", "Skills"],
    ["<command-name>", "Skills"],
    ["Base directory for this skill", "Skills"]
  ];
  var DEFERRED = /^\d+ deferred tools? (are|is) /;
  function categoryOfText(text, role) {
    const t = text.startsWith("<system-reminder>\n") ? text.slice("<system-reminder>\n".length) : text;
    for (const [m, c] of MARKERS) if (t.startsWith(m)) return c;
    if (DEFERRED.test(t)) return "MCP";
    if (/^`\/[\w:-]+` was invoked/.test(t)) return "Skills";
    if (/^Note: .* (was read before|changed on disk)/.test(t)) return "Files";
    if (role === "user" && !text.startsWith("<system-reminder>")) return "You";
    return "uncategorised";
  }
  var size = (v) => JSON.stringify(v).length;
  function compose(system, tools, messages) {
    const acc = /* @__PURE__ */ new Map();
    const add = (c, v) => {
      const p = acc.get(c) ?? { category: c, chars: 0, blocks: 0 };
      p.chars += size(v);
      p.blocks++;
      acc.set(c, p);
    };
    for (const b of Array.isArray(system) ? system : []) {
      add(typeof b["text"] === "string" && categoryOfText(b["text"], "system") !== "uncategorised" ? categoryOfText(b["text"], "system") : "System", b);
    }
    for (const t of Array.isArray(tools) ? tools : []) add(String(t["name"] ?? "").startsWith("mcp__") ? "MCP" : "System", t);
    for (const p of messageParts(messages)) {
      const q = acc.get(p.category) ?? { category: p.category, chars: 0, blocks: 0 };
      q.chars += p.chars;
      q.blocks += p.blocks;
      acc.set(p.category, q);
    }
    return CATEGORIES.filter((c) => acc.has(c)).map((c) => acc.get(c));
  }
  function messageParts(messages, toolNames = toolNamesOf(messages)) {
    const out = [];
    for (const m of messages) {
      const role = m["role"];
      const content = Array.isArray(m["content"]) ? m["content"] : [{ type: "text", text: m["content"] }];
      for (const b of content) {
        let c;
        if (role === "assistant") c = "Claude";
        else if (b["type"] === "tool_result") c = toolNames.get(String(b["tool_use_id"])) === "Read" ? "Files" : "Output";
        else if (b["type"] === "tool_addition") c = String(b["tool"]?.["name"] ?? b["tool"]?.["definition"]?.["name"] ?? "").startsWith("mcp__") ? "MCP" : "System";
        else if (b["type"] === "text" && typeof b["text"] === "string") c = categoryOfText(b["text"], role === "system" ? "system" : "user");
        else if (b["type"] === "image") c = role === "user" ? "You" : "uncategorised";
        else c = "uncategorised";
        out.push({ category: c, chars: size(b), blocks: 1 });
      }
    }
    return out;
  }
  function toolNamesOf(messages) {
    const names = /* @__PURE__ */ new Map();
    for (const m of messages) {
      if (m["role"] !== "assistant" || !Array.isArray(m["content"])) continue;
      for (const b of m["content"]) if (b["type"] === "tool_use") names.set(String(b["id"]), String(b["name"]));
    }
    return names;
  }

  // packages/assay-core/src/reconstruct/provenance.ts
  var MIN_LITERAL = 8;
  var PATH_LIKE = /(?:[A-Za-z]:[\\/]|\/)?(?:[\w.-]+[\\/])+[\w.-]+/g;
  function extractLiterals(input) {
    const out = /* @__PURE__ */ new Set();
    const walk = (v, key) => {
      if (typeof v === "string") {
        if (key === "description") return;
        if (v.length >= MIN_LITERAL && !v.includes("\n") && !/^\d+(\.\d+)?$/.test(v)) out.add(v);
        for (const m of v.match(PATH_LIKE) ?? []) if (m.length >= MIN_LITERAL) out.add(m);
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk(input, null);
    return [...out];
  }
  function textOf(b) {
    const parts2 = [];
    const walk = (v) => {
      if (typeof v === "string") parts2.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(b);
    return parts2.join("\n");
  }
  function locate(literals, system, tools, messages) {
    const segments = [];
    (Array.isArray(system) ? system : []).forEach((b, i) => segments.push({ where: { part: "system", index: i, block: 0 }, text: textOf(b) }));
    (Array.isArray(tools) ? tools : []).forEach((t, i) => segments.push({ where: { part: "tools", index: i, block: 0 }, text: textOf(t) }));
    messages.forEach((m, i) => {
      const content = Array.isArray(m["content"]) ? m["content"] : [{ type: "text", text: m["content"] }];
      content.forEach((b, j) => segments.push({ where: { part: "message", index: i, block: j }, text: textOf(b) }));
    });
    return literals.map((text) => ({ text, at: segments.find((s) => s.text.includes(text))?.where ?? null }));
  }
  function provenanceFromLines(calls, texts) {
    const byFile = /* @__PURE__ */ new Map();
    for (const t of texts) {
      const l = byFile.get(t.file) ?? [];
      l.push(t);
      byFile.set(t.file, l);
    }
    for (const l of byFile.values()) l.sort((a, b) => a.line - b.line);
    return calls.map((c) => {
      const prior = (byFile.get(c.file) ?? []).filter((t) => t.line < c.line);
      const literals = extractLiterals(c.input).map((text) => {
        const hit2 = prior.find((t) => t.text.includes(text));
        return { text, at: hit2 ? { part: "message", index: hit2.line, block: 0 } : null };
      });
      const first = literals.find((l) => l.at)?.at?.index ?? null;
      return { toolUseId: c.id, source: "l1-lines", literals, line: first };
    });
  }

  // packages/assay-core/src/reconstruct/rebuild.ts
  var blocksOf = (content) => Array.isArray(content) ? content : [{ type: "text", text: content }];
  var msgOf = (l) => l.raw["message"];
  var rendered = (l) => Array.isArray(l.raw["rendered"]) ? l.raw["rendered"].map((r) => r.content).filter((c) => typeof c === "string") : [];
  var clone = (v) => JSON.parse(JSON.stringify(v));
  var noCaller = (blocks) => blocks.map((b) => {
    if (b["type"] !== "tool_use" || !("caller" in b)) return b;
    const { caller: _caller, ...rest } = b;
    return rest;
  });
  function candidates(lines) {
    const out = [];
    const groups = /* @__PURE__ */ new Map();
    for (const l of lines) {
      if (l.raw["type"] !== "assistant") continue;
      const id = msgOf(l)?.["id"];
      if (typeof id !== "string") continue;
      const g = groups.get(id) ?? [];
      g.push(l);
      groups.set(id, g);
    }
    for (const g of groups.values()) {
      const from = g.map((l) => l.offset);
      const joined = g.flatMap((l) => blocksOf(msgOf(l)["content"]));
      const wire = g.flatMap((l) => {
        const inputs = l.raw["wireToolInputs"];
        return blocksOf(msgOf(l)["content"]).map((b) => b["type"] === "tool_use" && inputs && typeof b["id"] === "string" && b["id"] in inputs ? { ...b, input: inputs[b["id"]] } : b);
      });
      out.push(
        { message: { role: "assistant", content: joined }, rule: "assistant-joined", from },
        { message: { role: "assistant", content: wire }, rule: "assistant-wire-inputs", from },
        { message: { role: "assistant", content: noCaller(joined) }, rule: "assistant-joined-no-caller", from },
        { message: { role: "assistant", content: noCaller(wire) }, rule: "assistant-wire-no-caller", from }
      );
    }
    for (const l of lines) {
      if (l.raw["type"] !== "attachment" || l.raw["renderedRole"] !== "system") continue;
      for (const text of rendered(l)) {
        const bare = /^<system-reminder>\n([\s\S]*)\n<\/system-reminder>$/.exec(text)?.[1];
        out.push({ message: { role: "system", content: text }, rule: "system-attachment", from: [l.offset] });
        if (bare !== void 0) out.push({ message: { role: "system", content: bare }, rule: "system-attachment-unwrapped", from: [l.offset] });
      }
    }
    let seg = [];
    const flush = () => {
      const users = seg.filter((l) => l.raw["type"] === "user" && msgOf(l));
      if (users.length > 0) userCandidates(users, seg, out);
      seg = [];
    };
    for (const l of lines) {
      if (l.raw["type"] === "assistant") flush();
      else seg.push(l);
    }
    flush();
    return out;
  }
  function userCandidates(users, seg, out) {
    const from = users.map((l) => l.offset);
    const content = users.flatMap((l) => blocksOf(msgOf(l)["content"]));
    out.push({ message: { role: "user", content }, rule: "user-joined", from });
    for (const l of users) out.push({ message: { role: "user", content: blocksOf(msgOf(l)["content"]) }, rule: "user-single", from: [l.offset] });
    if (!content.some((b) => b["type"] === "tool_result")) {
      const attLines = seg.filter((l) => l.raw["type"] === "attachment" && rendered(l).length);
      const texts = attLines.flatMap(rendered);
      if (texts.length) {
        for (const nl of [false, true]) {
          const blocks = texts.map((t) => ({ type: "text", text: nl ? `${t}
` : t }));
          out.push({
            message: { role: "user", content: [...blocks, ...clone(content)] },
            rule: `human-turn+attachments-first${nl ? "+nl" : ""}`,
            from: [...attLines.map((l) => l.offset), ...from]
          });
        }
      }
    }
    const sysLines = seg.filter((l) => l.raw["type"] === "attachment" && l.raw["renderedRole"] === "system" && rendered(l).length);
    const userLines = seg.filter((l) => l.raw["type"] === "attachment" && l.raw["renderedRole"] === "user" && rendered(l).length);
    const sys = sysLines.flatMap(rendered), usr = userLines.flatMap(rendered);
    const withAtt = [...from, ...sysLines.map((l) => l.offset)];
    for (const trim of [false, true]) for (const nl of [false, true]) for (const withUser of [false, true]) {
      if (!trim && !nl && !withUser && sys.length === 0) continue;
      const c = clone(content);
      if (trim) {
        for (const b of c) if (b["type"] === "tool_result" && typeof b["content"] === "string") b["content"] = b["content"].trim();
      }
      const last = [...c].reverse().find((b) => b["type"] === "tool_result");
      if (last && sys.length) {
        if (typeof last["content"] === "string") last["content"] = `${last["content"]}

${sys.join("\n\n")}`;
        else if (Array.isArray(last["content"])) {
          const arr = last["content"];
          const tb = [...arr].reverse().find((x) => x["type"] === "text");
          if (nl && tb) tb["text"] = `${tb["text"]}
`;
          arr.push(...sys.map((t) => ({ type: "text", text: t })));
        }
      }
      const extra = withUser ? usr.map((t) => ({ type: "text", text: t })) : [];
      const rule = ["user-turn", trim && "trim", nl && "nl", sys.length && "reminders", withUser && "user-attachments"].filter(Boolean).join("+");
      out.push({ message: { role: "user", content: [...c, ...extra] }, rule, from: withUser ? [...withAtt, ...userLines.map((l) => l.offset)] : withAtt });
    }
  }

  // packages/assay-core/src/importers/claude-code-jsonl/requests.ts
  var REQUEST_RECORD_TYPES = /* @__PURE__ */ new Set(["api-request", "api-request-shape", "api-request-blob"]);
  var enc = new TextEncoder();
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      const o = v;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
    }
    return v;
  }
  function canonicalHash(v) {
    return sha256Hex(enc.encode(JSON.stringify(sortKeys(v))));
  }
  function asBlocks(m) {
    return typeof m["content"] === "string" ? { ...m, content: [{ type: "text", text: m["content"] }] } : m;
  }
  function setAt(body, path, value) {
    let t = body;
    for (const p of path) t = t && typeof t === "object" ? t[p] : void 0;
    if (t && typeof t === "object" && !Array.isArray(t)) t["cache_control"] = value;
  }
  function readRequestRecords(unknowns, events = []) {
    const blobs = /* @__PURE__ */ new Map();
    const shapes = /* @__PURE__ */ new Map();
    const blobsFailed = [], shapesFailed = [];
    const reqs = [];
    let blobCount = 0, shapeCount = 0;
    for (const u of unknowns) {
      const type = u.reason.startsWith("unknown-type:") ? u.reason.slice("unknown-type:".length) : null;
      if (!type || !REQUEST_RECORD_TYPES.has(type)) continue;
      const obj = JSON.parse(u.raw);
      if (type === "api-request-blob") {
        blobCount++;
        const m = obj["message"];
        const key = obj["hash"];
        if (m && typeof key === "string" && canonicalHash(asBlocks(m)) === key) blobs.set(key, { message: m, offset: u.offset });
        else blobsFailed.push(u.offset);
      } else if (type === "api-request-shape") {
        shapeCount++;
        const key = obj["shapeHash"];
        if (typeof key === "string" && canonicalHash(obj["shape"]) === key) shapes.set(key, obj["shape"]);
        else shapesFailed.push(u.offset);
      } else {
        reqs.push({ obj, offset: u.offset });
      }
    }
    if (reqs.length === 0 && blobCount === 0 && shapeCount === 0) return void 0;
    const responses = /* @__PURE__ */ new Map();
    for (const e of events) {
      if (e.kind !== "assistant") continue;
      const ref = e.raw["requestRef"];
      const content = e.raw["message"]?.["content"];
      if (typeof ref !== "string" || !Array.isArray(content)) continue;
      for (const b of content) {
        if (b["type"] !== "tool_use") continue;
        const list = responses.get(ref) ?? [];
        if (!list.some((x) => x.id === b["id"])) list.push({ id: String(b["id"]), input: b["input"] });
        responses.set(ref, list);
      }
    }
    const named = new Set(reqs.flatMap(({ obj }) => Array.isArray(obj["tail"]) ? obj["tail"].map(String) : []));
    const rebuilt = /* @__PURE__ */ new Map();
    if (events.length > 0) {
      const lines = [
        ...events.map((e) => ({ offset: e.offset, raw: e.raw })),
        ...unknowns.filter((u) => u.reason === "unknown-type:attachment").map((u) => ({ offset: u.offset, raw: JSON.parse(u.raw) }))
      ].sort((a, b) => a.offset.file === b.offset.file ? a.offset.line - b.offset.line : a.offset.file < b.offset.file ? -1 : 1);
      for (const c of candidates(lines)) {
        const h = canonicalHash(asBlocks(c.message));
        if (named.has(h) && !rebuilt.has(h)) rebuilt.set(h, c);
      }
    }
    const chains = /* @__PURE__ */ new Map();
    const lineChains = /* @__PURE__ */ new Map();
    const records = [];
    for (const { obj, offset } of reqs) {
      const id = String(obj["id"]);
      const base = typeof obj["base"] === "string" ? obj["base"] : null;
      const keep = typeof obj["keep"] === "number" ? obj["keep"] : 0;
      const tailHashes = Array.isArray(obj["tail"]) ? obj["tail"].map(String) : [];
      const baseChain = base === null ? [] : chains.get(base) ?? new Array(keep).fill(null);
      const tailEntries = tailHashes.map((h) => {
        const b = blobs.get(h);
        if (b) return { message: asBlocks(b.message), source: "blob" };
        const r = rebuilt.get(h);
        return r ? { message: asBlocks(r.message), source: "rebuilt" } : null;
      });
      const chain = [...baseChain.slice(0, keep), ...tailEntries];
      chains.set(id, chain);
      const lineBase = base === null ? [] : lineChains.get(base) ?? new Array(keep).fill(null);
      const lineChain = [...lineBase.slice(0, keep), ...tailHashes.map((h) => {
        const r = rebuilt.get(h);
        return r ? { message: asBlocks(r.message), source: "rebuilt" } : null;
      })];
      lineChains.set(id, lineChain);
      const shapeHash = String(obj["shapeHash"] ?? "");
      const shape = shapes.get(shapeHash);
      const sealOf = (msgs2) => {
        if (!shape) return "no-shape";
        if (msgs2.some((m) => m === null)) return "unresolved";
        const body = JSON.parse(JSON.stringify({ ...obj["params"], system: shape["system"], tools: shape["tools"], messages: msgs2.map((m) => m.message) }));
        const cc = Array.isArray(obj["cacheControl"]) ? obj["cacheControl"] : [];
        for (const c of cc) setAt(body, c.path, c.value);
        return canonicalHash(body) === obj["requestDigest"] ? "sealed" : "broken";
      };
      const seal = sealOf(chain);
      const sealFromBlobs = sealOf(chain.map((m) => m && m.source === "blob" ? m : null));
      const sealFromLines = sealOf(lineChain);
      const msgs = chain.map((m) => m?.message);
      const composition = seal === "sealed" && shape ? compose(shape["system"], shape["tools"], msgs) : null;
      const tailComposition = seal === "sealed" ? sumParts(messageParts(msgs.slice(keep), toolNamesOfAll(msgs))) : null;
      const provenance = seal === "sealed" && shape ? (responses.get(id) ?? []).map((t) => ({ toolUseId: t.id, literals: locate(extractLiterals(t.input), shape["system"], shape["tools"], msgs) })) : null;
      const ts = typeof obj["timestamp"] === "string" ? Date.parse(obj["timestamp"]) : NaN;
      records.push({
        id,
        offset,
        ...Number.isNaN(ts) ? {} : { ts },
        ...typeof obj["version"] === "string" ? { version: obj["version"] } : {},
        ...typeof obj["querySource"] === "string" ? { querySource: obj["querySource"] } : {},
        shapeHash,
        base,
        keep,
        tail: tailHashes.map((h) => {
          const r = blobs.has(h) ? void 0 : rebuilt.get(h);
          return {
            hash: h,
            blob: blobs.get(h)?.offset ?? null,
            source: blobs.has(h) ? "blob" : r ? "rebuilt" : null,
            ...r ? { rule: r.rule, from: r.from } : {}
          };
        }),
        messageCount: chain.length,
        missingMessages: chain.filter((m) => m === null).length,
        rebuiltMessages: chain.filter((m) => m?.source === "rebuilt").length,
        seal,
        sealFromBlobs,
        sealFromLines,
        composition,
        tailComposition,
        provenance
      });
    }
    return { records, blobs: blobCount, blobsFailed, shapes: shapeCount, shapesFailed };
  }
  function sumParts(parts2) {
    const acc = /* @__PURE__ */ new Map();
    for (const p of parts2) {
      const q = acc.get(p.category) ?? { category: p.category, chars: 0, blocks: 0 };
      q.chars += p.chars;
      q.blocks += p.blocks;
      acc.set(p.category, q);
    }
    return [...acc.values()];
  }
  function toolNamesOfAll(messages) {
    const names = /* @__PURE__ */ new Map();
    for (const m of messages) {
      if (m["role"] !== "assistant" || !Array.isArray(m["content"])) continue;
      for (const b of m["content"]) if (b["type"] === "tool_use") names.set(String(b["id"]), String(b["name"]));
    }
    return names;
  }

  // packages/assay-core/src/importers/claude-code-jsonl/version.ts
  function detectVersion(lines) {
    for (const line of lines) {
      if (typeof line === "object" && line !== null && "version" in line && typeof line["version"] === "string") {
        return line["version"];
      }
    }
    return void 0;
  }
  function detectLayout(hasSubagentDir, lines) {
    if (hasSubagentDir) return "subagent-files";
    for (const line of lines) {
      if (typeof line === "object" && line !== null && "isSidechain" in line && line["isSidechain"] === true) {
        return "inline-sidechain";
      }
    }
    const hasMainEvents = lines.some(
      (l) => typeof l === "object" && l !== null && "type" in l && (l["type"] === "user" || l["type"] === "assistant")
    );
    return hasMainEvents ? "main-only" : "unknown";
  }

  // packages/assay-core/src/importers/claude-code-jsonl/from-files.ts
  function importFromFiles(files, opts = {}, hasSubagentDir = files.length > 1) {
    if (files.length === 0) throw new Error("No JSONL files given");
    const flags = {
      prompts: false,
      responses: false,
      toolDetails: false,
      toolContent: false,
      rawBodies: false,
      ...opts.contentFlags
    };
    const parsed = files.map((f) => parseJsonlBytes(f.path, f.bytes));
    const allEvents = parsed.flatMap((p) => p.events);
    const allUnknowns = parsed.flatMap((p) => p.unknowns);
    const requests = readRequestRecords(allUnknowns, allEvents);
    for (const u of allUnknowns) if (REQUEST_RECORD_TYPES.has(u.reason.slice("unknown-type:".length))) u.parsedAs = "request-record";
    const rawApiRequestCount = parsed.reduce((s, p) => s + p.apiRequestCount, 0);
    const allCostStates = parsed.flatMap(
      (p) => p.costStates.map((cs) => ({
        evidence: [{ file: cs.sourceFile, line: cs.sourceLine, byteStart: cs.byteStart, byteEnd: cs.byteEnd }],
        totalCostUSD: cs.totalCostUSD,
        totalAPIDurationMs: cs.totalAPIDurationMs,
        hasUnknownModelCost: cs.hasUnknownModelCost,
        modelUsage: cs.modelUsage
      }))
    );
    const mainParsed = parsed[0];
    if (!mainParsed) throw new Error("No parsed files");
    const version = detectVersion(mainParsed.events.map((e) => e.raw));
    const layout = detectLayout(hasSubagentDir, mainParsed.events.map((e) => e.raw));
    const entities = deriveEntities(allEvents);
    const subagentFiles = files.slice(1).map((f) => f.path);
    for (const agent of entities.agents) {
      const match = subagentFiles.find((f) => f.includes(agent.agentId));
      if (match) agent.transcriptFile = match;
    }
    const captureLevel = 1;
    const sources = parsed.map((p) => ({
      kind: "jsonl",
      path: p.path,
      sha256: p.sha256,
      bytes: p.bytes,
      lines: p.lines
    }));
    const sessionId = files[0].path.split(/[\\/]/).pop()?.replace(".jsonl", "") ?? "unknown";
    return {
      id: sessionId,
      harness: { tool: "claude-code", version, layout },
      capture: {
        level: captureLevel,
        flags,
        truncated: false,
        version
      },
      truth: opts.truth ?? "real",
      sources,
      events: allEvents,
      ...entities,
      unknowns: allUnknowns,
      costStates: allCostStates,
      rawApiRequestCount,
      ...requests ? { requests } : {}
    };
  }

  // packages/assay-core/src/importers/claude-code-jsonl/support.ts
  var IMPORTER_SUPPORT = {
    tool: "claude-code",
    min: "2.1.165",
    max: "2.1.316",
    seen: ["2.1.165", "2.1.170", "2.1.177", "2.1.181", "2.1.299", "2.1.301", "2.1.304", "2.1.308", "2.1.309", "2.1.316"]
  };
  var SUPPORT_BY_TOOL = {
    "claude-code": IMPORTER_SUPPORT,
    "openinference-smolagents": { tool: "openinference-smolagents", min: "0.1.6", max: "0.1.8", seen: ["0.1.6", "0.1.8", "0.1.6+0.1.8"] }
  };
  var supportRange = (tool = "claude-code") => {
    const s = SUPPORT_BY_TOOL[tool];
    return s ? `${s.min}\u2013${s.max}` : "no importer support declared";
  };
  function parts(v) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  function cmp(a, b) {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  }
  function versionSupport(version, tool = "claude-code") {
    const sup = SUPPORT_BY_TOOL[tool];
    if (!sup) return "outside-range";
    if (!version) return "no-version";
    if (sup.seen.includes(version)) return "checked";
    const v = parts(version);
    if (!v) return "outside-range";
    const lo = parts(sup.min), hi = parts(sup.max);
    return cmp(v, lo) >= 0 && cmp(v, hi) <= 0 ? "in-range-unchecked" : "outside-range";
  }

  // packages/assay-core/src/health/detectors.ts
  var CONTEXT_LIMITS = {
    "claude-sonnet-4-6": 1e6,
    "claude-haiku-4-5-20251001": 2e5,
    "claude-sonnet-5-5": 1e6,
    "claude-opus-5-5": 1e6,
    "claude-haiku-5-5": 1e6,
    "claude-fable-5-1": 1e6
  };
  var SYNTHETIC_MODEL = "<synthetic>";
  function d1SubagentBlindSpot(run) {
    const findings = [];
    if (run.harness.tool !== "claude-code") return findings;
    const agentsWithFile = new Set(
      run.agents.filter((a) => a.transcriptFile).map((a) => a.agentId)
    );
    for (const agent of run.agents) {
      if (agent.type !== "main" && !agentsWithFile.has(agent.agentId)) {
        findings.push({
          detectorId: "D1",
          severity: "warn",
          message: `Subagent ${agent.agentId} referenced but no transcript file found \u2014 token usage undercounted`,
          evidence: agent.evidence,
          captureIntegrity: true
        });
      }
    }
    return findings;
  }
  function d2UsageDoubleCount(run) {
    const findings = [];
    const rawCountById = /* @__PURE__ */ new Map();
    for (const ev of run.events) {
      if (ev.kind !== "assistant") continue;
      const obj = ev.raw;
      const msg = obj["message"];
      const msgId = typeof msg?.["id"] === "string" ? msg["id"] : ev.id;
      rawCountById.set(msgId, (rawCountById.get(msgId) ?? 0) + 1);
    }
    for (const [msgId, count] of rawCountById) {
      if (count > 1) {
        const req = run.llmRequests.find((r) => r.messageId === msgId);
        findings.push({
          detectorId: "D2",
          severity: "info",
          message: `message.id ${msgId} appears ${count}\xD7 in events; deduplicated to 1 LlmRequest. Summing all lines would inflate tokens ~${count}\xD7`,
          evidence: req?.evidence ?? []
        });
      }
    }
    return findings;
  }
  function d3ChainBreak(run) {
    const findings = [];
    const unknownUuids = /* @__PURE__ */ new Set();
    for (const u of run.unknowns) {
      try {
        const obj = JSON.parse(u.raw);
        if (typeof obj["uuid"] === "string") unknownUuids.add(obj["uuid"]);
      } catch {
      }
    }
    const knownIds = /* @__PURE__ */ new Set([...run.events.map((e) => e.id), ...unknownUuids]);
    const firstEventPerFile = /* @__PURE__ */ new Map();
    for (const ev of run.events) {
      if (!firstEventPerFile.has(ev.sourceFile)) {
        firstEventPerFile.set(ev.sourceFile, ev.id);
      }
    }
    for (const ev of run.events) {
      if (!ev.parentId || knownIds.has(ev.parentId)) continue;
      if (firstEventPerFile.get(ev.sourceFile) === ev.id) continue;
      findings.push({
        detectorId: "D3",
        severity: "warn",
        message: `Event ${ev.id} has parentId ${ev.parentId} which is not in this run \u2014 possible GC truncation`,
        evidence: [ev.offset],
        captureIntegrity: true
      });
    }
    return findings;
  }
  function d4OrphanTool(run) {
    const findings = [];
    const resultIds = new Set(run.toolResults.map((r) => r.toolUseId));
    const callIds = new Set(run.toolCalls.map((c) => c.id));
    const compactedMessageIds = /* @__PURE__ */ new Set();
    let hasPreciseCompactionData = false;
    for (const comp of run.compactions) {
      if (comp.summarizedTurnUuids && comp.summarizedTurnUuids.length > 0) {
        for (const u of comp.summarizedTurnUuids) compactedMessageIds.add(u);
        hasPreciseCompactionData = true;
      }
    }
    const postCompactionLine = run.compactions.length > 0 ? Math.min(...run.compactions.map((c) => c.summaryOffset?.line ?? Infinity)) : Infinity;
    const lastEventOffset = run.events.at(-1)?.offset;
    for (const call of run.toolCalls) {
      if (!resultIds.has(call.id)) {
        const callLine = call.evidence[0]?.line ?? 0;
        const isInFlight = lastEventOffset !== void 0 && callLine >= lastEventOffset.line - 2;
        if (!isInFlight) {
          findings.push({
            detectorId: "D4",
            severity: "warn",
            message: `tool_use ${call.id} (${call.name}) has no matching tool_result`,
            evidence: call.evidence
          });
        }
      }
    }
    for (const result of run.toolResults) {
      if (!result.toolUseId || callIds.has(result.toolUseId)) continue;
      if (hasPreciseCompactionData && compactedMessageIds.has(result.messageId)) continue;
      if (!hasPreciseCompactionData) {
        const resultLine = result.evidence[0]?.line ?? 0;
        if (resultLine > postCompactionLine) continue;
      }
      findings.push({
        detectorId: "D4",
        severity: "warn",
        message: `tool_result references tool_use_id ${result.toolUseId} which has no corresponding tool_use${hasPreciseCompactionData ? " (compacted turns excluded by UUID)" : ""}`,
        evidence: result.evidence
      });
    }
    return findings;
  }
  function d5ContextOverflow(run) {
    const findings = [];
    const modelByMsgId = /* @__PURE__ */ new Map();
    for (const ev of run.events) {
      if (ev.kind !== "assistant") continue;
      const obj = ev.raw;
      const msg = obj["message"];
      if (!msg) continue;
      const mid = typeof msg["id"] === "string" ? msg["id"] : ev.id;
      if (!modelByMsgId.has(mid) && typeof msg["model"] === "string") {
        modelByMsgId.set(mid, msg["model"]);
      }
    }
    for (const req of run.llmRequests) {
      const model = req.model ?? modelByMsgId.get(req.messageId) ?? null;
      if (!model || model === SYNTHETIC_MODEL) {
        findings.push({
          detectorId: "D5",
          severity: "info",
          message: `message ${req.messageId}: model unknown or synthetic \u2014 context-limit check skipped`,
          evidence: req.evidence
        });
        continue;
      }
      const limit = CONTEXT_LIMITS[model];
      if (limit === void 0) {
        findings.push({
          detectorId: "D5",
          severity: "info",
          message: `message ${req.messageId}: model "${model}" has no documented context limit \u2014 skipping overflow check`,
          evidence: req.evidence
        });
        continue;
      }
      if (req.usage.inputTokens > limit) {
        findings.push({
          detectorId: "D5",
          severity: "warn",
          message: `message ${req.messageId}: inputTokens ${req.usage.inputTokens} exceeds ${model} context limit ${limit}`,
          evidence: req.evidence
        });
      }
    }
    const byModel = /* @__PURE__ */ new Map();
    for (const req of run.llmRequests) {
      const model = modelByMsgId.get(req.messageId);
      if (!model || model === SYNTHETIC_MODEL) continue;
      const limit = CONTEXT_LIMITS[model];
      if (limit === void 0) continue;
      const arr = byModel.get(model) ?? [];
      arr.push(req.usage.inputTokens);
      byModel.set(model, arr);
    }
    for (const [model, inputs] of byModel) {
      const avg = inputs.reduce((a, b) => a + b, 0) / inputs.length;
      const limit = CONTEXT_LIMITS[model];
      if (avg > limit) {
        findings.push({
          detectorId: "D5",
          severity: "warn",
          message: `${model}: average inputTokens ${Math.round(avg)} exceeds context limit ${limit} across ${inputs.length} requests`,
          evidence: []
        });
      }
    }
    return findings;
  }
  function d6UsageDisagreement(run) {
    const findings = [];
    const byMsgId = /* @__PURE__ */ new Map();
    for (const ev of run.events) {
      if (ev.kind !== "assistant") continue;
      const obj = ev.raw;
      const msg = obj["message"];
      if (!msg) continue;
      const msgId = typeof msg["id"] === "string" ? msg["id"] : ev.id;
      const usage = msg["usage"];
      if (!usage) continue;
      const inp = typeof usage["input_tokens"] === "number" ? usage["input_tokens"] : 0;
      const out = typeof usage["output_tokens"] === "number" ? usage["output_tokens"] : 0;
      const arr = byMsgId.get(msgId) ?? [];
      arr.push({ inp, out });
      byMsgId.set(msgId, arr);
    }
    for (const [msgId, records] of byMsgId) {
      if (records.length < 2) continue;
      const inpVals = records.map((r) => r.inp);
      const outVals = records.map((r) => r.out);
      const maxInpDiff = Math.max(...inpVals) - Math.min(...inpVals);
      const maxOutDiff = Math.max(...outVals) - Math.min(...outVals);
      const req = run.llmRequests.find((r) => r.messageId === msgId);
      if (maxInpDiff > 1) {
        findings.push({
          detectorId: "D6",
          severity: "warn",
          message: `message.id ${msgId}: inputTokens disagree across ${records.length} duplicates (range ${Math.min(...inpVals)}\u2013${Math.max(...inpVals)}); max-usage record selected`,
          evidence: req?.evidence ?? []
        });
      }
      if (maxOutDiff > 0) {
        findings.push({
          detectorId: "D6",
          severity: "info",
          message: `message.id ${msgId}: outputTokens differ across ${records.length} duplicates (${Math.min(...outVals)}\u2013${Math.max(...outVals)}); likely streaming-partial early records; max-usage record selected`,
          evidence: req?.evidence ?? []
        });
      }
    }
    return findings;
  }
  function d7CompactionTokenDrop(run) {
    const findings = [];
    if (run.compactions.length === 0) return findings;
    const reqsByLine = [];
    for (const req of run.llmRequests) {
      const line = req.evidence[0]?.line ?? 0;
      reqsByLine.push({ line, req });
    }
    reqsByLine.sort((a, b) => a.line - b.line);
    for (const compaction of run.compactions) {
      const cLine = compaction.summaryOffset?.line ?? 0;
      let pre = null;
      for (let i = reqsByLine.length - 1; i >= 0; i--) {
        if (reqsByLine[i].line < cLine) {
          pre = reqsByLine[i].req;
          break;
        }
      }
      let post = null;
      for (const { line, req } of reqsByLine) {
        if (line > cLine) {
          post = req;
          break;
        }
      }
      if (!pre || !post) {
        findings.push({
          detectorId: "D7",
          severity: "info",
          message: `compaction at line ${cLine}: ${!pre ? "no preceding" : "no following"} LlmRequest \u2014 insufficient evidence for token-change check`,
          evidence: compaction.evidence
        });
        continue;
      }
      const preInp = pre.usage.inputTokens;
      const postInp = post.usage.inputTokens;
      if (postInp > preInp) {
        findings.push({
          detectorId: "D7",
          severity: "info",
          message: `compaction at line ${cLine}: post-compaction inputTokens ${postInp} > pre-compaction ${preInp} (diff +${postInp - preInp}); may indicate a large tool result rather than failed compaction`,
          evidence: [...compaction.evidence, ...pre.evidence, ...post.evidence]
        });
      }
    }
    return findings;
  }
  function d8SessionIdConflict(run) {
    const findings = [];
    const byFile = /* @__PURE__ */ new Map();
    for (const ev of run.events) {
      if (!byFile.has(ev.sourceFile)) byFile.set(ev.sourceFile, /* @__PURE__ */ new Set());
      if (ev.sessionId) byFile.get(ev.sourceFile).add(ev.sessionId);
    }
    for (const [file, ids] of byFile) {
      if (ids.size > 1) {
        findings.push({
          detectorId: "D8",
          severity: "warn",
          message: `Source file ${file}: ${ids.size} distinct sessionIds found (${[...ids].join(", ")}) \u2014 possible session boundary or mis-attributed events`,
          evidence: []
        });
      }
    }
    return findings;
  }
  function d9TimestampReversal(run) {
    const findings = [];
    const byFile = /* @__PURE__ */ new Map();
    for (const ev of run.events) {
      const arr = byFile.get(ev.sourceFile) ?? [];
      arr.push(ev);
      byFile.set(ev.sourceFile, arr);
    }
    for (const [, evs] of byFile) {
      let prevTs;
      let prevId;
      for (const ev of evs) {
        if (ev.ts === void 0) continue;
        if (prevTs !== void 0 && ev.ts < prevTs) {
          findings.push({
            detectorId: "D9",
            severity: "info",
            message: `Timestamp reversal in ${ev.sourceFile}: event ${ev.id} (${new Date(ev.ts).toISOString()}) is before preceding ${prevId} (${new Date(prevTs).toISOString()})`,
            evidence: [ev.offset]
          });
          break;
        }
        prevTs = ev.ts;
        prevId = ev.id;
      }
    }
    return findings;
  }
  function requestLinks(run) {
    const records = new Set(run.requests?.records.map((r) => r.id) ?? []);
    const refByMessage = /* @__PURE__ */ new Map();
    for (const e of run.events) {
      if (e.kind !== "assistant") continue;
      const ref = e.raw["requestRef"];
      const mid = e.raw["message"]?.["id"];
      if (typeof ref === "string" && typeof mid === "string" && !refByMessage.has(mid)) refByMessage.set(mid, { ref, offset: e.offset });
    }
    const withRef = run.llmRequests.filter((q) => refByMessage.has(q.messageId)).map((q) => refByMessage.get(q.messageId));
    const missing = withRef.filter((x) => !records.has(x.ref));
    const pointed = new Set(withRef.map((x) => x.ref));
    const unpointed = run.requests?.records.filter((r) => !pointed.has(r.id)) ?? [];
    return {
      requestsWithRef: withRef.length,
      linked: withRef.length - missing.length,
      refWithoutRecord: missing.length,
      recordWithoutRef: unpointed.length,
      firstRefWithoutRecord: missing.slice(0, 5).map((x) => x.offset),
      firstRecordWithoutRef: unpointed.slice(0, 5).map((r) => r.offset)
    };
  }
  function d10ApiRequestCount(run) {
    const links = requestLinks(run);
    if (links.requestsWithRef > 0) {
      if (links.refWithoutRecord === 0) return [];
      return [{
        detectorId: "D10",
        severity: "info",
        message: `${links.refWithoutRecord} of ${links.requestsWithRef} transcript requests name a request record that was never written; request records cover only part of this session`,
        evidence: links.firstRefWithoutRecord,
        captureIntegrity: true
      }];
    }
    if (run.rawApiRequestCount === 0) return [];
    const diff = Math.abs(run.rawApiRequestCount - run.llmRequests.length);
    if (diff <= 2) return [];
    return [{
      detectorId: "D10",
      severity: "info",
      message: `api-request record count (${run.rawApiRequestCount}) differs from LlmRequest count (${run.llmRequests.length}) by ${diff}; this version writes no requestRef, so records cannot be linked one by one`,
      evidence: [],
      captureIntegrity: true
    }];
  }
  function d0VersionSupport(run) {
    const v = run.harness.version;
    const s = versionSupport(v, run.harness.tool);
    const range = supportRange(run.harness.tool);
    if (s === "checked") return [];
    if (s === "in-range-unchecked") {
      return [{ detectorId: "D0", severity: "info", message: `${run.harness.tool} ${v} is inside the importer's range (${range}) but no session at this version has been checked`, evidence: [] }];
    }
    const what = s === "no-version" ? `no ${run.harness.tool} version in the source` : `${run.harness.tool} ${v} is outside the importer's range (${range})`;
    return [{ detectorId: "D0", severity: "warn", message: `${what}; the run is read, but the format is not known to match`, evidence: [] }];
  }
  function d12AggregateTokens(run) {
    if (run.harness.tool !== "openinference-smolagents") return [];
    const llmTotal = /* @__PURE__ */ new Map();
    const children = /* @__PURE__ */ new Map();
    for (const e of run.events) {
      const a = e.raw["span_attributes"] ?? {};
      if (a["openinference.span.kind"] === "LLM" && a["llm.token_count.total"] != null) llmTotal.set(e.id, Number(a["llm.token_count.total"]));
      if (e.parentId) children.set(e.parentId, [...children.get(e.parentId) ?? [], e.id]);
    }
    const below = (id) => (children.get(id) ?? []).reduce((s, c) => s + (llmTotal.get(c) ?? 0) + below(c), 0);
    const out = [];
    for (const e of run.events) {
      const a = e.raw["span_attributes"] ?? {};
      if (a["openinference.span.kind"] !== "AGENT" || a["llm.token_count.total"] == null) continue;
      const own = Number(a["llm.token_count.total"]), sum = below(e.id);
      if (own === sum) continue;
      out.push({
        detectorId: "D12",
        severity: "info",
        message: `agent span ${e.id} reports ${own} tokens; the LLM calls beneath it total ${sum}. assay counts the LLM calls; summing both overcounts`,
        evidence: [e.offset]
      });
    }
    return out;
  }
  function d11RequestSeals(run) {
    const q = run.requests;
    if (!q) return [];
    const findings = [];
    const broken = q.records.filter((r) => r.seal === "broken");
    if (broken.length > 0) {
      const versions = [...new Set(broken.map((r) => r.version ?? "?"))].join(", ");
      findings.push({
        detectorId: "D11",
        severity: "warn",
        message: `${broken.length} request record(s) have every part present but do not hash to their own digest (version ${versions}); the record or the format has changed`,
        evidence: broken.slice(0, 20).map((r) => r.offset),
        captureIntegrity: true
      });
    }
    const bad = [...q.blobsFailed, ...q.shapesFailed];
    if (bad.length > 0) {
      findings.push({
        detectorId: "D11",
        severity: "warn",
        message: `${q.blobsFailed.length} message blob(s) and ${q.shapesFailed.length} shape(s) do not hash to their own key; they are kept but never used to rebuild a request`,
        evidence: bad.slice(0, 20),
        captureIntegrity: true
      });
    }
    return findings;
  }
  function dCostStateCheck(run) {
    const findings = [];
    if (run.costStates.length === 0) return findings;
    const lastCs = run.costStates.at(-1);
    let csInputTokens = 0;
    let csOutputTokens = 0;
    for (const entry of Object.values(lastCs.modelUsage)) {
      csInputTokens += entry.inputTokens + entry.cacheReadInputTokens + entry.cacheCreationInputTokens;
      csOutputTokens += entry.outputTokens;
    }
    let jsonlInputTokens = 0;
    let jsonlOutputTokens = 0;
    for (const req of run.llmRequests) {
      jsonlInputTokens += req.usage.inputTokens + req.usage.cacheReadTokens + req.usage.cacheWriteTokens;
      jsonlOutputTokens += req.usage.outputTokens;
    }
    if (csInputTokens === 0 && jsonlInputTokens === 0) return findings;
    const inputDiff = Math.abs(csInputTokens - jsonlInputTokens);
    const inputDenom = Math.max(csInputTokens, jsonlInputTokens);
    const inputRelDiff = inputDenom > 0 ? inputDiff / inputDenom : 0;
    if (inputDiff > 500 && inputRelDiff > 0.05) {
      findings.push({
        detectorId: "D-cost",
        severity: "warn",
        message: `Cost-state input token total (${csInputTokens}) vs JSONL input total (${jsonlInputTokens}) differ by ${inputDiff} (${Math.round(inputRelDiff * 100)}%) \u2014 cost-state may include internal routing calls not in the conversation transcript`,
        evidence: lastCs.evidence,
        captureIntegrity: true
      });
    }
    if (lastCs.hasUnknownModelCost) {
      findings.push({
        detectorId: "D-cost",
        severity: "info",
        message: `Cost-state has hasUnknownModelCost=true \u2014 total cost includes at least one model that was not individually accounted`,
        evidence: lastCs.evidence
      });
    }
    return findings;
  }

  // packages/assay-core/src/health/quality.ts
  var FIRST = 5;
  var counter = (falsePositive) => ({ count: 0, first: [], falsePositive });
  var hit = (c, o) => {
    c.count++;
    if (c.first.length < FIRST) c.first.push(o);
  };
  var stem = (path) => (path.split(/[\\/]/).pop() ?? "").replace(/\.jsonl$/, "");
  function captureQuality(run) {
    const q = {
      duplicateUuids: counter("a line rewritten in place by the harness (same record, new bytes) would also count"),
      duplicateRequestIdAcrossFiles: counter("a subagent transcript that legitimately repeats its parent's last request would count; D2 still dedups by message id"),
      sessionIdMismatch: counter("a resumed or forked session writes its new lines into the old file with its own id"),
      timestampBeforeParent: counter("clock skew between a subagent process and its parent"),
      orphanParents: counter("a parent removed by the harness when it compacts or prunes, not lost in capture"),
      unknownRecordTypes: { count: 0, types: {} }
    };
    const byUuid = /* @__PURE__ */ new Map();
    const reqFile = /* @__PURE__ */ new Map();
    const tsById = /* @__PURE__ */ new Map();
    for (const e of run.events) if (typeof e.ts === "number") tsById.set(e.id, e.ts);
    const ids = new Set(run.events.map((e) => e.id));
    for (const u of run.unknowns) {
      const m = /"uuid":"([^"]+)"/.exec(u.raw);
      if (m) ids.add(m[1]);
    }
    const mainStem = run.sources[0] ? stem(run.sources[0].path) : null;
    for (const e of run.events) {
      const raw = e.raw;
      if (typeof raw["uuid"] === "string") {
        if (byUuid.has(raw["uuid"])) hit(q.duplicateUuids, e.offset);
        else byUuid.set(raw["uuid"], e.offset);
      }
      const rid = raw["requestId"];
      if (e.kind === "assistant" && typeof rid === "string") {
        const f = reqFile.get(rid);
        if (f !== void 0 && f !== e.sourceFile) hit(q.duplicateRequestIdAcrossFiles, e.offset);
        else if (f === void 0) reqFile.set(rid, e.sourceFile);
      }
      if (mainStem && e.sessionId && e.sessionId !== mainStem) hit(q.sessionIdMismatch, e.offset);
      if (e.parentId) {
        if (!ids.has(e.parentId)) hit(q.orphanParents, e.offset);
        else {
          const pt = tsById.get(e.parentId);
          if (pt !== void 0 && typeof e.ts === "number" && e.ts < pt) hit(q.timestampBeforeParent, e.offset);
        }
      }
    }
    for (const u of run.unknowns) {
      if (u.catalogued || u.parsedAs) continue;
      q.unknownRecordTypes.count++;
      q.unknownRecordTypes.types[u.reason] = (q.unknownRecordTypes.types[u.reason] ?? 0) + 1;
    }
    return q;
  }

  // packages/assay-core/src/health/health.ts
  function runHealth(run) {
    const findings = [
      ...d1SubagentBlindSpot(run),
      ...d2UsageDoubleCount(run),
      ...d3ChainBreak(run),
      ...d4OrphanTool(run),
      ...d5ContextOverflow(run),
      ...d6UsageDisagreement(run),
      ...d7CompactionTokenDrop(run),
      ...d8SessionIdConflict(run),
      ...d9TimestampReversal(run),
      ...d10ApiRequestCount(run),
      ...d11RequestSeals(run),
      ...d0VersionSupport(run),
      ...d12AggregateTokens(run),
      ...dCostStateCheck(run)
    ];
    const errorFindings = findings.filter((f) => f.severity === "error");
    const warnFindings = findings.filter((f) => f.severity === "warn");
    const verdicts = {
      tokens: tokensVerdict(findings),
      structure: structureVerdict(findings),
      subagents: subagentsVerdict(findings)
    };
    const badUnknowns = run.unknowns.filter(
      (u) => u.reason === "json-parse-error" || u.reason === "not-an-object"
    );
    if (badUnknowns.length > 0) {
      verdicts["schema"] = "usable-with-caveats";
    }
    const overall = deriveOverall(verdicts, errorFindings, warnFindings);
    const validity = buildValidityCard(run, findings, overall);
    return { runId: run.id, captureLevel: run.capture.level, verdicts, findings, overall, validity };
  }
  function buildValidityCard(run, findings, overall) {
    const claimedTurns = run.messages.filter((m) => m.role === "assistant").length;
    const verifiedUsageTurns = run.llmRequests.filter(
      (r) => r.usage.inputTokens > 0 || r.usage.outputTokens > 0
    ).length;
    const usageCoverageRate = claimedTurns > 0 ? verifiedUsageTurns / claimedTurns : null;
    const modelByMsgId = /* @__PURE__ */ new Map();
    for (const ev of run.events) {
      if (ev.kind !== "assistant") continue;
      const obj = ev.raw;
      const msg = obj["message"];
      if (!msg) continue;
      const mid = typeof msg["id"] === "string" ? msg["id"] : ev.id;
      if (!modelByMsgId.has(mid) && typeof msg["model"] === "string") {
        modelByMsgId.set(mid, msg["model"]);
      }
    }
    const identifiedCount = run.llmRequests.filter((r) => r.model || modelByMsgId.has(r.messageId)).length;
    const modelIdentificationRate = run.llmRequests.length > 0 ? identifiedCount / run.llmRequests.length : null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheRead = 0;
    for (const req of run.llmRequests) {
      totalInputTokens += req.usage.inputTokens;
      totalOutputTokens += req.usage.outputTokens;
      totalCacheRead += req.usage.cacheReadTokens;
    }
    const totalContextTokens = totalInputTokens + totalCacheRead;
    const denom = totalContextTokens;
    const cacheHitRate = denom > 0 ? totalCacheRead / denom : null;
    const requestLines = run.unknowns.filter((u) => u.parsedAs).length;
    const eventLines = run.events.length + run.costStates.length + requestLines;
    const unknownLines = run.unknowns.length - requestLines;
    const totalLines = eventLines + unknownLines;
    const unknownRatio = totalLines > 0 ? unknownLines / totalLines : 0;
    const cataloguedLines = run.unknowns.filter((u) => u.catalogued && !u.parsedAs).length;
    const unparsedTelemetryRatio = totalLines > 0 ? (unknownLines - cataloguedLines) / totalLines : 0;
    const importerCoverage = { totalLines, eventLines, unknownLines, unknownRatio, cataloguedLines, unparsedTelemetryRatio };
    const inputTokenRange = inputTokenRangeOf(run, totalInputTokens);
    const otel = otelSummary(run);
    const requests = requestSummary(run);
    const version = {
      value: run.harness.version ?? null,
      support: versionSupport(run.harness.version, run.harness.tool),
      range: supportRange(run.harness.tool)
    };
    const fineness = finenessOf({
      "usage coverage": usageCoverageRate,
      "parsed telemetry": totalLines > 0 ? 1 - unparsedTelemetryRatio : null,
      "model identification": modelIdentificationRate
    });
    const captureIntegrityDetectors = new Set(
      findings.filter((f) => f.captureIntegrity).map((f) => f.detectorId)
    );
    const observability = {};
    const d3Findings = findings.filter((f) => f.detectorId === "D3");
    if (d3Findings.length > 0) {
      observability["transcript"] = {
        state: "capture-incomplete",
        count: d3Findings.length,
        reason: `${d3Findings.length} chain break(s) found \u2014 parentUuid references absent events; possible GC truncation or capture loss`
      };
    } else {
      observability["transcript"] = {
        state: "observed",
        count: run.events.length,
        reason: `${run.events.length} event(s), chain intact (no D3 gaps found)`
      };
    }
    if (run.compactions.length > 0) {
      observability["compaction"] = {
        state: "observed",
        count: run.compactions.length,
        reason: `${run.compactions.length} compaction event(s) found in JSONL`
      };
    } else if (captureIntegrityDetectors.has("D10")) {
      observability["compaction"] = {
        state: "capture-incomplete",
        count: 0,
        reason: "No compaction events observed; api-request count mismatch (D10) suggests capture gaps \u2014 cannot rule out missed compaction events"
      };
    } else {
      observability["compaction"] = {
        state: "not-observed",
        count: 0,
        reason: "No compaction events in JSONL; L1 capture cannot confirm absence (no independent record kept)"
      };
    }
    if (run.agents.length > 0 && captureIntegrityDetectors.has("D1")) {
      observability["subagent"] = {
        state: "capture-incomplete",
        count: run.agents.length,
        reason: `${run.agents.length} agent reference(s) found but \u22651 transcript file missing (D1) \u2014 subagent token data is incomplete`
      };
    } else if (run.agents.length > 0) {
      observability["subagent"] = {
        state: "observed",
        count: run.agents.length,
        reason: `${run.agents.length} agent reference(s) found`
      };
    } else {
      observability["subagent"] = {
        state: "not-observed",
        count: 0,
        reason: "No subagent references in JSONL; not confirmed absent \u2014 subagent use leaves no explicit marker in main transcript at L1"
      };
    }
    if (run.skills.length > 0) {
      observability["skill"] = {
        state: "observed",
        count: run.skills.length,
        reason: `${run.skills.length} skill invocation(s) found via tool_use`
      };
    } else {
      observability["skill"] = {
        state: "not-observed",
        count: 0,
        reason: "No skill invocations detected; inference is from Skill tool_use only \u2014 actual skill use may differ"
      };
    }
    if (run.costStates.length > 0 && captureIntegrityDetectors.has("D-cost")) {
      observability["costState"] = {
        state: "capture-incomplete",
        count: run.costStates.length,
        reason: `${run.costStates.length} cost-state record(s) found but token totals disagree with JSONL usage (D-cost) \u2014 one source is incomplete`
      };
    } else if (run.costStates.length > 0) {
      observability["costState"] = {
        state: "observed",
        count: run.costStates.length,
        reason: `${run.costStates.length} cost-state record(s) from runtime (v2.1.308+)`
      };
    } else {
      observability["costState"] = {
        state: "not-observed",
        count: 0,
        reason: "No cost-state records; either pre-v2.1.308 session or records not emitted \u2014 no independent cost cross-check available"
      };
    }
    const lastCostState = run.costStates.at(-1);
    const runtimeCostUSD = lastCostState?.totalCostUSD ?? null;
    const runtimeCostHasUnknownModel = lastCostState?.hasUnknownModelCost ?? false;
    const caveats = [];
    const d1 = findings.filter((f) => f.detectorId === "D1");
    const d2 = findings.filter((f) => f.detectorId === "D2");
    const d5 = findings.filter((f) => f.detectorId === "D5" && f.severity === "warn");
    const d6warn = findings.filter((f) => f.detectorId === "D6" && f.severity === "warn");
    const d6info = findings.filter((f) => f.detectorId === "D6" && f.severity === "info");
    const d7 = findings.filter((f) => f.detectorId === "D7" && f.severity === "info");
    const d8 = findings.filter((f) => f.detectorId === "D8");
    const d10 = findings.filter((f) => f.detectorId === "D10");
    const dCost = findings.filter((f) => f.detectorId === "D-cost" && f.severity === "warn");
    if (d1.length > 0)
      caveats.push(`${d1.length} subagent(s) missing transcript files \u2014 token totals are undercounted`);
    if (d6warn.length > 0)
      caveats.push(`${d6warn.length} message(s) had unexpected inputToken disagreement across duplicates`);
    if (d5.length > 0)
      caveats.push(`${d5.length} request(s) exceeded or approached the model context limit`);
    if (d7.length > 0)
      caveats.push(`${d7.length} compaction(s) showed unusual token patterns \u2014 post-compaction counts may not reflect summarization`);
    if (d8.length > 0)
      caveats.push(`${d8.length} source file(s) contained conflicting sessionIds`);
    const captureIncompleteCategories = Object.entries(observability).filter(([k, v]) => v.state === "capture-incomplete" && !(k === "costState" && dCost.length > 0)).map(([k]) => k);
    if (captureIncompleteCategories.length > 0)
      caveats.push(`Capture incomplete for: ${captureIncompleteCategories.join(", ")} \u2014 affirmative evidence of capture failure; these categories are not merely unobserved`);
    if (d10.length > 0)
      caveats.push(requests ? `${run.rawApiRequestCount} request records against ${run.llmRequests.length} requests in the conversation: ${requests.linked} linked by id, ${requests.refWithoutRecord} request(s) name a record that is not in the file, ${requests.recordWithoutRef} record(s) are named by no request` : `${run.rawApiRequestCount} api-request records against ${run.llmRequests.length} requests in the conversation; the transcript does not say what the difference is`);
    if (dCost.length > 0)
      caveats.push(`Cost: the runtime's cost-state totals disagree with the transcript's usage, so there is no independent cost cross-check`);
    if (modelIdentificationRate !== null && modelIdentificationRate < 0.5)
      caveats.push(`Model identified for only ${Math.round(modelIdentificationRate * 100)}% of LlmRequests \u2014 context-limit checks were skipped for most requests`);
    if (importerCoverage.unparsedTelemetryRatio > 0.05)
      caveats.push(`${Math.round(importerCoverage.unparsedTelemetryRatio * 100)}% of JSONL lines are of a type the importer does not know (kept, flagged) \u2014 telemetry in them is not counted`);
    if (run.capture.truncated)
      caveats.push("Some captured content is truncated at the source; text-based checks (provenance, categories) see only the kept part");
    if (otel && otel.otelOnly > 0)
      caveats.push(`${otel.otelOnly} API request(s) appear only in OTel (${Object.entries(otel.otelOnlyBySource).map(([k, v]) => `${k} \xD7${v}`).join(", ")}): ${otel.otelOnlyInputTokens} input and ${otel.otelOnlyOutputTokens} output tokens the transcript never recorded`);
    if (run.capture.level < 3)
      caveats.push(`Capture Level ${run.capture.level}: internal non-conversation API calls (e.g. tool-routing requests) not captured \u2014 token totals understate full API spend; OTel (L3+) required for complete cost accounting`);
    if (run.capture.level < 2)
      caveats.push(requests && requests.sealed > 0 ? `Capture Level ${run.capture.level}: tool content not captured; request bodies exist only as the ${requests.sealed} sealed request record(s)` : `Capture Level ${run.capture.level}: tool content and request bodies not captured`);
    return {
      claimedTurns,
      verifiedUsageTurns,
      usageCoverageRate,
      modelIdentificationRate,
      totalInputTokens,
      totalContextTokens,
      totalOutputTokens,
      cacheHitRate,
      importerCoverage,
      inputTokenRange,
      otel,
      requests,
      version,
      captureQuality: captureQuality(run),
      fineness,
      observability,
      runtimeCostUSD,
      runtimeCostHasUnknownModel,
      captureLevel: run.capture.level,
      overallHealth: overall,
      caveats
    };
  }
  function tokensVerdict(findings) {
    const d2 = findings.filter((f) => f.detectorId === "D2");
    if (d2.length > 0) return "usable-with-caveats";
    if (findings.some((f) => f.detectorId === "D6" && f.severity === "warn")) return "usable-with-caveats";
    return "trustworthy";
  }
  function structureVerdict(findings) {
    const d3 = findings.filter((f) => f.detectorId === "D3");
    const d4 = findings.filter((f) => f.detectorId === "D4");
    if (d3.length > 0 || d4.length > 0) return "usable-with-caveats";
    return "trustworthy";
  }
  function subagentsVerdict(findings) {
    const d1 = findings.filter((f) => f.detectorId === "D1");
    if (d1.length > 0) return `do-not-trust-for:subagent-token-totals`;
    return "trustworthy";
  }
  function deriveOverall(verdicts, errors, warns) {
    const values = Object.values(verdicts);
    if (values.some((v) => v.startsWith("do-not-trust-for:"))) {
      const affected = values.filter((v) => v.startsWith("do-not-trust-for:")).map((v) => v.replace("do-not-trust-for:", "")).join(",");
      return `do-not-trust-for:${affected}`;
    }
    if (errors.length > 0) return "do-not-trust-for:data-integrity";
    if (values.some((v) => v === "usable-with-caveats") || warns.length > 0) {
      return "usable-with-caveats";
    }
    return "trustworthy";
  }
  function inputTokenRangeOf(run, reported) {
    const copies = /* @__PURE__ */ new Map();
    for (const ev of run.events) {
      if (ev.kind !== "assistant") continue;
      const msg = ev.raw["message"];
      const usage = msg?.["usage"];
      if (!msg || !usage || typeof usage["input_tokens"] !== "number") continue;
      const id = typeof msg["id"] === "string" ? msg["id"] : ev.id;
      const arr = copies.get(id) ?? [];
      arr.push(usage["input_tokens"]);
      copies.set(id, arr);
    }
    let gap = 0;
    for (const req of run.llmRequests) {
      const arr = copies.get(req.messageId);
      if (arr && arr.length > 1) gap += req.usage.inputTokens - Math.min(...arr);
    }
    return { min: reported - gap, max: reported };
  }
  function finenessOf(rates) {
    let bound = null;
    for (const k of Object.keys(rates)) {
      const r = rates[k];
      if (r !== null && (bound === null || r < rates[bound])) bound = k;
    }
    const value = bound === null ? null : Math.floor(1e3 * rates[bound]);
    return { value, bound, rates };
  }
  function requestSummary(run) {
    const q = run.requests;
    if (!q) return null;
    const n = (s) => q.records.filter((r) => r.seal === s).length;
    return {
      records: q.records.length,
      sealed: n("sealed"),
      broken: n("broken"),
      unresolved: n("unresolved"),
      noShape: n("no-shape"),
      blobs: q.blobs,
      blobsFailed: q.blobsFailed.length,
      shapesFailed: q.shapesFailed.length,
      messagesWithoutBlob: q.records.reduce((s, r) => s + r.tail.filter((t) => !t.blob).length, 0),
      sealedFromBlobs: q.records.filter((r) => r.sealFromBlobs === "sealed").length,
      sealedFromLines: q.records.filter((r) => r.sealFromLines === "sealed").length,
      messagesRebuilt: q.records.reduce((s, r) => s + r.tail.filter((t) => t.source === "rebuilt").length, 0),
      ...(({ requestsWithRef, linked, refWithoutRecord, recordWithoutRef }) => ({ requestsWithRef, linked, refWithoutRecord, recordWithoutRef }))(requestLinks(run))
    };
  }
  function otelSummary(run) {
    if (!run.otel) return null;
    const only = run.otel.apiRequests.filter((q) => !q.inTranscript);
    const bySource = {};
    for (const q of only) bySource[q.querySource || "unknown"] = (bySource[q.querySource || "unknown"] ?? 0) + 1;
    const otelIds = new Set(run.otel.apiRequests.map((q) => q.requestId));
    return {
      apiRequests: run.otel.apiRequests.length,
      inTranscript: run.otel.apiRequests.length - only.length,
      otelOnly: only.length,
      otelOnlyInputTokens: only.reduce((s, q) => s + q.inputTokens, 0),
      otelOnlyOutputTokens: only.reduce((s, q) => s + q.outputTokens, 0),
      otelOnlyCostUSD: only.reduce((s, q) => s + q.costUSD, 0),
      otelOnlyBySource: bySource,
      transcriptOnly: run.llmRequests.filter((r) => r.requestRef && !otelIds.has(r.requestRef)).length,
      // First disagreements, each at its own raw bytes: the OTel record with no
      // transcript request, and the transcript request with no OTel record.
      firstOtelOnly: only.slice(0, 5).flatMap((q) => q.evidence.slice(0, 1)),
      firstTranscriptOnly: run.llmRequests.filter((r) => r.requestRef && !otelIds.has(r.requestRef)).slice(0, 5).flatMap((r) => r.evidence.slice(0, 1))
    };
  }

  // packages/assay-core/src/view/redact.ts
  var ID_RE = /^(msg_|toolu_|req_|srvtoolu_)[A-Za-z0-9]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{16,17}$/;
  var TS_RE = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;
  var SENSITIVE = /* @__PURE__ */ new Set([
    "content",
    "text",
    "thinking",
    "signature",
    "input",
    "prompt",
    "cwd",
    "gitBranch",
    "slug",
    "summary",
    "display",
    "leafUuid",
    "title",
    "customTitle",
    "lastPrompt",
    "agentName",
    "stdout",
    "stderr",
    "operation",
    // Tool results that carry file or diff content: a short diff line passes the token rule otherwise.
    "lines",
    "oldString",
    "newString",
    "old_string",
    "new_string",
    "originalFile",
    "filePath",
    "file_path",
    "path",
    "command",
    "query",
    "url",
    "pattern",
    "description"
  ]);
  var MAX_LIST = 6;
  function redact(v, key) {
    if (Array.isArray(v)) {
      const head = v.slice(0, MAX_LIST).map((x) => redact(x, key));
      return v.length > MAX_LIST ? [...head, `\u2039+${v.length - MAX_LIST} more\u203A`] : head;
    }
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, k)]));
    }
    if (typeof v === "string") {
      const shortToken = v.length <= 28 && !/[\s\\/]/.test(v);
      if (!(key && SENSITIVE.has(key)) && (ID_RE.test(v) || TS_RE.test(v) || shortToken)) return v;
      return `\u2039redacted \xB7 ${v.length} chars\u203A`;
    }
    return v;
  }
  function basename(p) {
    return p.split(/[\\/]/).pop() ?? p;
  }
  function stripPaths(msg) {
    return msg.replace(/[A-Za-z]:\\[^\s:]+|\/(?:[^\s/:]+\/)+[^\s/:]+/g, (m) => basename(m));
  }
  function scrubPaths(v) {
    if (typeof v === "string") return stripPaths(v);
    if (Array.isArray(v)) return v.map(scrubPaths);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubPaths(x)]));
    return v;
  }

  // packages/assay-core/src/reconstruct/tokens.ts
  function split(acc, tokens, parts2) {
    const chars = parts2.reduce((s, p) => s + p.chars, 0);
    if (chars === 0 || tokens <= 0) return;
    for (const p of parts2) {
      const e = acc.get(p.category) ?? { measured: 0, inferred: 0 };
      e.inferred += tokens * p.chars / chars;
      acc.set(p.category, e);
    }
  }
  function attributeTokens(run) {
    const records = run.requests?.records ?? [];
    const msgByRecord = /* @__PURE__ */ new Map();
    for (const e of run.events) {
      if (e.kind !== "assistant") continue;
      const ref = e.raw["requestRef"];
      const mid = e.raw["message"]?.["id"];
      if (typeof ref === "string" && typeof mid === "string" && !msgByRecord.has(ref)) msgByRecord.set(ref, mid);
    }
    const usage = new Map(run.llmRequests.map((q) => [q.messageId, q.usage]));
    const totalOf = (id) => {
      const u = usage.get(msgByRecord.get(id) ?? "");
      return u ? u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens : null;
    };
    const done = /* @__PURE__ */ new Map();
    const out = [];
    for (const r of records) {
      const total = totalOf(r.id);
      if (!r.composition || total === null) continue;
      const b = r.base ? done.get(r.base) : void 0;
      const acc = /* @__PURE__ */ new Map();
      const delta = b ? total - b.total : -1;
      let deltaMeasured = 0;
      if (b && b.shapeHash === r.shapeHash && r.keep === b.messageCount && delta >= 0 && r.tailComposition) {
        for (const [c, e] of b.acc) acc.set(c, { ...e });
        deltaMeasured = b.deltaMeasured + delta;
        const tail = r.tailComposition.filter((p) => p.chars > 0);
        if (tail.length === 1) {
          const e = acc.get(tail[0].category) ?? { measured: 0, inferred: 0 };
          e.measured += delta;
          acc.set(tail[0].category, e);
        } else split(acc, delta, tail);
      } else {
        split(acc, total, r.composition);
      }
      done.set(r.id, { acc, total, messageCount: r.messageCount, shapeHash: r.shapeHash, deltaMeasured });
      out.push({
        recordId: r.id,
        messageId: msgByRecord.get(r.id) ?? null,
        total,
        parts: [...acc.entries()].map(([category, e]) => ({ category, measured: Math.round(e.measured), inferred: Math.round(e.inferred) })),
        deltaMeasured
      });
    }
    return out;
  }

  // packages/assay-core/src/reconstruct/run-provenance.ts
  function runProvenance(run) {
    const out = /* @__PURE__ */ new Map();
    for (const r of run.requests?.records ?? []) {
      for (const p of r.provenance ?? []) {
        const first = p.literals.find((l) => l.at);
        out.set(p.toolUseId, { toolUseId: p.toolUseId, source: "request", literals: p.literals, line: first ? r.offset.line : null });
      }
    }
    const calls = [];
    const texts = [];
    for (const e of run.events) {
      const content = e.raw["message"]?.["content"];
      if (e.kind === "assistant" && Array.isArray(content)) {
        for (const b of content) {
          if (b["type"] === "tool_use" && !out.has(String(b["id"]))) calls.push({ id: String(b["id"]), input: b["input"], file: e.offset.file, line: e.offset.line });
        }
      }
      if (content !== void 0) texts.push({ file: e.offset.file, line: e.offset.line, text: textOf(content) });
    }
    for (const u of run.unknowns) {
      if (u.reason !== "unknown-type:attachment") continue;
      const rendered2 = JSON.parse(u.raw)["rendered"];
      if (rendered2) texts.push({ file: u.offset.file, line: u.offset.line, text: textOf(rendered2) });
    }
    for (const p of provenanceFromLines(calls, texts)) out.set(p.toolUseId, p);
    return out;
  }

  // packages/assay-core/src/view/spine.ts
  function buildSpine(run, report) {
    const tokensByMessage = new Map(attributeTokens(run).filter((t) => t.messageId).map((t) => [t.messageId, t]));
    const recordLine = new Map((run.requests?.records ?? []).map((r) => [r.id, r.offset.line]));
    const prov = runProvenance(run);
    const tsByLine = /* @__PURE__ */ new Map();
    const agentByLine = /* @__PURE__ */ new Map();
    const key = (file, line) => `${file}\0${line}`;
    for (const e of run.events) {
      const k = key(e.offset.file, e.offset.line);
      if (typeof e.ts === "number" && !Number.isNaN(e.ts)) tsByLine.set(k, e.ts);
      if (e.agentId) agentByLine.set(k, e.agentId);
    }
    const tsOf = (o) => o ? tsByLine.get(key(o.file, o.line)) ?? null : null;
    const resultByUse = new Map(run.toolResults.map((r) => [r.toolUseId, r]));
    const toolsByMsg = /* @__PURE__ */ new Map();
    for (const c of run.toolCalls) {
      const r = resultByUse.get(c.id);
      const t0 = tsOf(c.evidence[0]), t1 = tsOf(r?.evidence[0]);
      const list = toolsByMsg.get(c.messageId) ?? [];
      list.push({
        name: c.name,
        id: c.id,
        line: c.evidence[0]?.line ?? 0,
        resultLine: r?.evidence[0]?.line ?? null,
        ms: t0 !== null && t1 !== null ? t1 - t0 : null,
        isError: r?.isError ?? false,
        // A ToolResult exists only when its tool_use_id matched this call exactly.
        edge: r ? "observed" : null
      });
      toolsByMsg.set(c.messageId, list);
    }
    const findingLines = /* @__PURE__ */ new Map();
    for (const f of report.findings) {
      const o = f.evidence[0];
      if (!o) continue;
      const k = key(o.file, o.line);
      const s = findingLines.get(k) ?? /* @__PURE__ */ new Set();
      s.add(f.detectorId);
      findingLines.set(k, s);
    }
    const cuts = run.compactions.map((c) => c.evidence[0]?.line ?? 0).sort((a, b) => a - b);
    const mainFile = run.sources[0]?.path;
    const reqs = [...run.llmRequests].sort((a, b) => {
      const ea = a.evidence[0], eb = b.evidence[0];
      const fa = ea?.file === mainFile ? 0 : 1, fb = eb?.file === mainFile ? 0 : 1;
      return fa - fb || (ea?.line ?? 0) - (eb?.line ?? 0);
    });
    const steps = reqs.map((q, i) => {
      const o = q.evidence[0];
      const k = key(o.file, o.line);
      return {
        i,
        line: o.line,
        file: basename(o.file),
        b0: o.byteStart,
        b1: o.byteEnd,
        ts: tsByLine.get(k) ?? null,
        agent: agentByLine.get(k) ?? "main",
        epoch: o.file === mainFile ? cuts.filter((c) => c <= o.line).length : 0,
        usage: [q.usage.inputTokens, q.usage.cacheReadTokens, q.usage.cacheWriteTokens, q.usage.outputTokens],
        tools: (toolsByMsg.get(q.messageId) ?? []).sort((a, b) => a.line - b.line),
        findings: [...findingLines.get(k) ?? []].sort(),
        context: (() => {
          const t = tokensByMessage.get(q.messageId);
          if (!t) return null;
          return {
            recordLine: recordLine.get(t.recordId) ?? 0,
            total: t.total,
            deltaMeasured: t.deltaMeasured,
            parts: t.parts,
            notSeparable: NOT_SEPARABLE
          };
        })(),
        provenance: (() => {
          const ps = (toolsByMsg.get(q.messageId) ?? []).map((t) => prov.get(t.id)).filter((p) => Boolean(p));
          return ps.length ? ps : null;
        })()
      };
    });
    const agents = run.agents.map((a) => ({
      id: a.agentId,
      type: a.type,
      parent: a.parentAgentId ?? null,
      transcript: Boolean(a.transcriptFile)
    }));
    const toolSequence = steps.flatMap((s) => s.tools.map((t) => t.name));
    return { steps, agents, epochs: cuts.length + 1, toolSequence };
  }

  // packages/assay-core/src/view/build.ts
  var SEGMENTS = 140;
  function usageOf(raw) {
    const msg = raw?.["message"];
    const u = msg?.["usage"];
    if (!u) return null;
    return [u["input_tokens"] ?? 0, u["cache_read_input_tokens"] ?? 0, u["cache_creation_input_tokens"] ?? 0, u["output_tokens"] ?? 0];
  }
  function counter2(xs, top) {
    const m = /* @__PURE__ */ new Map();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  }
  function buildRunView(run, report, opts = {}) {
    const totalLines = Math.max(1, ...run.sources.map((s) => s.lines));
    const seg = (line) => Math.min(SEGMENTS - 1, Math.floor(line / totalLines * SEGMENTS));
    const byLine = /* @__PURE__ */ new Map();
    for (const e of run.events) if (!byLine.has(e.offset.line)) byLine.set(e.offset.line, e.raw);
    const unkByLine = new Map(run.unknowns.map((u) => [u.offset.line, u]));
    const band = Array.from({ length: SEGMENTS }, () => ({ user: 0, assistant: 0, system: 0, other: 0, unknown: 0, f: {}, n: 0, nc: 0 }));
    for (const e of run.events) {
      const k = e.kind === "user" || e.kind === "assistant" || e.kind === "system" ? e.kind : "other";
      band[seg(e.offset.line)][k]++;
    }
    for (const u of run.unknowns) band[seg(u.offset.line)].unknown++;
    const findings = /* @__PURE__ */ new Map();
    for (const f of report.findings) {
      const ent = findings.get(f.detectorId) ?? { id: f.detectorId, severity: f.severity, count: 0, items: [] };
      findings.set(f.detectorId, ent);
      ent.count++;
      if (f.severity === "warn") ent.severity = "warn";
      if (f.captureIntegrity) ent.ci = true;
      const line = f.evidence[0]?.line;
      if (line !== void 0) band[seg(line)].f[f.detectorId] = (band[seg(line)].f[f.detectorId] ?? 0) + 1;
      if (ent.items.length >= 60) continue;
      const item = {
        msg: stripPaths(f.message),
        ev: f.evidence.slice(0, 3).map((x) => ({ file: basename(x.file), line: x.line, b0: x.byteStart, b1: x.byteEnd }))
      };
      if (ent.items.length < 25 && line !== void 0) {
        let raw = byLine.get(line);
        const unk = unkByLine.get(line);
        if (raw === void 0 && unk) {
          try {
            raw = JSON.parse(unk.raw);
          } catch {
            raw = void 0;
          }
        }
        if (raw !== void 0) item.raw = redact(raw);
      }
      ent.items.push(item);
    }
    const naive = [0, 0, 0, 0];
    for (const e of run.events) {
      if (e.kind !== "assistant") continue;
      const u = usageOf(e.raw);
      if (!u) continue;
      for (let i = 0; i < 4; i++) naive[i] += u[i];
      const b = band[seg(e.offset.line)];
      b.n += u[3];
      b.nc += u[0] + u[1] + u[2];
    }
    const reqs = run.llmRequests.map((q) => [q.evidence[0]?.line ?? 0, q.usage.inputTokens, q.usage.cacheReadTokens, q.usage.cacheWriteTokens, q.usage.outputTokens]);
    const dedup = [1, 2, 3, 4].map((i) => reqs.reduce((s, r) => s + (r[i] ?? 0), 0));
    const firstUnk = run.unknowns[0];
    let unknownSample = null;
    if (firstUnk) {
      try {
        unknownSample = { line: firstUnk.offset.line, b0: firstUnk.offset.byteStart, b1: firstUnk.offset.byteEnd, reason: firstUnk.reason, raw: redact(JSON.parse(firstUnk.raw)) };
      } catch {
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const modelIds = [];
    for (const e of run.events) {
      if (e.kind !== "assistant") continue;
      const m = e.raw["message"];
      const id = m?.["id"];
      if (typeof id === "string" && !seen.has(id)) {
        seen.add(id);
        modelIds.push(typeof m?.["model"] === "string" ? m["model"] : "?");
      }
    }
    const models = counter2(modelIds, 4);
    const mainModel = models[0]?.[0] ?? null;
    const ts = run.events.map((e) => e.ts).filter((t) => typeof t === "number" && !Number.isNaN(t));
    const v = report.validity;
    const src = run.sources[0];
    return {
      hallmark: {
        fineness: v.fineness.value,
        bound: v.fineness.bound,
        rates: v.fineness.rates,
        firstTs: ts.length ? Math.min(...ts) : null,
        model: mainModel,
        contextLimit: mainModel ? CONTEXT_LIMITS[mainModel] ?? null : null
      },
      models,
      id: opts.id ?? run.id.slice(0, 8),
      session: run.id,
      file: opts.file ?? basename(run.sources[0].path),
      truth: opts.truth ?? run.truth,
      harness: run.harness,
      capture: run.capture,
      source: { file: basename(src.path), sha256: src.sha256, bytes: run.sources.reduce((s, x) => s + x.bytes, 0), lines: totalLines, count: run.sources.length },
      counts: {
        events: run.events.length,
        llm: run.llmRequests.length,
        tools: run.toolCalls.length,
        agents: run.agents.length,
        compactions: run.compactions.length,
        skills: run.skills.length,
        unknowns: run.unknowns.length,
        edges: run.edges.length,
        observed: run.edges.filter((e) => e.kind === "observed").length,
        matched: run.edges.filter((e) => e.kind === "matched").length
      },
      verdicts: report.verdicts,
      overall: report.overall,
      validity: scrubPaths(v),
      findings: [...findings.values()].sort((a, b) => a.id.localeCompare(b.id)),
      band,
      reqs,
      compactions: run.compactions.map((c) => c.evidence[0]?.line).filter((l) => l !== void 0),
      naive,
      dedup,
      tools: counter2(run.toolCalls.map((t) => t.name), 10),
      // Request records are read by their own reader (ADR-026), so they are not listed as held aside.
      unknownReasons: counter2(run.unknowns.filter((u) => !u.parsedAs).map((u) => u.reason), 8),
      unknownSample,
      rawApi: run.rawApiRequestCount,
      spine: redactSpine(buildSpine(run, report)),
      // M4 fills these per run; null means not reconstructed / not traced yet.
      m4: { reconstruction: null, provenance: null }
    };
  }
  var PATHISH = /[\\/]/;
  var FILE_NAME = /^[\w.-]+\.[A-Za-z0-9]{1,8}$/;
  var EXAMPLES = 3;
  function shown(text) {
    const b = PATHISH.test(text) && !/\s/.test(text) ? basename(text) : "";
    return FILE_NAME.test(b) ? b : `\u2039redacted \xB7 ${text.length} chars\u203A`;
  }
  var whereOf = (p, at) => at === null ? null : p.source === "l1-lines" ? `l${at.index}` : at.part === "message" ? `m${at.index}.${at.block}` : `${at.part[0]}${at.index}`;
  function redactSpine(spine) {
    let notSeparable = null;
    const steps = spine.steps.map((st) => {
      const context = st.context && (() => {
        notSeparable ?? (notSeparable = st.context.notSeparable);
        return { line: st.context.recordLine, total: st.context.total, deltaMeasured: st.context.deltaMeasured, parts: st.context.parts.map((p) => [p.category, p.measured, p.inferred]) };
      })();
      const provenance = st.provenance && st.provenance.map((p) => ({
        tool: st.tools.findIndex((t) => t.id === p.toolUseId),
        source: p.source,
        count: p.literals.length,
        sourced: p.literals.filter((l) => l.at).length,
        examples: p.literals.slice(0, EXAMPLES).map((l) => [shown(l.text), whereOf(p, l.at)])
      }));
      return { ...st, context, provenance };
    });
    return { ...spine, steps, notSeparable };
  }

  // packages/assay-core/src/diff/align.ts
  function stepKey(s) {
    return s.tools.map((t) => t.name).sort().join("+");
  }
  function align(a, b) {
    const ka = a.map(stepKey), kb = b.map(stepKey);
    const n = ka.length, m = kb.length;
    const w = m + 1;
    const L = new Uint32Array((n + 1) * w);
    for (let i2 = n - 1; i2 >= 0; i2--) {
      for (let j2 = m - 1; j2 >= 0; j2--) {
        L[i2 * w + j2] = ka[i2] === kb[j2] ? L[(i2 + 1) * w + j2 + 1] + 1 : Math.max(L[(i2 + 1) * w + j2], L[i2 * w + j2 + 1]);
      }
    }
    const pairs = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (ka[i] === kb[j]) {
        pairs.push({ a: i++, b: j++ });
      } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) pairs.push({ a: i++, b: null });
      else pairs.push({ a: null, b: j++ });
    }
    while (i < n) pairs.push({ a: i++, b: null });
    while (j < m) pairs.push({ a: null, b: j++ });
    let first = null;
    for (let k = 0; k < Math.min(n, m); k++) if (ka[k] !== kb[k]) {
      first = k;
      break;
    }
    if (first === null && n !== m) first = Math.min(n, m);
    const matched = pairs.filter((p) => p.a !== null && p.b !== null).length;
    return { pairs, matched, onlyA: n - matched, onlyB: m - matched, firstDivergence: first };
  }
  return __toCommonJS(browser_exports);
})();
