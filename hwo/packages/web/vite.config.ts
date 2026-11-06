/**
 * Vite 配置——React 插件 + /api 代理到本地 NestJS（3000）。
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 浏览器没有 Node 风格的 `global` 变量，将其映射为 globalThis 以兼容依赖。
  // 注意：facesjs 的浏览器渲染走 display()（见 PlayerFace 组件），不用 faceToSvgString。
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
