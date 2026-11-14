# Findings Detail — Cronos Blockchain Protocols, run-1

## Confirmed findings

**None.** Run-1 confirmed zero findings at any severity. `findings.json` is an empty
array. There is no confirmed medium, high, or critical record to detail here.

## Strongest killed leads (NOT findings)

These leads were investigated to a conclusion and killed by evidence. They are
recorded so a future run does not re-litigate them without changed evidence. None
is submittable; none implies a vulnerability.

### 1. EIP-712 signature gaps in ethermint v0.24.0 — already fixed upstream (#1153)

- **Lead:** v0.24.0 EIP-712 verification gaps (fee-payer binding, unordered-tx
  handling) could let an attacker replay or re-shape a signed tx.
- **Kill:** the gaps exactly match upstream fix 05e49089 (#1153, 13 Nov 2026),
  already merged in ethermint main — a known, fixed issue, not a new finding.
  The unordered leg is additionally dead on Cronos v1.8.2/evmd (unordered txs not
  enabled). The legacy-schema mismatch fails closed, verified empirically against
  the geth fork and the repo test (`expectSuccess: !useLegacyEIP712TypedData` for
  "2x MsgVoteV1 with Different Schemas"). EIP-712 suite re-run by the parent: exit 0.
- **Residual:** see REPORT.md §6 (narrow fresh-account amino-mode unordered flip;
  $0 tier, needs a victim signing an unordered tx — fails the no-unusual-actions gate).

### 2. Mempool double-spend via recheck/reap staleness — killed by Finalize nonce re-run

- **Lead:** a spent/failed/stale tx reproposed before recheck completes (including
  the 500 ms `WaitForRecheckTimedOut` window and `mempool.recheck=false`) could
  execute twice.
- **Kill:** FinalizeBlock re-runs the full ante handler including nonce verification
  on block bytes; the nonce is consumed by the first execution, so any stale
  reproposal fails. No double execution is reachable through mempool code.

### 3. Mempool decoder-cache poisoning — killed by full-bytes comparison

- **Lead:** the decoder cache could return one tx's decode for another tx's bytes.
- **Kill:** `cacheShard.get/set` compare full raw bytes (`bytes.Equal`); xxhash is
  only a shard/index key. The real sharing hazard (mutation of the shared `sdk.Tx`)
  is #2251, already fixed on main (39c7cf03), liveness/panic-class: a corrupted
  sign-doc can only make verification fail, never pass for a wrong signer, since
  all semantic fields are signature-covered.

### 4. ProcessProposal blocklist-only handler — invalid txs cannot execute

- **Lead:** `app.go:573` replaces the default ProcessProposal with a blocklist-only
  handler, so a proposer can include invalid txs and every validator ACCEPTs.
- **Kill:** FinalizeBlock re-runs the full ante handler (signature, nonce, fee, gas)
  for every tx; invalid txs fail with no state change; duplicates fail the nonce
  check. Worst case is block-space waste (DoS, out of scope). No consensus split
  (deterministic across validators).

### 5. EVM From-field spoofing vs blocklist — killed by ante sig verification

- **Lead:** `ValidateTransaction` trusts `sigTx.GetSigners()`; for `MsgEthereumTx`
  the signer annotation is the attacker-controlled `From` field.
- **Kill:** the ethermint ante handler's `VerifyEthSig` recovers the sender from
  V,R,S and requires `msg.From == recovered`; Cronos wires the standard ethermint
  ante handler (`app.go:1273`), so a spoofed-From tx fails at FinalizeBlock and
  never executes.

### 6. Tiered-rewards redelegation count drift — killed (wrong premise)

- **Lead:** redelegation could leave `PositionCountByValidator` wrong (missing
  bond/unbond events, bonus overpaid for unbonded gaps).
- **Kill:** the pinned SDK fork (crypto-org-chain/cosmos-sdk v0.53.7)
  `BeginRedelegation` creates the dst delegation immediately
  (`x/staking/keeper/delegation.go:1270`); `TierRedelegate`'s `setPosition`
  re-derives the dst delegation and reindexes src→dst. Counts correct. Verified
  in fork source and `msg_server_redelegate_test.go:35-37`.

### 7. Tiered-rewards slash-timing bonus overpay — killed by pre-slash snapshot

- **Lead:** bonus rewards could be overpaid via slash timing.
- **Kill:** the slash snapshot uses the pre-slash rate: `BeforeValidatorSlashed`
  (`x/staking/keeper/slash.go:170`) runs before `RemoveValidatorTokens` (verified
  in fork v0.53.7). `computeSegmentBonus` and `applyBonusAccrualCheckpoint` cap
  accrual at `ExitUnlockAt`.

### 8. EIP-7702 durable replay / statedb mint — killed by journaling + checks

- **Lead:** EIP-7702 authorizations could replay across txs, or statedb mint/burn
  could create funds.
- **Kill:** 3 PoC tests written and PASS (re-run by the parent, exit 0):
  auth applied once on the success path; invalid auth skipped on both StateDBs;
  refund bounded by deduction (over-refund fails and mints nothing).
  File: `~/workspace/cronos-ethermint-v0.24.0/x/evm/keeper/poc_evmexec_test.go`.

### 9. Bridge 1:1 conversion / hook failure — killed by tmpCtx revert + dust retention

- **Lead:** EVM↔IBC conversion could mint unbacked native coins, or a hook failure
  could strand burned EVM tokens.
- **Kill:** conversion is 1:1 (burn/lock before log emission; handlers act only on
  logs from the mapped contract); IBC send burns `amount - amount%1e10` and pays
  `amount/1e10`, so dust stays with the user (confirmed by
  `TestSendCroToIbcHandler`: 500 dust remains). Hook failure reverts the whole tx
  including the EVM burn (ethermint `state_transition.go` runs PostTxProcessing on
  a tmpCtx committed only on success).

### 10. Precompile fund theft — killed: all three precompiles are dead code

- **Lead:** bank/ICA/relayer precompiles could let an EVM caller move others' funds.
- **Kill:** all three are unregistered in v1.8.2 — `app/app.go:807` passes an empty
  `[]evmkeeper.CustomContractFn{}`; zero call sites for the constructors repo-wide;
  bank removed 2023-10-05 (#1196), relayer+ICA removed 2026-03-13 (#1986).
  Calls to 0x64/0x65/0x66 hit empty accounts. The 7-Question Gate Q1 fails for
  every hypothetical precompile bug.

### 11. NFT IBC duplication / denom collision — killed by escrow discipline + strict denom validation

- **Lead:** an NFT could be duplicated across chains, or an attacker could collide
  an x/nft denom with an IBC voucher class.
- **Kill:** escrow/burn on send, mint/unescrow on receive, refund on ack-error/timeout;
  replay prevented by IBC sequences. User msgs use strict `ValidateDenomID`
  (alphanumeric, no `/`). Front-running denom creation only DoSes that class's
  receives (out of scope); denom NAME squatting is a hardening note (DoS only).

### 12. Inflation over-mint — killed by bounded decay

- **Lead:** inflation minting could be manipulated to over-mint.
- **Kill:** `DecayRate` validated 0..1; decay factor in [0,1] so the final rate is
  ≤ base rate; `ApproxRoot(0)=0`, no panic at decayRate=1. Minting is the SDK mint
  module `DefaultMintFn`; only gov authority can `UpdateParams`.
