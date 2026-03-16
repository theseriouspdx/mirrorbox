const fs = require('fs');
const path = 'node_modules/vscode-jsonrpc/lib/common/connection.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix computeSingleParam
content = content.replace(/function computeSingleParam\(parameterStructures, param\) \{([\s\S]+?)switch \(parameterStructures\) \{/g, 
`function computeSingleParam(parameterStructures, param) {
        const isByName = (parameterStructures === "byName" || (parameterStructures && (parameterStructures.kind === "byName" || (typeof parameterStructures.toString === "function" && parameterStructures.toString() === "byName"))));
        if (isByName) {
            if (!isNamedParam(param)) {
                throw new Error("Received parameters by name but param is not an object literal.");
            }
            return nullToUndefined(param);
        }
        $1 switch (parameterStructures) {`);

// 2. Fix switches on numberOfParams where it checks for byName mismatch
content = content.replace(/case 1:\s+messageParams = computeSingleParam\(parameterStructures, args\[paramStart\]\);\s+break;\s+case "byName":\s+default:/g,
`case 1:
                        messageParams = computeSingleParam(parameterStructures, args[paramStart]);
                        break;
                    default:
                        if (parameterStructures === "byName" || (parameterStructures && (parameterStructures.kind === "byName" || (typeof parameterStructures.toString === "function" && parameterStructures.toString() === "byName")))) {
                             // Correctly handle byName with 1 param already handled above if it was indeed 1 param.
                             // But wait, if numberOfParams > 1 and it's byName, that's an error.
                             if (numberOfParams > 1) {
                                 throw new Error("Received " + numberOfParams + " parameters for 'by Name' parameter structure.");
                             }
                        }
`);

fs.writeFileSync(path, content);
console.log('Global patch applied.');
