# Honesty check — every checkable claim and where its evidence lives

A reviewer should be able to verify every substantive claim in this repo
in under a minute each. This file lists them. Anything that could not be
verified is flagged **UNVERIFIED** — there is one such item, at the end.

## Skill and validators

| Claim | Where to check |
|---|---|
| The skill adapts Cloudflare's security-audit-skill (MIT) | `skill/UPSTREAM-SKILL.md` (verbatim upstream) + `skill/LICENSE-upstream` (MIT, Copyright (c) 2025-2026 Cloudflare, Inc.) + `skill/SKILL.md` header |
| Validators are zero-dependency Node scripts | `skill/validate-findings.cjs`, `skill/validate-coverage-ledger.cjs` — only `require("fs")`, `require("path")`, `require("util")` |
| `node --test` passes 65/65 | Run `node --test validate-findings.test.cjs validate-coverage-ledger.test.cjs` in `skill/` (verified 14 Nov 2026 on Node v24.22.1: 65 pass, 0 fail) |
| The pipeline has six phases (recon → ledger → hunt → verify → findings → report) | `skill/SKILL.md` ("Run the six phases in order") |
| Severity is given only to confirmed records, with fixed anchors | `skill/SKILL.md` ("Confirm only a demonstrated boundary failure") + `skill/report-schema.json` (severity exists only on the `confirmed` variant) |

## Demo (all reproducible with `node demo/run-demo.cjs`)

| Claim | Where to check |
|---|---|
| DemoVault has one intentional reentrancy bug (call before state update) | `demo/src/DemoVault.sol` lines 38–40 — external call at line 38, balance zeroed at line 40; header labels it intentional |
| A 1-ether attacker drains the whole vault: vault 0, attacker 11 ether, 10 re-entries | `demo/out/findings.json` → `execution.observed_result`; reproduced by `forge test --match-test testReentrancyDrainsVault` (`demo/test/DemoVault.t.sol`, assertions at the end of the test) |
| The same attack fails against the fixed vault | `forge test --match-test testFixedVaultBlocksReentrancy` (PASS); fixed contract `demo/src/DemoVaultFixed.sol` zeroes the balance before the call (lines 26–27) |
| The runner seeds a 3-unit ledger before hunting and validates it | `demo/run-demo.cjs` Phase 1; `demo/out/coverage-ledger.json` (3 units; final state 2 covered, 1 candidate); run `node skill/validate-coverage-ledger.cjs demo/out/coverage-ledger.json` |
| The runner writes 1 confirmed (high) finding and validates it | `demo/out/findings.json` (fingerprint `demo-vault:withdraw:reentrancy`); run `node skill/validate-findings.cjs demo/out/findings.json` |
| The full demo run takes under a minute | Timed 0.6–0.8s on this VM with a warm solc cache (see `demo/out/demo-report.md`); first run on a fresh machine downloads solc via Foundry (seconds) — still well under a minute |
| The demo runner replays phases deterministically; it does not discover bugs by itself | `demo/run-demo.cjs` header comment + `demo/README.md` + root `README.md` — all three state this explicitly |

## Sample run 1 — Cronos Blockchain Protocols (Go)

| Claim | Where to check |
|---|---|
| 0 findings; `findings.json` is an empty array, validator PASS | `sample-runs/cronos-blockchain-protocols-run-1/findings.json` (`[]`); run the findings validator on it |
| 7/7 ledger units, 127 paths, 70 checks | `sample-runs/cronos-blockchain-protocols-run-1/REPORT.md` §7 + `coverage-ledger.json` (7 units; validator PASS) |
| Audited cronos v1.8.2, ethermint v0.24.0, chain-main v8.0.1 | `REPORT.md` §1 (commit hashes listed) + `run-metadata.json` |
| EIP-712 lead killed: gaps exactly match upstream fix #1153 (merged 13 Nov 2026) | `FINDINGS-DETAIL.md` §1 (with the fix commit 05e49089) |
| Mempool double-spend killed by FinalizeBlock nonce re-run | `FINDINGS-DETAIL.md` §2 and §4 |
| All 3 precompiles are unregistered dead code in v1.8.2 | `FINDINGS-DETAIL.md` §10 (`app/app.go:807` passes an empty custom-contract list) |
| One real defect: CLI panic on nil recipient, no on-chain impact | `REPORT.md` §6 (appcore H1) — recorded as hardening, not a finding |
| 10 of 13 agent budget spent; ~74 minutes | `run-metadata.json` (`agents_spent: 10`, `started_utc` 12:09, `completed_utc` 13:23 UTC, 14 Nov 2026) |

## Sample run 2 — Cronos Smart Contracts / VVS Finance (Solidity)

| Claim | Where to check |
|---|---|
| 0 findings; `findings.json` is an empty array, validator PASS | `sample-runs/cronos-smart-contracts-run-1/findings.json` (`[]`); run the findings validator on it |
| 12/12 ledger units, ~2,105 lines, 41 Foundry PoC tests all passing | `REPORT.md` §2 + `coverage-ledger.json` (12 units; validator PASS) |
| Source verified byte-for-byte vs deployed bytecode, 8/8 match | `REPORT.md` §3 (method: solc-js recompile vs `eth_getCode`, 0 differing bytes after metadata strip + immutable mask) |
| VVS emissions off: BONUS_MULTIPLIER=0, pool 0 allocPoint=0, pendingVVS=0, migrator=0x0 | `REPORT.md` §4 (verified via `cast` at block ~105.8M, 14 Nov 2026, independently by coordinator and critic) |
| Deposit-before-harvest: PoC profit 9,090,909 VVS with rewards on, exactly 0 in a live-state replica | `FINDINGS-DETAIL.md` §A |
| BENCH duplication: supply exceeds staked VVS by exactly 1,901,549,456; not reportable (program excludes VVS-Bench; no redeem/governance; 0 DEX pairs) | `FINDINGS-DETAIL.md` §B |
| Vault TVL ≈ $11.12M | `REPORT.md` §1 (VVSVault row; snapshot at block ~105.8M, 14 Nov 2026) |
| 6 of 8 agent budget spent; ~41 minutes | `run-metadata.json` (`agents_spent: 6`, `started_utc` 14:09, `completed_utc` 14:50 UTC, 14 Nov 2026) |

## Article and video script

Verified 14 Nov 2026 against the sources above and the live demo run.
Article: **1,780 words** (`wc -w`, target 1,200–1,800). Script: **241
narration words ≈ 90 seconds** at ~160 wpm, shot timestamps 0:00–1:30.
No URLs in either file (repo not created yet — verified by grep).

| Claim | Where to check |
|---|---|
| Article: six phases, ledger state machine, critic waves, adversarial verifier, severity only on confirmed records | `skill/SKILL.md` + tables above (skill section) |
| Article: "a critic found a material gap — the ethermint EVM execution core — hunted in a second wave and closed" | `sample-runs/cronos-blockchain-protocols-run-1/REPORT.md` §1 ("Profile: started `quick`, changed to `standard` after the first final critic found one material in-scope gap (ethermint x/evm execution core)") |
| Article: run 1 — 7/7 units, 127 paths, 70 checks, 3 PoC tests + 2 re-run upstream suites, 10/13 budget, ~74 min, 0 findings | Run-1 table above (`REPORT.md` §7, `run-metadata.json`) |
| Article: EIP-712 kill — gaps match upstream fix #1153, merged 13 Nov 2026; unordered leg dead on Cronos v1.8.2 | `FINDINGS-DETAIL.md` §1 (fix commit 05e49089); "unordered leg is additionally dead on Cronos v1.8.2/evmd" — `FINDINGS-DETAIL.md` §1 |
| Article: mempool double-spend killed by FinalizeBlock nonce re-run; all 3 precompiles unregistered dead code | `FINDINGS-DETAIL.md` §2/§4 and §10 |
| Article: run 2 — 8 contracts, ~2,105 lines, $11.12M TVL, 12/12 units, 41 PoC tests, 8/8 byte-match, 6/8 budget, ~41 min, 0 findings | Run-2 table above (`REPORT.md` §1–3, `run-metadata.json`) |
| Article: emissions off (BONUS_MULTIPLIER=0, pool 0 allocPoint=0, pendingVVS=0, migrator=0x0) at block ~105.8M | `REPORT.md` §4 |
| Article: deposit-before-harvest PoC profit 9,090,909 VVS with rewards on, exactly 0 live; BENCH excess exactly 1,901,549,456, 0 DEX pairs | `FINDINGS-DETAIL.md` §A and §B |
| Article: demo — 3-unit ledger, 3 Foundry tests all pass, 1-ether attacker drains vault (0 / 11 ether, 10 re-entries), 1 confirmed HIGH finding | Demo table above; reproduced by `node demo/run-demo.cjs` (verified 14 Nov 2026: exit 0, 0.5–0.8s, both validators PASS) |
| Article + script: "the demo replays the pipeline deterministically with pre-written PoC tests; it does not discover bugs by itself" | `demo/run-demo.cjs` header comment + `demo/README.md` |
| Article: "no zkVerify integration exists in this entry" | True by construction — no zkVerify dependency, import, or proof artifact anywhere in the repo (verified by grep for `zkverify`/`zk-verify` — only the article and README discuss it as a future possibility) |
| Script: every quoted terminal line (phase 1 seeding, 3 `[PASS]` lines, 3a–3c verifier steps, `DONE … 1 confirmed finding (high)`) | Verified verbatim against a fresh `node demo/run-demo.cjs` run, 14 Nov 2026 (log `/tmp/demo-final-run.log`) — all quoted lines appear word-for-word |
| Script: "under a minute in full" for the demo run | Measured 0.5–0.8s with a warm solc cache; see the UNVERIFIED item below for a fresh machine |
| Article: CLI panic defect and ProcessProposal-handler kill NOT mentioned | Deliberate cut for the word cap (child writer's note); both remain fully documented in the sample-run reports (`REPORT.md` §6, `FINDINGS-DETAIL.md`) — omission, not inaccuracy |

## UNVERIFIED

- **The demo's first-run time on a machine without a Foundry solc cache.**
  Measured 0.6–0.8s here (solc 0.8.30 already downloaded). The README says
  "under a minute" for a fresh machine; that bound was NOT measured on a
  clean machine — it is an estimate based on the solc download being a few
  MB and the compile taking ~0.2s. If a reviewer measures longer, the
  README should be corrected to the measured number.
- **Agent Games judging criteria beyond what the track pages publish.**
  The README and article describe the tracks only from the public pages
  (rules, guide, event pages as read 14 Nov 2026). Anything about how
  judges weight criteria is not published and is not claimed here.
