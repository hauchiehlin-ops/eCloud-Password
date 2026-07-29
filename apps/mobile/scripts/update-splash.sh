#!/bin/bash
set -e

cd /Users/barretlin/GitProjects/Cloud-password/apps/mobile/ios/CloudPassword/Images.xcassets/SplashScreenLegacy.imageset
SRC="/Users/barretlin/GitProjects/Cloud-password/apps/mobile/assets/splash-icon.png"

echo "Replacing Splash Screen placeholder images..."
cp "$SRC" image.png
cp "$SRC" image@2x.png
cp "$SRC" image@3x.png

echo "Splash Screen updated successfully."
