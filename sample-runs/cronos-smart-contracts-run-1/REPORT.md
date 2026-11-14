# REPORT — Cronos Smart Contracts (VVS Finance), run-1

- Program: HackenProof Cronos Smart Contracts (FREE, min rep 50, KYC + PoC;
  ONLY Critical $20k–$200k / Extreme $250k and High $500–$20k pay;
  Medium/Low $0; 24h-from-discovery rule).
- Run: 2026-11-14 21:09–21:50 WIB (14:09–14:50 UTC). Profile: standard.
- Verdict: **0 reportable findings. $0 from this round.** Nothing submitted.

## 1. What was audited

All 8 in-scope VVS Finance contracts deployed on Cronos mainnet, at the
GitHub source that was verified byte-for-byte against the deployed bytecode
(see §3). ~2,105 lines of main contract code plus interfaces and libraries;
~100 functions across the 8 contracts, all covered by the ledger.

| Contract | Address | Lines | Role |
|---|---|---|---|
| WCRO | 0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23 | 105 code (+652 license comment) | Wrapped CRO (WETH9) |
| Factory | 0x3b44b2a187a7b3824131f8db5a74194d0a42fc15 | 51 (+Pair 201, ERC20 96) | Uniswap V2 fork factory |
| Router | 0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae | 445 | Uniswap V2 fork router |
| Token (VVS) | 0x2D03bECE6747ADC00E1a131BBA1469C15fD11e03 | 17 (+InitMintable 58) | VVS token, annual halving |
| Workbench (BENCH) | 0x6a2d178585806de5a2e5e7f9acfce44680637284 | 37 | BENCH receipt token + reward holder |
| Craftsman | 0xDccd6455AE04b03d785F12196B492b18129564bc | 344 | MasterChef fork (172 pools) |
| Multicall2 | 0x5e954f5972EC6BFc7dECd75779F10d848230345F | 73 | MakerDAO Multicall2 |
| VVSVault | 0xA6fF77fC8E839679D4F7408E8988B564dE1A2dcD | 381 | Auto-compound vault, ~$11.12M TVL |

## 2. Coverage (ledger: 12/12 covered, validator PASS)

| Hunter | Units | Paths reviewed | PoC tests (all re-run by coordinator) |
|---|---|---|---|
| hunter-vault | 3 (vault shares/harvest/admin) | VVSVault, Craftsman, Workbench, Token | 4/4 PASS |
| hunter-craftsman | 4 (pools/staking/admin/Workbench) | Craftsman, Workbench, CraftsmanAdmin | 9/9 PASS |
| hunter-token | 3 (token/WCRO/Multicall2) | VVSToken, VVSInitMintable, WCRO, Multicall2 | 22/22 PASS |
| hunter-swap | 2 (factory-pair/router) | Factory, Pair, ERC20, Router, libraries | 6/6 PASS |
| verifier-bytecode | source==deployed for all 8 | — | 8/8 MATCH (re-run by coordinator) |
| critic-final | coverage critic | all hunter notes + live state | stop: true, 0 gaps |

Total: 41 PoC tests, all passing, all re-run independently by the
coordinator. One independent critic pass: `stop: true`, no material gap,
no unit to reopen. Two immaterial prose slips found by the critic
(a wrong date conversion, a wrong token name in a note); neither affects
any verdict.

## 3. Source verification (bytecode == deployed, 8/8)

Explorer APIs were unreachable from this VM (api.cronoscan.com TCP fail;
explorer.cronos.com has no public source API), so source came from the VVS
GitHub repos and was verified by recompiling with solc-js and comparing
against `eth_getCode` output: 0 differing bytes per contract after stripping
metadata and masking immutables; metadata IPFS hashes identical for all 8.
- Farm (Token/Workbench/Craftsman/VVSVault): solc 0.6.12, optimizer runs 200,
  istanbul, OZ 3.4.0. Multicall2: solc 0.8.0, runs 200.
- Factory: solc 0.5.16, runs 200, istanbul, OZ 2.5.1 (full bytecode
  identical including the embedded VVSPair metadata hash).
- Router/WCRO: solc 0.6.6, runs 1000, istanbul (found by sweeping 19 values;
  the repo `.waffle.json` claims 999999 — wrong).
- Immutables verified: Router factory/WETH = the in-scope Factory/WCRO;
  VVSVault token/receiptToken/craftsman = Token/Workbench/Craftsman.
- vvs-farm HEAD contracts are identical to the 2021-11-16 deployment commit
  (`git diff` empty); the Jan 2022 commit only changed config.
- Consequence: every hunter conclusion about the GitHub source applies to
  the deployed contracts. No finding is conditional on source match.

## 4. Why 0 findings: the live state kills the attack surface

The decisive fact of this audit is that **VVS emissions are switched off**:
`BONUS_MULTIPLIER = 0`, `poolInfo(0).allocPoint = 0`, `totalAllocPoint = 1`,
`pendingVVS(0, vault) = 0`, `migrator = 0x0`, `vvsStakingRatio = 0`
(all verified independently by the coordinator and the critic via `cast`
at block ~105.8M, 14 Nov 2026). The vault's last harvest was 14 Aug 2026.
Every reward-accrual attack is therefore inert today, and the two real
mechanisms found both depend on emissions or on the excluded BENCH economy:

1. **Deposit-before-harvest (VVSVault)** — real in code (PoC profit
   9,090,909 VVS with rewards on), dead live (profit exactly 0 in an exact
   live-state replica). Revival requires the owner to re-enable pool 0
   emissions. Not reportable now.
2. **BENCH duplication via emergencyWithdraw (Craftsman)** — real in code
   and on-chain (BENCH supply exceeds staked VVS by exactly 1,901,549,456),
   but the program excludes "VVS-Bench" and incentive devaluation, BENCH has
   no redeem/governance function anywhere, and there is no BENCH pair on any
   Cronos DEX (critic: DexScreener, 0 pairs). No path from BENCH to user
   fund loss was found. Not reportable.

Beyond those two: the swap code is a faithful Uniswap V2 fork (diff: 10
differences, all cosmetic/policy/security-fix); the token cannot be minted
by anyone but Craftsman; WCRO is WETH9; Multicall2 is MakerDAO verbatim;
the vault's admin functions have no unprivileged bypass; Workbench's 4.09T
VVS can only leave via legitimate pending claims. The SlowMist 2021 audit's
N1–N9 are all known (and N5/N7/N8 fixed in the deployed code).

## 5. Hardening notes (not findings)

13 notes across the hunters, recorded in the coverage ledger: price shares
including pendingVVS; harvest fees only from claimed delta; burn BENCH on
emergencyWithdraw; document BENCH as a must-hold receipt token; CEI order in
Craftsman deposit/emergencyWithdraw; no on-chain supply cap (live supply
101.64T vs nominal 100T — blocks faster than the assumed 6s); owner==admin
centralization (vault) and single-EOA owners (Craftsman, vault); WCRO
`.transfer` 2300-gas quirk; OracleLibrary return-order footgun; missing OZ
dependency declaration in vvs-swap-core.

## 6. Limits of this run

- Round 1, standard profile — not an exhaustive audit. Not covered:
  individual VVSPair instances (code identical; factory is the source);
  BENCH pairs on non-VVS DEXes beyond the critic's DexScreener check;
  front-end / off-chain components (out of scope).
- All live-state conclusions are a snapshot at block ~105.8M, 14 Nov 2026.
  The only revival trigger for the strongest lead is an owner action
  (re-enabling pool 0 emissions) — see NEEDS-VALIDATION.md for the cheap
  watch that would catch it.
- No mainnet fork was used; PoCs are local Foundry tests against the
  original contracts; live state was read via `eth_call` only.

## 7. Artifacts

- `coverage-ledger.json` (12 units, validator PASS), `findings.json` (empty,
  validator PASS), `architecture.md`, `run-metadata.json`
- `FINDINGS-DETAIL.md` (both confirmed mechanisms + killed leads),
  `NEEDS-VALIDATION.md` (0 open leads + watch items),
  `coverage-critic-report.md` (stop: true)
- Hunter artifacts under `agents/<hunter>/artifacts/` (PoC tests, diff);
  full notes under `agents/<hunter>/scratch/`
- Sources: `~/workspace/cronos-vvs/`; deployed bytecode:
  `~/workspace/cronos-vvs/deployed/`
