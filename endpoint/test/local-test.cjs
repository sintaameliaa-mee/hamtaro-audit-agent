// Local test runner for the endpoint — no network, no Vercel CLI.
// Invokes the audit checker directly AND the HTTP handler with mock
// req/res objects, using three sample Solidity snippets:
//   1. clean vault      — expects 0 findings
//   2. reentrant vault  — expects a high reentrancy finding
//   3. tx.origin auth   — expects a tx.origin finding
// Run: node test/local-test.cjs        (or: npm test)
// Exit 0 only if every expectation holds.

"use strict";

const { audit } = require("../lib/audit-checks");
const handler = require("../api/audit");

const CLEAN = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract CleanVault {
    mapping(address => uint256) public balances;
    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing to withdraw");
        balances[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }
}
`;

const REENTRANT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract ReentrantVault {
    mapping(address => uint256) public balances;
    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing to withdraw");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] = 0;
    }
}
`;

const TX_ORIGIN = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract TxOriginAuth {
    address public owner;
    constructor() {
        owner = msg.sender;
    }
    function transferOwnership(address newOwner) external {
        require(tx.origin == owner, "not owner");
        owner = newOwner;
    }
}
`;

// 4th snippet: an admin operation with no guard at all — the
// access-control heuristic should still fire on genuinely sensitive names.
const UNGUARDED_PAUSE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Pausable {
    bool public paused;
    function pause() external {
        paused = true;
    }
}
`;

let failures = 0;
function check(name, cond, detail) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

function summarize(result) {
  return result.findings.map((f) =>
    `    - [${f.severity.overall_severity}] ${f.check}: ${f.title} ` +
    `(verdict=${f.verdict}, confidence=${f.confidence.score})`
  ).join("\n") || "    (no findings)";
}

// Minimal mock of the Node http req/res pair the handler expects.
function mockReq(method, bodyObj) {
  const listeners = {};
  return {
    method,
    body: bodyObj,
    on: (ev, fn) => { listeners[ev] = fn; },
    destroy: () => {},
  };
}
function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader: (k, v) => { res.headers[k] = v; },
    status: (code) => { res.statusCode = code; return res; },
    json: (obj) => { res.body = obj; return res; },
    end: () => res,
  };
  return res;
}

async function main() {
  console.log("== direct audit() tests ==");

  console.log("1. clean vault (checks-effects-interactions, state first):");
  const clean = audit(CLEAN);
  console.log(`   verdict: ${clean.verdict}`);
  console.log(summarize(clean));
  check("clean vault has 0 findings", clean.findings.length === 0,
    `${clean.findings.length} found`);
  check("clean vault verdict is 'no patterns found'",
    clean.verdict === "no patterns found", clean.verdict);

  console.log("2. reentrant vault (call before state update):");
  const re = audit(REENTRANT);
  console.log(`   verdict: ${re.verdict}`);
  console.log(summarize(re));
  const reF = re.findings.find((f) => f.check === "reentrancy");
  check("reentrant vault flags reentrancy", !!reF);
  check("reentrancy finding is high severity",
    reF && reF.severity.overall_severity === "high",
    reF ? reF.severity.overall_severity : "no finding");
  check("reentrancy finding is needs_validation (not confirmed)",
    reF && reF.verdict === "needs_validation",
    reF ? reF.verdict : "no finding");
  check("reentrancy evidence cites the call line and the later write line",
    reF && reF.evidence.length >= 2 &&
      reF.evidence[1].line > reF.evidence[0].line,
    reF ? reF.evidence.map((e) => e.line).join(",") : "no finding");

  console.log("3. tx.origin auth:");
  const tx = audit(TX_ORIGIN);
  console.log(`   verdict: ${tx.verdict}`);
  console.log(summarize(tx));
  const txF = tx.findings.find((f) => f.check === "tx-origin");
  check("tx.origin snippet flags tx-origin", !!txF);
  check("tx.origin finding is needs_validation",
    txF && txF.verdict === "needs_validation",
    txF ? txF.verdict : "no finding");

  console.log("4. unguarded pause() (admin op, no guard):");
  const pu = audit(UNGUARDED_PAUSE);
  console.log(`   verdict: ${pu.verdict}`);
  console.log(summarize(pu));
  const puF = pu.findings.find((f) => f.check === "access-control");
  check("unguarded pause() flags access-control", !!puF);
  check("access-control finding is labelled heuristic",
    puF && puF.heuristic === true,
    puF ? `heuristic=${puF.heuristic}` : "no finding");

  console.log("== HTTP handler tests (mock req/res) ==");
  const req = mockReq("POST", { code: REENTRANT });
  const res = mockRes();
  await handler(req, res);
  check("handler returns 200 for a valid POST", res.statusCode === 200,
    `status ${res.statusCode}`);
  check("handler response carries the reentrancy finding",
    res.body && res.body.findings &&
      res.body.findings.some((f) => f.check === "reentrancy"));
  check("handler response includes checks_run (7 checks)",
    res.body && res.body.checks_run && res.body.checks_run.length === 7,
    res.body && res.body.checks_run ? `${res.body.checks_run.length} checks` : "none");
  check("handler response includes the limitations note",
    res.body && Array.isArray(res.body.limitations) && res.body.limitations.length > 0);

  const badReq = mockReq("POST", { code: "   " });
  const badRes = mockRes();
  await handler(badReq, badRes);
  check("handler returns 400 for empty code", badRes.statusCode === 400,
    `status ${badRes.statusCode}`);

  const getReq = mockReq("GET", null);
  const getRes = mockRes();
  await handler(getReq, getRes);
  check("handler returns 200 + usage for GET",
    getRes.statusCode === 200 && getRes.body && getRes.body.endpoint === "POST /api/audit",
    `status ${getRes.statusCode}`);

  console.log(failures === 0
    ? "\nAll local tests passed."
    : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Test runner crashed:", e);
  process.exit(1);
});
