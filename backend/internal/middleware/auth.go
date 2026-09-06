package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/auth"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// JWTAuth 校验 Authorization: Bearer <token>，并把用户信息写入 Gin Context。
func JWTAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			response.Error(c, http.StatusUnauthorized, 40101, "未登录或 token 缺失")
			c.Abort()
			return
		}

		tokenString := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		claims, err := auth.ParseToken(tokenString, secret)
		if err != nil {
			response.Error(c, http.StatusUnauthorized, 40101, "登录状态已失效，请重新登录")
			c.Abort()
			return
		}

		// 后续 handler / service 可以通过 middleware.GetUserID / GetUsername 获取当前用户
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}

// JWTAuthFlexible 允许 Header Bearer 或 query token（供 <img src> 加载私有资源）。
func JWTAuthFlexible(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := ""
		header := c.GetHeader("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			tokenString = strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		}
		if tokenString == "" {
			tokenString = strings.TrimSpace(c.Query("token"))
		}
		if tokenString == "" {
			response.Error(c, http.StatusUnauthorized, 40101, "未登录或 token 缺失")
			c.Abort()
			return
		}
		claims, err := auth.ParseToken(tokenString, secret)
		if err != nil {
			response.Error(c, http.StatusUnauthorized, 40101, "登录状态已失效，请重新登录")
			c.Abort()
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}

// GetUserID 从 Gin Context 获取当前登录用户 ID。
func GetUserID(c *gin.Context) int64 {
	v, exists := c.Get("user_id")
	if !exists {
		return 0
	}
	id, _ := v.(int64)
	return id
}

// GetUsername 从 Gin Context 获取当前登录用户名。
func GetUsername(c *gin.Context) string {
	v, exists := c.Get("username")
	if !exists {
		return ""
	}
	name, _ := v.(string)
	return name
}
