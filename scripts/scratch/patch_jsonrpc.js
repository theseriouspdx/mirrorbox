const fs = require('fs');
const path = 'node_modules/vscode-jsonrpc/lib/common/connection.js';
let content = fs.readFileSync(path, 'utf8');

// The original problematic section:
// switch (parameterStructures) {
//     case messages_1.ParameterStructures.auto: ...
//     case messages_1.ParameterStructures.byName: ...
//     case messages_1.ParameterStructures.byPosition: ...
//     default: throw new Error(`Unknown parameter structure ${parameterStructures.toString()}`);
// }

const search = /switch \(parameterStructures\) \{([\s\S]+?)default:([\s\S]+?)throw new Error\(`Unknown parameter structure $\{\w+\.toString\(\)\}`\);/g;

content = content.replace(search, (match, cases, rest) => {
    if (cases.includes('ParameterStructures.byName')) {
        return `switch (parameterStructures) {${cases}
            case "byName":
                if (!isNamedParam(param)) {
                    throw new Error(\`Received parameters by name but param is not an object literal.\`);
                }
                return nullToUndefined(param);
            default:`;
    }
    return match;
});

fs.writeFileSync(path, content);
console.log('Patch applied.');
