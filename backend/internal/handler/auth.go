package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/middleware"
	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// RegisterRequest 用户注册请求参数。
type RegisterRequest struct {
	Username   string `json:"username" example:"zhangsan"`
	Password   string `json:"password" example:"123456"`
	Nickname   string `json:"nickname,omitempty" example:"张三"`
	Phone      string `json:"phone,omitempty" example:"13800138000"`
	Email      string `json:"email,omitempty" example:"zhangsan@example.com"`
	InviteCode string `json:"invite_code" example:"ABCD2345"`
}

// LoginRequest 用户登录请求参数。
type LoginRequest struct {
	Username    string `json:"username" example:"zhangsan"`
	Password    string `json:"password" example:"123456"`
	CaptchaID   string `json:"captcha_id,omitempty"`
	CaptchaCode string `json:"captcha_code,omitempty"`
}

// AuthHandler 处理认证相关 HTTP 请求。
type AuthHandler struct {
	svc *service.AuthService
}

// NewAuthHandler 创建认证 Handler。
func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

// Register 用户注册接口。
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}

	user, err := h.svc.Register(c.Request.Context(), service.RegisterInput{
		Username:   req.Username,
		Password:   req.Password,
		Nickname:   req.Nickname,
		Phone:      req.Phone,
		Email:      req.Email,
		InviteCode: req.InviteCode,
	})
	if err != nil {
		writeAuthError(c, err, nil)
		return
	}
	response.Success(c, http.StatusCreated, "注册成功", user)
}

// Login 用户登录接口。
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}

	result, failInfo, err := h.svc.Login(c.Request.Context(), service.LoginInput{
		Username:    req.Username,
		Password:    req.Password,
		CaptchaID:   req.CaptchaID,
		CaptchaCode: req.CaptchaCode,
	}, c.ClientIP())
	if err != nil {
		writeAuthError(c, err, failInfo)
		return
	}
	response.Success(c, http.StatusOK, "登录成功", result)
}

// Captcha 获取图形验证码。
func (h *AuthHandler) Captcha(c *gin.Context) {
	payload, err := h.svc.CreateCaptcha()
	if err != nil {
		response.Error(c, http.StatusInternalServerError, 50000, "验证码生成失败")
		return
	}
	response.Success(c, http.StatusOK, "ok", payload)
}

// Me 获取当前登录用户信息。
func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.svc.GetUserByID(c.Request.Context(), userID)
	if err != nil {
		writeAuthError(c, err, nil)
		return
	}
	response.Success(c, http.StatusOK, "ok", user)
}

// writeAuthError 将 service 层错误转换为统一 HTTP 响应。
func writeAuthError(c *gin.Context, err error, failInfo *service.LoginFailInfo) {
	switch {
	case errors.Is(err, service.ErrInvalidInput):
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
	case errors.Is(err, service.ErrInviteInvalid):
		response.Error(c, http.StatusBadRequest, 40002, err.Error())
	case errors.Is(err, service.ErrUserExists):
		response.Error(c, http.StatusConflict, 40901, err.Error())
	case errors.Is(err, service.ErrCaptchaRequired):
		response.ErrorWithData(c, http.StatusUnauthorized, 40102, err.Error(), failInfo)
	case errors.Is(err, service.ErrCaptchaInvalid):
		response.ErrorWithData(c, http.StatusUnauthorized, 40103, err.Error(), failInfo)
	case errors.Is(err, service.ErrInvalidCredentials):
		response.ErrorWithData(c, http.StatusUnauthorized, 40101, err.Error(), failInfo)
	case errors.Is(err, service.ErrUserDisabled):
		response.Error(c, http.StatusForbidden, 40301, err.Error())
	case errors.Is(err, service.ErrUserNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	case errors.Is(err, service.ErrForbidden), errors.Is(err, service.ErrCannotOperateSelf), errors.Is(err, service.ErrLastAdmin):
		response.Error(c, http.StatusForbidden, 40302, err.Error())
	default:
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
	}
}
