# Demo — the pipeline end-to-end in under a minute

This directory is a self-contained demo of the security-audit pipeline.
It audits a tiny target with **one intentional, clearly-labelled bug** and
shows every phase producing its artifact.

## The target (intentional bug — do not deploy)

`src/DemoVault.sol` is a small ETH vault with a deliberate classic
reentrancy in `withdraw()`: the external call happens **before** the
balance is zeroed. Every file that touches the bug says so in its header.

- `src/DemoVault.sol` — the vulnerable vault (intentional bug, labelled)
- `src/DemoVaultFixed.sol` — the same vault with the bug fixed
  (checks-effects-interactions); used by the verifier as a counterfactual
- `src/Attacker.sol` — the PoC attacker contract (attacks DemoVault only)
- `test/DemoVault.t.sol` — 3 Foundry tests, no dependencies, no forge-std:
  the drain PoC, the fixed-vault counterfactual, and an honest-path sanity
  check

## Run it

Requirements: Node.js 18+ and [Foundry](https://getfoundry.sh)
(`forge` on PATH, in `~/.foundry/bin`, or via `FORGE_BIN`).

```sh
node run-demo.cjs
```

What it does:

1. **Phase 1 — coverage ledger.** Seeds 3 planned coverage units *before*
   any hunting, then validates the ledger with the skill's real validator.
2. **Phase 2 — hunt.** Runs the Foundry PoC tests. The attack test passes:
   a 1-ether attacker drains the whole vault (11 ether out, 10 of them
   victim funds, 10 reentrant calls).
3. **Phase 3 — independent verifier.** Re-runs the attack PoC in a fresh
   process, runs the same attack against the *fixed* vault (it must fail),
   and checks the source order (call before state update in DemoVault, the
   reverse in DemoVaultFixed). The verifier's job is to refute the
   candidate; it cannot, so the finding stands.
4. **Phase 4 — findings.** Writes `out/findings.json` with the one
   confirmed (high) finding and validates it; updates the ledger
   (2 covered, 1 candidate) and validates it again.

Outputs land in `out/`: `coverage-ledger.json`, `findings.json`,
`demo-report.md`, and the hunter/verifier logs under `agents/`. The
committed `out/` directory is the output of a real run of this script, so
reviewers can inspect the artifacts without running anything.

## What this demo is, honestly

The runner replays the pipeline's phases deterministically with
pre-written PoC tests. In the real runs under `../sample-runs/`, the
hunting and the verification were done by agents following
`../skill/SKILL.md`. The demo shows the artifact flow and the verifier
gate — it does not claim the script discovers bugs by itself.
