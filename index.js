// /api/ask — "Ask the orchestrator" Q&A for the closing scene.
// POST { question, history? } -> { answer }
// Calls the Anthropic Messages API SERVER-SIDE so your API key never reaches the browser.
// Requires the ANTHROPIC_API_KEY app setting. ANTHROPIC_MODEL is optional.

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

const SYSTEM = [
  "You are 'the orchestrator' — a concise, grounded guide taking live questions at the end of a short talk",
  "that defines agentic AI for an audience of healthcare and company leaders.",
  "Context of the talk: clinicians are buried in documentation; agentic AI can take on the gathering,",
  "reading, and writing while clinicians keep the deciding and the caring. An orchestrator plans and",
  "dispatches small specialized agents (patient chart via FHIR, the round's transcript, guidelines, and a",
  "safety/evaluation agent), with the human in the loop the whole way. As software begins to inform clinical",
  "decisions it becomes a regulated medical device (SaaS -> SaMD), which raises the bar for validation,",
  "continuous monitoring, and clear accountability.",
  "Answer in 2-4 sentences, plain language, no hype, no markdown headings or bullet lists.",
  "Orient answers to leaders' decisions: governance, evidence, teaming, and risk.",
  "If asked for medical advice or a specific diagnosis, decline briefly and note this is an educational demo."
].join(" ");

module.exports = async function (context, req) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  try {
    if (req.method !== "POST") {
      context.res = { status: 405, headers, body: { error: "method not allowed" } };
      return;
    }
    if (!KEY) {
      context.res = { status: 503, headers, body: { error: "Q&A not configured" } };
      return;
    }

    const body = req.body || {};
    const q = (body.question || "").toString().trim().slice(0, 1000);
    if (!q) {
      context.res = { status: 400, headers, body: { error: "empty question" } };
      return;
    }

    // carry a little conversation context if the page sends it
    const msgs = [];
    if (Array.isArray(body.history)) {
      body.history.slice(-6).forEach(function (m) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          msgs.push({ role: m.role, content: m.content.slice(0, 2000) });
        }
      });
    }
    msgs.push({ role: "user", content: q });

    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system: SYSTEM, messages: msgs })
    });

    if (!r.ok) {
      const t = await r.text();
      context.log("anthropic error", r.status, t);
      context.res = { status: 502, headers, body: { error: "upstream error" } };
      return;
    }

    const data = await r.json();
    const answer = (data.content || [])
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text; })
      .join("\n").trim() || "…";

    context.res = { status: 200, headers, body: { answer } };
  } catch (e) {
    context.log("ask failed", e && e.message);
    context.res = { status: 500, headers, body: { error: "ask failed" } };
  }
};
