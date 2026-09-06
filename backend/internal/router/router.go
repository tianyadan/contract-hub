package router

import (
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "github.com/lshc/contract-hub/backend/docs"
	"github.com/lshc/contract-hub/backend/internal/config"
	"github.com/lshc/contract-hub/backend/internal/handler"
	"github.com/lshc/contract-hub/backend/internal/middleware"
)

// New 创建 Gin 引擎并注册路由。
func New(
	cfg *config.Config,
	authHandler *handler.AuthHandler,
	contractHandler *handler.ContractHandler,
	templateHandler *handler.TemplateHandler,
	customerHandler *handler.CustomerHandler,
	shareHandler *handler.ShareHandler,
	publicHandler *handler.PublicHandler,
	fidelityHandler *handler.FidelityHandler,
	settingsHandler *handler.SettingsHandler,
	internalWSHandler, shareWSHandler gin.HandlerFunc,
) *gin.Engine {
	// 根据环境变量设置 Gin 模式，便于本地 debug / 线上 release 切换
	gin.SetMode(cfg.GinMode)

	r := gin.New()

	// 使用 Gin 自带的 Logger 和 Recovery，并加入 RequestID 中间件
	r.Use(gin.Logger(), gin.Recovery(), middleware.RequestID())

	// Swagger 接口文档：http://localhost:8080/swagger/index.html
	// docs 目录由 swag init 自动生成，后续新增接口后需要重新生成
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// 健康检查：供部署探活、运维排查使用
	r.GET("/health", handler.Health(cfg))

	// 业务 API 统一放在 /api 下
	api := r.Group("/api")
	{
		api.GET("/health", handler.APIHealth(cfg))

		// 公开验真（无需 JWT）
		api.GET("/public/verify/:code", publicHandler.VerifyContract)

		// 认证相关接口
		authGroup := api.Group("/auth")
		{
			authGroup.POST("/register", authHandler.Register)
			authGroup.POST("/login", authHandler.Login)

			// 需要登录后携带 JWT 访问
			authGroup.GET("/me", middleware.JWTAuth(cfg.JWTSecret), authHandler.Me)
		}

		// 合同设置（用户级）
		settings := api.Group("/settings", middleware.JWTAuth(cfg.JWTSecret))
		{
			settings.GET("/watermark", settingsHandler.GetWatermark)
			settings.PUT("/watermark", settingsHandler.SaveWatermark)
			settings.GET("/seals", settingsHandler.ListSeals)
			settings.POST("/seals", settingsHandler.UploadSeal)
			settings.PUT("/seals/:id", settingsHandler.UpdateSeal)
			settings.DELETE("/seals/:id", settingsHandler.DeleteSeal)
		}
		// 电子章图片：允许 query token，供 <img> 加载私有 OSS 对象
		api.GET(
			"/settings/seals/:id/image",
			middleware.JWTAuthFlexible(cfg.JWTSecret),
			settingsHandler.StreamSealImage,
		)

		// 合同模板池
		templates := api.Group("/templates", middleware.JWTAuth(cfg.JWTSecret))
		{
			templates.POST("/upload", templateHandler.Upload)
			templates.GET("", templateHandler.List)
			templates.GET("/:id", templateHandler.Detail)
			templates.PUT("/:id", templateHandler.Update)
			templates.DELETE("/:id", templateHandler.Delete)
			templates.GET("/:id/preview", templateHandler.Preview)
			templates.PUT("/:id/content", templateHandler.SaveContent)
			templates.GET("/:id/fidelity-snapshots", fidelityHandler.ListTemplateSnapshots)
			templates.POST("/:id/fidelity-snapshots", fidelityHandler.CreateTemplateSnapshot)
			templates.GET("/:id/fidelity-snapshots/:snapshotId", fidelityHandler.GetTemplateSnapshot)
			templates.GET("/:id/fidelity-snapshots/:snapshotId/pdf", fidelityHandler.StreamTemplateSnapshotPdf)
			templates.POST("/:id/fidelity-snapshots/:snapshotId/rollback", fidelityHandler.RollbackTemplateSnapshot)
		}

		// 客户管理
		customers := api.Group("/customers", middleware.JWTAuth(cfg.JWTSecret))
		{
			customers.POST("", customerHandler.Create)
			customers.GET("", customerHandler.List)
			customers.GET("/:id", customerHandler.Detail)
			customers.PUT("/:id", customerHandler.Update)
			customers.DELETE("/:id", customerHandler.Delete)
			customers.GET("/:id/contracts", customerHandler.ListContracts)
			customers.POST("/:id/contracts", customerHandler.CreateContract)
		}

		// 合同相关接口，均需要登录
		contracts := api.Group("/contracts", middleware.JWTAuth(cfg.JWTSecret))
		{
			contracts.POST("", contractHandler.Create)
			contracts.GET("", contractHandler.List)
			contracts.DELETE("", contractHandler.BatchDelete)
			contracts.GET("/:id", contractHandler.Detail)
			contracts.GET("/:id/preview", contractHandler.Preview)
			contracts.DELETE("/:id", contractHandler.Delete)

			// 版本管理
			contracts.POST("/:id/versions", contractHandler.SaveVersion)
			contracts.GET("/:id/versions", contractHandler.VersionList)
			contracts.GET("/:id/versions/:versionId", contractHandler.VersionDetail)
			contracts.GET("/:id/changes", contractHandler.ChangeList)
			contracts.POST("/:id/seals/upload", contractHandler.UploadContractSeal)

			// 分享与确认
			contracts.POST("/:id/share", shareHandler.CreateShare)
			contracts.POST("/:id/share/:shareId/disable", shareHandler.DisableShare)
			contracts.POST("/:id/prepare-final-export", contractHandler.PrepareFinalExport)
			contracts.POST("/:id/confirm", shareHandler.Confirm)
			contracts.GET("/:id/confirm-progress", shareHandler.GetConfirmProgress)
			contracts.GET("/:id/confirmations", shareHandler.ListConfirmations)
			contracts.POST("/:id/export-pdf", contractHandler.ExportPdf)
			contracts.GET("/:id/export-pdf", contractHandler.GetExportPdf)
			contracts.GET("/:id/versions/:versionId/export-pdf", contractHandler.GetVersionExportPdf)
			contracts.POST("/:id/export-png", contractHandler.ExportPng)
			contracts.GET("/:id/export-png", contractHandler.GetExportPng)
			contracts.GET("/:id/fidelity-snapshots", fidelityHandler.ListContractSnapshots)
			contracts.POST("/:id/fidelity-snapshots", fidelityHandler.CreateContractSnapshot)
			contracts.GET("/:id/fidelity-snapshots/:snapshotId", fidelityHandler.GetContractSnapshot)
			contracts.GET("/:id/fidelity-snapshots/:snapshotId/pdf", fidelityHandler.StreamContractSnapshotPdf)
			contracts.POST("/:id/fidelity-snapshots/:snapshotId/rollback", fidelityHandler.RollbackContractSnapshot)
		}
		// 合同电子章图片：允许 query token，供 <img> 加载
		api.GET(
			"/contracts/:id/seals/image",
			middleware.JWTAuthFlexible(cfg.JWTSecret),
			contractHandler.StreamContractSeal,
		)

		// 外部协作者公开访问（无需 JWT，通过 token 鉴权）
		share := api.Group("/share")
		{
			share.GET("/:token", shareHandler.GetShareInfo)
			share.POST("/:token/join", shareHandler.Join)
			share.GET("/:token/contract", shareHandler.GetShareContract)
			share.GET("/:token/versions", shareHandler.ShareVersionList)
			share.GET("/:token/versions/:versionId", shareHandler.ShareVersionDetail)
			share.POST("/:token/versions", shareHandler.ShareSaveVersion)
			share.GET("/:token/changes", shareHandler.ShareChangeList)
			share.POST("/:token/seals/upload", shareHandler.UploadShareSeal)
			share.GET("/:token/seals/image", shareHandler.StreamShareSeal)
			share.POST("/:token/prepare-final-export", shareHandler.SharePrepareFinalExport)
			share.POST("/:token/export-pdf", shareHandler.ShareExportPdf)
			share.GET("/:token/export-pdf", shareHandler.ShareGetExportPdf)
			share.POST("/:token/confirm", shareHandler.ShareConfirm)
			share.GET("/:token/confirm-progress", shareHandler.ShareGetConfirmProgress)
			share.GET("/:token/confirmations", shareHandler.ShareListConfirmations)
			share.GET("/:token/ws", shareWSHandler)
		}

		// WebSocket 在线状态（内部用户）
		api.GET("/ws/contracts/:id", internalWSHandler)
	}

	return r
}
