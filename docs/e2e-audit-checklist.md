# E2E Audit Checklist (Milestone 1.1 Hardening)

## 0) Run Header (Required)
- Run ID: v0.11.x-template
- Date/Time (PT): unknown
- Operator: unknown
- Task ID (from `.dev/governance/projecttracking.md`): unknown
- Milestone: 1.1
- Branch: unknown
- Target repo/world (`mirror` or `subject`): mirror

## 1) Calibration Phase Audit (Onboarding / Gate 0)
- [ ] Entropy gate exceeded (`entropyScore > 10`) blocks execution (Stage 1.5)
- [ ] Human approval missing (`go` absent) blocks mutation
- [ ] Audit gate unresolved (`approved|reject` missing) blocks completion
- [ ] Validator failure after recovery loop blocks completion
- [ ] Any write outside approved file scope blocks completion
- [ ] MCP/graph unavailable after recovery blocks completion

## 2) Planning Phase Audit (Pre-Build)
- [ ] Plan rationale is in labeled sections (not implicit chat prose)
- [ ] Assumption Ledger generated for Tier 1+
- [ ] Blockers explicitly enumerated
- [ ] Sign-off block emitted with entropy score and defaults

## 3) Execution Phase Audit (Tool Use)
- [ ] Environment mutations logged
- [ ] Runtime integrity check performed after shell/tool actions
- [ ] Python/Node execution path validated post-change
- [ ] No direct DB writes by agent (Invariant 18)
### 3.1 Traceability (Dark Code Test)
| File Changed | Why Needed | Source Requirement | Task Link | Evidence |
|---|---|---|---|---|
| | | | | |

## 4) Verification Phase Audit (Post-Build)
- [ ] `CHANGELOG.md` updated with task and acceptance evidence
- [ ] `projecttracking.md` status updated
- [ ] `BUGS.md`/`BUGS-resolved.md` updated per workflow rules
- [ ] Active governance snapshot reference recorded

## 5) Adversarial "Why" Proof (Hallucination-of-Success Check)
- [ ] Authorized: all mutations were explicitly approved
- [ ] Auditable: full trace from requirement -> change -> verification -> decision
- [ ] Aligned: output conforms to Prime Directive + Section 22 invariants
- [ ] Reproducible: another operator can rerun checks from artifacts

`NON_HALLUCINATION_PROOF=PENDING`

## 6) Weighted Scorecard (Required)
| Category | Weight | Score Earned |
|---|---:|---:|
| Calibration Phase Controls (Section 1) | 20 | 0 |
| Planning Phase Controls (Section 2) | 20 | 0 |
| Execution Traceability + Side Effects (Section 3) | 30 | 0 |
| Verification + Persistence (Section 4) | 20 | 0 |
| Adversarial Non-Hallucination Proof (Section 5) | 10 | 0 |
| **Total** | **100** | 0 |

## 7) Sign-Off Block (Required)
- Audit Verdict: PENDING
- Score Total: 0
- Blocking Findings: none
- Waivers (if any): none
- Approved by: unknown
- Date/Time (PT): unknown
