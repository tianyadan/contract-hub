import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 监听 0.0.0.0，便于局域网手机 / 其他电脑通过本机 IP 访问
    host: true,
    port: 5173,
    strictPort: true,
    // 开发环境代理：把 /api 请求转发到本机 Go 后端（含 WebSocket）
    // 手机访问 http://<局域网IP>:5173 时，/api 仍由本机 Vite 转到 127.0.0.1:8080
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
})
