# Hamtaro Audit Agent — public endpoint

The public HTTPS endpoint for the Agent Games Season 01 Wildcard entry.
Vercel serverless, Node 18+, **zero dependencies, zero paid services**.

## Honest scope

This endpoint is the agent's **deterministic pre-screen**: it runs seven
fixed pattern checks over a Solidity snippet in pure JavaScript — no
Foundry, no compilation, no external calls. Every finding it returns is
`verdict: needs_validation`, because confirmation needs a runnable PoC and
an independent verifier.

The **full multi-agent audit** — reconnaissance, coverage ledger, parallel
hunters, critic waves, independent verification — runs in Muse following
`skill/SKILL.md` and is evidenced by the sample runs in this repo
(`sample-runs/`) and the demo run (`demo/out/`). This endpoint does
**not** run the full audit, and the demo page says so.

## Layout

| Path | What it is |
|---|---|
| `public/index.html` | The demo page: what the agent is, the 6-phase flow, the honest-scope statement, a live pre-screen form, the worked demo example, links to repo / sample runs / video |
| `api/audit.js` | Vercel serverless function: `POST /api/audit` |
| `lib/audit-checks.js` | The deterministic checker (pure JS, no deps) — shared by the function and the local tests |
| `test/local-test.cjs` | Local test runner (no network, no Vercel CLI) |
| `package.json` | No dependencies; `npm test` runs the local tests |

## The seven checks

1. **reentrancy** — external call before a state write in one function
2. **tx-origin** — `tx.origin` used (authorization bypass risk)
3. **unchecked-call** — low-level call return value not checked
4. **selfdestruct** — `selfdestruct` reachable without access control
5. **delegatecall** — `delegatecall`, flagged harder when unguarded
6. **div-before-mul** — division before multiplication (heuristic)
7. **access-control** — sensitive function with no visible guard (heuristic)

Findings mirror the repo's `findings.json` record shape (fingerprint,
title, description, root cause, trace, evidence, severity, confidence,
remediation) — with `verdict: needs_validation` throughout.

## API

```
POST /api/audit        {"code": "<Solidity source, max 200 KB>"}
GET  /api/audit        usage document
```

```sh
curl -X POST "$URL/api/audit" -H "Content-Type: application/json" \
  -d '{"code":"contract V { function w() external { (bool ok,) = msg.sender.call{value: 1}(\"\"); require(ok); } }"}'
```

## Test locally

```sh
cd endpoint
node test/local-test.cjs   # or: npm test
```

Invokes the checker and the HTTP handler directly (mock req/res) with a
clean vault, a reentrant vault, a `tx.origin` snippet, and an unguarded
`pause()`. Exits 0 only if every expectation holds. The checker also
flags the repo's real `demo/src/DemoVault.sol` (high reentrancy) and
clears `demo/src/DemoVaultFixed.sol`.

## Deploy (Vercel Hobby, free)

The user deploys — this repo only holds the code. ~10 minutes:

1. Create a Vercel account at https://vercel.com/signup — **sign up with
   GitHub** (GitHub OAuth) so Vercel can see the repo.
2. In the Vercel dashboard: **Add New → Project → Import** the repo
   `sintaameliaa-mee/hamtaro-audit-agent`.
3. **Root Directory: set it to `endpoint`** (the serverless functions and
   the demo page live in this subdirectory, not the repo root). Leave
   Framework Preset as "Other" and Build Command empty — there is no
   build step.
4. Deploy. Vercel assigns a public HTTPS URL (e.g.
   `https://hamtaro-audit-agent-endpoint.vercel.app`).
5. Verify in a browser:
   - `GET /` shows the demo page.
   - `GET /api/audit` returns the usage JSON.
   - Paste the reentrant sample in the form and confirm it flags
     reentrancy (high, needs_validation).
6. Use that URL as the **agent endpoint** in the Agent Games Wildcard
   form (deadline: 21 Nov 2026, 22:00 UTC / 22 Nov 05:00 WIB — check the
   current rules page for the exact close).

Notes:

- The `endpoint` branch holds this code; merge it to `main` (or deploy
  the branch directly — Vercel lets you pick the branch at import) before
  or during step 2.
- No environment variables, no secrets, no build. The function is
  stateless and stores nothing; submitted code is analyzed in-memory and
  discarded.
- Redeploys happen automatically on every push to the deployed branch.
