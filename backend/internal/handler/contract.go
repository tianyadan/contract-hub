package handler

import (
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/middleware"
	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// ContractHandler 处理合同相关 HTTP 请求。
type ContractHandler struct {
	svc *service.ContractService
}

// NewContractHandler 创建合同 Handler。
func NewContractHandler(svc *service.ContractService) *ContractHandler {
	return &ContractHandler{svc: svc}
}

// Create 创建合同
// @Summary 创建合同
// @Description 上传 DOCX 文件创建合同，文件保存到阿里云 OSS，并自动生成 V1 合同版本
// @Tags 合同
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param contract_name formData string true "合同名称"
// @Param file formData file true "DOCX 文件，仅支持 .docx"
// @Param description formData string false "合同备注"
// @Param customer_name formData string false "客户名称/公司名称"
// @Param customer_contact formData string false "客户联系人"
// @Param customer_phone formData string false "客户联系电话"
// @Success 201 {object} response.Body "创建成功"
// @Failure 400 {object} response.Body "参数错误或文件不合法"
// @Failure 401 {object} response.Body "未登录"
// @Router /api/contracts [post]
func (h *ContractHandler) Create(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请上传 file 文件")
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "读取上传文件失败")
		return
	}
	defer file.Close()

	// 20MB 以内可以直接读入内存；后续若放开更大文件，建议改为流式上传
	data, err := io.ReadAll(file)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "读取上传文件失败")
		return
	}

	result, err := h.svc.Create(c.Request.Context(), service.CreateContractInput{
		Name:            c.PostForm("contract_name"),
		Description:     c.PostForm("description"),
		CustomerName:    c.PostForm("customer_name"),
		CustomerContact: c.PostForm("customer_contact"),
		CustomerPhone:   c.PostForm("customer_phone"),
		UserID:          middleware.GetUserID(c),
		Username:        middleware.GetUsername(c),
		FileName:        fileHeader.Filename,
		FileData:        data,
		ClientIP:        c.ClientIP(),
		UserAgent:       c.Request.UserAgent(),
	})
	if err != nil {
		writeContractError(c, err)
		return
	}

	response.Success(c, http.StatusCreated, "创建成功", result)
}

// List 合同列表
// @Summary 合同列表
// @Description 分页查询当前登录用户的合同列表，支持按合同名称/编号、状态、客户名称筛选
// @Tags 合同
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param page query int false "页码，默认 1" default(1)
// @Param page_size query int false "每页数量，默认 10，最大 100" default(10)
// @Param keyword query string false "合同名称或合同编号关键字"
// @Param status query int false "合同状态：0已导入 1已分享 2协作中 3已确认 4已完成 5已取消"
// @Param customer_name query string false "客户名称"
// @Success 200 {object} response.Body "分页合同列表"
// @Failure 401 {object} response.Body "未登录"
// @Router /api/contracts [get]
func (h *ContractHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	var status *int8
	if statusStr := c.Query("status"); statusStr != "" {
		if v, err := strconv.Atoi(statusStr); err == nil {
			s := int8(v)
			status = &s
		}
	}

	var customerID *int64
	if customerIDStr := c.Query("customer_id"); customerIDStr != "" {
		if v, err := strconv.ParseInt(customerIDStr, 10, 64); err == nil && v > 0 {
			customerID = &v
		}
	}

	result, err := h.svc.List(c.Request.Context(), service.ContractListQuery{
		UserID:       middleware.GetUserID(c),
		CustomerID:   customerID,
		Page:         page,
		PageSize:     pageSize,
		Keyword:      c.Query("keyword"),
		Status:       status,
		CustomerName: c.Query("customer_name"),
	})
	if err != nil {
		// 列表查询失败也记录具体错误，避免前端只看到模糊 500
		log.Printf("list contracts error: %v", err)
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
		return
	}

	response.Success(c, http.StatusOK, "ok", result)
}

// Detail 合同详情
// @Summary 合同详情
// @Description 获取当前用户创建的合同详情，包含当前版本信息
// @Tags 合同
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Success 200 {object} response.Body "合同详情"
// @Failure 400 {object} response.Body "参数错误"
// @Failure 401 {object} response.Body "未登录"
// @Failure 404 {object} response.Body "合同不存在或无权访问"
// @Router /api/contracts/{id} [get]
func (h *ContractHandler) Detail(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}

	detail, err := h.svc.Detail(c.Request.Context(), contractID, middleware.GetUserID(c))
	if err != nil {
		writeContractError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "ok", detail)
}

// Preview 合同 DOCX 高保真预览流。
func (h *ContractHandler) Preview(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	data, fileName, err := h.svc.PreviewDocx(c.Request.Context(), contractID, middleware.GetUserID(c))
	if err != nil {
		writeContractError(c, err)
		return
	}
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	c.Header("Content-Disposition", "inline; filename=\""+fileName+"\"")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data)
}

// BatchDeleteRequest 批量删除合同请求体。
type BatchDeleteRequest struct {
	IDs []int64 `json:"ids"`
}

// Delete 删除合同
// @Summary 删除合同
// @Description 根据合同 ID 删除当前用户创建的合同及其版本、变更、确认、分享等关联业务数据
// @Tags 合同
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Success 200 {object} response.Body "删除成功"
// @Failure 400 {object} response.Body "参数错误"
// @Failure 401 {object} response.Body "未登录"
// @Failure 404 {object} response.Body "合同不存在或无权访问"
// @Router /api/contracts/{id} [delete]
func (h *ContractHandler) Delete(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}

	if err := h.svc.Delete(
		c.Request.Context(),
		contractID,
		middleware.GetUserID(c),
		middleware.GetUsername(c),
		c.ClientIP(),
		c.Request.UserAgent(),
	); err != nil {
		writeContractError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "删除成功", nil)
}

// BatchDelete 批量删除合同
// @Summary 批量删除合同
// @Description 根据合同 ID 列表批量删除当前用户创建的合同；任一合同不存在或无权访问时不会部分删除
// @Tags 合同
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body BatchDeleteRequest true "合同ID列表"
// @Success 200 {object} response.Body "删除成功"
// @Failure 400 {object} response.Body "参数错误"
// @Failure 401 {object} response.Body "未登录"
// @Failure 404 {object} response.Body "合同不存在或无权访问"
// @Router /api/contracts [delete]
func (h *ContractHandler) BatchDelete(c *gin.Context) {
	var req BatchDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}

	if err := h.svc.BatchDelete(c.Request.Context(), service.BatchDeleteContractsInput{
		ContractIDs: req.IDs,
		UserID:      middleware.GetUserID(c),
		Username:    middleware.GetUsername(c),
		ClientIP:    c.ClientIP(),
		UserAgent:   c.Request.UserAgent(),
	}); err != nil {
		writeContractError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "删除成功", nil)
}

// SaveVersionRequest 保存新版本请求体。
type SaveVersionRequest struct {
	DocumentContent map[string]interface{} `json:"document_content"`
	ChangeSummary   string                 `json:"change_summary"`
}

// SaveVersion 保存新版本
// @Summary 保存新版本
// @Description 提交编辑后的结构化文档，自动生成新版本并记录变更
// @Tags 合同版本
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Param request body SaveVersionRequest true "新版本内容"
// @Success 200 {object} response.Body "保存成功"
// @Failure 400 {object} response.Body "参数错误"
// @Failure 401 {object} response.Body "未登录"
// @Failure 404 {object} response.Body "合同不存在或无权访问"
// @Failure 422 {object} response.Body "文档对比失败"
// @Router /api/contracts/{id}/versions [post]
func (h *ContractHandler) SaveVersion(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}

	var req SaveVersionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.DocumentContent == nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}

	result, err := h.svc.SaveVersion(c.Request.Context(), service.SaveVersionInput{
		ContractID:      contractID,
		UserID:          middleware.GetUserID(c),
		Username:        middleware.GetUsername(c),
		DocumentContent: req.DocumentContent,
		ChangeSummary:   req.ChangeSummary,
		ClientIP:        c.ClientIP(),
		UserAgent:       c.Request.UserAgent(),
	})
	if err != nil {
		writeContractError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "保存成功", result)
}

// VersionList 版本列表
// @Summary 版本列表
// @Description 分页查询合同版本列表
// @Tags 合同版本
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Param page query int false "页码，默认 1" default(1)
// @Param page_size query int false "每页数量，默认 10，最大 100" default(10)
// @Success 200 {object} response.Body "分页版本列表"
// @Failure 401 {object} response.Body "未登录"
// @Failure 404 {object} response.Body "合同不存在或无权访问"
// @Router /api/contracts/{id}/versions [get]
func (h *ContractHandler) VersionList(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	result, err := h.svc.VersionList(c.Request.Context(), contractID, middleware.GetUserID(c), page, pageSize)
	if err != nil {
		writeContractError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "ok", result)
}

// VersionDetail 版本详情
// @Summary 版本详情
// @Description 获取指定历史版本的完整结构化内容
// @Tags 合同版本
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Param versionId path int true "版本ID"
// @Success 200 {object} response.Body "版本详情"
// @Failure 400 {object} response.Body "参数错误"
// @Failure 401 {object} response.Body "未登录"
// @Failure 404 {object} response.Body "合同不存在、无权访问或版本不存在"
// @Router /api/contracts/{id}/versions/{versionId} [get]
func (h *ContractHandler) VersionDetail(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	versionID, err := strconv.ParseInt(c.Param("versionId"), 10, 64)
	if err != nil || versionID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "版本ID不合法")
		return
	}

	result, err := h.svc.VersionDetail(c.Request.Context(), contractID, versionID, middleware.GetUserID(c))
	if err != nil {
		writeContractError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "ok", result)
}

// ChangeList 变更记录列表
// @Summary 变更记录列表
// @Description 分页查询合同版本之间的变更记录
// @Tags 合同版本
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "合同ID"
// @Param page query int false "页码，默认 1" default(1)
// @Param page_size query int false "每页数量，默认 20，最大 100" default(20)
// @Success 200 {object} response.Body "分页变更记录"
// @Failure 401 {object} response.Body "未登录"
// @Failure 404 {object} response.Body "合同不存在或无权访问"
// @Router /api/contracts/{id}/changes [get]
func (h *ContractHandler) ChangeList(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	result, err := h.svc.ChangeList(c.Request.Context(), contractID, middleware.GetUserID(c), page, pageSize)
	if err != nil {
		writeContractError(c, err)
		return
	}

	response.Success(c, http.StatusOK, "ok", result)
}

// ExportPng 上传 PNG 终稿归档。
func (h *ContractHandler) ExportPng(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请使用 multipart 上传 PNG 文件")
		return
	}
	files := form.File["files"]
	if len(files) == 0 {
		response.Error(c, http.StatusBadRequest, 40001, "请上传至少一张 PNG")
		return
	}

	blobs := make([][]byte, 0, len(files))
	for _, fh := range files {
		f, err := fh.Open()
		if err != nil {
			response.Error(c, http.StatusBadRequest, 40001, "读取上传文件失败")
			return
		}
		data, err := io.ReadAll(f)
		_ = f.Close()
		if err != nil {
			response.Error(c, http.StatusBadRequest, 40001, "读取上传文件失败")
			return
		}
		blobs = append(blobs, data)
	}

	hash := c.PostForm("hash")
	result, err := h.svc.UploadExportPng(c.Request.Context(), contractID, middleware.GetUserID(c), blobs, hash)
	if err != nil {
		writeContractError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// GetExportPng 获取当前版本 PNG 归档列表。
func (h *ContractHandler) GetExportPng(c *gin.Context) {
	contractID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || contractID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	result, err := h.svc.GetExportPng(c.Request.Context(), contractID, middleware.GetUserID(c))
	if err != nil {
		writeContractError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// writeContractError 将合同 service 层错误转换为统一 HTTP 响应。
func writeContractError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidContractInput),
		errors.Is(err, service.ErrInvalidFileType),
		errors.Is(err, service.ErrEmptyFile),
		errors.Is(err, service.ErrFileTooLarge):
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
	case errors.Is(err, service.ErrContractNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	case errors.Is(err, service.ErrContractLocked):
		response.Error(c, http.StatusForbidden, 40301, err.Error())
	case errors.Is(err, service.ErrDocParseFailed):
		response.Error(c, http.StatusUnprocessableEntity, 42201, err.Error())
	case errors.Is(err, service.ErrVersionNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	default:
		// 记录具体错误到服务端日志，便于排查 500 问题；不要把内部错误直接返回给前端
		log.Printf("contract error: %v", err)
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
	}
}
