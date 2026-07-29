#!/bin/zsh
# Cloud Password - 一鍵啟動 Android Development Build
# 用途：編譯原生模組並在 Android Emulator 上運行

# 載入環境變數
source ~/.zshrc 2>/dev/null
source ~/.zprofile 2>/dev/null

# 強制使用 Java 17 (Expo 54+ 相容版本)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH=$JAVA_HOME/bin:$PATH

echo "▶ 檢查 Android Emulator..."
if ! adb devices | grep -q "emulator"; then
  echo "⚠ 未偵測到運行中的 Android Emulator。"
  echo "  請先從 Android Studio > Virtual Device Manager 啟動模擬器，再重新執行此腳本。"
  exit 1
fi

echo "✓ 找到 Android Emulator"
echo "▶ 啟動 Cloud Password Android Build..."

cd "$(dirname "$0")/apps/mobile"
npx expo run:android
