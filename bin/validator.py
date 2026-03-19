#!/usr/bin/env python3
import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

CONTROLLER_ROOT = Path(__file__).parent.parent
MBO_ROOT = Path(__import__("os").environ.get("MBO_PROJECT_ROOT", str(CONTROLLER_ROOT))).resolve()
CELLS_DIR = MBO_ROOT / "src" / "cells"
IMPORTS_ALLOW = MBO_ROOT / ".dev" / "governance" / "imports.allow"
COMPLEXITY_TOML = MBO_ROOT / ".dev" / "governance" / "complexity.toml"
PROJECTTRACKING = MBO_ROOT / ".dev" / "governance" / "projecttracking.md"
BUGS = MBO_ROOT / ".dev" / "governance" / "BUGS.md"


@dataclass
class BudgetConfig:
    loc: int = 250
    cc: int = 10
    nesting: int = 4


def load_config():
    cfg = BudgetConfig()
    if not COMPLEXITY_TOML.exists():
        return cfg
    try:
        try:
            import tomllib
        except ImportError:
            import tomli as tomllib
        data = tomllib.loads(COMPLEXITY_TOML.read_text()).get("limits", {})
        cfg.loc = data.get("max_loc", 250)
        cfg.cc = data.get("max_cc", 10)
        cfg.nesting = data.get("max_nesting", 4)
    except Exception:
        pass
    return cfg


def validate_complexity(fpath: Path, cfg: BudgetConfig, whitelist):
    try:
        src = fpath.read_text()
        tree = ast.parse(src)
        loc = sum(1 for l in src.splitlines() if l.strip() and not l.strip().startswith("#"))
        cc = 1 + sum(1 for n in ast.walk(tree) if isinstance(n, (ast.If, ast.For, ast.While, ast.ExceptHandler, ast.With, ast.BoolOp)))

        def get_depth(node, d):
            if isinstance(node, (ast.If, ast.For, ast.While, ast.With, ast.Try)):
                d += 1
            return max([get_depth(c, d) for c in ast.iter_child_nodes(node)], default=d)

        depth = get_depth(tree, 0)
        violations = []
        if loc > cfg.loc:
            violations.append(f"LOC: {loc}>{cfg.loc}")
        if cc > cfg.cc:
            violations.append(f"CC: {cc}>{cfg.cc}")
        if depth > cfg.nesting:
            violations.append(f"NESTING: {depth}>{cfg.nesting}")
        if whitelist:
            for n in ast.walk(tree):
                if isinstance(n, ast.Import):
                    for name in n.names:
                        if name.name.split(".")[0] not in whitelist:
                            violations.append(f"IMPORT: {name.name}")
        return violations
    except Exception as e:
        return [f"ERROR: {e}"]


def _parse_task_ids(projecttracking_text: str):
    ids = set()
    for line in projecttracking_text.splitlines():
        if not line.startswith("|"):
            continue
        if line.startswith("|---") or "Task ID" in line:
            continue
        cols = [c.strip() for c in line.strip().split("|")[1:-1]]
        if len(cols) < 2:
            continue
        task_id = cols[0]
        if task_id:
            ids.add(task_id)
    return ids


def _parse_next_task(projecttracking_text: str):
    m = re.search(r"^\*\*Next Task:\*\*\s*([^\n]+)$", projecttracking_text, flags=re.MULTILINE)
    return m.group(1).strip() if m else ""


def _parse_active_task_statuses(projecttracking_text: str):
    statuses = {}
    in_active = False
    for line in projecttracking_text.splitlines():
        if line.strip() == "## Active Tasks":
            in_active = True
            continue
        if in_active and line.startswith("## "):
            break
        if not in_active or not line.startswith("|"):
            continue
        if line.startswith("|---") or "Task ID" in line:
            continue
        cols = [c.strip() for c in line.strip().split("|")[1:-1]]
        if len(cols) < 4:
            continue
        task_id = cols[0]
        status = cols[3]
        if task_id:
            statuses[task_id] = status
    return statuses


def _parse_bug_records(text: str):
    records = []
    current = None
    for raw in text.splitlines():
        line = raw.rstrip("\n")
        if line.startswith("### BUG-"):
            if current:
                records.append(current)
            current = {"header": line, "severity": "", "status": "", "task": ""}
            continue
        if not current:
            continue
        if line.startswith("- **Severity:**"):
            m = re.search(r"- \*\*Severity:\*\*\s+(P[0-9])", line)
            if m:
                current["severity"] = m.group(1)
            continue
        if line.startswith("- **Status:**"):
            current["status"] = line.replace("- **Status:**", "", 1).strip()
            continue
        if line.startswith("- **Task:**"):
            current["task"] = line.replace("- **Task:**", "", 1).strip().split()[0].split(",")[0]
            continue
    if current:
        records.append(current)
    return records


def validate_workflow_consistency():
    errs = []

    if not PROJECTTRACKING.exists():
        errs.append(f"Missing canonical task ledger: {PROJECTTRACKING}")
        return errs

    if not BUGS.exists():
        errs.append(f"Missing bug registry: {BUGS}")
        return errs

    pt_text = PROJECTTRACKING.read_text()
    bug_text = BUGS.read_text()
    task_ids = _parse_task_ids(pt_text)
    next_task = _parse_next_task(pt_text)
    active_statuses = _parse_active_task_statuses(pt_text)

    if not next_task:
        errs.append("projecttracking.md missing '**Next Task:** <task-id>'")
    elif next_task not in task_ids:
        errs.append(f"projecttracking.md Next Task '{next_task}' not found in task ledger")
    else:
        status = active_statuses.get(next_task)
        if status not in {"READY", "IN_PROGRESS", "BLOCKED"}:
            errs.append(
                f"projecttracking.md Next Task '{next_task}' must be in Active Tasks with status READY/IN_PROGRESS/BLOCKED"
            )
    bug_records = _parse_bug_records(bug_text)

    for rec in bug_records:
        status_upper = rec["status"].upper()
        sev = rec["severity"].upper()
        if sev in {"P0", "P1"} and ("OPEN" in status_upper or "PARTIAL" in status_upper):
            if not rec["task"]:
                errs.append(f"{rec['header']}: OPEN/PARTIAL {sev} bug missing '- **Task:** <task-id>'")
                continue
            if rec["task"] not in task_ids:
                errs.append(f"{rec['header']}: task '{rec['task']}' not found in projecttracking.md")


    return errs


def main():
    cfg = load_config()
    whitelist = None
    if IMPORTS_ALLOW.exists():
        whitelist = {l.strip() for l in IMPORTS_ALLOW.read_text().splitlines() if l.strip() and not l.strip().startswith("#")}

    all_violations = {}

    if CELLS_DIR.exists():
        for cell in CELLS_DIR.iterdir():
            if not cell.is_dir():
                continue
            for fpath in cell.rglob("*.py"):
                v = validate_complexity(fpath, cfg, whitelist)
                if v:
                    all_violations[str(fpath)] = v

    workflow_errors = validate_workflow_consistency()
    if workflow_errors:
        all_violations["workflow"] = workflow_errors

    if all_violations:
        for fpath, violations in all_violations.items():
            print(f"FAIL: {fpath}\n  " + "\n  ".join(violations))
        sys.exit(1)

    print("[CYNIC] ENTROPY TAX: PAID.")
    sys.exit(0)


if __name__ == "__main__":
    main()
