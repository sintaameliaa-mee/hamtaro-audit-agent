# Sample runs — two real audits, both honest zeros

These are the unedited artifacts of the first two full runs of this agent,
both on 14 November 2026, both against HackenProof free programs. Each
directory holds the run's `REPORT.md`, `FINDINGS-DETAIL.md`,
`coverage-ledger.json`, `findings.json`, `run-metadata.json`, and
`NEEDS-VALIDATION.md`.

## 1. cronos-blockchain-protocols-run-1 — 0 findings

- **Target:** Cronos chain code, latest releases — `crypto-org-chain/cronos`
  v1.8.2, `ethermint` v0.24.0, `chain-main` v8.0.1 (Go).
- **Coverage:** 7/7 ledger units, 127 reviewed paths, 70 invariant checks,
  3 passing PoC tests + 2 re-run upstream suites. 10 of 13 agent budget
  spent; ~74 minutes.
- **Why zero:** the strongest leads were killed by evidence. The EIP-712
  gaps in ethermint v0.24.0 turned out to be exactly upstream fix #1153,
  already merged; the mempool double-spend theory died because
  FinalizeBlock re-runs the full ante handler including nonce checks; all
  three precompiles are unregistered dead code in v1.8.2. One real defect
  was verified (a CLI tool panic on a nil recipient) — a local operator
  tool crash with no on-chain or fund impact, recorded as hardening, not a
  finding.

## 2. cronos-smart-contracts-run-1 — 0 findings

- **Target:** all 8 in-scope VVS Finance contracts deployed on Cronos
  mainnet (Solidity, ~2,105 lines). Source verified byte-for-byte against
  deployed bytecode: 8/8 match.
- **Coverage:** 12/12 ledger units, 41 Foundry PoC tests, all passing.
  6 of 8 agent budget spent; ~41 minutes.
- **Why zero:** VVS emissions are switched off on mainnet
  (`BONUS_MULTIPLIER = 0`, pool 0 allocation 0, no pending rewards), so
  the entire reward-accrual attack class is inert in live state. Two real
  mechanisms were confirmed in code — a deposit-before-harvest edge in the
  vault (profitable only while rewards are on; exactly 0 live) and a BENCH
  duplication via `emergencyWithdraw` (real on-chain, but the program
  excludes VVS-Bench and BENCH has no redeem path or DEX market, so there
  is no route to user fund loss). Both are documented in
  `FINDINGS-DETAIL.md` as confirmed-but-not-reportable, not as findings.

## What these samples show

A security agent that reports a finding only when the evidence survives an
adversarial verifier will sometimes report nothing. These two runs are the
proof that the zero is real: full ledgers, passing validators, killed
leads with reasons, and the exact limits of what was covered. The
`findings.json` in each directory is an empty array — and its validator
still passes, because "no finding" is a valid, checkable outcome.
