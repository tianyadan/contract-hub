package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config 保存服务运行所需的基础配置。
// 所有敏感配置统一从环境变量或 .env 读取，不写入代码仓库。
type Config struct {
	ServerPort       string // Go 服务监听端口
	GinMode          string // Gin 运行模式
	MysqlDSN         string // MySQL 连接串
	JWTSecret        string // JWT 签名密钥
	JWTExpireHours   int    // JWT 有效期（小时）
	DocEngineBaseURL string // Python 文档服务地址
	OSS              OSSConfig
}

// OSSConfig 阿里云 OSS 相关配置，V1 阶段先预留。
type OSSConfig struct {
	Endpoint        string
	AccessKeyID     string
	AccessKeySecret string
	Bucket          string
}

// Load 从环境变量加载配置；没有设置时使用适合本地开发的默认值。
func Load() *Config {
	// 如果存在 .env 文件则自动加载，便于本地开发。
	// 使用 Overload 让 .env 覆盖 shell 中可能存在的旧 OSS 环境变量，
	// 避免出现 .env 里 AccessKey 正确但被系统环境变量覆盖导致 InvalidAccessKeyId。
	_ = godotenv.Overload()

	cfg := &Config{
		ServerPort:       getEnv("SERVER_PORT", "8080"),
		GinMode:          getEnv("GIN_MODE", "debug"),
		MysqlDSN:         getEnv("MYSQL_DSN", ""),
		JWTSecret:        getEnv("JWT_SECRET", "dev-secret"),
		JWTExpireHours:   getEnvInt("JWT_EXPIRE_HOURS", 24),
		DocEngineBaseURL: getEnv("DOC_ENGINE_BASE_URL", "http://127.0.0.1:9002"),
		OSS: OSSConfig{
			Endpoint:        getEnv("OSS_ENDPOINT", ""),
			AccessKeyID:     getEnv("OSS_ACCESS_KEY_ID", ""),
			AccessKeySecret: getEnv("OSS_ACCESS_KEY_SECRET", ""),
			Bucket:          getEnv("OSS_BUCKET", ""),
		},
	}

	// 启动时打印关键配置来源，方便排查；敏感信息不打印完整值。
	log.Printf("config loaded: port=%s gin_mode=%s doc_engine=%s", cfg.ServerPort, cfg.GinMode, cfg.DocEngineBaseURL)
	return cfg
}

// getEnv 读取环境变量，若为空则返回默认值。
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// getEnvInt 读取整数环境变量，解析失败时返回默认值。
func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
