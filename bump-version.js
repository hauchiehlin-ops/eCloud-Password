const fs = require('fs');
const path = require('path');

// 檔案路徑定義
const appJsonPath = path.join(__dirname, 'apps', 'mobile', 'app.json');

// 讀取 app.json
if (!fs.existsSync(appJsonPath)) {
  console.error(`Error: Cannot find app.json at ${appJsonPath}`);
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

if (!appJson.expo) {
  console.error('Error: Invalid app.json structure (missing "expo" object)');
  process.exit(1);
}

const oldVersion = appJson.expo.version || '1.0.0';
const oldBuildNumber = parseInt(appJson.expo.ios?.buildNumber || '1', 10);
const oldVersionCode = parseInt(appJson.expo.android?.versionCode || 1, 10);

// 計算新的 Build Number 與 Version Code (自動遞增 1)
const newBuildNumber = oldBuildNumber + 1;
const newVersionCode = oldVersionCode + 1;

// 解析參數以設定對外版本號
let newVersion = oldVersion;
const args = process.argv.slice(2);

if (args.length > 0) {
  const arg = args[0].toLowerCase();
  const parts = oldVersion.split('.');
  let major = parseInt(parts[0] || '1', 10);
  let minor = parseInt(parts[1] || '0', 10);
  let patch = parseInt(parts[2] || '0', 10);

  if (arg === 'major') {
    newVersion = `${major + 1}.0.0`;
  } else if (arg === 'minor') {
    newVersion = `${major}.${minor + 1}.0`;
  } else if (arg === 'patch') {
    newVersion = `${major}.${minor}.${patch + 1}`;
  } else {
    // 如果帶參數但不是關鍵字，直接使用該參數作為新版本號 (例如: node bump-version.js 2.1.0)
    newVersion = args[0];
  }
} else {
  // 如果沒有帶參數，自動將 patch 版本號 +1 (例如: 2.0.0 -> 2.0.1)
  const parts = oldVersion.split('.');
  if (parts.length === 3) {
    const patch = parseInt(parts[2], 10);
    parts[2] = (patch + 1).toString();
    newVersion = parts.join('.');
  } else if (parts.length === 2) {
    parts.push('1');
    newVersion = parts.join('.');
  } else {
    newVersion = `${oldVersion}.1`;
  }
}

// 寫入變更
appJson.expo.version = newVersion;

if (!appJson.expo.ios) appJson.expo.ios = {};
appJson.expo.ios.buildNumber = newBuildNumber.toString();

if (!appJson.expo.android) appJson.expo.android = {};
appJson.expo.android.versionCode = newVersionCode;

// 1. 寫回 app.json
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf8');

console.log('=== 版本更新成功 ===');
console.log(`對外版本 (version):     ${oldVersion} -> ${newVersion}`);
console.log(`iOS Build (buildNumber): ${oldBuildNumber} -> ${newBuildNumber}`);
console.log(`Android Code (versionCode): ${oldVersionCode} -> ${newVersionCode}`);
console.log('====================');

// 2. [PAC 原生同步]：同步修正 iOS 原生專案設定 (Info.plist)
const plistPath = path.join(__dirname, 'apps', 'mobile', 'ios', 'CloudPassword', 'Info.plist');
if (fs.existsSync(plistPath)) {
  let plistContent = fs.readFileSync(plistPath, 'utf8');
  // 替換 CFBundleShortVersionString 對外版本號
  plistContent = plistContent.replace(
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)(.*?)(<\/string>)/,
    `$1${newVersion}$3`
  );
  // 替換 CFBundleVersion 內部建置版本號
  plistContent = plistContent.replace(
    /(<key>CFBundleVersion<\/key>\s*<string>)(.*?)(<\/string>)/,
    `$1${newBuildNumber}$3`
  );
  fs.writeFileSync(plistPath, plistContent, 'utf8');
  console.log(`[iOS Sync] Info.plist 已成功同步更新為: ${newVersion} (${newBuildNumber})`);
}

// 3. [PAC 原生同步]：同步修正 Android 原生專案設定 (build.gradle)
const gradlePath = path.join(__dirname, 'apps', 'mobile', 'android', 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradleContent = fs.readFileSync(gradlePath, 'utf8');
  // 替換 versionCode
  gradleContent = gradleContent.replace(
    /(versionCode\s+)(\d+)/,
    `$1${newVersionCode}`
  );
  // 替換 versionName
  gradleContent = gradleContent.replace(
    /(versionName\s+")[^"]*(")/,
    `$1${newVersion}$2`
  );
  fs.writeFileSync(gradlePath, gradleContent, 'utf8');
  console.log(`[Android Sync] build.gradle 已成功同步更新為: ${newVersion} (${newVersionCode})`);
}
