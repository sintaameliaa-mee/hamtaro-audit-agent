// POST /api/audit — deterministic Solidity pre-screen.
// Vercel serverless function (Node, zero dependencies).
//
// Request:  POST with JSON body { "code": "<solidity source>" } (<= 200 KB)
// Response: JSON — { agent, scope, verdict, findings, checks_run, stats,
//           limitations } where each finding mirrors the repo's
//           findings.json record shape (verdict: "needs_validation").
//
// GET returns a short usage document. This endpoint is a public demo:
// no auth, no state, no external calls, no code execution.

"use strict";

const { audit, MAX_CODE_BYTES } = require("../lib/audit-checks");

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
    'msg.sender.call{value: 1}(\"\"); require(ok); } }"}\'',
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_CODE_BYTES + 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json(USAGE);
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed; use POST with { code }" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (!body || typeof body.code !== "string" || body.code.trim().length === 0) {
    return res.status(400).json({ error: "`code` must be a non-empty string of Solidity source." });
  }

  try {
    const result = audit(body.code);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
