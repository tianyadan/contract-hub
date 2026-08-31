package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

// RequestID 为每个请求生成/透传 request_id，便于日志追踪和问题排查。
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = newRequestID()
		}

		// 放入 Gin Context，后续 handler 和 service 可以读取
		c.Set("request_id", requestID)
		c.Writer.Header().Set("X-Request-ID", requestID)

		c.Next()
	}
}

// newRequestID 生成一个随机 request id。
func newRequestID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		// 随机数生成失败时退化为时间戳+固定前缀，保证请求仍能继续
		return "req-fallback"
	}
	return "req-" + hex.EncodeToString(buf)
}
