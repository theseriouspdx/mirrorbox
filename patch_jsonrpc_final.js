const fs = require('fs');
const path = 'node_modules/vscode-jsonrpc/lib/common/connection.js';
let content = fs.readFileSync(path, 'utf8');

const search = /function computeSingleParam\(parameterStructures, param\) \{([\s\S]+?)throw new Error\("Unknown parameter structure " \+ parameterStructures\.toString\(\)\);/g;

const replacement = `function computeSingleParam(parameterStructures, param) {
        if (parameterStructures && parameterStructures.toString() === "byName") {
             if (isNamedParam(param)) return nullToUndefined(param);
        }
        $1 throw new Error("Unknown parameter structure " + (parameterStructures ? parameterStructures.toString() : "null"));`;

content = content.replace(search, replacement);
fs.writeFileSync(path, content);
console.log('Final definitive patch applied.');
