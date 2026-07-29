const fs = require('fs');
const path = require('path');

// 尋找專案中所有的 ts, tsx 檔案
function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      if (!name.includes('node_modules') && !name.includes('.git') && !name.includes('.expo') && !name.includes('dist') && !name.includes('build')) {
        getFiles(name, fileList);
      }
    } else {
      if (name.endsWith('.ts') || name.endsWith('.tsx')) {
        fileList.push(name);
      }
    }
  }
  return fileList;
}

const projectRoot = '/Users/barretlin/GitProjects/Cloud-password';
const allFiles = getFiles(projectRoot);

// 讀取 translations.ts 並解析所有的 key
const translationsPath = path.join(projectRoot, 'packages/core/src/i18n/translations.ts');
const translationsContent = fs.readFileSync(translationsPath, 'utf8');

const transKeyRegex = /['"]([a-zA-Z0-9_]+)['"]\s*:\s*/g;
const keysInTranslations = new Set();
let match;
while ((match = transKeyRegex.exec(translationsContent)) !== null) {
  keysInTranslations.add(match[1]);
}

console.log(`Parsed ${keysInTranslations.size} translation keys from translations.ts`);

const literalRegex = /\bt\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
// 三元運算子 t(cond ? 'key1' : 'key2')
const ternaryRegex = /\bt\(\s*[^?]+\?\s*['"`]([a-zA-Z0-9_]+)['"`]\s*:\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;

const missingKeys = {};
const chineseHardcoded = [];

for (const filePath of allFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(projectRoot, filePath);

  if (relativePath === 'packages/core/src/i18n/translations.ts') {
    continue; // 忽略翻譯檔本身
  }

  // 1. 搜尋 t() 使用的 key
  let m;
  literalRegex.lastIndex = 0;
  while ((m = literalRegex.exec(content)) !== null) {
    const key = m[1];
    if (!keysInTranslations.has(key) && !key.startsWith('cat_')) {
      if (!missingKeys[key]) missingKeys[key] = [];
      missingKeys[key].push(relativePath);
    }
  }

  ternaryRegex.lastIndex = 0;
  while ((m = ternaryRegex.exec(content)) !== null) {
    const key1 = m[1];
    const key2 = m[2];
    if (!keysInTranslations.has(key1) && !key1.startsWith('cat_')) {
      if (!missingKeys[key1]) missingKeys[key1] = [];
      missingKeys[key1].push(relativePath);
    }
    if (!keysInTranslations.has(key2) && !key2.startsWith('cat_')) {
      if (!missingKeys[key2]) missingKeys[key2] = [];
      missingKeys[key2].push(relativePath);
    }
  }

  // 2. 尋找程式碼中包含中文的字串字面量 (單引號、雙引號、模板字面量)
  // 排除單行和多行注釋之後的內容
  const cleanContent = content
    .replace(/\/\*[\s\S]*?\*\//g, '') // 移除非多行注釋
    .replace(/\/\/.*/g, '');          // 移除單行注釋

  const strRegex = /'(.*?)'|"(.*?)"|`(.*?)`/g;
  let strMatch;
  while ((strMatch = strRegex.exec(cleanContent)) !== null) {
    const strVal = strMatch[1] || strMatch[2] || strMatch[3] || '';
    if (/[\u4e00-\u9fa5]/.test(strVal)) {
      chineseHardcoded.push({
        file: relativePath,
        string: strVal
      });
    }
  }
}

console.log('\n--- Missing Translation Keys ---');
console.log(JSON.stringify(missingKeys, null, 2));

console.log('\n--- Hardcoded Chinese Strings ---');
console.log(JSON.stringify(chineseHardcoded, null, 2));
