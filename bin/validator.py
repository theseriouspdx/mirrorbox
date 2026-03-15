#!/usr/bin/env python3
import ast, json, sys, time
from pathlib import Path
from dataclasses import dataclass, field

CONTROLLER_ROOT = Path(__file__).parent.parent
MBO_ROOT = Path(__import__("os").environ.get("MBO_PROJECT_ROOT", str(CONTROLLER_ROOT))).resolve()
CELLS_DIR = MBO_ROOT / "src" / "cells"
IMPORTS_ALLOW = MBO_ROOT / ".dev" / "governance" / "imports.allow"
COMPLEXITY_TOML = MBO_ROOT / ".dev" / "governance" / "complexity.toml"

@dataclass
class BudgetConfig: loc: int = 250; cc: int = 10; nesting: int = 4

def load_config():
    cfg = BudgetConfig()
    if not COMPLEXITY_TOML.exists(): return cfg
    try:
        try: import tomllib
        except ImportError: import tomli as tomllib
        data = tomllib.loads(COMPLEXITY_TOML.read_text()).get("limits", {})
        cfg.loc, cfg.cc, cfg.nesting = data.get("max_loc", 250), data.get("max_cc", 10), data.get("max_nesting", 4)
    except: pass
    return cfg

def validate(f, cfg, whitelist):
    try:
        src = f.read_text(); tree = ast.parse(src)
        loc = sum(1 for l in src.splitlines() if l.strip() and not l.strip().startswith("#"))
        cc = 1 + sum(1 for n in ast.walk(tree) if isinstance(n, (ast.If, ast.For, ast.While, ast.ExceptHandler, ast.With, ast.BoolOp)))
        def get_depth(node, d):
            if isinstance(node, (ast.If, ast.For, ast.While, ast.With, ast.Try)): d += 1
            return max([get_depth(c, d) for c in ast.iter_child_nodes(node)], default=d)
        depth = get_depth(tree, 0)
        violations = []
        if loc > cfg.loc: violations.append(f"LOC: {loc}>{cfg.loc}")
        if cc > cfg.cc: violations.append(f"CC: {cc}>{cfg.cc}")
        if depth > cfg.nesting: violations.append(f"NESTING: {depth}>{cfg.nesting}")
        if whitelist:
            for n in ast.walk(tree):
                if isinstance(n, ast.Import):
                    for name in n.names:
                        if name.name.split('.')[0] not in whitelist: violations.append(f"IMPORT: {name.name}")
        return violations
    except Exception as e: return [f"ERROR: {e}"]

def main():
    cfg = load_config()
    whitelist = {l.strip() for l in IMPORTS_ALLOW.read_text().splitlines() if l.strip() and not l.strip().startswith("#")} if IMPORTS_ALLOW.exists() else None
    all_violations = {}
    if CELLS_DIR.exists():
        for cell in CELLS_DIR.iterdir():
            if cell.is_dir():
                for f in cell.rglob("*.py"):
                    v = validate(f, cfg, whitelist)
                    if v: all_violations[str(f)] = v
    if all_violations:
        for f, vs in all_violations.items(): print(f"FAIL: {f}\n  " + "\n  ".join(vs))
        sys.exit(1)
    print("[CYNIC] ENTROPY TAX: PAID."); sys.exit(0)

if __name__ == "__main__": main()
