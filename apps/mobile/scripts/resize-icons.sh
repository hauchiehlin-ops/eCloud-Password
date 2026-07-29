#!/bin/bash
set -e

cd /Users/barretlin/GitProjects/Cloud-password/apps/mobile/ios/CloudPassword/Images.xcassets/AppIcon.appiconset
SRC="/Users/barretlin/GitProjects/Cloud-password/apps/mobile/assets/icon.png"

echo "Resizing iOS App Icons using sips..."

sips -z 40 40 "$SRC" --out icon-20@2x.png
sips -z 60 60 "$SRC" --out icon-20@3x.png
sips -z 58 58 "$SRC" --out icon-29@2x.png
sips -z 87 87 "$SRC" --out icon-29@3x.png
sips -z 80 80 "$SRC" --out icon-40@2x.png
sips -z 120 120 "$SRC" --out icon-40@3x.png
sips -z 120 120 "$SRC" --out icon-60@2x.png
sips -z 180 180 "$SRC" --out icon-60@3x.png
sips -z 20 20 "$SRC" --out icon-ipad-20.png
sips -z 40 40 "$SRC" --out icon-ipad-20@2x.png
sips -z 29 29 "$SRC" --out icon-ipad-29.png
sips -z 58 58 "$SRC" --out icon-ipad-29@2x.png
sips -z 40 40 "$SRC" --out icon-ipad-40.png
sips -z 80 80 "$SRC" --out icon-ipad-40@2x.png
sips -z 76 76 "$SRC" --out icon-ipad-76.png
sips -z 152 152 "$SRC" --out icon-ipad-76@2x.png
sips -z 167 167 "$SRC" --out icon-ipad-83.5@2x.png
cp "$SRC" icon-1024.png

echo "App Icons regenerated successfully."
