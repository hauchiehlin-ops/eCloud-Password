const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceIcon = path.join(__dirname, '../apps/mobile/assets/icon_3d_lock.png');
const targetDir = path.join(__dirname, '../apps/mobile/ios/CloudPassword/Images.xcassets/AppIcon.appiconset');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const iconConfigs = [
  { size: '20x20', idiom: 'iphone', filename: 'icon-20@2x.png', scale: '2x', px: 40 },
  { size: '20x20', idiom: 'iphone', filename: 'icon-20@3x.png', scale: '3x', px: 60 },
  { size: '29x29', idiom: 'iphone', filename: 'icon-29@2x.png', scale: '2x', px: 58 },
  { size: '29x29', idiom: 'iphone', filename: 'icon-29@3x.png', scale: '3x', px: 87 },
  { size: '40x40', idiom: 'iphone', filename: 'icon-40@2x.png', scale: '2x', px: 80 },
  { size: '40x40', idiom: 'iphone', filename: 'icon-40@3x.png', scale: '3x', px: 120 },
  { size: '60x60', idiom: 'iphone', filename: 'icon-60@2x.png', scale: '2x', px: 120 },
  { size: '60x60', idiom: 'iphone', filename: 'icon-60@3x.png', scale: '3x', px: 180 },
  { size: '20x20', idiom: 'ipad', filename: 'icon-ipad-20.png', scale: '1x', px: 20 },
  { size: '20x20', idiom: 'ipad', filename: 'icon-ipad-20@2x.png', scale: '2x', px: 40 },
  { size: '29x29', idiom: 'ipad', filename: 'icon-ipad-29.png', scale: '1x', px: 29 },
  { size: '29x29', idiom: 'ipad', filename: 'icon-ipad-29@2x.png', scale: '2x', px: 58 },
  { size: '40x40', idiom: 'ipad', filename: 'icon-ipad-40.png', scale: '1x', px: 40 },
  { size: '40x40', idiom: 'ipad', filename: 'icon-ipad-40@2x.png', scale: '2x', px: 80 },
  { size: '76x76', idiom: 'ipad', filename: 'icon-ipad-76.png', scale: '1x', px: 76 },
  { size: '76x76', idiom: 'ipad', filename: 'icon-ipad-76@2x.png', scale: '2x', px: 152 },
  { size: '83.5x83.5', idiom: 'ipad', filename: 'icon-ipad-83.5@2x.png', scale: '2x', px: 167 },
  { size: '1024x1024', idiom: 'ios-marketing', filename: 'icon-1024.png', scale: '1x', px: 1024 }
];

console.log('Generating iOS App Icons using sips...');

iconConfigs.forEach(config => {
  const targetFile = path.join(targetDir, config.filename);
  console.log(`Generating ${config.filename} (${config.px}x${config.px})...`);
  try {
    execSync(`sips -z ${config.px} ${config.px} "${sourceIcon}" --out "${targetFile}"`, { stdio: 'ignore' });
  } catch (err) {
    console.error(`Failed to generate ${config.filename}:`, err.message);
  }
});

const contentsJson = {
  images: iconConfigs.map(config => ({
    size: config.size,
    idiom: config.idiom,
    filename: config.filename,
    scale: config.scale
  })),
  info: {
    version: 1,
    author: "xcode"
  }
};

fs.writeFileSync(
  path.join(targetDir, 'Contents.json'),
  JSON.stringify(contentsJson, null, 2)
);

console.log('Successfully generated iOS App Icons and Contents.json.');
