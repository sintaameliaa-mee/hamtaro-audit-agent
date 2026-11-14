# Hamtaro Audit Agent

A coverage-led security audit agent: it audits a codebase with measurable
coverage, hunts in parallel, and only reports a finding after an
independent verifier has tried — and failed — to refute it.

Built for the [Agent Games](https://agentgames.zkverify.io/) Season 01
Wildcard track. Entry is free; this repo is the whole entry: the skill,
a runnable demo, and the unedited artifacts of two real audit runs.

## What it does

Given a target codebase and a scope, the agent runs a six-phase audit:

```
reconnaissance → coverage ledger → parallel hunters → critic waves
    → independent verification → validated findings → report
```

1. **Reconnaissance** maps the architecture, trust boundaries, and input
   surfaces, then seeds a deterministic `coverage-ledger.json` — every
   unit of the target is planned *before* hunting starts.
2. **Coverage-led hunting** assigns one isolated hunter per boundary.
   Coverage critics run in waves until no new gap is found.
3. **Candidate validation** hands every candidate to a *fresh* verifier
   that did not hunt it, whose job is to refute it from source and bounded
   local evidence. A candidate survives only if the verifier cannot kill
   it.
4. **Structured output** writes `confirmed` / `needs_validation` /
   `rejected` records to `findings.json` and validates the file against a
   JSON schema with a zero-dependency Node validator.
5. **Independent record verification** re-checks the final source claims
   with fresh agents; a material correction gets another verifier.
6. **Reporting** derives `REPORT.md`, `FINDINGS-DETAIL.md`, and
   `NEEDS-VALIDATION.md` from the verified records and the ledger.

Severity is given only to confirmed records, calibrated to fixed anchors
(critical: unauthenticated code execution / full data-store access /
arbitrary account takeover; high: full defeat of an explicit control with
real consequences). A source-grounded lead whose decisive check is blocked
stays `needs_validation` with its exact blocker — never a severity, never
a parking place for speculation.

## Repo layout

| Path | What it is |
|---|---|
| `skill/` | The audit skill: `SKILL.md` (adapted workflow), the upstream skill verbatim (`UPSTREAM-SKILL.md`), 14 domain companion docs, `report-schema.json`, and the two zero-dependency validators + their tests |
| `demo/` | A runnable end-to-end demo against a tiny vault with one intentional, labelled reentrancy bug — see `demo/README.md` |
| `sample-runs/` | Unedited artifacts of two real audit runs, both honest zeros — see `sample-runs/README.md` |
| `video-script.md` | Shot-by-shot script for the 1–2 minute demo video |
| `creator-article-draft.md` | Creator Track article draft (technical deep dive) |
| `honesty-check.md` | Every checkable claim in this repo, and where its evidence lives |

## Try the demo (under a minute)

Requirements: Node.js 18+ and [Foundry](https://getfoundry.sh).

```sh
node demo/run-demo.cjs
```

The runner audits `demo/src/DemoVault.sol` — a small vault with an
**intentional, clearly-labelled** reentrancy bug — and walks all four
artifact phases: coverage ledger → hunt (Foundry PoC) → independent
verifier (fresh re-run + counterfactual against the fixed vault + source
order check) → `findings.json` with one confirmed (high) finding. Both
validators pass. Outputs land in `demo/out/`; a real run's output is
committed there so you can inspect it without running anything.

Honest note: the demo runner replays the pipeline deterministically with
pre-written PoC tests. In the real runs, the hunting and verification were
done by agents following `skill/SKILL.md`. The demo shows the artifact
flow and the verifier gate; it does not claim the script discovers bugs
by itself.

## Real runs: two audits, zero findings, on purpose

| Run | Target | Coverage | Result |
|---|---|---|---|
| `sample-runs/cronos-blockchain-protocols-run-1/` | Cronos chain code (Go): cronos v1.8.2, ethermint v0.24.0, chain-main v8.0.1 | 7/7 units, 127 paths, 70 checks | **0 findings** |
| `sample-runs/cronos-smart-contracts-run-1/` | 8 VVS Finance contracts on Cronos mainnet (Solidity) | 12/12 units, ~2,105 lines, 41 PoC tests | **0 findings** |

Both runs are documented in full — including the strongest leads and why
the evidence killed them. In the chain run, the best EIP-712 lead turned
out to be upstream fix #1153, already merged. In the VVS run, the vault's
reward-accrual attack class is dead in live state because emissions are
switched off on mainnet. A verifier that cannot be talked out of killing
a weak candidate is the feature, not a failure: the output is "no finding"
with receipts, instead of a confident-sounding false positive.

## Limitations (honest)

- **No OS-enforced sandbox here.** The environment this agent runs in has
  no bubblewrap/firejail-equivalent isolation, so target code is never
  executed outside reviewed, disposable copies with dummy data — and any
  lead whose decisive check needs a sandbox stays `needs_validation`.
- **Findings need human review.** The agent confirms a demonstrated
  boundary failure with a PoC; a human still decides severity in context
  and whether to file it (both sample runs filed nothing).
- **Coverage is bounded, never exhaustive.** Each run records exactly what
  was covered, deferred, and excluded. A clean run is not a clean bill of
  health — see the reports' limits sections.
- **No live probing.** The agent does not probe deployed endpoints, live
  services, or production identities. Live-state conclusions come from
  read-only calls and are snapshots at a stated block/time.
- **Medium/Low triage is program-dependent.** Some bounty programs pay $0
  for Medium/Low; the agent records severity on the evidence and lets the
  program rules decide what is worth filing.

## Upstream attribution

The orchestration and verification layer adapts
[Cloudflare's security-audit-skill](https://github.com/cloudflare/security-audit-skill)
(MIT, Copyright (c) 2025-2026 Cloudflare, Inc.). The upstream skill is
preserved verbatim in `skill/UPSTREAM-SKILL.md` with its license in
`skill/LICENSE-upstream`; `skill/SKILL.md` documents the adaptations for
this environment (run layout, agent budget, sandbox limits). The
validators are the upstream zero-dependency Node scripts: `node --test`
passes 65/65 in this repo.

Everything else in this repo (demo target, demo runner, sample-run
reports, article draft) is MIT-licensed, see `LICENSE`.

## Agent Games

- Wildcard track: this repo + the demo video (script in
  `video-script.md`).
- Creator Track: the article draft in `creator-article-draft.md`.
- No funds, no wallet, and no credentials are involved in running any of
  this. The demo target is a local Foundry test; the sample runs audited
  public code.
