# Needs Validation — Cronos Blockchain Protocols, run-1

## Unresolved records

**None.** Run-1 has zero `needs_validation` records. No source-grounded candidate
survives with an unresolved decisive fact, and no severity is assigned to anything
in this file.

## Dispositioned items (not findings, not open leads)

These items were recorded in the coverage ledger as `dispositioned_unresolved`.
They are infrastructure or out-of-scope limitations, not validation blockers for
any candidate — no candidate exists, so no PoC is owed for any of them.

1. **App-package test run killed (hunter-appcore).** The `go test ./app/...` build
   was killed after ~15 min still compiling under heavy contention from concurrent
   agents. Disposition: test-infrastructure limitation, not a coverage gap. All
   verdict-relevant checks are source-grounded and complete; the e2ee keeper suite
   passed (artifact `agents/hunter-appcore/artifacts/e2ee-keeper-test.log`).
   Round-2 note: re-run the app test package on a quiet VM if a future candidate
   ever depends on `TestExtTxSelector` / `TestCacheProposalTxVerifier` /
   `TestSetBlockListRetriesAfterFailure` / `TestPruneStaleIBCConsensusStateSubkeys`.
2. **Mempool test run unfinished (hunter-mempool).** `go test ./app/mempool/` could
   not complete (module downloads took ~6h; test-binary build still compiling after
   ~12 min on the 1.5-CPU VM, then stopped to free CPU). Disposition: same as above
   — all 9 checks are source checks and complete.
3. **Precompile upstream provenance (hunter-precompiles).** The provenance of
   `packetSenderAddress` / `contractAddress` passed to `keeper.go onPacketResult`
   (supplied by upstream ibc-go ibccallbacks middleware) was not verified, and what
   `contract.Caller()` returns under DELEGATECALL in the pinned go-ethereum fork
   (v1.10.20-0.20260521015249-663dca6c618e) was not source-verified. Disposition:
   out of scope for this run — concerns upstream ibc-go middleware / go-ethereum
   fork (not in-scope repos) and dead unregistered code; the keeper-side check
   holds. Re-check only if the precompiles are ever re-registered.

## Round-2 leads (prioritized, no severity)

These are coverage gaps, not findings. Each names a concrete next step.

1. **Pinned ethermint pseudo-version.** cronos v1.8.2 pins
   `crypto-org-chain/ethermint v0.24.1-0.20261001054021-cdb246e9a1d2`, whose commit
   is not in the git clone history. This run audited the v0.24.0 tag. Next step:
   diff the pseudo-version (module cache) against v0.24.0 and audit the delta.
2. **Deployed-state divergence.** No live parameter reads or bytecode-vs-repo
   comparison was done. Next step: compare deployed Cronos mainnet contract/bytecode
   and live params against the v1.8.2 repo (read-only).
3. **New commits since v1.8.2.** Only #2251 and #2216 were genuinely post-release
   at run time. Next step: on the next release or commit batch, diff and audit the
   changes (same pattern as the XE repo watch).
4. **Deferred surfaces.** ethermint `rpc/` debug namespaces, cronos
   `x/cronos/rpc/api.go`, ethermint indexer, `x/cronos/events/decoders.go`,
   chain-main `app/ante.go` + `app/upgrades.go`, cronos migrations/grpc_query/genesis,
   `ModuleCRC20Proxy.sol`, x/nft residual files. Critics judged no plausible
   Critical/High fund impact; a deeper round-2 pass could confirm or overturn that
   judgment for the RPC surface specifically.
5. **EIP-712 residual (ethermint hardening).** Narrow fresh-account (sequence 0)
   amino-mode unordered-flip residual; and the legacy decorator's missing fee-payer
   check. Both are $0-tier as-is (require the victim to sign an unusual tx), but a
   round-2 pass could test whether any live path makes the flip reachable without
   victim cooperation.
