/**
 * Vite 配置——React 插件 + /api 代理到本地 NestJS（3000）。
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // facesjs 的 faceToSvgString() 依赖浏览器/Node 的 `global`，浏览器无该全局变量，
  // 这里将其映射为 globalThis。
  define: {
    global: "globalThis",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
