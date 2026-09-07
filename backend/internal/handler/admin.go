package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/middleware"
	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// AdminHandler 管理员用户与邀请码接口。
type AdminHandler struct {
	svc *service.AdminService
}

// NewAdminHandler 创建管理员 Handler。
func NewAdminHandler(svc *service.AdminService) *AdminHandler {
	return &AdminHandler{svc: svc}
}

// ListUsers 分页用户列表。
func (h *AdminHandler) ListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	keyword := c.Query("keyword")
	var statusPtr *int8
	if s := c.Query("status"); s != "" {
		v, err := strconv.Atoi(s)
		if err == nil {
			st := int8(v)
			statusPtr = &st
		}
	}
	result, err := h.svc.ListUsers(c.Request.Context(), service.AdminUserListQuery{
		Keyword:  keyword,
		Status:   statusPtr,
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		writeAuthError(c, err, nil)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// BanUser 封禁用户。
func (h *AdminHandler) BanUser(c *gin.Context) {
	h.withTarget(c, "封禁成功", nil, func(op, target int64) error {
		return h.svc.BanUser(c.Request.Context(), op, target)
	})
}

// EnableUser 启用用户。
func (h *AdminHandler) EnableUser(c *gin.Context) {
	h.withTarget(c, "启用成功", nil, func(op, target int64) error {
		return h.svc.EnableUser(c.Request.Context(), op, target)
	})
}

// DeleteUser 软删除用户。
func (h *AdminHandler) DeleteUser(c *gin.Context) {
	h.withTarget(c, "删除成功", nil, func(op, target int64) error {
		return h.svc.DeleteUser(c.Request.Context(), op, target)
	})
}

// ResetPassword 重置密码为默认 12345678。
func (h *AdminHandler) ResetPassword(c *gin.Context) {
	h.withTarget(c, "密码已重置", gin.H{"default_password": service.DefaultResetPassword}, func(op, target int64) error {
		return h.svc.ResetPassword(c.Request.Context(), op, target)
	})
}

// CreateInviteCode 生成邀请码。
func (h *AdminHandler) CreateInviteCode(c *gin.Context) {
	vo, err := h.svc.CreateInviteCode(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		writeAuthError(c, err, nil)
		return
	}
	response.Success(c, http.StatusCreated, "邀请码已生成", vo)
}

// ListInviteCodes 邀请码列表。
func (h *AdminHandler) ListInviteCodes(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	list, err := h.svc.ListInviteCodes(c.Request.Context(), limit)
	if err != nil {
		writeAuthError(c, err, nil)
		return
	}
	response.Success(c, http.StatusOK, "ok", list)
}

// withTarget 解析目标用户 ID 并执行操作。
func (h *AdminHandler) withTarget(c *gin.Context, msg string, data interface{}, action func(operatorID, targetID int64) error) {
	targetID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || targetID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "用户 ID 不合法")
		return
	}
	if err := action(middleware.GetUserID(c), targetID); err != nil {
		writeAuthError(c, err, nil)
		return
	}
	response.Success(c, http.StatusOK, msg, data)
}
