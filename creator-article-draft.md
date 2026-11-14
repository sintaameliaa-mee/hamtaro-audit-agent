# The Audit Agent That Has to Earn the Right to Report a Bug

Most security-audit agents are judged by what they find. This one is
judged by what it refuses to report.

The Hamtaro Audit Agent is a coverage-led audit agent. Given a target
and a scope, it runs a six-phase audit — reconnaissance, coverage-led
hunting, candidate validation, structured output, independent record
verification, reporting — and only calls something a finding after a
fresh verifier agent, one that did not hunt it, has tried and failed to
refute it. It has run two real audits on public bug-bounty programs
and reported zero findings in both. That zero is the system working as
designed.

An agent that reports findings is easy to build; an agent whose
findings a human can trust is not. A confident false positive costs a
triager's time and a reporter's credibility. The question that matters
is not "can the agent find bugs?" but "what stops it from claiming one
it hasn't earned?"

## Architecture: coverage first, then hunting, then a hostile verifier

The orchestration layer adapts Cloudflare's
security-audit-skill (MIT, Copyright 2025-2026 Cloudflare, Inc.), with
the upstream skill preserved verbatim. The validators are the upstream
zero-dependency Node scripts; `node --test` passes 65/65.

**Phase 1 — reconnaissance and the coverage ledger.** Before hunting
begins, the agent maps the target's architecture, trust boundaries,
and input surfaces, then seeds a deterministic `coverage-ledger.json`.
Every unit is planned up front: boundary, attack class, starting
paths. The ledger is a validator-enforced state machine: a unit is
`planned`, `in progress`, `covered`, `candidate`, `deferred`,
`blocked`, or `out of scope` — and never `covered` until actually
reviewed. The ledger records what was covered, deferred, and excluded.

**Phase 2 — parallel hunters and critic waves.** One isolated hunter
per boundary, working it deeply rather than skimming the whole
codebase. Critics then run in waves until a pass finds no new gap. In
the first real run, a critic found a material gap — the ethermint EVM
execution core — hunted in a second wave and closed.

**Phase 3 — the adversarial verifier.** Every candidate goes to a
fresh verifier that did not hunt it, whose job is to refute it from
source and bounded local evidence. The verifier is asked to kill the
candidate; it survives only if the verifier cannot. A lead whose
decisive check is blocked stays `needs_validation`, with its exact
blocker recorded and no severity attached. Severity goes only to
confirmed records, calibrated to fixed anchors: critical is
unauthenticated code execution, full data-store access, or arbitrary
account takeover; high is full defeat of an explicit control with real
consequences.

**Phases 4–6 — validated output and reporting.** Confirmed,
`needs_validation`, and `rejected` records go into `findings.json`,
validated against a JSON schema. Fresh agents re-check the final
source claims; only then are the reports derived from the verified
records and the ledger.

## The verifier at work: three kills from the chain run

The first real run audited Cronos Blockchain Protocols — cronos
v1.8.2, ethermint v0.24.0, and chain-main v8.0.1, all Go — under a free
HackenProof program where only Critical ($20,000–$100,000) and High
($500–$20,000) pay; Medium/Low pay $0. It covered 7/7 ledger
units, 127 reviewed paths, and 70 checks, with 3 passing
proof-of-concept tests plus 2 re-run upstream suites, spending 10
of a 13-agent budget in about 74 minutes — and reported 0 findings.
The interesting part is what it killed.

The strongest lead was a set of EIP-712 signature gaps in ethermint
v0.24.0 — fee-payer binding and unordered-transaction handling that
could let an attacker replay or re-shape a signed transaction.
Verification killed it: the gaps exactly matched upstream fix #1153,
already merged in ethermint main on 13 November 2026. A known, fixed
issue is not a finding; the unordered leg was dead anyway on Cronos
v1.8.2.

The second kill was a mempool double-spend: a spent transaction
reproposed before recheck completes could, in theory, execute twice.
But FinalizeBlock re-runs the full ante handler, including nonce
verification — the nonce is consumed by the first execution, so any
stale reproposal fails.

The third kill was the precompile surface. The bank, ICA, and relayer
precompiles looked like the highest-value attack surface in the
codebase — EVM-callable functions that move funds. Verification found
all three are unregistered dead code in v1.8.2: the wiring passes an
empty list of custom precompiles, there are zero call sites for their
constructors, and calls to their addresses hit empty accounts. With no
live precompile to attack, every hypothetical precompile bug fails the
first question.

## The honest zero: VVS Finance and the emissions switch

The second run audited 8 deployed VVS Finance contracts on Cronos
mainnet — about 2,105 lines of Solidity, with the vault holding about
$11.12M in total value locked — under the free HackenProof Cronos
Smart Contracts program, where again only Critical/High pay. It
covered 12/12 ledger units, ran 41 Foundry proof-of-concept tests, all
passing, and verified the source byte-for-byte against deployed
bytecode: 8/8 match. It spent 6 of an 8-agent budget in
about 41 minutes. It reported 0 findings.

The reason is a single live-state fact: VVS emissions are switched
off on mainnet. `BONUS_MULTIPLIER` is 0, pool 0's allocation points
are 0, pending rewards for the vault are 0, and the migrator is the
zero address — all verified by independent read-only calls at block
~105.8M. The entire reward-accrual attack class is dead in live state.

Two real mechanisms were confirmed in code and still not reported.
The first is a deposit-before-harvest flaw in VVSVault: deposits are
priced from the vault's balance excluding pending staking rewards,
and the harvest that pays those rewards in happens after the new
shares are minted — so a depositor arriving just before a harvest
captures rewards accrued by earlier depositors. With rewards on, the
proof-of-concept profit is 9,090,909 VVS in a single transaction. In
an exact live-state replica, with the multiplier at 0 and pool 0
allocation at 0, the profit is exactly 0. Real mechanism; zero impact
today — it revives only if the owner re-enables pool 0 emissions.

The second is BENCH duplication via `emergencyWithdraw`: the function
returns staked VVS without burning the BENCH receipt tokens, so
repeated stake-and-emergency-withdraw loops mint BENCH for free. It is
real on-chain: BENCH supply exceeds staked VVS by exactly
1,901,549,456 tokens. But
the program excludes "VVS-Bench" and incentive devaluation, BENCH has
no redeem or governance function in any in-scope contract, and there
are 0 BENCH trading pairs on any Cronos DEX — so there is no path
from duplicated BENCH to user fund loss. A mechanism without an
impact path is a note, not a finding.

## The demo: one bug, found the hard way, on purpose

The repo includes a runnable demo of the whole loop, under a minute.
The target is `DemoVault.sol`, a small vault with one intentional,
clearly-labelled reentrancy bug: the external call happens before the
balance is zeroed. The runner (`node demo/run-demo.cjs`, zero
dependencies, needs Foundry's forge) seeds a 3-unit coverage ledger
and validates it, runs 3 Foundry PoC tests — all pass — then runs the
verifier gate: a fresh re-run of the attack test, a counterfactual
showing the same attack fails against the fixed vault, and a
source-order check confirming the call precedes the update. It writes
`findings.json` with 1 confirmed HIGH finding. The observed result: a
1-ether attacker drains the whole vault — vault 0 ether, attacker 11
ether, 10 of them victim funds, across 10 reentrant calls.

One honesty point: the runner replays the pipeline deterministically
with pre-written PoC tests. In the real runs, the hunting and
verification were done by agents following the skill. The demo shows
the artifact flow and the verifier gate — it does not claim the script
discovers bugs by itself.

## What a ZK proof could — and could not — add

This entry is for the Agent Games, run by zkVerify, so the question
is fair: what would zero-knowledge proofs add to an audit agent? The
honest answer cuts both ways.

A proof could make the ledger's completeness claim checkable. Today,
"7/7 units covered" rests on the agent's word and the validator's
output; a proof could make it a verifiable statement — every planned
unit reached a terminal state, or a stated finding's proof-of-concept
executed with a stated result. That fits the pipeline's
already-deterministic parts: the ledger state machine, the validators,
the test executions.

But a proof cannot cover the judgement calls, and the judgement calls
are where audits are won and lost. No proof can show the planned
boundaries were the right ones, the scope was correct, or an impact
path is real. A proof of a wrong claim is still a wrong claim — just a
wrong claim with better packaging. The EIP-712 kill depended on
knowing upstream fix #1153 existed; the VVS zero on reasoning about
what "emissions off" means for an attack class. Neither is a
computation a proof can certify. Verification
infrastructure is the last step, after the claim is worth making.

For the record: no zkVerify integration exists in this entry. Any
future proof layer would sit on top of the pipeline's validated
artifacts, not replace them.

## Limitations

There is no OS-enforced sandbox in the environment this agent runs
in, so target code is never executed outside reviewed, disposable
copies with dummy data — and any lead whose decisive check needs a
sandbox stays `needs_validation` with its exact blocker. Findings
need human review before filing: the agent confirms a demonstrated
boundary failure, and a human decides severity and whether to file
(both sample runs filed nothing). Coverage is bounded, never
exhaustive, and a clean run is not a clean bill of health. There is no
live probing: live-state conclusions are read-only snapshots at a
stated block and time. And Medium/Low triage is
program-dependent: some bounty programs pay $0 for Medium and Low, so
the agent records severity on the evidence and lets the program rules
decide what is worth filing.

## Disclosure

The Hamtaro Audit Agent is AI-driven: agents following the audit
skill performed the hunting, verification, and reporting in both real
runs, and this draft was written with AI assistance and reviewed by
the human operator. Tools used: Foundry, the zero-dependency Node
validators from the Cloudflare-origin skill, and read-only chain
calls for live-state verification. Shortcuts, as disclosed above: the demo runner replays
the pipeline deterministically with pre-written PoC tests, and the
demo target is intentionally vulnerable — a labelled reentrancy bug,
not a real vulnerability. Nothing in this entry involved funds,
wallets, or credentials.

The repo — [github.com/sintaameliaa-mee/hamtaro-audit-agent](https://github.com/sintaameliaa-mee/hamtaro-audit-agent) — contains the skill, the runnable demo, and the unedited
artifacts of both real runs. To see the pipeline end to end, run the
demo:

```sh
node demo/run-demo.cjs
```

Two audits, zero findings, and every kill documented. That is the
entry: an agent that shows its coverage, proves its findings, and
says nothing when there is nothing to say.
