const fs = require('fs');
const path = 'node_modules/vscode-jsonrpc/lib/common/connection.js';
let content = fs.readFileSync(path, 'utf8');

const search = /function computeSingleParam\(parameterStructures, param\) \{[\s\S]+?switch \(parameterStructures\) \{/g;

const replacement = `function computeSingleParam(parameterStructures, param) {
        const isByName = (parameterStructures === "byName" || (parameterStructures && (parameterStructures.kind === "byName" || (typeof parameterStructures.toString === "function" && parameterStructures.toString() === "byName"))));
        if (isByName) {
            if (!isNamedParam(param)) {
                throw new Error("Received parameters by name but param is not an object literal.");
            }
            return nullToUndefined(param);
        }
        switch (parameterStructures) {`;

content = content.replace(search, replacement);
fs.writeFileSync(path, content);
console.log('Final real patch applied.');
