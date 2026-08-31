package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/config"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// Health 健康检查接口
// @Summary 服务健康检查
// @Description 返回 Go 服务基础运行状态，供部署探活使用
// @Tags 系统
// @Produce json
// @Success 200 {object} response.Body "ok"
// @Router /health [get]
func Health(cfg *config.Config) gin.HandlerFunc {
	return healthHandler(cfg)
}

// APIHealth 业务 API 健康检查接口
// @Summary API 健康检查
// @Description 返回 /api 分组下的服务健康状态
// @Tags 系统
// @Produce json
// @Success 200 {object} response.Body "ok"
// @Router /api/health [get]
func APIHealth(cfg *config.Config) gin.HandlerFunc {
	return healthHandler(cfg)
}

// healthHandler 健康检查公共实现。
func healthHandler(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 阶段 0 只确认 Go 服务本身可运行；
		// 后续可在这里追加 MySQL、OSS、Python Document Engine 的连通性检查。
		response.Success(c, http.StatusOK, "ok", gin.H{
			"service":    "contract-hub-backend",
			"version":    "v0.1.0",
			"doc_engine": cfg.DocEngineBaseURL,
		})
	}
}
