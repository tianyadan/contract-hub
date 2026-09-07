# 前端：Vite 构建 + Nginx 托管（build context 为仓库根目录）
FROM docker.m.daocloud.io/library/node:22-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
# 国内 npm 镜像，加快服务器构建
RUN npm ci --registry=https://registry.npmmirror.com
COPY frontend/ ./
RUN npm run build

FROM docker.m.daocloud.io/library/nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
