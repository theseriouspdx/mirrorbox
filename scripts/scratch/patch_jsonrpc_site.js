const fs = require('fs');
const path = 'node_modules/vscode-jsonrpc/lib/common/connection.js';
let content = fs.readFileSync(path, 'utf8');

const target = 'throw new Error("Unknown parameter structure " + parameterStructures.toString());';
const replacement = 'if (parameterStructures && parameterStructures.toString() === "byName") return nullToUndefined(param); throw new Error("Unknown parameter structure " + parameterStructures.toString());';

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log('Site patch applied.');
} else {
    console.log('Site target not found.');
}
