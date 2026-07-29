#!/bin/zsh
# Cloud Password - 一鍵啟動 iOS Development Build
# 用途：編譯原生模組並在 iOS Simulator 上運行

# 載入環境變數
source ~/.zshrc 2>/dev/null
source ~/.zprofile 2>/dev/null

echo "▶ 檢查 iOS Simulator..."
if ! xcrun simctl list devices | grep -q "Booted"; then
  echo "  iOS Simulator 未啟動，正在開啟..."
  open -a Simulator
  sleep 5
fi

echo "✓ iOS Simulator 就緒"
echo "▶ 啟動 Cloud Password iOS Build..."

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT/apps/mobile"

echo "▶ 啟動 Cloud Password iOS Build..."
REACT_NATIVE_PACKAGER_HOSTNAME=localhost npx expo run:ios --no-build-cache
