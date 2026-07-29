
const fs = require('fs');
const content = fs.readFileSync('/Users/barretlin/GitProjects/Cloud-password/apps/mobile/src/screens/VaultScreen.tsx', 'utf8');

// Strip strings and comments
const clean = content
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
  .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');

let braces = 0;
let parens = 0;

for (let i = 0; i < clean.length; i++) {
  if (clean[i] === '{') braces++;
  if (clean[i] === '}') braces--;
  if (clean[i] === '(') parens++;
  if (clean[i] === ')') parens--;
}

console.log(`Clean Braces: ${braces}`);
console.log(`Clean Parens: ${parens}`);
