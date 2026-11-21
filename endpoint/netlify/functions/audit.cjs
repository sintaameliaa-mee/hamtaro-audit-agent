// POST /api/audit — Netlify Functions adapter for the deterministic Solidity
// pre-screen. Same audit logic as api/audit.js (Vercel); this file only adapts
// the request/response shape to Netlify's event/handler format.
// Request:  POST with JSON body { "code": "<solidity source>" } (<= 200 KB)
// Response: JSON — { agent, scope, verdict, findings, checks_run, stats,
//           limitations } where each finding mirrors the repo's
//           findings.json record shape (verdict: "needs_validation").
//
// GET returns a short usage document. This endpoint is a public demo:
// no auth, no state, no external calls, no code execution.

"use strict";

const { audit, MAX_CODE_BYTES } = require("../../lib/audit-checks");

const USAGE = {
  agent: "hamtaro-audit-agent/endpoint-pre-screen",
  endpoint: "POST /api/audit",
  request: { code: "<Solidity source, string, max 200 KB>" },
  response: "verdict + findings in the repo findings.json record shape; " +
    "every finding is verdict needs_validation (a pattern pre-screen, " +
    "not a confirmed audit).",
  scope: "Deterministic pre-screen only. The full multi-agent audit runs " +
    "in Muse per skill/SKILL.md; see the demo page and the sample runs " +
    "in https://github.com/sintaameliaa-mee/hamtaro-audit-agent",
  example: 'curl -X POST "$URL/api/audit" -H "Content-Type: application/json" ' +
    '-d \'{"code":"contract V { function w() external { (bool ok,) = ' +
    'msg.sender.call{value: 1}(""); require(ok); } }"}\'',
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function json(statusCode, obj) {
  return { statusCode, headers: CORS, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  const method = event.httpMethod;

  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (method === "GET") return json(200, USAGE);
  if (method !== "POST") {
    return json(405, { error: "method not allowed; use POST with { code }" });
  }

  let body;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    if (raw.length > MAX_CODE_BYTES + 1024) throw new Error("request body too large");
    body = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return json(400, { error: e.message });
  }
  if (!body || typeof body.code !== "string" || body.code.trim().length === 0) {
    return json(400, { error: "`code` must be a non-empty string of Solidity source." });
  }

  try {
    const result = audit(body.code);
    return json(200, result);
  } catch (e) {
    return json(400, { error: e.message });
  }
};
