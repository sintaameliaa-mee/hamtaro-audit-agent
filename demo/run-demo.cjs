#!/usr/bin/env node
/**
 * Demo runner for the security-audit agent (Agent Games Wildcard entry).
 *
 * Walks the pipeline end-to-end against the INTENTIONAL demo target
 * (demo/src/DemoVault.sol, a small vault with a deliberate reentrancy bug):
 *
 *   Phase 1 — coverage ledger: seed 3 planned units, validate the ledger.
 *   Phase 2 — hunt: run the Foundry PoC tests (the evidence).
 *   Phase 3 — independent verifier: fresh re-run of the attack test, a
 *             counterfactual run against the FIXED vault (attack must
 *             fail), and a source-order check (call before state update).
 *   Phase 4 — findings: write findings.json with the one confirmed finding
 *             and validate it; update the ledger and validate it again.
 *
 * What this runner is, honestly: a deterministic walkthrough of the
 * pipeline's artifact flow. In the real runs (see ../sample-runs/) the
 * hunting and the verification are done by agents following skill/SKILL.md;
 * this script replays the same phases with pre-written PoC tests so a
 * reviewer can see the whole loop run in about a minute. The script does
 * NOT claim to discover bugs by itself.
 *
 * Zero dependencies. Requires: node >= 18 and Foundry's `forge`
 * (https://getfoundry.sh) on PATH, in ~/.foundry/bin, or via FORGE_BIN.
 *
 * Usage: node run-demo.cjs        (from the demo/ directory, or anywhere)
 * Outputs: demo/out/ (ledger, findings, logs, demo-report.md)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const DEMO_DIR = __dirname;
const REPO_DIR = path.resolve(DEMO_DIR, "..");
const SKILL_DIR = path.join(REPO_DIR, "skill");
const OUT_DIR = path.join(DEMO_DIR, "out");

const { canonicalCoverageId } = require(path.join(
  SKILL_DIR,
  "validate-coverage-ledger.cjs"
));

const FINDING_FINGERPRINT = "demo-vault:withdraw:reentrancy";
const HUNTER_ID = "hunter-demo";
const VERIFIER_ID = "verifier-demo";

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`\nDEMO FAILED: ${msg}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return {
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    error: res.error || null,
  };
}

function resolveForge() {
  if (process.env.FORGE_BIN) return process.env.FORGE_BIN;
  const found = run("which", ["forge"]);
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  const homeForge = path.join(os.homedir(), ".foundry", "bin", "forge");
  if (fs.existsSync(homeForge)) return homeForge;
  fail(
    "forge (Foundry) not found. Install it from https://getfoundry.sh, " +
      "add it to PATH, or set FORGE_BIN to its location."
  );
}

function runValidator(script, target, label) {
  const res = run(process.execPath, [path.join(SKILL_DIR, script), target], {
    cwd: DEMO_DIR,
  });
  const output = `${res.stdout}${res.stderr}`.trim();
  log(`    ${label}: ${output.split("\n").join(" | ")}`);
  if (res.status !== 0) fail(`${label} failed for ${target}`);
  return output;
}

function findLine(file, needle) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const idx = lines.findIndex((l) => l.includes(needle));
  if (idx === -1) fail(`pattern not found in ${file}: ${needle}`);
  return idx + 1; // 1-based
}

// ---------------------------------------------------------------------------
// Phase 1 — coverage ledger (planned, before any hunting)
// ---------------------------------------------------------------------------

function ledgerUnit(refs, startingPaths, extra = {}) {
  return {
    coverage_id: canonicalCoverageId(refs),
    canonical_refs: refs,
    surface: refs.surface,
    boundary: refs.boundary,
    subsystem: refs.subsystem,
    attack_class: refs.attack_class,
    starting_paths: startingPaths,
    ordinary_attack_class_block: null,
    selected_companion_blocks: [],
    excluded_blocks: [],
    prior_status: "new",
    attempts: [],
    wave: 1,
    status: "planned",
    agent_id: null,
    reviewed_paths: [],
    local_checks: [],
    result_fingerprints: [],
    unresolved: [],
    ...extra,
  };
}

function seedLedger() {
  return [
    ledgerUnit(
      {
        surface: "demo#DemoVault-deposit",
        boundary: "demo/src/DemoVault.sol#deposit",
        subsystem: "profile/demo/vault",
        attack_class: "ATTACK-CLASSES.md#Access control",
      },
      ["demo/src/DemoVault.sol"]
    ),
    ledgerUnit(
      {
        surface: "demo#DemoVault-withdraw",
        boundary: "demo/src/DemoVault.sol#withdraw",
        subsystem: "profile/demo/vault",
        attack_class: "ATTACK-CLASSES.md#Reentrancy",
      },
      ["demo/src/DemoVault.sol", "demo/src/Attacker.sol"]
    ),
    ledgerUnit(
      {
        surface: "demo#DemoVault-accounting",
        boundary: "demo/src/DemoVault.sol#balances",
        subsystem: "profile/demo/vault",
        attack_class: "ATTACK-CLASSES.md#Business logic",
      },
      ["demo/src/DemoVault.sol"]
    ),
  ];
}

// ---------------------------------------------------------------------------
// Phase 2/3 — Foundry evidence
// ---------------------------------------------------------------------------

function forgeTest(forge, matchTest, logFile) {
  const args = ["test"];
  if (matchTest) args.push("--match-test", matchTest);
  const res = run(forge, args, { cwd: DEMO_DIR });
  const combined = `$ forge ${args.join(" ")}\n\n${res.stdout}${res.stderr}`;
  fs.writeFileSync(logFile, combined);
  return { res, combined };
}

function expectPass(combined, testName, where) {
  if (!combined.includes(`[PASS] ${testName}()`)) {
    fail(`expected ${testName} to PASS in ${where}; see the log for details`);
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — findings record (schema: skill/report-schema.json)
// ---------------------------------------------------------------------------

function buildFinding(lines) {
  return [
    {
      verdict: "confirmed",
      fingerprint: FINDING_FINGERPRINT,
      title: "Reentrancy in DemoVault.withdraw drains the whole vault",
      description:
        "DemoVault.withdraw() sends ETH to the caller before zeroing the " +
        "caller's recorded balance, so a malicious receiver contract can " +
        "re-enter withdraw() and be paid its full balance again on every " +
        "re-entry. A 1-ether attacker drains the entire vault, including " +
        "other users' deposits. (Intentional demo bug in DemoVault.sol.)",
      root_cause:
        "Checks-interactions-effects ordering: the external call at " +
        "DemoVault.sol withdraw() precedes the balance update " +
        "(balances[msg.sender] = 0), so the balance check on re-entry " +
        "still sees the pre-withdrawal balance.",
      intended_behavior:
        "Each withdrawal pays the caller exactly its recorded balance once; " +
        "no caller can withdraw more than it deposited, and no caller can " +
        "withdraw other users' funds.",
      trace: [
        {
          kind: "entrypoint",
          file: "demo/src/DemoVault.sol",
          line: lines.withdrawFn,
          scope: "DemoVault.withdraw",
          description:
            "Public withdraw() reads the caller's balance and checks it is non-zero.",
        },
        {
          kind: "propagation",
          file: "demo/src/Attacker.sol",
          line: lines.attackerReceive,
          scope: "Attacker.receive",
          description:
            "The attacker's receive() callback re-enters withdraw() while the vault still holds funds.",
        },
        {
          kind: "sink",
          file: "demo/src/DemoVault.sol",
          line: lines.externalCall,
          scope: "DemoVault.withdraw",
          description:
            "The external call pays the caller before the balance is zeroed, so every re-entry pays again.",
        },
      ],
      evidence: [
        {
          file: "demo/src/DemoVault.sol",
          line: lines.externalCall,
          description:
            "External call precedes the state update (call at this line, balance zeroed later).",
        },
        {
          file: "demo/src/DemoVault.sol",
          line: lines.balanceZero,
          description:
            "Balance is zeroed only after the external call returns.",
        },
        {
          file: "demo/test/DemoVault.t.sol",
          line: lines.testAttack,
          description:
            "Foundry test testReentrancyDrainsVault: 1-ether attacker drains the vault; PASS.",
        },
        {
          file: "demo/test/DemoVault.t.sol",
          line: lines.testFixed,
          description:
            "Foundry test testFixedVaultBlocksReentrancy: the same attack fails against DemoVaultFixed; PASS.",
        },
      ],
      conditions: [
        {
          kind: "authentication_level",
          description:
            "No privilege needed: any address that can deposit 1 ether can run the attack.",
        },
        {
          kind: "data_state",
          description:
            "The vault must hold other users' deposits for the drain to exceed the attacker's own funds.",
        },
      ],
      execution: {
        attacker_perspective:
          "An ordinary depositor with 1 ether, no special role, no victim cooperation.",
        payloads: [
          "Attacker.attack() after funding the Attacker contract with 1 ether",
          "Attacker.receive() re-enters DemoVault.withdraw() while vault balance >= 1 ether",
        ],
        instructions: [
          "Deploy DemoVault; a victim deposits 10 ether.",
          "Deploy Attacker pointing at the vault; fund it with 1 ether.",
          "Call Attacker.attack(): it deposits 1 ether, then withdraws; each payout re-enters withdraw().",
          "Or run the packaged PoC: forge test --match-test testReentrancyDrainsVault.",
        ],
        observed_result:
          "Vault balance 0 ether; attacker balance 11 ether (10 ether of victim funds plus its own 1 ether deposit); 10 reentrant calls. " +
          "Foundry test testReentrancyDrainsVault PASS. Counterfactual: the same attack against DemoVaultFixed fails and all funds stay in place " +
          "(testFixedVaultBlocksReentrancy PASS).",
      },
      remediation: {
        strategy:
          "Follow checks-effects-interactions: zero the caller's balance before the external call (see DemoVaultFixed.sol). " +
          "Consider a reentrancy guard as defense in depth.",
        code_changes: [
          {
            file_name: "demo/src/DemoVault.sol",
            fixed_code:
              "balances[msg.sender] = 0;\n(bool ok, ) = msg.sender.call{value: amount}(\"\");\nrequire(ok, \"transfer failed\");",
          },
        ],
      },
      severity: {
        likelihood: {
          score: "high",
          reason:
            "Any depositor can run it with no privilege, no victim action, and no timing window.",
        },
        impact: {
          score: "high",
          reason:
            "Total loss of all deposited funds: the attacker takes every other user's deposit.",
        },
        overall_severity: "high",
      },
      confidence: {
        score: "high",
        reason:
          "Demonstrated end-to-end by a passing Foundry PoC, independently re-run, with a passing counterfactual against the fixed contract.",
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const started = new Date();
  log("security-audit demo runner");
  log("=========================");
  log(`Target: demo/src/DemoVault.sol (INTENTIONAL demo reentrancy bug)`);
  log(`Started: ${started.toISOString()}\n`);

  // --- Preflight -----------------------------------------------------------
  const forge = resolveForge();
  const forgeVersion = run(forge, ["--version"]);
  log(`[preflight] forge: ${forgeVersion.stdout.trim().split("\n")[0]}`);
  for (const f of ["validate-findings.cjs", "validate-coverage-ledger.cjs", "report-schema.json"]) {
    if (!fs.existsSync(path.join(SKILL_DIR, f))) fail(`missing skill file: ${f}`);
  }
  log("[preflight] skill validators present");
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT_DIR, "agents", HUNTER_ID, "artifacts"), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "agents", VERIFIER_ID, "artifacts"), { recursive: true });

  // --- Phase 1: coverage ledger, seeded BEFORE hunting ---------------------
  log("\n[phase 1] coverage ledger — seeding 3 planned units (before hunting)");
  const ledgerPath = path.join(OUT_DIR, "coverage-ledger.json");
  const ledger = seedLedger();
  ledger.sort((a, b) => (a.coverage_id < b.coverage_id ? -1 : 1)); // validator requires lexicographic order
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  log(`    wrote ${path.relative(REPO_DIR, ledgerPath)} (3 units, all planned)`);
  runValidator("validate-coverage-ledger.cjs", ledgerPath, "ledger validator (seed)");

  // --- Phase 2: hunt — run the PoC tests ------------------------------------
  log("\n[phase 2] hunt — running the Foundry PoC tests");
  const huntLog = path.join(OUT_DIR, "agents", HUNTER_ID, "artifacts", "forge-test.log");
  const hunt = forgeTest(forge, null, huntLog);
  if (hunt.res.status !== 0) fail(`forge test failed; see ${huntLog}`);
  for (const t of ["testReentrancyDrainsVault", "testFixedVaultBlocksReentrancy", "testHonestWithdrawWorks"]) {
    expectPass(hunt.combined, t, "hunt run");
    log(`    [PASS] ${t}`);
  }
  log("    candidate recorded: reentrancy in DemoVault.withdraw (PoC demonstrates a full vault drain)");

  // --- Phase 3: independent verifier ---------------------------------------
  log("\n[phase 3] independent verifier — trying to refute the candidate");
  const verifyLog = path.join(OUT_DIR, "agents", VERIFIER_ID, "artifacts", "verifier.log");
  const vLines = [];
  const vLog = (s) => {
    vLines.push(s);
    log(`    ${s}`);
  };

  // 3a. Fresh re-run of the attack test (separate process, no shared state).
  const attackLog = path.join(OUT_DIR, "agents", VERIFIER_ID, "artifacts", "forge-attack-rerun.log");
  const rerun = forgeTest(forge, "testReentrancyDrainsVault", attackLog);
  if (rerun.res.status !== 0) fail("verifier re-run of the attack test failed");
  expectPass(rerun.combined, "testReentrancyDrainsVault", "verifier re-run");
  vLog("3a. attack PoC re-run in a fresh process: PASS (reproduces)");

  // 3b. Counterfactual: the same attack against the fixed vault must fail.
  const fixedLog = path.join(OUT_DIR, "agents", VERIFIER_ID, "artifacts", "forge-fixed.log");
  const fixed = forgeTest(forge, "testFixedVaultBlocksReentrancy", fixedLog);
  if (fixed.res.status !== 0) fail("verifier counterfactual run failed");
  expectPass(fixed.combined, "testFixedVaultBlocksReentrancy", "verifier counterfactual");
  vLog("3b. counterfactual vs DemoVaultFixed: attack FAILS, funds stay put (the bug is the code order, not the test)");

  // 3c. Source-order check: the call must precede the state update in
  // DemoVault, and follow it in DemoVaultFixed.
  const vaultSrc = path.join(DEMO_DIR, "src", "DemoVault.sol");
  const fixedSrc = path.join(DEMO_DIR, "src", "DemoVaultFixed.sol");
  const callLine = findLine(vaultSrc, "msg.sender.call{value: amount}");
  const zeroLine = findLine(vaultSrc, "balances[msg.sender] = 0;");
  if (!(callLine < zeroLine)) fail("expected the external call to precede the balance update in DemoVault.sol");
  vLog(`3c. source order in DemoVault.sol: external call line ${callLine} BEFORE balance update line ${zeroLine} — root cause confirmed in source`);
  const fixedCallLine = findLine(fixedSrc, "msg.sender.call{value: amount}");
  const fixedZeroLine = findLine(fixedSrc, "balances[msg.sender] = 0;");
  if (!(fixedZeroLine < fixedCallLine)) fail("expected the fix to update state before the call in DemoVaultFixed.sol");
  vLog(`    source order in DemoVaultFixed.sol: balance update line ${fixedZeroLine} BEFORE call line ${fixedCallLine} — fix is real`);

  // 3d. Gate check: the skill only confirms a demonstrated boundary failure.
  const gate = [
    ["lower-trust principal", "any depositor (no role, no privilege)"],
    ["accepted input", "a plain withdraw() call after a 1-ether deposit"],
    ["intended control", "the balances ledger: each caller withdraws at most its own deposit"],
    ["crossed boundary", "the vault pays out other users' deposits to the attacker"],
    ["observed result", "vault 0 ether; attacker 11 ether (10 ether victim funds); 10 re-entries"],
  ];
  for (const [k, v] of gate) vLog(`3d. gate — ${k}: ${v}`);
  vLog("verdict: the verifier could not refute the candidate. Finding stands.");
  fs.writeFileSync(verifyLog, `${vLines.join("\n")}\n`);

  // Line numbers for the finding record (measured, not hardcoded).
  const lines = {
    withdrawFn: findLine(vaultSrc, "function withdraw()"),
    externalCall: callLine,
    balanceZero: zeroLine,
    attackerReceive: findLine(path.join(DEMO_DIR, "src", "Attacker.sol"), "receive() external payable"),
    testAttack: findLine(path.join(DEMO_DIR, "test", "DemoVault.t.sol"), "attacker.attack();"),
    testFixed: findLine(path.join(DEMO_DIR, "test", "DemoVault.t.sol"), "function testFixedVaultBlocksReentrancy()"),
  };

  // --- Phase 4: findings + final ledger ------------------------------------
  log("\n[phase 4] findings — writing findings.json and updating the ledger");
  const findingsPath = path.join(OUT_DIR, "findings.json");
  const findings = buildFinding(lines);
  fs.writeFileSync(findingsPath, `${JSON.stringify(findings, null, 2)}\n`);
  log(`    wrote ${path.relative(REPO_DIR, findingsPath)} (1 confirmed finding: ${FINDING_FINGERPRINT})`);
  runValidator("validate-findings.cjs", findingsPath, "findings validator");

  const bySurface = Object.fromEntries(ledger.map((u) => [u.surface, u]));
  const check = (agentId, reviewedPaths, invariant, method, result, artifact) => ({
    agent_id: agentId,
    reviewed_paths: reviewedPaths,
    invariant,
    method,
    result,
    artifact,
  });
  Object.assign(bySurface["demo#DemoVault-deposit"], {
    status: "covered",
    agent_id: HUNTER_ID,
    reviewed_paths: ["demo/src/DemoVault.sol"],
    local_checks: [
      check(
        HUNTER_ID,
        ["demo/src/DemoVault.sol"],
        "deposit() credits exactly the sent value to the sender",
        "local",
        "Holds. testHonestWithdrawWorks deposits 10 ether and the ledger reads 10 ether before withdrawal.",
        `agents/${HUNTER_ID}/artifacts/forge-test.log`
      ),
    ],
  });
  Object.assign(bySurface["demo#DemoVault-withdraw"], {
    status: "candidate",
    agent_id: HUNTER_ID,
    reviewed_paths: ["demo/src/DemoVault.sol", "demo/src/Attacker.sol"],
    local_checks: [
      check(
        HUNTER_ID,
        ["demo/src/DemoVault.sol", "demo/src/Attacker.sol"],
        "withdraw() pays the caller at most its recorded balance, once",
        "local",
        "VIOLATED. testReentrancyDrainsVault: a 1-ether attacker drains the whole vault (11 ether out, 10 of them victim funds); independently re-run and counterfactually confirmed against DemoVaultFixed.",
        `agents/${HUNTER_ID}/artifacts/forge-test.log`
      ),
    ],
    result_fingerprints: [FINDING_FINGERPRINT],
  });
  Object.assign(bySurface["demo#DemoVault-accounting"], {
    status: "covered",
    agent_id: HUNTER_ID,
    reviewed_paths: ["demo/src/DemoVault.sol"],
    local_checks: [
      check(
        HUNTER_ID,
        ["demo/src/DemoVault.sol"],
        "honest deposit + full withdrawal leaves the user whole and the ledger zeroed",
        "local",
        "Holds. testHonestWithdrawWorks: vault 0, ledger 0, victim balance restored.",
        `agents/${HUNTER_ID}/artifacts/forge-test.log`
      ),
    ],
  });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  log("    ledger updated: 2 covered, 1 candidate");
  runValidator("validate-coverage-ledger.cjs", ledgerPath, "ledger validator (final)");

  // --- Demo report ----------------------------------------------------------
  const finished = new Date();
  const seconds = ((finished - started) / 1000).toFixed(1);
  const report = [
    "# Demo run report — security-audit pipeline",
    "",
    `Run: ${started.toISOString()} → ${finished.toISOString()} (${seconds}s)`,
    "Target: demo/src/DemoVault.sol — INTENTIONAL demo reentrancy bug (do not deploy).",
    "",
    "## Result",
    "",
    "- Coverage ledger: 3 units seeded before hunting; final state 2 covered, 1 candidate. Validator PASS.",
    "- Hunt: 3 Foundry PoC tests, all PASS (testReentrancyDrainsVault, testFixedVaultBlocksReentrancy, testHonestWithdrawWorks).",
    "- Verifier: attack PoC re-run in a fresh process (PASS); counterfactual against DemoVaultFixed (attack fails); source-order check confirms the call precedes the balance update.",
    "- Findings: 1 confirmed (high) — reentrancy in DemoVault.withdraw; findings.json validator PASS.",
    "",
    "## Observed result",
    "",
    "A 1-ether attacker drains the entire vault in one call: vault 0 ether, attacker 11 ether (10 ether of victim funds), 10 reentrant calls.",
    "",
    "## Artifacts",
    "",
    "- coverage-ledger.json, findings.json (this directory)",
    "- agents/hunter-demo/artifacts/forge-test.log",
    "- agents/verifier-demo/artifacts/verifier.log, forge-attack-rerun.log, forge-fixed.log",
    "",
    "## Honesty note",
    "",
    "This runner replays the pipeline's phases deterministically with pre-written PoC tests. In the real runs under ../sample-runs/, the hunting and verification were done by agents following skill/SKILL.md. The runner demonstrates the artifact flow and the verifier gate; it does not claim to discover bugs by itself.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "demo-report.md"), report);

  log("\n=========================");
  log(`DONE in ${seconds}s. 1 confirmed finding (high): reentrancy in DemoVault.withdraw.`);
  log(`Artifacts in ${path.relative(process.cwd(), OUT_DIR)}/`);
  log("Ledger: 2 covered, 1 candidate. Both validators PASS.");
}

main();
