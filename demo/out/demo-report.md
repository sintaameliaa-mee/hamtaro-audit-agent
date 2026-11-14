# Demo run report — security-audit pipeline

Run: 2026-11-14T15:23:31.758Z → 2026-11-14T15:23:32.251Z (0.5s)
Target: demo/src/DemoVault.sol — INTENTIONAL demo reentrancy bug (do not deploy).

## Result

- Coverage ledger: 3 units seeded before hunting; final state 2 covered, 1 candidate. Validator PASS.
- Hunt: 3 Foundry PoC tests, all PASS (testReentrancyDrainsVault, testFixedVaultBlocksReentrancy, testHonestWithdrawWorks).
- Verifier: attack PoC re-run in a fresh process (PASS); counterfactual against DemoVaultFixed (attack fails); source-order check confirms the call precedes the balance update.
- Findings: 1 confirmed (high) — reentrancy in DemoVault.withdraw; findings.json validator PASS.

## Observed result

A 1-ether attacker drains the entire vault in one call: vault 0 ether, attacker 11 ether (10 ether of victim funds), 10 reentrant calls.

## Artifacts

- coverage-ledger.json, findings.json (this directory)
- agents/hunter-demo/artifacts/forge-test.log
- agents/verifier-demo/artifacts/verifier.log, forge-attack-rerun.log, forge-fixed.log

## Honesty note

This runner replays the pipeline's phases deterministically with pre-written PoC tests. In the real runs under ../sample-runs/, the hunting and verification were done by agents following skill/SKILL.md. The runner demonstrates the artifact flow and the verifier gate; it does not claim to discover bugs by itself.
