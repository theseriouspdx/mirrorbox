# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** 2026-03-08 (session 10)
**Last task:** Governance update — logged 0.3 audit findings, filed BUG-023 through BUG-028, updated projecttracking.md with 0.3 bug-fix block and PRE-0.4 spec correction block.
**Status:** Milestone 0.3 IN AUDIT — FAIL. Bug-fix tasks queued.

---

## Section 1 — Next Action

**0.3-BF-01** — Rotate leaked OpenRouter key (do this first, before any code work)

Then in order:
- **0.3-BF-02** — Fix BUG-023: Redactor callback offset/group1 confusion (`src/state/redactor.js`)
- **0.3-BF-03** — Fix BUG-024 + BUG-027: Chain-linked hash envelope + `seq` field (spec fix first, then `event-store.js` + both verify-chain scripts)
- **0.3-BF-04** — Fix BUG-025: Move id/timestamp/seq inside transaction
- **0.3-BF-05** — Fix BUG-026: Snapshot type guard on `recover()`
- **0.3-BF-06** — Rebuild `mirrorbox.db` clean
- **0.3-RE-AUDIT** — Re-audit all four findings

After 0.3 closes:
- **PRE-0.4-01** — Apply off-the-shelf audit diff to SPEC.md
- **PRE-0.4-02** — MCP server research spike

---

## Section 2 — Session Start Protocol

1. Read `.dev/governance/AGENTS.md` — complete required affirmation (Base nhash: 54)
2. Read `.dev/governance/projecttracking.md` — current milestone is 0.3 (AUDIT FAIL), next action is 0.3-BF-01
3. Read `.dev/governance/BUGS.md` — P0s are BUG-023 and BUG-024; key rotation is operational prerequisite
4. Read `.dev/spec/SPEC.md` — source of truth

---

## Section 3 — Operational Notes

- **Rotate the OpenRouter key before writing any code.** It is live in `data/mirrorbox.db` Event 2.
- BUG-023 fix and BUG-024 fix are independent — they can be implemented in parallel but BUG-027 spec fix (add `seq` to Event interface) must land before BUG-024 implementation.
- The three audit copy databases (`mirrorbox.audit.actor.db`, `mirrorbox.audit.copy.db`, `mirrorbox.audit.recover.db`) can be deleted after 0.3 closes — they are audit artifacts, not production state.
- PRE-0.4 spec work is two tasks, not many. Don't let it balloon.
- Current Hard State Anchor: **456**

---

## Section 4 — Directory State

```
/Users/johnserious/mbo/
├── AGENTS.md
├── Dockerfile
├── ROADMAP.md
├── package.json
├── .gitignore
├── data/
│   ├── mirrorbox.db              (COMPROMISED — contains leaked key in Event 2)
│   ├── mirrorbox.audit.actor.db  (audit artifact)
│   ├── mirrorbox.audit.copy.db   (audit artifact)
│   ├── mirrorbox.audit.recover.db (audit artifact)
│   └── state.json
├── scripts/
│   ├── test-chain.js
│   ├── test-recovery.js
│   ├── test-redactor.js
│   ├── test-state.js
│   ├── verify-chain.js           (needs update for chain-linked hash — BUG-024)
│   └── verify-chain.py           (needs update for chain-linked hash — BUG-024)
└── src/
    ├── index.js
    ├── auth/
    │   ├── call-model.js
    │   ├── model-router.js
    │   ├── session-detector.js
    │   ├── local-detector.js
    │   └── openrouter-detector.js
    └── state/
        ├── db-manager.js
        ├── event-store.js         (needs chain-linked hash — BUG-024, BUG-025)
        ├── redactor.js            (needs callback fix — BUG-023)
        └── state-manager.js      (needs snapshot type guard — BUG-026)
```
