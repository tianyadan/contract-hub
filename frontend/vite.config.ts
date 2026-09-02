import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 开发环境代理：把 /api 请求转发到 Go 后端，避免跨域（含 WebSocket 在线状态）
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        // 支持 WebSocket（/api/ws/contracts/:id 与 /api/share/:token/ws）
        ws: true,
      },
    },
  },
})
