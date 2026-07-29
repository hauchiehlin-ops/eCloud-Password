import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    // 防止 Vite 將小於 4kb 的資產轉換為 base64 (Manifest V3 嚴格限制)
    assetsInlineLimit: 0,
    // Extension 不支援 module script 的 HMR
    modulePreload: false,
    emptyOutDir: true,
  }
});
