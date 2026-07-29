const fs = require('fs');
const path = require('path');

const vaultScreenPath = path.join(__dirname, 'apps/mobile/src/screens/VaultScreen.tsx');
const translationsPath = path.join(__dirname, 'packages/core/src/i18n/translations.ts');

const vaultScreenContent = fs.readFileSync(vaultScreenPath, 'utf8');
const translationsContent = fs.readFileSync(translationsPath, 'utf8');

const keysInScreen = new Set();

// 1. Match simple literal: t('key')
const literalRegex = /\bt\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
let match;
while ((match = literalRegex.exec(vaultScreenContent)) !== null) {
  keysInScreen.add(match[1]);
}

// 2. Match ternary operator within t: t(cond ? 'key1' : 'key2')
// E.g., t(appState === 'SETUP' ? 'initialize_btn' : 'unlock_btn')
const ternaryRegex = /\bt\(\s*[^?]+\?\s*['"`]([a-zA-Z0-9_]+)['"`]\s*:\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
while ((match = ternaryRegex.exec(vaultScreenContent)) !== null) {
  keysInScreen.add(match[1]);
  keysInScreen.add(match[2]);
}

// Parse keys in translations.ts
const transKeyRegex = /['"]([a-zA-Z0-9_]+)['"]\s*:\s*/g;
const keysInTranslations = new Set();
while ((match = transKeyRegex.exec(translationsContent)) !== null) {
  keysInTranslations.add(match[1]);
}

console.log('--- Screen Keys detected ---');
console.log(Array.from(keysInScreen).sort());

console.log('\n--- Missing Translation Keys ---');
const missingKeys = [];
for (const key of keysInScreen) {
  if (!keysInTranslations.has(key)) {
    missingKeys.push(key);
  }
}
console.log(missingKeys);
