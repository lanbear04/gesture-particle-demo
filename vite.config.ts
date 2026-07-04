import { defineConfig } from "vite";

// 单页应用，无前端框架。dev server 默认 localhost，满足 getUserMedia 安全上下文要求。
// 部署到 GitHub Pages 等非根路径时，可通过 BASE_PATH 环境变量设置 base。
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  server: {
    host: "localhost",
    open: true,
  },
  build: {
    target: "es2022",
  },
});
