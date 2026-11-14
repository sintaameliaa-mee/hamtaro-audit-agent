# Audit Report — Cronos Blockchain Protocols, run-1

**Program:** HackenProof "Cronos Blockchain Protocols" (FREE, min rep 50, KYC + PoC required).
Only Critical ($20,000–$100,000) and High ($500–$20,000) pay; Medium/Low pay $0.
Critical must directly benefit the attacker via on-chain operations, capped at 10% of
economic loss. PoC required for every report. 24-hour-from-discovery rule applies.
**Nothing was submitted to HackenProof in this run; submission needs user confirmation.**

## 1. Run profile, scope, budget, execution

- **Profile:** started `quick`, changed to `standard` after the first final critic
  (critic-final) found one material in-scope gap (ethermint x/evm execution core).
  Standard profile: wave 2 hunter + post-wave critic + distinct final-clean critic.
- **Scope (latest releases only):**
  - `crypto-org-chain/cronos` v1.8.2 — `f5ec24a8cacbb74b603c501b6189d5e36314987a` (2026-11-09)
  - `crypto-org-chain/ethermint` v0.24.0 — `db757f396a7f7393a28cc85c496469f09b6fc054` (2026-09-23)
  - `crypto-org-chain/chain-main` v8.0.1 — `cfdc54570b2976fc4fe3206386b9d2c92c827a6d` (2026-10-08)
  - Worktrees: `~/workspace/cronos-cronos-v1.8.2`, `~/workspace/cronos-ethermint-v0.24.0`,
    `~/workspace/cronos-chain-main-v8.0.1`.
- **Budget:** 13 subagent invocations planned, **10 spent** (6 wave-1 hunters +
  critic-final + 1 wave-2 hunter + critic-wave2 + critic-clean), 3 unused. No
  candidate verifiers were needed: 0 candidates, so Phase 3 and Phase 5 are vacuous.
- **Execution:** source-and-local only. PoC tests ran against reviewed public bounty
  code in disposable worktrees with dummy data. No OS-enforced sandbox exists on this
  VM; no live endpoints were probed and no deployed state was modified.
- **Prior runs:** none for these repos. No prior ledger exists; no records carried forward.
- **Run window:** 2026-11-14 12:09–13:23 UTC (~1h14m).
- **This is a partial pass.** Round 1 of a budget-limited, coverage-led audit. It does
  not exhaust the target. See §7 for what was covered, deferred, and excluded.

### Deferred and out-of-scope coverage

Deliberately not hunted this round (critic-reviewed, recorded with reasons):

- **Out of scope by program rules:** DoS/DDoS/spamming and resource exhaustion;
  known upstream Cosmos SDK / CometBFT / Ethereum bugs without a working PoC;
  51% attacks; attacks requiring funded keys in the node keyring (this excludes the
  ethermint `rpc/` personal namespace); privileged-address access; social engineering;
  leaked keys; best-practice critiques.
- **Reviewed and not proposed by any critic** (no plausible Critical/High fund impact):
  ethermint `rpc/` debug namespaces, cronos `x/cronos/rpc/api.go`, ethermint indexer,
  cronos `x/cronos/events/decoders.go`, chain-main `x/chainmain` (stub),
  chain-main `app/ante.go` + `app/upgrades.go`, cronos migrations / grpc_query /
  genesis, `ModuleCRC20Proxy.sol`, x/nft residual files.
- **Not covered this round (round-2 candidates):** live deployed-state divergence
  (bytecode vs repo, live parameter reads on Cronos mainnet); the pinned ethermint
  pseudo-version `v0.24.1-0.20261001054021-cdb246e9a1d2` actually used by cronos v1.8.2
  (audited v0.24.0 tag instead — the pseudo-version commit is not in the git clone
  history, though present in the module cache); deeper passes on chain-main staking
  fork internals; integration-level EVM↔IBC flows against a local testnet.

## 2. Security posture summary

**Zero confirmed findings. Zero needs-validation leads. Zero rejected records.**
`findings.json` is an empty array.

Round 1 covered the freshest and highest-value Cronos-owned surfaces — the v1.8.2
mempool rewrite area, the EVM↔IBC bridge, the app core (proposal handler, upgrades,
e2ee blocklist), ethermint ante + EVM execution, and chain-main's economic modules —
with 70 invariant checks across 127 reviewed paths and 3 passing PoC tests plus 2
re-run upstream test suites. The code in these areas is, on the evidence reviewed,
sound against fund-theft by an unauthenticated or ordinary tx sender: conversions are
1:1 with dust kept by the user, hook failures revert the whole tx, FinalizeBlock
re-runs the full ante handler so mempool/proposal fast paths cannot smuggle invalid
txs into execution, and the highest-value precompile surface is unregistered dead
code. The strongest leads were killed by evidence, not by assumption — notably the
EIP-712 gaps, which exactly match upstream fix #1153 already merged in ethermint
main (13 Nov 2026).

This is a clean round-1 result, not a clean bill of health: coverage is bounded
(§7), and the deferred surfaces above remain unexamined.

## 3. Confirmed findings

| Severity | Title | Affected boundary | Observed result |
|---|---|---|---|
| — | *none* | — | — |

No Critical, High, Medium, or Low findings were confirmed. No findings were
submitted to HackenProof.

## 4. Confirmed finding details

None. See `FINDINGS-DETAIL.md` for the strongest killed leads (not findings).

## 5. Needs validation

| Title | Repository trace | Exact blocker | Bounded local next step | Safe owner-observed check |
|---|---|---|---|---|
| — | *none* | — | — | — |

No source-grounded candidate survives with an unresolved decisive fact. The two
test-infrastructure items recorded in the ledger (app-package test build killed by
CPU contention; mempool test build unfinished) are not coverage gaps: all
verdict-relevant checks are source-grounded and complete, and no candidate exists,
so no PoC is owed. See `NEEDS-VALIDATION.md`.

## 6. Hardening notes and positive source patterns

30 hardening notes were recorded in the coverage ledger (none is a payable finding;
several are out-of-scope DoS/liveness or compliance class). The most notable:

- **Verified defect, operator CLI only (appcore H1):** `x/e2ee/client/cli/encrypt_to_validators.go`
  leaves `recipients[i]` nil when a bonded validator has no registered key or an
  invalid key, and `age.Encrypt` panics on a nil Recipient (confirmed standalone
  against filippo.io/age v1.3.1). The blocklist publisher's tool crashes instead of
  skipping that validator. Fix: build the recipient list with `append`, including
  only successfully parsed recipients (`encrypt.go` already fails closed this way).
  No on-chain or fund impact.
- **Blocklist coverage gaps (appcore H2/H3):** blocklist checks cover tx signers plus
  EVM top-level destinations and EIP-7702 authorization addresses only. Cosmos-msg
  recipients, IBC-transfer recipients, pre-existing authz grants, fee granters, and
  EVM internal calls are not checked — a blocked address can still receive funds via
  Cosmos msgs and act through pre-existing grants. Compliance-bypass class, not theft.
- **Precompiles are dead code — keep it deliberate (precompiles):** all three
  precompiles (bank, ICA, relayer) are unregistered in v1.8.2 (`app/app.go:807`
  passes an empty `[]evmkeeper.CustomContractFn{}`). Before any re-enable, re-audit
  the `contract.Caller()` binding under DELEGATECALL in the pinned go-ethereum fork,
  add a `len(input) < 4` guard to `BankContract`, and consider deleting or clearly
  marking the package as dead code so re-enabling is a deliberate reviewed act.
- **EIP-712 residual (ethermint):** the legacy decorator still has no fee-payer check
  after #1153 (griefing-only, $0 tier); a narrow residual remains for a fresh account
  (sequence 0) signing an unordered amino-mode EIP-712 tx that an attacker flips to
  ordered for double execution — consider a tx-level unordered check in the cosmos
  ante handler.
- **EVM execution quirks (evmexec):** `RefundGas` refunds to `msg.From`, not the fee
  payer (feegrant pocketing — requires the victim to deliberately grant, fails the
  no-unusual-actions gate); `StateDB.err` is sticky across `RevertToSnapshot`
  (tx-level DoS only); `MinGasMultiplier` validation rejects only negatives
  (gov-set > 1 fails all txs closed — cap at 1); self-delegation nonce quirk
  (Ethereum-signed self-auth silently skipped); `EVMBlockConfig` cached per block
  (gov param changes take effect one block late).
- **chain-main:** x/nft denom NAME squatting can permanently block IBC receives of a
  class (DoS only); `ExitTierWithDelegation` does not call
  `alignVestingDelegationTracking` (unreachable post-v8 — re-check if the
  vesting-owner ban is ever relaxed); `UpdateTier` BonusApy changes fail entirely if
  the bonus pool cannot cover one position's pending bonus; x/inflation BeginBlocker
  panics if total supply exceeds MaxSupply (chain halt, liveness).
- **Mempool:** `EncoderCache.Set` stores the caller's slice without copying on the
  encode-error fallback (defensive copy would close it); legacy Data-format eth txs
  mutate the shared decode-cache object before rejection (same #2251 class, harmless
  today).
- **Bridge:** zero-amount bridge logs succeed as silent no-ops (consider an explicit
  amount > 0 guard); `ModuleCRC21.transfer_from_cronos_module` has no explicit
  only-module check (relies on never-approved allowances); `ConvertCoinFromCRC21ToNative`
  is dead code with send-then-burn ordering — fix or remove before any future caller.

**Positive patterns observed:** EVM hook failure reverts the whole tx via tmpCtx
commit-on-success; 1:1 EVM↔native conversion with dust retained by the user;
signer annotations consistently bind funds to the signer; inflation decay bounded
(rate ≤ base rate); NFT IBC escrow/burn discipline with sequence replay protection;
statedb mint/burn journaled with refunds bounded by deduction; EIP-7702 durable
replay safe; blocklist blob decryption failure fails closed (keeps old blocklist).

**Premise correction recorded:** #2244 (5ab71b9a) and #2254 (b6c2a826) ARE in
v1.8.2, not post-release; only #2251 (39c7cf03, decode-cache race) and #2216
(8d2cb65b) are genuinely post-v1.8.2, both already fixed and liveness/DoS-class.
The v1.8.1..v1.8.2 diff is essentially #2244+#2254, not a mempool rewrite.

## 7. Coverage summary

| Unit (agent) | Reviewed paths | Checks | Result |
|---|---|---|---|
| chain-main economic modules (hunter-chainmain) | 24 | 11 | covered, 0 candidates |
| cronos app core: proposal/upgrades/e2ee (hunter-appcore) | 21 | 10 | covered, 0 candidates |
| cronos mempool v1.8.2 (hunter-mempool) | 14 | 9 | covered, 0 candidates |
| x/cronos EVM↔IBC bridge (hunter-evmibc) | 17 | 9 | covered, 0 candidates |
| x/cronos precompiles (hunter-precompiles) | 11 | 6 | covered, 0 candidates (dead code) |
| ethermint ante + EVM fee (hunter-ethermint) | 23 | 11 | covered, 0 candidates |
| ethermint x/evm execution (hunter-evmexec, wave 2) | 17 | 14 | covered, 0 candidates |
| **Total** | **127** | **70** | **7/7 covered, 0 candidates** |

- Ledger counts: covered 7, candidate 0, blocked 0, deferred 0, out-of-scope
  exclusions recorded per unit (DoS/availability class excluded program-wide).
- **Critics:** critic-final found 1 material gap (ethermint x/evm execution core),
  hunted in wave 2 and closed; critic-wave2 (post-wave) clean
  (`stop: true`, no missing units, no reassigns); critic-clean (distinct
  final-clean pass) clean (`stop: true`, no missing units, no reassigns).
- **Test evidence (re-run by the parent coordinator, exit 0):**
  - 3 PoC tests PASS — `TestPocEvmExecSuccessPathAuthAppliedOnce`,
    `TestPocEvmExecInvalidAuthSkippedOnBothStateDBs`,
    `TestPocEvmExecRefundBoundedByDeduction`
    (`~/workspace/cronos-ethermint-v0.24.0/x/evm/keeper/poc_evmexec_test.go`;
    log `agents/hunter-evmexec/artifacts/poc-evmexec-test.log`).
  - EIP-712 legacy test suite PASS (`agents/hunter-ethermint/artifacts/eip712-legacy-test.log`).
  - e2ee keeper test suite PASS (`agents/hunter-appcore/artifacts/e2ee-keeper-test.log`).
- **Provenance note:** hunter-chainmain's structured JSON handoff did not arrive;
  its ledger entry was reconstructed by the parent coordinator from the hunter's own
  scratch notes plus its follow-up verification handoff (fork v0.53.7
  `BeginRedelegation` / `BeforeValidatorSlashed` confirmed). Recorded in the ledger
  unit's `provenance` field.
- Validators: `validate-findings.cjs` and `validate-coverage-ledger.cjs` both pass
  on the final artifacts.
