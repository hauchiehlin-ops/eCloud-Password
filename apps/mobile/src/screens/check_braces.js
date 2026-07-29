
const fs = require('fs');
const content = fs.readFileSync('/Users/barretlin/GitProjects/Cloud-password/apps/mobile/src/screens/VaultScreen.tsx', 'utf8');

let stack = [];
for (let i = 0; i < content.length; i++) {
  const char = content[i];
  const line = content.substring(0, i).split('\n').length;
  if (char === '{') stack.push({ line, i });
  if (char === '}') {
    if (stack.length === 0) console.log(`Extra } at line ${line}`);
    else stack.pop();
  }
}
stack.forEach(s => console.log(`Unclosed { starting at line ${s.line}`));
