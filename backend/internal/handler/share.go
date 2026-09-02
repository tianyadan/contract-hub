package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/middleware"
	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// ShareHandler 处理分享链接、外部协作者和确认相关 HTTP 请求。
type ShareHandler struct {
	svc *service.ShareService
}

// NewShareHandler 创建分享 Handler。
func NewShareHandler(svc *service.ShareService) *ShareHandler {
	return &ShareHandler{svc: svc}
}

// CreateShare 创建分享链接
// @Summary 创建分享链接
// @Description 为合同生成外部协作者分享链接
// @Tags 分享协作
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Param request body createShareRequest true "分享参数"
// @Success 200 {object} response.Body "分享链接"
// @Failure 400 {object} response.Body "参数错误"
// @Failure 404 {object} response.Body "合同不存在或无权访问"
// @Router /api/contracts/{id}/share [post]
func (h *ShareHandler) CreateShare(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}

	var req struct {
		Permission  int `json:"permission"`
		ExpireHours int `json:"expire_hours"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}
	if req.Permission != 0 && req.Permission != 1 {
		response.Error(c, http.StatusBadRequest, 40001, "permission 只能为 0 或 1")
		return
	}

	result, err := h.svc.CreateShare(c.Request.Context(), service.CreateShareInput{
		ContractID:  contractID,
		UserID:      middleware.GetUserID(c),
		Permission:  int8(req.Permission),
		ExpireHours: req.ExpireHours,
	})
	if err != nil {
		writeShareError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "分享链接创建成功", result)
}

// GetShareInfo 获取分享概要
// @Summary 获取分享概要
// @Description 外部用户通过 token 获取合同概要
// @Tags 分享协作
// @Produce json
// @Param token path string true "分享Token"
// @Success 200 {object} response.Body "分享概要"
// @Failure 404 {object} response.Body "分享链接不存在或已失效"
// @Router /api/share/{token} [get]
func (h *ShareHandler) GetShareInfo(c *gin.Context) {
	token := c.Param("token")
	result, err := h.svc.GetShareInfo(c.Request.Context(), token)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// Join 外部协作者加入
// @Summary 外部协作者加入
// @Description 外部用户输入姓名加入合同协作
// @Tags 分享协作
// @Accept json
// @Produce json
// @Param token path string true "分享Token"
// @Param request body joinShareRequest true "姓名"
// @Success 200 {object} response.Body "协作者信息"
// @Failure 400 {object} response.Body "参数错误"
// @Router /api/share/{token}/join [post]
func (h *ShareHandler) Join(c *gin.Context) {
	token := c.Param("token")
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		response.Error(c, http.StatusBadRequest, 40001, "请填写姓名")
		return
	}

	result, err := h.svc.Join(c.Request.Context(), token, req.Name)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "加入成功", result)
}

// GetShareContract 外部获取合同内容
// @Summary 外部获取合同内容
// @Description 外部协作者获取合同当前版本内容
// @Tags 分享协作
// @Produce json
// @Param token path string true "分享Token"
// @Param collaborator_name query string true "协作者姓名"
// @Success 200 {object} response.Body "合同内容"
// @Failure 403 {object} response.Body "协作者不存在"
// @Router /api/share/{token}/contract [get]
func (h *ShareHandler) GetShareContract(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	result, err := h.svc.GetShareContract(c.Request.Context(), token, name)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// ShareVersionList 外部版本列表
// @Summary 外部版本列表
// @Description 外部协作者分页查看合同版本列表
// @Tags 分享协作
// @Produce json
// @Param token path string true "分享Token"
// @Param collaborator_name query string true "协作者姓名"
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(10)
// @Success 200 {object} response.Body "版本列表"
// @Router /api/share/{token}/versions [get]
func (h *ShareHandler) ShareVersionList(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	result, err := h.svc.ShareVersionList(c.Request.Context(), token, name, page, pageSize)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// ShareVersionDetail 外部版本详情
// @Summary 外部版本详情
// @Description 外部协作者查看指定版本详情
// @Tags 分享协作
// @Produce json
// @Param token path string true "分享Token"
// @Param versionId path int true "版本ID"
// @Param collaborator_name query string true "协作者姓名"
// @Success 200 {object} response.Body "版本详情"
// @Router /api/share/{token}/versions/{versionId} [get]
func (h *ShareHandler) ShareVersionDetail(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	versionID, err := strconv.ParseInt(c.Param("versionId"), 10, 64)
	if err != nil || versionID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "版本ID不合法")
		return
	}

	result, err := h.svc.ShareVersionDetail(c.Request.Context(), token, name, versionID)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// ShareSaveVersion 外部保存版本
// @Summary 外部保存版本
// @Description 外部协作者提交修改，生成新版本
// @Tags 分享协作
// @Accept json
// @Produce json
// @Param token path string true "分享Token"
// @Param collaborator_name query string true "协作者姓名"
// @Param request body SaveVersionRequest true "新版本内容"
// @Success 200 {object} response.Body "保存成功"
// @Failure 403 {object} response.Body "只读链接不可编辑"
// @Router /api/share/{token}/versions [post]
func (h *ShareHandler) ShareSaveVersion(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)

	var req SaveVersionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.DocumentContent == nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}

	result, err := h.svc.ShareSaveVersion(c.Request.Context(), token, name, req.DocumentContent, req.ChangeSummary, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "保存成功", result)
}

// ShareChangeList 外部变更记录
// @Summary 外部变更记录
// @Description 外部协作者查看变更记录
// @Tags 分享协作
// @Produce json
// @Param token path string true "分享Token"
// @Param collaborator_name query string true "协作者姓名"
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Success 200 {object} response.Body "变更记录"
// @Router /api/share/{token}/changes [get]
func (h *ShareHandler) ShareChangeList(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	result, err := h.svc.ShareChangeList(c.Request.Context(), token, name, page, pageSize)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// Confirm 内部确认
// @Summary 内部用户确认合同
// @Description 内部用户确认当前版本
// @Tags 确认
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Success 200 {object} response.Body "确认成功"
// @Failure 404 {object} response.Body "合同不存在或无权访问"
// @Router /api/contracts/{id}/confirm [post]
func (h *ShareHandler) Confirm(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	form, err := parseConfirmPdfForm(c)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
		return
	}

	user := middleware.GetUsername(c)
	if user == "" {
		user = "内部用户"
	}
	outcome, err := h.svc.ConfirmWithPdf(
		c.Request.Context(),
		contractID,
		middleware.GetUserID(c),
		user,
		c.ClientIP(),
		c.Request.UserAgent(),
		service.ConfirmPdfInput{
			PdfData:    form.Data,
			Hash:       form.Hash,
			PageCount:  form.PageCount,
			VerifyCode: form.VerifyCode,
		},
	)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, outcome.Message, outcome)
}

// ShareConfirm 外部确认
// @Summary 外部协作者确认合同
// @Description 外部协作者确认当前版本
// @Tags 确认
// @Accept json
// @Produce json
// @Param token path string true "分享Token"
// @Param collaborator_name query string true "协作者姓名"
// @Success 200 {object} response.Body "确认成功"
// @Router /api/share/{token}/confirm [post]
func (h *ShareHandler) ShareConfirm(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	form, err := parseConfirmPdfForm(c)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
		return
	}
	outcome, err := h.svc.ShareConfirmWithPdf(
		c.Request.Context(),
		token,
		name,
		c.ClientIP(),
		c.Request.UserAgent(),
		service.ConfirmPdfInput{
			PdfData:    form.Data,
			Hash:       form.Hash,
			PageCount:  form.PageCount,
			VerifyCode: form.VerifyCode,
		},
	)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, outcome.Message, outcome)
}

// GetConfirmProgress 内部用户查询双方确认进度。
func (h *ShareHandler) GetConfirmProgress(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	progress, err := h.svc.GetConfirmProgress(c.Request.Context(), contractID, middleware.GetUserID(c))
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", progress)
}

// ShareGetConfirmProgress 外部协作者查询双方确认进度。
func (h *ShareHandler) ShareGetConfirmProgress(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	progress, err := h.svc.ShareGetConfirmProgress(c.Request.Context(), token, name)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", progress)
}
func (h *ShareHandler) SharePrepareFinalExport(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	result, err := h.svc.PrepareShareFinalExport(c.Request.Context(), token, name)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// ShareExportPdf 外部分享页上传 PDF 归档。
func (h *ShareHandler) ShareExportPdf(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	form, err := parsePdfUploadForm(c)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
		return
	}
	result, err := h.svc.ShareUploadExportPdf(
		c.Request.Context(),
		token,
		name,
		form.Data,
		form.Hash,
		form.PageCount,
		form.VerifyCode,
		form.Draft,
	)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// ListConfirmations 内部查看确认记录
// @Summary 查看确认记录
// @Description 查看合同的确认记录
// @Tags 确认
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Success 200 {object} response.Body "确认记录"
// @Router /api/contracts/{id}/confirmations [get]
func (h *ShareHandler) ListConfirmations(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	items, err := h.svc.ListConfirmations(c.Request.Context(), contractID, middleware.GetUserID(c))
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", items)
}

// ShareListConfirmations 外部查看确认记录
// @Summary 外部查看确认记录
// @Description 外部协作者查看确认记录
// @Tags 确认
// @Produce json
// @Param token path string true "分享Token"
// @Param collaborator_name query string true "协作者姓名"
// @Success 200 {object} response.Body "确认记录"
// @Router /api/share/{token}/confirmations [get]
func (h *ShareHandler) ShareListConfirmations(c *gin.Context) {
	token := c.Param("token")
	name := collaboratorName(c)
	items, err := h.svc.ShareListConfirmations(c.Request.Context(), token, name)
	if err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", items)
}

// DisableShare 失效分享链接
// @Summary 失效分享链接
// @Description 使分享链接失效
// @Tags 分享协作
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Param shareId path int true "分享记录ID"
// @Success 200 {object} response.Body "已失效"
// @Router /api/contracts/{id}/share/{shareId}/disable [post]
func (h *ShareHandler) DisableShare(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	shareID, err := strconv.ParseInt(c.Param("shareId"), 10, 64)
	if err != nil || shareID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "分享ID不合法")
		return
	}

	if err := h.svc.DisableShare(c.Request.Context(), shareID, contractID, middleware.GetUserID(c)); err != nil {
		writeShareError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "分享链接已失效", nil)
}

// collaboratorName 从 Header 或 Query 获取外部协作者姓名。
func collaboratorName(c *gin.Context) string {
	name := strings.TrimSpace(c.GetHeader("X-Collaborator-Name"))
	if name == "" {
		name = strings.TrimSpace(c.Query("collaborator_name"))
	}
	return name
}

// writeShareError 分享模块错误转换。
func writeShareError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidInput),
		errors.Is(err, service.ErrInvalidPdfInput),
		errors.Is(err, service.ErrInvalidPdfHash),
		errors.Is(err, service.ErrVerifyCodeMismatch),
		errors.Is(err, service.ErrExportPdfTooLarge),
		errors.Is(err, service.ErrAlreadyConfirmedByUser),
		errors.Is(err, service.ErrPdfRequiredForFinalize):
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
	case errors.Is(err, service.ErrShareNotFound),
		errors.Is(err, service.ErrShareDisabled),
		errors.Is(err, service.ErrShareExpired),
		errors.Is(err, service.ErrShareMaxAccess),
		errors.Is(err, service.ErrCollaboratorNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	case errors.Is(err, service.ErrSharePermissionDenied):
		response.Error(c, http.StatusForbidden, 40301, err.Error())
	case errors.Is(err, service.ErrContractNotFound),
		errors.Is(err, service.ErrVersionNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	case errors.Is(err, service.ErrContractLocked):
		response.Error(c, http.StatusForbidden, 40302, err.Error())
	case errors.Is(err, service.ErrAlreadyConfirmed):
		response.Error(c, http.StatusForbidden, 40302, err.Error())
	default:
		log.Printf("share error: %v", err)
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
	}
}

// createShareRequest 分享请求体（Swagger 用）
type createShareRequest struct {
	Permission  int `json:"permission" example:"1"`
	ExpireHours int `json:"expire_hours" example:"24"`
}

// joinShareRequest 加入请求体（Swagger 用）
type joinShareRequest struct {
	Name string `json:"name" example:"张三"`
}
