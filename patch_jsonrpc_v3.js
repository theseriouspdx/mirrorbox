const fs = require('fs');
const path = 'node_modules/vscode-jsonrpc/lib/common/connection.js';
let content = fs.readFileSync(path, 'utf8');

// 1. computeSingleParam fix
const search1 = /function computeSingleParam\(parameterStructures, param\) \{([\s\S]+?)default:([\s\S]+?)throw new Error\(\`Unknown parameter structure \$\{\w+\.toString\(\)\}\`\);/g;
const replacement1 = `function computeSingleParam(parameterStructures, param) {
        if (parameterStructures && (parameterStructures === "byName" || parameterStructures.kind === "byName" || (typeof parameterStructures.toString === "function" && parameterStructures.toString() === "byName"))) {
            if (param !== undefined && param !== null && !Array.isArray(param) && typeof param === "object") {
                return param === null ? undefined : param;
            }
            throw new Error("Received parameters by name but param is not an object literal.");
        }
        switch (parameterStructures) {$1default:$2throw new Error("Unknown parameter structure " + (parameterStructures ? parameterStructures.toString() : "null"));`;

content = content.replace(search1, replacement1);

// 2. computeMessageParams fix
const search2 = /case 1:\s+result = computeSingleParam\(type\.parameterStructures, params\[0\]\);\s+break;/g;
const replacement2 = `case 1:
                {
                    const ps = type.parameterStructures;
                    if (ps && (ps === "byName" || ps.kind === "byName" || (typeof ps.toString === "function" && ps.toString() === "byName"))) {
                        return computeSingleParam(ps, params[0]);
                    }
                    result = computeSingleParam(ps, params[0]);
                }
                break;`;

content = content.replace(search2, replacement2);

fs.writeFileSync(path, content);
console.log('Patch v3 applied.');
