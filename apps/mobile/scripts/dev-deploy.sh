#!/bin/bash
# [PAC] Dev-Deploy Automation Script for Cloud Password
# 目的：簡化實機測試分發流程

APP_NAME="cloud-password"
BUILD_TIME=$(date +"%Y%m%d_%H%M")
OUTPUT_DIR="./dist_builds"
LOCAL_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)

echo "🚀 Starting Automated Build & Deploy Process..."

# 1. 建立輸出目錄
mkdir -p $OUTPUT_DIR

# 2. 執行 Android 編譯 (Release 模式)
echo "📦 Building Android APK..."
cd android && ./gradlew assembleRelease
cd ..

# 3. 搬運並重命名 (自動偵測最新生成的 APK)
APK_SRC=$(ls -t ./android/app/build/outputs/apk/release/*.apk | head -n 1)
APK_DEST="$OUTPUT_DIR/${APP_NAME}_${BUILD_TIME}.apk"

if [ -f "$APK_SRC" ]; then
    cp "$APK_SRC" "$APK_DEST"
    ln -sf "$APK_DEST" "$OUTPUT_DIR/${APP_NAME}_latest.apk"
    echo "✅ Build Complete: $APK_DEST"
else
    echo "❌ Error: No APK found in ./android/app/build/outputs/apk/release/"
    exit 1
fi

# 4. 啟動雙重下載站 (本地 + 公網)
echo "------------------------------------------------"
echo "🚀 Initializing Download Stations..."
echo "Local URL: http://$LOCAL_IP:8080"

# 在背景啟動本地伺服器
npx http-server $OUTPUT_DIR -p 8080 -c-1 > /dev/null 2>&1 &
SERVER_PID=$!

# 獲取公網 IP (用於 Localtunnel 驗證)
echo "🔍 Fetching Public IP for remote access..."
PUBLIC_IP=$(curl -s https://ifconfig.me || echo "Unknown")

echo "🌍 Starting Remote Tunnel (Please wait for URL)..."
echo "💡 Tip: If prompted for 'tunnel password', enter this Public IP: $PUBLIC_IP"
echo "------------------------------------------------"

# 確保結束時會關閉背景伺服器
trap "kill $SERVER_PID; echo '🛑 Servers stopped.'; exit" INT TERM

# 啟動公網隧道 (前景執行，方便查看網址)
npx localtunnel --port 8080
