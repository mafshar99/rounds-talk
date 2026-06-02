// /api/ask — "Ask the orchestrator" Q&A for the closing scene.
// POST { question, history? } -> { answer }
// GET  -> a self-test: calls Claude once and reports the result so you can debug in a browser.

const https = require("https");

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const SYSTEM = [
  "You are 'the orchestrator' — a concise, grounded guide taking live questions at the end of a short talk",
  "that defines agentic AI for an audience of healthcare and company leaders.",
  "Context: clinicians are buried in documentation; agentic AI can take on the gathering, reading, and",
  "writing while clinicians keep the deciding and the caring. An orchestrator plans and dispatches small",
  "specialized agents (patient chart via FHIR, the round's transcript, guidelines, and a safety/evaluation",
  "agent), with the human in the loop the whole way. As software begins to inform clinical decisions it",
  "becomes a regulated medical device (SaaS -> SaMD), raising the bar for validation, monitoring, and",
  "accountability.",
  "Answer in 2-4 sentences, plain language, no hype, no markdown headings or bullet lists.",
  "Orient answers to leaders' decisions: governance, evidence, teaming, and risk.",
  "If asked for medical advice or a diagnosis, decline briefly and note this is an educational demo."
].join(" ");

function callAnthropic(messages) {
  return new Promise(function (resolve, reject) {
    const payload = JSON.stringify({ model: MODEL, max_tokens: 600, system: SYSTEM, messages: messages });
    const r = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          "x-api-key": KEY,
          "anthropic-version": "2023-06-01"
        }
      },
      function (res) {
        let data = "";
        res.on("data", function (c) { data += c; });
        res.on("end", function () { resolve({ status: res.statusCode, body: data }); });
      }
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

module.exports = async function (context, req) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  try {
    if (!KEY) { context.res = { status: 503, headers, body: { error: "Q&A not configured" } }; return; }

    if (req.method === "GET") {
      const r = await callAnthropic([{ role: "user", content: "Reply with the single word: ok" }]);
      let detail = r.body;
      try {
        const j = JSON.parse(r.body);
        detail = j.error ? (j.error.message || JSON.stringify(j.error))
               : (j.content && j.content[0] && j.content[0].text) || r.body;
      } catch (e) {}
      context.res = { status: 200, headers, body: { test: true, model: MODEL, upstreamStatus: r.status, detail: detail } };
      return;
    }

    if (req.method !== "POST") { context.res = { status: 405, headers, body: { error: "method not allowed" } }; return; }

    const body = req.body || {};
    const q = (body.question || "").toString().trim().slice(0, 1000);
    if (!q) { context.res = { status: 400, headers, body: { error: "empty question" } }; return; }

    const msgs = [];
    if (Array.isArray(body.history)) {
      body.history.slice(-6).forEach(function (m) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          msgs.push({ role: m.role, content: m.content.slice(0, 2000) });
        }
      });
    }
    msgs.push({ role: "user", content: q });

    const r = await callAnthropic(msgs);
    if (r.status < 200 || r.status >= 300) {
      context.log("anthropic error", r.status, r.body);
      context.res = { status: 502, headers, body: { error: "upstream error", upstreamStatus: r.status } };
      return;
    }
    const data = JSON.parse(r.body);
    const answer = (data.content || [])
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text; })
      .join("\n").trim() || "…";
    context.res = { status: 200, headers, body: { answer: answer } };
  } catch (e) {
    context.log("ask failed", e && e.message);
    context.res = { status: 500, headers, body: { error: "ask failed", detail: (e && e.message) || String(e) } };
  }
};
