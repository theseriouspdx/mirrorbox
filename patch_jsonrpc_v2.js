const fs = require('fs');
const path = 'node_modules/vscode-jsonrpc/lib/common/connection.js';
let content = fs.readFileSync(path, 'utf8');

// The original problematic section in computeSingleParam:
// switch (parameterStructures) {
//     case messages_1.ParameterStructures.auto: ...
//     case messages_1.ParameterStructures.byName: ...
//     case messages_1.ParameterStructures.byPosition: ...
//     default: throw new Error(`Unknown parameter structure ${parameterStructures.toString()}`);
// }

const search = /function computeSingleParam\(parameterStructures, param\) \{([\s\S]+?)default:([\s\S]+?)throw new Error\(\`Unknown parameter structure \$\{\w+\.toString\(\)\}\`\);/g;

const replacement = `function computeSingleParam(parameterStructures, param) {
        if (parameterStructures && (parameterStructures === "byName" || parameterStructures.kind === "byName" || (typeof parameterStructures.toString === "function" && parameterStructures.toString() === "byName"))) {
            if (!isNamedParam(param)) {
                throw new Error("Received parameters by name but param is not an object literal.");
            }
            return nullToUndefined(param);
        }
        switch (parameterStructures) {$1default:$2throw new Error("Unknown parameter structure " + (parameterStructures ? parameterStructures.toString() : "null"));`;

content = content.replace(search, replacement);

// Also fix computeMessageParams switch on numberOfParams
content = content.replace(/switch \(numberOfParams\) \{([\s\S]+?)case 1:([\s\S]+?)result = computeSingleParam\(type\.parameterStructures, params\[0\]\);\s+break;([\s\S]+?)default:/g, 
(match, before, case1Before, case1Body, after) => {
    return \`switch (numberOfParams) {\${before}case 1:\${case1Before}
                {
                    const ps = type.parameterStructures;
                    if (ps && (ps === "byName" || ps.kind === "byName" || (typeof ps.toString === "function" && ps.toString() === "byName"))) {
                        return computeSingleParam(ps, params[0]);
                    }
                    result = computeSingleParam(ps, params[0]);
                }
                break;\${after}default:\`;
});

fs.writeFileSync(path, content);
console.log('Clean patch applied.');
