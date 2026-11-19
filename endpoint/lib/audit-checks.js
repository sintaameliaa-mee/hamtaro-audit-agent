// Deterministic Solidity pre-screen — pure JavaScript, no dependencies,
// no network, no Foundry. Used by the Vercel serverless function
// (api/audit.js) and by the local test runner (test/local-test.cjs).
//
// WHAT THIS IS: a pattern pre-screen. It flags code shapes that *look like*
// known bug classes. It does NOT prove a bug: every finding it returns has
// verdict "needs_validation", because confirmation needs a runnable PoC and
// an independent verifier — the two things the full audit in skill/SKILL.md
// adds and this endpoint deliberately does not claim to do.
//
// Checks (all labelled in the output):
//   1. reentrancy      — external call before a state write in one function
//   2. tx-origin       — use of tx.origin for authorization
//   3. unchecked-call  — low-level call whose return value is not checked
//   4. selfdestruct    — selfdestruct reachable without access control
//   5. delegatecall    — delegatecall, flagged harder when unguarded
//   6. div-before-mul  — division before multiplication (precision loss)
//   7. access-control  — sensitive function with no guard (heuristic)
//
// Every check works on comment-stripped, string-masked source with original
// line numbers preserved, so the reported lines match the submitted code.

"use strict";

const MAX_CODE_BYTES = 200 * 1024;

// ---------------------------------------------------------------------------
// Source preparation: strip comments, mask strings, keep line numbers.
// ---------------------------------------------------------------------------

// Returns an array of { no, code } — one entry per original line, with
// comments removed and string contents masked (quotes kept so the text
// still parses loosely). Line numbers are the ORIGINAL line numbers.
function prepareLines(source) {
  const raw = source.split("\n");
  const out = [];
  let inBlockComment = false;
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    let res = "";
    let j = 0;
    while (j < line.length) {
      if (inBlockComment) {
        const end = line.indexOf("*/", j);
        if (end === -1) { j = line.length; break; }
        inBlockComment = false;
        j = end + 2;
        continue;
      }
      const two = line.slice(j, j + 2);
      if (two === "//") break; // rest of line is a comment
      if (two === "/*") { inBlockComment = true; j += 2; continue; }
      const ch = line[j];
      if (ch === '"' || ch === "'") {
        // Mask a string literal, keeping the quotes.
        res += ch;
        j++;
        while (j < line.length && line[j] !== ch) {
          if (line[j] === "\\") j++; // skip escaped char
          j++;
        }
        if (j < line.length) { res += ch; j++; }
        continue;
      }
      res += ch;
      j++;
    }
    out.push({ no: i + 1, code: res });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lightweight structure scan: contracts, state variables, functions.
// ---------------------------------------------------------------------------

// Find contract-level state variable names (identifiers declared outside any
// function body, at brace depth 1 inside a contract). Used to tell a state
// write from a local assignment.
function findStateVariables(lines) {
  const vars = new Set();
  let depth = 0;
  let inContract = false;
  for (const { code } of lines) {
    const trimmed = code.trim();
    if (/^contract\s+\w+/.test(trimmed) || /^abstract\s+contract\s+\w+/.test(trimmed)) {
      inContract = true;
    }
    if (inContract && depth === 1) {
      // mapping(address => uint256) public balances;
      // uint256 public totalSupply;  address public owner;
      const m = trimmed.match(
        /^(?:mapping\s*\([^;]+\)|(?:uint\d*|int\d*|address|bool|bytes\d*|string|[A-Z]\w*(?:\[\])?))\s+(?:public|private|internal)?\s*(?:constant|immutable)?\s*(\w+)\s*(?:=[^;]*)?;/
      );
      if (m && !/^(function|constructor|event|error|modifier|struct|enum|using|import|pragma)$/.test(m[1])) {
        vars.add(m[1]);
      }
    }
    for (const ch of code) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth === 0) inContract = false;
  }
  return vars;
}

// Split the source into functions: { name, startLine, endLine, lines,
// visibility, modifiers, isViewOrPure, bodyText }.
function findFunctions(lines) {
  const fns = [];
  const joined = lines.map((l) => l.code).join("\n");
  // Match `function name(...)` headers, then brace-match the body.
  const headerRe = /function\s+(\w+)\s*\([^)]*\)\s*([^{;]*)\{/g;
  let m;
  while ((m = headerRe.exec(joined)) !== null) {
    const name = m[1];
    const headerTail = m[2] || "";
    const headerStartIdx = m.index;
    // Line number of the header start.
    const startLine = joined.slice(0, headerStartIdx).split("\n").length;
    // Brace-match from the `{` that ends the header.
    let depth = 0;
    let idx = headerStartIdx + m[0].length - 1; // at the `{`
    let endIdx = idx;
    for (; idx < joined.length; idx++) {
      if (joined[idx] === "{") depth++;
      else if (joined[idx] === "}") {
        depth--;
        if (depth === 0) { endIdx = idx; break; }
      }
    }
    const endLine = joined.slice(0, endIdx).split("\n").length;
    const fnLines = lines.filter((l) => l.no >= startLine && l.no <= endLine);
    const visibility = /external/.test(headerTail)
      ? "external"
      : /public/.test(headerTail)
        ? "public"
        : /internal/.test(headerTail)
          ? "internal"
          : /private/.test(headerTail)
            ? "private"
            : "default";
    const modifiers = [...headerTail.matchAll(/\b(only\w+|nonReentrant|whenNotPaused|initializer)\b/g)]
      .map((x) => x[1]);
    fns.push({
      name,
      startLine,
      endLine,
      lines: fnLines,
      visibility,
      modifiers,
      isViewOrPure: /\b(view|pure)\b/.test(headerTail),
      bodyText: fnLines.map((l) => l.code).join("\n"),
    });
  }
  return fns;
}

// ---------------------------------------------------------------------------
// Finding builder — mirrors the repo's findings.json record shape.
// ---------------------------------------------------------------------------

function makeFinding(opts) {
  return {
    verdict: "needs_validation",
    fingerprint: opts.fingerprint,
    title: opts.title,
    description: opts.description,
    root_cause: opts.rootCause,
    intended_behavior: opts.intendedBehavior,
    trace: opts.trace || [],
    evidence: opts.evidence || [],
    conditions: opts.conditions || [],
    execution: {
      attacker_perspective: opts.attackerPerspective ||
        "Not demonstrated — this pre-screen reports a code pattern only. " +
        "A runnable PoC (e.g. a Foundry test) is required before this " +
        "can be called confirmed.",
      payloads: [],
      instructions: [
        "Write a Foundry test that exercises the flagged path against the " +
        "contract, following demo/test/DemoVault.t.sol in this repo.",
        "Confirm the exploit effect, then re-run the same test against a " +
        "fixed version (counterfactual). Only a passing PoC plus a passing " +
        "counterfactual promotes this to confirmed.",
      ],
      observed_result: "None — no PoC has been run by this endpoint.",
    },
    remediation: {
      strategy: opts.remediation,
      code_changes: [],
    },
    severity: {
      likelihood: { score: opts.likelihood, reason: opts.likelihoodReason },
      impact: { score: opts.impact, reason: opts.impactReason },
      overall_severity: opts.severity,
    },
    confidence: {
      score: opts.confidence,
      reason: opts.confidenceReason,
    },
    check: opts.check,
    heuristic: !!opts.heuristic,
  };
}

const FILE = "input.sol";

// ---------------------------------------------------------------------------
// The checks.
// ---------------------------------------------------------------------------

function checkReentrancy(lines, fns, stateVars, findings) {
  const callRe = /\.(call|transfer|send)\s*(\{|\(|\s)/;
  for (const fn of fns) {
    if (fn.isViewOrPure) continue;
    // External-call lines in this function.
    const calls = fn.lines.filter((l) => callRe.test(l.code));
    if (calls.length === 0) continue;
    // State-write lines: assignment to a known state variable (or an
    // indexed/field access rooted at one), or `delete` of one.
    const writes = fn.lines.filter((l) => {
      for (const v of stateVars) {
        const w = new RegExp(`\\b${v}\\b\\s*(\\[[^\\]]*\\])?\\s*(\\.|\\+?=|-=|\\+\\+|--)`);
        if (w.test(l.code)) return true;
        if (new RegExp(`\\bdelete\\s+${v}\\b`).test(l.code)) return true;
      }
      return false;
    });
    for (const call of calls) {
      const laterWrite = writes.find((w) => w.no > call.no);
      if (!laterWrite) continue;
      const isValueCall = /\.call\s*\{[^}]*value\s*:/.test(call.code) ||
        /\.transfer\s*\(/.test(call.code) || /\.send\s*\(/.test(call.code);
      findings.push(makeFinding({
        check: "reentrancy",
        fingerprint: `input:${fn.name}:reentrancy`,
        title: `Possible reentrancy in ${fn.name}: external call before state update`,
        description:
          `${fn.name}() makes an external call at line ${call.no} and only ` +
          `updates state afterwards (line ${laterWrite.no}). A malicious ` +
          `receiver could re-enter ${fn.name}() before the state update ` +
          `takes effect and repeat the payout.`,
        rootCause:
          "Checks-effects-interactions ordering: the external call precedes " +
          "the state write in the same function, so a re-entered call still " +
          "sees the pre-call state.",
        intendedBehavior:
          "Each call settles its state effects before any external call, so " +
          "a re-entrant call cannot repeat the same effect.",
        trace: [
          { kind: "entrypoint", file: FILE, line: fn.startLine, scope: fn.name,
            description: `${fn.name}() is callable by an external address.` },
          { kind: "sink", file: FILE, line: call.no, scope: fn.name,
            description: "External call hands control to the callee." },
          { kind: "propagation", file: FILE, line: laterWrite.no, scope: fn.name,
            description: "State is updated only after the external call returns." },
        ],
        evidence: [
          { file: FILE, line: call.no, description: "External call." },
          { file: FILE, line: laterWrite.no, description: "State write after the call." },
        ],
        remediation:
          "Follow checks-effects-interactions: update all state before the " +
          "external call. Consider OpenZeppelin ReentrancyGuard as defense " +
          "in depth.",
        likelihood: isValueCall ? "high" : "medium",
        likelihoodReason: isValueCall
          ? "The call moves value and any receiver contract can re-enter."
          : "The call hands control to an external contract; exploitability depends on what the callee can re-enter.",
        impact: isValueCall ? "high" : "medium",
        impactReason: isValueCall
          ? "A re-entrant call can repeat a value payout."
          : "A re-entrant call can repeat the function's effect.",
        severity: isValueCall ? "high" : "medium",
        confidence: "medium",
        confidenceReason:
          "Static pattern match (call-before-write) with no PoC. A guard, a " +
          "reentrancy lock, or a call to a trusted address can make this a " +
          "false positive — confirm with a Foundry PoC.",
      }));
      break; // one reentrancy finding per function is enough
    }
  }
}

function checkTxOrigin(lines, findings) {
  for (const l of lines) {
    if (/\btx\.origin\b/.test(l.code)) {
      findings.push(makeFinding({
        check: "tx-origin",
        fingerprint: `input:tx-origin:${l.no}`,
        title: `tx.origin used for authorization (line ${l.no})`,
        description:
          `tx.origin is used at line ${l.no}. tx.origin is the original ` +
          `externally-owned account that started the transaction, not the ` +
          `immediate caller — a phishing contract can trick a user into ` +
          `calling it, and tx.origin will still be the user.`,
        rootCause:
          "Authorization based on tx.origin instead of msg.sender.",
        intendedBehavior:
          "Authorization checks use msg.sender, the immediate caller.",
        trace: [
          { kind: "sink", file: FILE, line: l.no, scope: "tx.origin",
            description: "tx.origin read." },
        ],
        evidence: [
          { file: FILE, line: l.no, description: "tx.origin use." },
        ],
        remediation: "Replace tx.origin with msg.sender for authorization.",
        likelihood: "medium",
        likelihoodReason: "Requires a victim to interact with a malicious contract.",
        impact: "high",
        impactReason: "Authorization bypass can let an attacker act as the victim.",
        severity: "medium",
        confidence: "high",
        confidenceReason: "Direct textual use of tx.origin; the only question is whether it guards anything sensitive.",
      }));
    }
  }
}

function checkUncheckedCalls(lines, fns, findings) {
  for (const l of lines) {
    const m = l.code.match(/\.(call|delegatecall|staticcall)\s*(\{|\(|\s)/);
    if (!m) continue;
    // Checked if: assigned (`(bool ok, ) = ...` / `ok = ...`), inside a
    // require, or followed by a require on the same line.
    const assigned = /=\s*[^=]*\.(call|delegatecall|staticcall)\s*(\{|\(|\s)/.test(l.code) ||
      /\(bool\s+\w+/.test(l.code);
    const inRequire = /require\s*\([^;]*\.(call|delegatecall|staticcall)\s*(\{|\(|\s)/.test(l.code);
    if (assigned || inRequire) continue;
    findings.push(makeFinding({
      check: "unchecked-call",
      fingerprint: `input:unchecked-call:${l.no}`,
      title: `Unchecked low-level ${m[1]} return value (line ${l.no})`,
      description:
        `A low-level ${m[1]} at line ${l.no} does not check its boolean ` +
        `return value. If the call fails silently, execution continues as ` +
        `though it succeeded.`,
      rootCause: "Low-level calls return false on failure instead of reverting; the return value is ignored here.",
      intendedBehavior: "Every low-level call's return value is checked (require or explicit handling).",
      trace: [
        { kind: "sink", file: FILE, line: l.no, scope: "low-level call",
          description: `Unchecked ${m[1]}.` },
      ],
      evidence: [
        { file: FILE, line: l.no, description: `Low-level ${m[1]} with no return-value check on this line.` },
      ],
      remediation: "Capture the return value and require it, e.g. `(bool ok, ) = target.call(...); require(ok, \"call failed\");`.",
      likelihood: "medium",
      likelihoodReason: "Depends on whether the callee can fail in practice.",
      impact: "medium",
      impactReason: "Silent failure can leave the contract in an inconsistent state.",
      severity: "medium",
      confidence: "medium",
      confidenceReason:
        "Heuristic: the check looks at the call's own line only. The return " +
        "value could be checked on a later line — verify by reading the function.",
      heuristic: true,
    }));
  }
}

function checkSelfdestruct(lines, fns, findings) {
  for (const l of lines) {
    if (!/\bselfdestruct\s*\(/.test(l.code)) continue;
    const fn = fns.find((f) => l.no >= f.startLine && l.no <= f.endLine);
    const guarded = fn && (fn.modifiers.length > 0 ||
      /require\s*\(\s*msg\.sender\s*==/.test(fn.bodyText));
    findings.push(makeFinding({
      check: "selfdestruct",
      fingerprint: `input:selfdestruct:${l.no}`,
      title: guarded
        ? `selfdestruct present (line ${l.no}) — verify the guard`
        : `Unguarded selfdestruct (line ${l.no})`,
      description:
        guarded
          ? `selfdestruct is used at line ${l.no} inside a function that ` +
            `appears guarded. Verify the guard actually restricts who can ` +
            `destroy the contract.`
          : `selfdestruct is used at line ${l.no} in a function with no ` +
            `visible access control. Anyone who can call it can destroy the ` +
            `contract and redirect its balance.`,
      rootCause: "selfdestruct permanently destroys the contract and sends its balance to a chosen address.",
      intendedBehavior: "selfdestruct, if used at all, is reachable only by an authorized admin.",
      trace: [
        { kind: "sink", file: FILE, line: l.no, scope: fn ? fn.name : "selfdestruct",
          description: "selfdestruct call." },
      ],
      evidence: [
        { file: FILE, line: l.no, description: "selfdestruct use." },
      ],
      remediation: "Restrict selfdestruct to a single admin role (e.g. onlyOwner) or remove it; prefer pausable patterns.",
      likelihood: guarded ? "low" : "high",
      likelihoodReason: guarded
        ? "A guard appears to be present; exploitability depends on the guard being correct."
        : "No access control is visible on the enclosing function.",
      impact: "high",
      impactReason: "Contract destruction and forced balance transfer.",
      severity: guarded ? "medium" : "high",
      confidence: guarded ? "low" : "medium",
      confidenceReason: guarded
        ? "Guard detection is a heuristic — read the modifier/require to confirm it is effective."
        : "Direct textual use of selfdestruct with no visible guard on the enclosing function.",
      heuristic: true,
    }));
  }
}

function checkDelegatecall(lines, fns, findings) {
  for (const l of lines) {
    if (!/\.delegatecall\s*(\{|\(|\s)/.test(l.code)) continue;
    const fn = fns.find((f) => l.no >= f.startLine && l.no <= f.endLine);
    const guarded = fn && (fn.modifiers.length > 0 ||
      /require\s*\(\s*msg\.sender\s*==/.test(fn.bodyText));
    findings.push(makeFinding({
      check: "delegatecall",
      fingerprint: `input:delegatecall:${l.no}`,
      title: guarded
        ? `delegatecall present (line ${l.no}) — verify target and guard`
        : `Unguarded delegatecall (line ${l.no})`,
      description:
        `delegatecall at line ${l.no} executes another contract's code in ` +
        `this contract's storage context. ` +
        (guarded
          ? "The enclosing function appears guarded; verify the target is " +
            "fixed or allow-listed and the guard is effective."
          : "The enclosing function has no visible access control, and if " +
            "the target address is attacker-controlled the caller can " +
            "rewrite this contract's storage."),
      rootCause: "delegatecall runs foreign code with this contract's storage, balance, and identity.",
      intendedBehavior: "delegatecall targets are fixed or allow-listed and reachable only by authorized callers.",
      trace: [
        { kind: "sink", file: FILE, line: l.no, scope: fn ? fn.name : "delegatecall",
          description: "delegatecall." },
      ],
      evidence: [
        { file: FILE, line: l.no, description: "delegatecall use." },
      ],
      remediation: "Allow-list delegatecall targets and restrict the function to an admin role; never delegatecall to an address supplied by the caller.",
      likelihood: guarded ? "low" : "medium",
      likelihoodReason: guarded
        ? "A guard appears to be present; exploitability depends on the guard and the target."
        : "No access control is visible; exploitability depends on whether the target is attacker-controlled.",
      impact: "high",
      impactReason: "Arbitrary code execution in this contract's storage context.",
      severity: guarded ? "medium" : "high",
      confidence: "medium",
      confidenceReason: "Direct textual use of delegatecall; guard detection is a heuristic — read the enclosing function.",
      heuristic: true,
    }));
  }
}

function checkDivBeforeMul(lines, findings) {
  for (const l of lines) {
    // a / b * c  or  a / b) * c  within one statement, ignoring `*` in
    // comments (already stripped) and exponentiation `**`.
    if (/\/\s*[^;*\n]+\*\s*[^*;]/.test(l.code) && !/\*\*/.test(l.code)) {
      // Skip lines that are just a division with a multiplication in a
      // different, parenthesised sub-expression is hard without a parser;
      // this is labelled heuristic.
      findings.push(makeFinding({
        check: "div-before-mul",
        fingerprint: `input:div-before-mul:${l.no}`,
        title: `Possible division before multiplication (line ${l.no})`,
        description:
          `Line ${l.no} divides before it multiplies. Integer division ` +
          `truncates, so dividing first throws away precision that ` +
          `multiplying first would have kept — amounts can come out ` +
          `smaller than intended.`,
        rootCause: "Solidity integer division truncates toward zero.",
        intendedBehavior: "Multiply before dividing (with overflow checked) so precision is preserved.",
        trace: [
          { kind: "sink", file: FILE, line: l.no, scope: "arithmetic",
            description: "Division before multiplication." },
        ],
        evidence: [
          { file: FILE, line: l.no, description: "Expression divides, then multiplies." },
        ],
        remediation: "Reorder to multiply first, then divide; check for overflow (Solidity 0.8+ reverts on overflow by default).",
        likelihood: "medium",
        likelihoodReason: "Depends on the operand magnitudes; small amounts lose the most.",
        impact: "low",
        impactReason: "Precision loss, usually a rounding error rather than a drain.",
        severity: "low",
        confidence: "low",
        confidenceReason:
          "Heuristic pattern match on one line. The division and the " +
          "multiplication may belong to separate sub-expressions — read " +
          "the statement to confirm.",
        heuristic: true,
      }));
    }
  }
}

const SENSITIVE_NAMES = [
  // Admin-only operations. Deliberately NOT included: withdraw / mint /
  // burn — those are commonly public by design (users act on their own
  // balance), so flagging them would be noise.
  "setowner", "transferownership",
  "pause", "unpause", "upgrade", "setfee", "sweep", "rescue",
  "initialize", "setadmin", "grantrole", "revokerole", "kill", "destroy",
  "setimplementation", "setguardian",
];

function checkAccessControl(lines, fns, findings) {
  for (const fn of fns) {
    if (fn.isViewOrPure) continue;
    if (fn.visibility !== "public" && fn.visibility !== "external") continue;
    const lower = fn.name.toLowerCase();
    const sensitive = SENSITIVE_NAMES.find((n) => lower.includes(n));
    if (!sensitive) continue;
    if (fn.modifiers.length > 0) continue;
    // Any sender-based require counts as a guard for this check. A
    // tx.origin guard is still wrong, but the tx-origin check already
    // flags it — no need for a second, noisier finding here.
    if (/require\s*\([^;]*(msg\.sender|tx\.origin)\s*==/.test(fn.bodyText)) continue;
    if (/onlyOwner|onlyAdmin|onlyRole/.test(fn.bodyText)) continue;
    findings.push(makeFinding({
      check: "access-control",
      fingerprint: `input:access-control:${fn.name}`,
      title: `Sensitive function ${fn.name}() has no visible access control`,
      description:
        `${fn.name}() is ${fn.visibility} and its name suggests a ` +
        `sensitive operation (${sensitive}), but it has no modifier and no ` +
        `msg.sender check. Anyone may be able to call it.`,
      rootCause: "No access control is visible on a function whose name suggests a privileged operation.",
      intendedBehavior: "Sensitive operations are restricted to authorized roles.",
      trace: [
        { kind: "entrypoint", file: FILE, line: fn.startLine, scope: fn.name,
          description: `${fn.name}() is ${fn.visibility} with no guard.` },
      ],
      evidence: [
        { file: FILE, line: fn.startLine, description: `${fn.name}() header — no modifier, no sender check in body.` },
      ],
      remediation: "Add an access-control modifier (e.g. onlyOwner / AccessControl roles) or a msg.sender check.",
      likelihood: "medium",
      likelihoodReason: "Any address can call the function as written.",
      impact: "medium",
      impactReason: "Depends on what the function actually does — the name alone does not prove impact.",
      severity: "medium",
      confidence: "low",
      confidenceReason:
        "Heuristic: the check is name-based. The function may be " +
        "intentionally public, or guarded by logic this pre-screen cannot " +
        "see — read the function before acting.",
      heuristic: true,
    }));
  }
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

const CHECKS = [
  { id: "reentrancy", description: "external call before state update in one function" },
  { id: "tx-origin", description: "tx.origin used (authorization bypass risk)" },
  { id: "unchecked-call", description: "low-level call return value not checked" },
  { id: "selfdestruct", description: "selfdestruct reachable without access control" },
  { id: "delegatecall", description: "delegatecall, flagged harder when unguarded" },
  { id: "div-before-mul", description: "division before multiplication (precision loss, heuristic)" },
  { id: "access-control", description: "sensitive function with no visible guard (heuristic)" },
];

// audit(code) -> { verdict, findings, checks_run, stats, limitations, scope }
function audit(code) {
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new Error("`code` must be a non-empty string of Solidity source.");
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    throw new Error(`\`code\` exceeds the ${MAX_CODE_BYTES / 1024} KB limit.`);
  }
  const lines = prepareLines(code);
  const stateVars = findStateVariables(lines);
  const fns = findFunctions(lines);
  const findings = [];
  checkReentrancy(lines, fns, stateVars, findings);
  checkTxOrigin(lines, findings);
  checkUncheckedCalls(lines, fns, findings);
  checkSelfdestruct(lines, fns, findings);
  checkDelegatecall(lines, fns, findings);
  checkDivBeforeMul(lines, findings);
  checkAccessControl(lines, fns, findings);

  const severities = findings.map((f) => f.severity.overall_severity);
  const verdict = severities.includes("high")
    ? "high-risk patterns found"
    : findings.length > 0
      ? "patterns found — review recommended"
      : "no patterns found";

  return {
    agent: "hamtaro-audit-agent/endpoint-pre-screen",
    scope: "deterministic pre-screen of the submitted Solidity snippet",
    verdict,
    findings,
    checks_run: CHECKS,
    stats: {
      lines: lines.length,
      functions: fns.length,
      state_variables: stateVars.size,
      findings_by_severity: {
        high: severities.filter((s) => s === "high").length,
        medium: severities.filter((s) => s === "medium").length,
        low: severities.filter((s) => s === "low").length,
      },
    },
    limitations: [
      "Pattern-based only: every finding is verdict needs_validation. " +
        "Confirmation requires a runnable PoC and an independent verifier.",
      "Heuristic checks (access-control, div-before-mul, unchecked-call, " +
        "selfdestruct/delegatecall guard detection) can false-positive — " +
        "read the flagged code before acting.",
      "No inter-contract analysis, no control-flow or data-flow analysis, " +
        "no compilation, no Foundry. This endpoint is the deterministic " +
        "pre-screen; the full multi-agent audit runs in Muse per " +
        "skill/SKILL.md and is evidenced by the sample runs in this repo.",
    ],
  };
}

module.exports = { audit, CHECKS, MAX_CODE_BYTES, prepareLines, findFunctions, findStateVariables };
