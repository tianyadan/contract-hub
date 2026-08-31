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
	Username string `json:"username" example:"zhangsan"`                    // 登录账号
	Password string `json:"password" example:"123456"`                      // 登录密码
	Nickname string `json:"nickname,omitempty" example:"张三"`                // 昵称/姓名
	Phone    string `json:"phone,omitempty" example:"13800138000"`          // 手机号
	Email    string `json:"email,omitempty" example:"zhangsan@example.com"` // 邮箱
}

// LoginRequest 用户登录请求参数。
type LoginRequest struct {
	Username string `json:"username" example:"zhangsan"` // 登录账号
	Password string `json:"password" example:"123456"`   // 登录密码
}

// AuthHandler 处理认证相关 HTTP 请求。
type AuthHandler struct {
	svc *service.AuthService
}

// NewAuthHandler 创建认证 Handler。
func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

// Register 用户注册接口
// @Summary 用户注册
// @Description 注册一个新的系统用户，用户名唯一，密码使用 bcrypt 加密保存
// @Tags 认证
// @Accept json
// @Produce json
// @Param request body RegisterRequest true "注册参数"
// @Success 201 {object} response.Body "注册成功"
// @Failure 400 {object} response.Body "请求参数错误"
// @Failure 409 {object} response.Body "用户名已存在"
// @Router /api/auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}

	user, err := h.svc.Register(c.Request.Context(), service.RegisterInput{
		Username: req.Username,
		Password: req.Password,
		Nickname: req.Nickname,
		Phone:    req.Phone,
		Email:    req.Email,
	})
	if err != nil {
		writeAuthError(c, err)
		return
	}

	response.Success(c, http.StatusCreated, "注册成功", user)
}

// Login 用户登录接口
// @Summary 用户登录
// @Description 校验用户名和密码，登录成功返回 JWT
// @Tags 认证
// @Accept json
// @Produce json
// @Param request body LoginRequest true "登录参数"
// @Success 200 {object} response.Body "登录成功"
// @Failure 400 {object} response.Body "请求参数错误"
// @Failure 401 {object} response.Body "用户名或密码错误"
// @Router /api/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}

	result, err := h.svc.Login(c.Request.Context(), service.LoginInput{
		Username: req.Username,
		Password: req.Password,
	}, c.ClientIP())
	if err != nil {
		writeAuthError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "登录成功", result)
}

// Me 获取当前登录用户信息
// @Summary 获取当前用户
// @Description 通过 JWT 获取当前登录用户信息
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Body "当前用户信息"
// @Failure 401 {object} response.Body "未登录或 token 失效"
// @Router /api/auth/me [get]
func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.svc.GetUserByID(c.Request.Context(), userID)
	if err != nil {
		writeAuthError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "ok", user)
}

// writeAuthError 将 service 层错误转换为统一 HTTP 响应。
func writeAuthError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidInput):
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
	case errors.Is(err, service.ErrUserExists):
		response.Error(c, http.StatusConflict, 40901, err.Error())
	case errors.Is(err, service.ErrInvalidCredentials):
		response.Error(c, http.StatusUnauthorized, 40101, err.Error())
	case errors.Is(err, service.ErrUserDisabled):
		response.Error(c, http.StatusForbidden, 40301, err.Error())
	case errors.Is(err, service.ErrUserNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	default:
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
	}
}
