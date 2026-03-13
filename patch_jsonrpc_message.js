const fs = require('fs');
const path = 'node_modules/vscode-jsonrpc/lib/common/connection.js';
let content = fs.readFileSync(path, 'utf8');

const search = /function computeMessageParams\(type, params\) \{([\s\S]+?)switch \(numberOfParams\) \{/g;

const replacement = `function computeMessageParams(type, params) {
        const parameterStructures = type.parameterStructures;
        const isByName = (parameterStructures === "byName" || (parameterStructures && (parameterStructures.kind === "byName" || (typeof parameterStructures.toString === "function" && parameterStructures.toString() === "byName"))));
        if (isByName) {
            return computeSingleParam(parameterStructures, params[0]);
        }
        $1 switch (numberOfParams) {`;

content = content.replace(search, replacement);
fs.writeFileSync(path, content);
console.log('Message params patch applied.');
