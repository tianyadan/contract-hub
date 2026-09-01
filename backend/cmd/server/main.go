// @title 心智协同合同协作系统 API
// @version 1.0
// @description 心智协同合同协作系统 V1 后端接口文档
// @host localhost:8080
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
package main

import (
	"log"
	"time"

	"github.com/lshc/contract-hub/backend/internal/config"
	"github.com/lshc/contract-hub/backend/internal/database"
	"github.com/lshc/contract-hub/backend/internal/docengine"
	"github.com/lshc/contract-hub/backend/internal/handler"
	"github.com/lshc/contract-hub/backend/internal/oss"
	"github.com/lshc/contract-hub/backend/internal/repository"
	"github.com/lshc/contract-hub/backend/internal/router"
	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/internal/ws"
)

func main() {
	// 1. 加载环境配置
	cfg := config.Load()

	// 2. 初始化 MySQL 连接
	db, err := database.Open(cfg.MysqlDSN)
	if err != nil {
		log.Fatalf("mysql connect failed: %v", err)
	}
	defer db.Close()

	// 3. 初始化 OSS 客户端
	if cfg.OSS.Endpoint == "" || cfg.OSS.AccessKeyID == "" || cfg.OSS.AccessKeySecret == "" || cfg.OSS.Bucket == "" {
		log.Fatalf("oss config is incomplete: endpoint/access_key_id/access_key_secret/bucket must not be empty")
	}
	ossClient, err := oss.NewClient(cfg)
	if err != nil {
		log.Fatalf("oss client init failed: %v", err)
	}

	// 初始化 Python Document Engine 客户端
	docEngineClient := docengine.NewClient(cfg)

	// 4. 初始化依赖：仓库 -> 服务 -> Handler
	userRepo := repository.NewUserRepository(db)
	authService := service.NewAuthService(userRepo, cfg.JWTSecret, time.Duration(cfg.JWTExpireHours)*time.Hour)
	authHandler := handler.NewAuthHandler(authService)

	contractRepo := repository.NewContractRepository(db)
	templateRepo := repository.NewTemplateRepository(db)
	customerRepo := repository.NewCustomerRepository(db)
	shareRepo := repository.NewShareRepository(db)

	templateService := service.NewTemplateService(templateRepo, ossClient, docEngineClient)
	customerService := service.NewCustomerService(customerRepo, contractRepo)
	contractService := service.NewContractService(contractRepo, templateRepo, customerRepo, shareRepo, ossClient, docEngineClient, cfg.PublicWebOrigin)

	contractHandler := handler.NewContractHandler(contractService)
	templateHandler := handler.NewTemplateHandler(templateService)
	customerHandler := handler.NewCustomerHandler(customerService, contractService)

	shareService := service.NewShareService(shareRepo, contractRepo, docEngineClient, ossClient, contractService)
	shareHandler := handler.NewShareHandler(shareService)
	publicHandler := handler.NewPublicHandler(contractService)

	// 初始化 WebSocket 在线状态 Hub
	wsHub := ws.NewHub()
	internalWSHandler := ws.RegisterInternalHandler(wsHub, contractService, cfg.JWTSecret)
	shareWSHandler := ws.ServeShare(wsHub, shareService)

	// 5. 初始化 Gin 引擎并注册路由
	r := router.New(cfg, authHandler, contractHandler, templateHandler, customerHandler, shareHandler, publicHandler, internalWSHandler, shareWSHandler)

	// 6. 启动 HTTP 服务
	log.Printf("contract-hub backend server listening on :%s", cfg.ServerPort)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("server start failed: %v", err)
	}
}
