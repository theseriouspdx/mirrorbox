# Command Outputs — Session 0.4A Audit

## 1) Commit scope confirmation

```text
a62c8a7 feat(graph): 0.4B-00 + 0.4A-01/02 — instance separation, tree-sitter fix, scanner working
src/graph/graph-store.js
src/graph/static-scanner.js
src/state/db-manager.js
test-graph-store.js
test-scanner.js

4b742cd docs: governance sync for 0.4A session — projecttracking, SPEC, AGENTS Section 11, NEXT_SESSION
.dev/governance/AGENTS.md
.dev/governance/projecttracking.md
.dev/sessions/NEXT_SESSION.md
.dev/spec/SPEC.md
package-lock.json
package.json
```

## 2) Tree-sitter export checks

```text
[ 'typescript', 'tsx' ]
has typescript true has tsx true

js keys [ 'name', 'language', 'nodeTypeInfo' ]
py keys [ 'name', 'language', 'nodeTypeInfo' ]
js has language prop true
py has language prop true
```

## 3) Graph server entrypoint existence check

```text
total 24
drwxr-xr-x@ 4 johnserious  staff   128 Mar  8 23:28 .
drwxr-xr-x@ 7 johnserious  staff   224 Mar  8 23:22 ..
-rw-r--r--@ 1 johnserious  staff  2734 Mar  8 23:47 graph-store.js
-rw-r--r--@ 1 johnserious  staff  5038 Mar  8 23:49 static-scanner.js
```

## 4) Runtime proof of schema/write-path mismatch

Command run:
```bash
node -e "const e=require('./src/state/event-store'); try{ const id=e.append('STATE','ORCHESTRATOR',{currentTask:'x',currentStage:'y'}); console.log('ok',id);} catch(err){ console.error('ERR',err.message); process.exit(1);} "
```

Output:
```text
ERR table chain_anchors has no column named id
```

