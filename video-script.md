# Video Script — Hamtaro Audit Agent (Agent Games Wildcard)

**Format:** 1–2 minute demo video. **Total runtime: ~90 seconds.**
**On screen throughout:** screen recording of the terminal + repo; no
face cam required. The demo target is **intentionally vulnerable** and is
labelled as such on screen and in narration.

---

## Shot 0 — Hook (0:00–0:08, ~8s)

**Visual:** Title card over a still of the repo root (`README.md` open).
On-screen text: **"Hamtaro Audit Agent"** + subtitle
**"A coverage-led security audit agent"**.

**Narration (exact):**
> "Most audit agents report bugs. This one has to earn the right to
> report one."

**On-screen text overlay:**
`Most audit agents report bugs. This one has to earn the right.`

---

## Shot 1 — The problem + architecture (0:08–0:25, ~17s)

**Visual:** Simple architecture diagram, built left to right as the
narration names each stage:
`coverage ledger → parallel hunters → critic waves → independent verifier → validated findings.json`
The diagram is a static image or slide; each stage highlights as it is
named.

**Narration (exact):**
> "A finding is only as good as the process behind it. Coverage is
> planned before hunting — every unit in a ledger first. Hunters work
> in parallel, one per boundary. Critics hunt for gaps. Then a fresh
> verifier, one that did not hunt it, tries to refute every candidate."

**On-screen text overlay (appears per stage):**
`1. Coverage ledger — planned before hunting` ·
`2. Parallel hunters — one per boundary` ·
`3. Critic waves — find the gaps` ·
`4. Independent verifier — tries to REFUTE` ·
`5. Validated findings.json`

---

## Shot 2 — Live demo run (0:25–0:55, ~30s)

**Visual:** Live terminal recording of the demo runner, run for real
(under a minute in full; the video shows the run at natural speed with
the preflight and the slowest forge output trimmed, no fake output).
The command typed is:

```
node demo/run-demo.cjs
```

The terminal scrolls through the phases; the camera (or a highlight
box) pauses on each of these lines as the narration names them:

- `[phase 1] coverage ledger — seeding 3 planned units (before hunting)`
- `[PASS] testReentrancyDrainsVault`
- `[PASS] testFixedVaultBlocksReentrancy`
- `[PASS] testHonestWithdrawWorks`
- `3a. attack PoC re-run in a fresh process: PASS (reproduces)`
- `3b. counterfactual vs DemoVaultFixed: attack FAILS, funds stay put`
- `3c. source order in DemoVault.sol: external call … BEFORE balance update`
- `DONE … 1 confirmed finding (high): reentrancy in DemoVault.withdraw.`

A persistent lower-third reads, for the whole shot:
**"Demo target: intentionally vulnerable vault — labelled, do not deploy."**

**Narration (exact):**
> "Here it is, running. Phase one: a three-unit ledger, seeded before
> hunting. Phase two: three Foundry tests — all pass. A one-ether
> attacker drains the vault: zero left, eleven to the attacker, ten of
> them victim funds. Phase three is the gate: the verifier re-runs the
> attack fresh, runs it against the fixed vault — it fails — and checks
> the source order. Phase four: one confirmed finding, high severity.
> The demo replays these phases with pre-written tests — it shows the
> flow and the gate."

**On-screen text overlay (key beats):**
`3 PoC tests — all PASS` ·
`1-ether attacker → vault 0 ether, attacker 11 ether` ·
`Verifier: re-run ✓ · counterfactual ✓ · source order ✓` ·
`findings.json — 1 confirmed (high)`

---

## Shot 3 — The honest zero (0:55–1:15, ~20s)

**Visual:** Split screen of the two sample-run report headers
(`sample-runs/cronos-blockchain-protocols-run-1/REPORT.md` and
`sample-runs/cronos-smart-contracts-run-1/REPORT.md`), each with a large
**"0 findings"** stamp. One line under each report gives the reason.

**Narration (exact):**
> "Now the honest part. Two real audits — Cronos chain code, then eight
> VVS contracts on mainnet — zero findings in both. The best chain lead
> was upstream fix eleven-fifty-three, already merged. And on VVS, the
> reward attack proved in code is dead live — emissions are off. A
> verifier that kills weak candidates is the feature."

**On-screen text overlay:**
`Run 1 — Cronos chain code · 7/7 units · 127 paths · 70 checks · 0 findings` ·
`Strongest lead: EIP-712 gaps = upstream fix #1153, already merged` ·
`Run 2 — VVS Finance · 8 contracts · 41 PoC tests · 0 findings` ·
`Reward attacks dead live: emissions switched off (BONUS_MULTIPLIER = 0)`

---

## Shot 4 — Close (1:15–1:30, ~15s)

**Visual:** Title card again, with the repo layout (`skill/`, `demo/`,
`sample-runs/`) and the demo command. No GitHub URL — the repo is not
published yet.

**Narration (exact):**
> "An agent that shows its coverage, proves its findings, and says
> nothing when there is nothing to say. No sandbox — a human still
> reviews before anything is filed. The repo has the skill, the demo,
> both runs. Try it — under a minute."

**On-screen text overlay:**
`Hamtaro Audit Agent — coverage-led, verifier-gated, honest zeros` ·
`Try it: node demo/run-demo.cjs` ·
`Skill · Demo · Two real audit runs — in the repo`

---

## Production notes

- **Total runtime: ~90 seconds** (8 + 17 + 30 + 20 + 15).
- Narration is ~240 words, paced at roughly 160 words per minute;
  trim the forge output, never the narration.
- The demo run must be a real recording of `node demo/run-demo.cjs`
  (Node 18+ and Foundry required). Do not fake terminal output.
- The demo target (`demo/src/DemoVault.sol`) is intentionally
  vulnerable and labelled as such in its header; keep the lower-third
  visible for the whole of Shot 2.
- No GitHub URL appears anywhere: the repo is not created yet.
