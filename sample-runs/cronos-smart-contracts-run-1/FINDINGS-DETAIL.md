# FINDINGS-DETAIL — Cronos Smart Contracts (VVS Finance), run-1

Reportable findings: **0**. This file records the two confirmed-but-not-reportable
mechanisms and the killed leads, so a later round does not re-litigate them.

---

## A. Confirmed mechanism 1 — Deposit-before-harvest (VVSVault) — DEAD LIVE

- **Contract:** VVSVault `0xA6fF77fC8E839679D4F7408E8988B564dE1A2dcD`
- **Mechanism (real in code):** `deposit()` prices shares from the vault's
  `balanceOf()` EXCLUDING pending staking rewards. `_earn()` then calls
  `enterStaking()` (which triggers `harvest` inside Craftsman) and pays ALL
  pending rewards into the vault AFTER the new shares are minted — so a
  depositor who arrives just before a harvest captures a share of rewards
  accrued by earlier depositors. PoC (rewards ON, Foundry):
  victim 1,000,000 VVS + 10,000,000 pending; attacker deposits 10,000,000 VVS
  → attacker profit **9,090,909 VVS** in one tx, no `harvest()` call.
  Artifacts: `agents/hunter-vault/artifacts/VVSVaultTest.t.sol`.
- **Why it is dead live (three independent gates, all verified by the
  coordinator and the critic via `cast` at block ~105.8M, 14 Nov 2026):**
  1. `BONUS_MULTIPLIER = 0` → `updatePool` mints no rewards at all.
  2. `poolInfo(0).allocPoint = 0`, `totalAllocPoint = 1` → pool 0 gets no
     share even if the multiplier were non-zero.
  3. `pendingVVS(0, vault) = 0` and `vault.available() = 0` → there is
     nothing to capture.
  Exact live-replica PoC (multiplier 0, alloc 0, live totalShares): attacker
  profit exactly **0**.
- **Why it cannot be revived without the owner:** the vault only stakes in
  pid 0; the only other pool with a non-zero alloc is pid 154 (alloc 1) and
  it still yields 0 while the multiplier is 0; `migrator = 0x0` and setting it
  is owner-only; flash loans are blocked (the critic re-checked:
  `notContract` requires `msg.sender == tx.origin` as well).
- **Revival trigger (watch):** owner sets `BONUS_MULTIPLIER > 0` AND
  `poolInfo(0).allocPoint > 0`. If both happen, re-evaluate as a
  Critical/High candidate — see NEEDS-VALIDATION.md.

## B. Confirmed mechanism 2 — BENCH duplication via emergencyWithdraw — SCOPE-AMBIGUOUS

- **Contract:** Craftsman `0xDccd6455AE04b03d785F12196B492b18129564bc`
- **Mechanism (real in code):** `emergencyWithdraw` (Craftsman.sol:279) does
  NOT burn BENCH, while `leaveStaking` (Craftsman.sol:305-318) does. Loop:
  stake X VVS → +X BENCH → emergencyWithdraw → VVS back, BENCH kept.
  PoC: 1,000 VVS × 3 loops → 3,000 BENCH, VVS intact.
  Artifacts: `agents/hunter-craftsman/artifacts/CraftsmanTest.t.sol`.
- **On-chain evidence:** BENCH totalSupply 15,264,981,287,223 exceeds the
  Craftsman VVS balance 15,263,079,737,767 by exactly **1,901,549,456**
  (= cumulative emergencyWithdraw volume). Verified by the coordinator and
  the critic via `cast` at block ~105.8M.
- **Why it is NOT reportable:**
  1. Program rules: "VVS-Bench is Out of Scope" (scope ambiguity noted:
     the Workbench CONTRACT is in the scope table, so BENCH-centric findings
     are at best ambiguous — but see 2–3, which kill it regardless).
  2. Impact is BENCH dilution only — the program excludes "incentive
     devaluation without user fund loss".
  3. BENCH has no redeem/governance function in any in-scope contract
     (critic: grep across all repos) and no trading path: no BENCH/WCRO or
     BENCH/VVS pair exists on the VVS Factory (checked on-chain), and the
     critic confirmed via DexScreener **0 BENCH pairs on any Cronos DEX**.
     There is no path from duplicated BENCH to user fund loss.
- **Scope note:** if the program later clarifies that Workbench/BENCH
  interactions ARE in scope AND a BENCH→VVS market appears, re-evaluate.
  Today neither holds.

## C. Killed leads (hunter PoCs either disproved the impact or proved the kill)

1. **Harvest fee on idle funds (N2 variant)** — `harvest()` charges 2%
   on the full `available()` delta; donations self-harm, no victim path.
   Known issue (SlowMist N2). Killed.
2. **deposit() reentrancy double-pay (Craftsman)** — PoC proves a malicious
   lpToken could be paid 2×, but requires the owner to add a malicious token
   as a pool, is the same class as known N9, and is inert live (multiplier 0).
   Killed.
3. **leaveStaking locked after BENCH transfer** — self-inflicted; principal
   recoverable via emergencyWithdraw. Not an attack. Killed.
4. **migrate() callable by anyone** — live `migrator = 0x0`; a malicious
   migrator requires owner trust (known N1). Killed.
5. **Zero-share / first-depositor** — explicitly excluded by the program.
   Not pursued.
6. **Vault dust rounding** — maximum <112.33 wei live; dust in the
   attacker's favour is negligible. Killed.
7. **Fee-to manipulation (Factory `_mintFee`)** — feeTo is a trusted role;
   1/3-of-growth rate is intentional policy. Killed.
8. **Oracle manipulation / flash loans** — no oracle consumer in scope
   (VVSOracleLibrary has no in-scope caller); no attack surface. Killed.
9. **updateStakingPool / totalAllocPoint invariant** — holds in all orderings
   (PoC). Killed.
10. **safeVVSTransfer rounding** — paid + dust == minted exactly (PoC). Killed.
11. **CraftsmanAdmin timelock bypass** — admin is not used in deployment
    (Craftsman owner is an EOA, verified on-chain); its timelock logic is
    sound per PoC. Killed.
12. **VVS Token minting** — `mint`/`distributeSupply` onlyOwner; only mint
    path is Craftsman.updatePool → Workbench; team ≤70% enforced; SafeMath
    blocks underflow. 22/22 tests pass. Killed.
13. **Workbench 4.09T VVS drain** — no drain path; only via legitimate
    pending claims by BENCH holders. Killed.
14. **Multicall2 / WCRO** — Multicall2 is MakerDAO verbatim (no delegatecall);
    WCRO is WETH9 (only name/symbol + active `receive()`). Killed.
15. **Router/Factory deviations** — full normalized diff vs Uniswap V2
    canonical (135 lines): 10 differences, all cosmetic/policy/fix. Killed.

## D. Known issues (SlowMist audit, Sep–Oct 2021, pre-deployment)

N1 excessive owner authority (Medium); N2 harvest fee on emergency-withdrawn
funds (Low); N3 dev EOA; N4 DOMAIN_SEPARATOR replay; N5 permit malleability
(Fixed in deployed code); N6 deflationary tokens; N7 missing events (Fixed);
N8 vvsAtLastUserAction ordering (Fixed); N9 emergencyWithdraw CEI/reentrancy
(Ignored). All out of scope as known issues.
