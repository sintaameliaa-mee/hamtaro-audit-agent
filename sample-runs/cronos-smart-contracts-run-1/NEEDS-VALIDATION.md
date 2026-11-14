# NEEDS-VALIDATION — Cronos Smart Contracts (VVS Finance), run-1

Open leads requiring validation: **0**. Two conditional watch items below.

## W1 (conditional revival) — Deposit-before-harvest (VVSVault)

- **Trigger:** `BONUS_MULTIPLIER > 0` AND `poolInfo(0).allocPoint > 0`
  (both readable with two cheap `eth_call`s to Craftsman
  `0xDccd6455AE04b03d785F12196B492b18129564bc`).
- **Today:** both are 0 (block ~105.8M, 14 Nov 2026), so the mechanism is
  dead. If the owner re-enables pool 0 emissions, the mechanism revives and
  becomes a Critical/High candidate: re-run the hunter-vault PoC against the
  new live state and re-check the 24h rule (the clock starts at revival,
  not at this run).
- **Watch proposed (cheap, optional):** poll the two getters every 6h; alert
  only on change. NOT yet set up — needs the user's go-ahead.

## W2 (conditional scope change) — BENCH duplication (Craftsman)

- **Trigger:** (a) the program clarifies that Workbench/BENCH interactions
  are in scope, OR (b) a BENCH→VVS market appears on a Cronos DEX (today:
  0 pairs on any Cronos DEX per the critic's DexScreener check, 14 Nov 2026).
- **Today:** neither holds; the quirk is confirmed but not reportable
  (VVS-Bench out of scope + incentive devaluation excluded + no dump path).
- No watch set up; re-check only if the program scope text changes.

## Round-2 suggestions (if the user wants a second round)

1. **Deployed-state divergence on the remaining contracts** — round 1
   verified source == bytecode for all 8, so this is done; instead a round 2
   should look at cross-contract flows not modelled yet: VVSVault +
   Workbench + Craftsman as a system with a mainnet-fork PoC harness (round 1
   used local Foundry only).
2. **Cross-program view:** the VVS contracts are 2021-era and 5 years old;
   the highest-value next step may be a different target rather than a
   round 2 on VVS (see the parent agent's HackenProof survey:
   `~/workspace/hackenproof-survey-2026-11-14.md`).
