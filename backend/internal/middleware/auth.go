package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/auth"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// SessionValidator 校验 JWT 内会话是否仍有效。
type SessionValidator func(ctx context.Context, userID int64, sessionID string) error

func applyClaims(c *gin.Context, claims *auth.UserClaims) {
	c.Set("user_id", claims.UserID)
	c.Set("username", claims.Username)
	c.Set("role", claims.Role)
	c.Set("session_id", claims.SessionID)
}

func authorizeToken(c *gin.Context, secret string, validate SessionValidator, tokenString string) bool {
	claims, err := auth.ParseToken(tokenString, secret)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, 40101, "登录状态已失效，请重新登录")
		c.Abort()
		return false
	}
	if validate != nil {
		if err := validate(c.Request.Context(), claims.UserID, claims.SessionID); err != nil {
			if errors.Is(err, auth.ErrSessionReplaced) {
				response.Error(c, http.StatusUnauthorized, 40105, err.Error())
			} else {
				response.Error(c, http.StatusUnauthorized, 40101, err.Error())
			}
			c.Abort()
			return false
		}
	}
	applyClaims(c, claims)
	return true
}

// JWTAuth 校验 Authorization: Bearer <token>，并把用户信息写入 Gin Context。
func JWTAuth(secret string, validate SessionValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			response.Error(c, http.StatusUnauthorized, 40101, "未登录或 token 缺失")
			c.Abort()
			return
		}
		tokenString := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		if !authorizeToken(c, secret, validate, tokenString) {
			return
		}
		c.Next()
	}
}

// JWTAuthFlexible 允许 Header Bearer 或 query token（供 <img src> 加载私有资源）。
func JWTAuthFlexible(secret string, validate SessionValidator) gin.HandlerFunc {
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
		if !authorizeToken(c, secret, validate, tokenString) {
			return
		}
		c.Next()
	}
}

// RequireAdmin 要求当前用户为管理员。
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		if GetRole(c) != 1 {
			response.Error(c, http.StatusForbidden, 40302, "需要管理员权限")
			c.Abort()
			return
		}
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

// GetRole 从 Gin Context 获取当前用户角色。
func GetRole(c *gin.Context) int8 {
	v, exists := c.Get("role")
	if !exists {
		return 0
	}
	role, _ := v.(int8)
	return role
}

// GetSessionID 从 Gin Context 获取当前会话 sid。
func GetSessionID(c *gin.Context) string {
	v, exists := c.Get("session_id")
	if !exists {
		return ""
	}
	sid, _ := v.(string)
	return sid
}
