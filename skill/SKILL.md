# Security Audit

> Source: https://github.com/cloudflare/security-audit-skill (MIT, Cloudflare).
> Installed 2026-11-14 from the upstream `skills/security-audit/` directory.
> The upstream `SKILL.md` is saved verbatim as `UPSTREAM-SKILL.md` in this
> folder, with all companion files, `report-schema.json`, and both validators.
> This file adapts the workflow to this VM and to the skills already installed
> here. Validators verified on this VM: `node --test` passes 65 of 65 tests
> on Node v24.22.1, zero dependencies, no API key, no GPU, no desktop needed.

## When to use this skill and when to use the others

- Use this skill for a full structured audit of a codebase with measurable
  coverage, parallel hunters, independent verification, and a validated
  findings file.

- Use this skill when a target is large, when a previous audit left gaps, or
  when a new commit lands on a watched repo and only the diff plus affected
  surfaces need a fresh pass.

- Use `agentic-bug-hunter` for the bug classes, grep patterns, and PoC
  templates themselves, especially for smart contracts.

- Use `bug_bounty_hunt` for program scope, submission cost, live-board
  duplicate checks, and filing rules.

- These three skills compose. This skill is the orchestration and
  verification layer. It does not replace the hunting knowledge or the
  filing rules.

## Choose guidance mode or full audit mode

- Stay in guidance mode for security questions, a focused review of one
  file or function, methodology advice, or triage of a single finding.

- In guidance mode do not create an output directory, do not run all six
  phases, and do not write audit artifacts.

- Run full audit mode only when the user explicitly asks to audit or
  pen-test a codebase, asks for a full or end-to-end review, or requests
  report artifacts.

- When the request could mean either mode, ask one focused question before
  you create files or start the complete workflow.

## Run the six phases in order

- Phase 1, reconnaissance: map the architecture, trust boundaries, input
  surfaces, and prior evidence, then write `architecture.md` and seed a
  deterministic `coverage-ledger.json`. Follow `RECONNAISSANCE.md`.

- Phase 2, coverage-led hunting: assign planned ledger units to isolated
  hunters, one hunter per boundary, and run coverage-critic waves until the
  critic finds no new gap. Follow `HUNTING.md` and `ATTACK-CLASSES.md` plus
  the selected domain companions.

- Phase 3, candidate validation: give every unique candidate to a fresh
  verifier that did not hunt it and whose job is to refute it from source
  and bounded local evidence. Follow `VALIDATION-AND-REPORTING.md`.

- Phase 4, structured output: write `confirmed`, `needs_validation`, and
  `rejected` records to `findings.json` and validate the file against
  `report-schema.json` with `validate-findings.cjs`.

- Phase 5, independent record verification: give the final source claims to
  fresh agents for verification. A material correction gets another
  independent verifier.

- Phase 6, target-neutral reporting: derive `REPORT.md`,
  `FINDINGS-DETAIL.md`, and `NEEDS-VALIDATION.md` from the verified records
  and the coverage ledger, with no live-probe instructions.

- End a run only when all Phase 6 artifacts are written and both validators
  pass, or when `run_status` is recorded as incomplete with its exact reason
  and the gap is disclosed in the report.

## Keep coverage honest across runs

- Build the coverage ledger before hunting starts and update it after every
  agent result. The parent agent alone writes the shared run files.

- Record every unit as planned, in progress, covered, candidate, deferred,
  blocked, or out of scope. Never record an unreviewed unit as covered.

- Run the ledger validator after creating the ledger and after each later
  update with `node validate-coverage-ledger.cjs <path>`.

- When a prior run exists, read its ledger and findings first. Carry a prior
  confirmed record forward only when its relevant source is unchanged and
  its evidence still meets the current contract, and send it through current
  verification anyway.

- Treat prior needs_validation, deferred, blocked, and changed-source units
  as current work. A prior rejected record suppresses only the unchanged
  failed claim, never coverage of its unit.

- When no prior ledger exists, say so in the final coverage statement. Never
  imply that one run exhausts the target.

## Confirm only a demonstrated boundary failure

- Name the lower-trust principal, the accepted input or action, the intended
  control, the crossed boundary, the affected principal or resource, and the
  concrete observed result for every candidate.

- Drop a candidate that is only a missing best practice, a guessed
  deployment behavior, a generic parser crash, or self-impact.

- Give severity only to confirmed records. Calibrate with the upstream
  anchors: critical is unauthenticated code execution, full data-store
  access, or arbitrary account takeover. High fully defeats an explicit
  control with real consequences. Medium is a real boundary violation with
  limited blast radius or uncommon preconditions. Low is disclosure of
  non-secret internals or minimal gain for sustained effort.

- Keep a source-grounded blocked lead as needs_validation with its exact
  unresolved fact and no severity. Never use needs_validation as a parking
  place for a speculative idea.

- Recommend the smallest effective source fix for each confirmed finding,
  at the last trusted decision point, with a regression test.

## Adapt the orchestration to this VM

- Put every run under `~/workspace/security-audits/<repo-name>/run-<N>`
  so runs survive a VM restart. Never write run files inside the target
  repository unless the user explicitly selects an ignored directory.

- The main agent is the parent. It owns `run-metadata.json`,
  `architecture.md`, `coverage-ledger.json`, `findings.json`, and the three
  report files. Hunters and verifiers are subagents that write only to
  their own `agents/<agent-id>/scratch/` directory and return one
  structured result.

- A subagent cannot spawn further subagents here. When this skill runs
  inside a subagent, run the phases sequentially in that session or return
  to the parent so it can launch the hunter and verifier waves in parallel.

- Set a budget as a maximum number of subagent invocations and record it in
  `run-metadata.json`. Reserve the critic and verifier calls before you
  assign hunters. When the budget cannot fund the required critics and
  validation, launch no hunters and mark the planned units deferred.

- Pick a profile and record it. Quick is one hunter wave plus one critic
  pass for a small target or a fast first look. Standard is the workflow as
  written. Deep splits units per subsystem, runs critic waves to a clean
  pass, and keeps candidate validation and final verification as separate
  fresh agents.

## Execution limits on this VM

- This VM has no OS-enforced sandbox for target-controlled code. No
  bubblewrap, firejail, or equivalent isolation was verified here, so the
  upstream sandbox requirement cannot be met in full.

- Run a proof of concept only against public bug-bounty code you have
  already reviewed, in a disposable copy under the run directory, with dummy
  data and no credentials in the environment. Never run untrusted binaries,
  fuzzers, or target-controlled builds that fetch dependencies.

- When the decisive check needs the missing sandbox, do not execute. Keep
  the lead as needs_validation with the exact blocker and give a safe
  validation plan.

- Do not probe deployed endpoints, external services, shared
  infrastructure, production identities, other users data, or live control
  planes. Do not spend paid API quota or test availability against a live
  or shared process.

- The validators are the only code this skill executes. They are
  zero-dependency Node scripts and were verified here with `node --test`.

## Available connectors

- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.

- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Websites

- [Cloudflare blog: Build your own vulnerability harness](https://blog.cloudflare.com/build-your-own-vulnerability-harness) for the background on the harness this skill seeded.

## Alternatives for better results

- Ask the user for the one thing only they can supply, such as the audit scope, a run profile, or a subagent budget, and carry the rest yourself.

- Run a quick profile first on a new large target, then use its ledger gaps to aim a standard or deep run at the uncovered surfaces.
