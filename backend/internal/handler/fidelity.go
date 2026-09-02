package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/middleware"
	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// FidelityHandler 高保真快照 HTTP 处理。
type FidelityHandler struct {
	svc *service.FidelityService
}

// NewFidelityHandler 创建高保真快照 Handler。
func NewFidelityHandler(svc *service.FidelityService) *FidelityHandler {
	return &FidelityHandler{svc: svc}
}

// ListContractSnapshots 合同高保真快照列表。
func (h *FidelityHandler) ListContractSnapshots(c *gin.Context) {
	contractID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	items, err := h.svc.ListContractSnapshots(c.Request.Context(), contractID, middleware.GetUserID(c))
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", items)
}

// CreateContractSnapshot 创建合同高保真快照。
func (h *FidelityHandler) CreateContractSnapshot(c *gin.Context) {
	contractID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	form, err := parseFidelityUploadForm(c)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
		return
	}
	result, err := h.svc.CreateContractSnapshot(c.Request.Context(), service.CreateFidelitySnapshotInput{
		EntityID:        contractID,
		UserID:          middleware.GetUserID(c),
		Username:        middleware.GetUsername(c),
		PdfData:         form.Data,
		Hash:            form.Hash,
		PageCount:       form.PageCount,
		SourceVersionNo: form.SourceVersionNo,
		DocumentContent: form.DocumentContent,
	})
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	response.Success(c, http.StatusCreated, "高保真阅览已生成", result)
}

// StreamContractSnapshotPdf 代理输出合同快照 PDF（内嵌预览）。
func (h *FidelityHandler) StreamContractSnapshotPdf(c *gin.Context) {
	contractID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	snapshotID, err := parsePathID(c, "snapshotId")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "快照ID不合法")
		return
	}
	data, fileName, err := h.svc.GetContractSnapshotPdf(c.Request.Context(), contractID, snapshotID, middleware.GetUserID(c))
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "inline; filename=\""+fileName+"\"")
	c.Data(http.StatusOK, "application/pdf", data)
}

// GetContractSnapshot 合同高保真快照详情。
func (h *FidelityHandler) GetContractSnapshot(c *gin.Context) {
	contractID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	snapshotID, err := parsePathID(c, "snapshotId")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "快照ID不合法")
		return
	}
	result, err := h.svc.GetContractSnapshot(c.Request.Context(), contractID, snapshotID, middleware.GetUserID(c))
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// RollbackContractSnapshot 回退合同至高保真快照。
func (h *FidelityHandler) RollbackContractSnapshot(c *gin.Context) {
	contractID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "合同ID不合法")
		return
	}
	snapshotID, err := parsePathID(c, "snapshotId")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "快照ID不合法")
		return
	}
	result, err := h.svc.RollbackContractSnapshot(c.Request.Context(), service.RollbackFidelityInput{
		EntityID:   contractID,
		SnapshotID: snapshotID,
		UserID:     middleware.GetUserID(c),
		Username:   middleware.GetUsername(c),
		ClientIP:   c.ClientIP(),
		UserAgent:  c.Request.UserAgent(),
	})
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "已回退至快照内容", result)
}

// ListTemplateSnapshots 模板高保真快照列表。
func (h *FidelityHandler) ListTemplateSnapshots(c *gin.Context) {
	templateID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "模板ID不合法")
		return
	}
	items, err := h.svc.ListTemplateSnapshots(c.Request.Context(), templateID, middleware.GetUserID(c))
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", items)
}

// CreateTemplateSnapshot 创建模板高保真快照。
func (h *FidelityHandler) CreateTemplateSnapshot(c *gin.Context) {
	templateID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "模板ID不合法")
		return
	}
	form, err := parseFidelityUploadForm(c)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
		return
	}
	result, err := h.svc.CreateTemplateSnapshot(c.Request.Context(), service.CreateFidelitySnapshotInput{
		EntityID:        templateID,
		UserID:          middleware.GetUserID(c),
		Username:        middleware.GetUsername(c),
		PdfData:         form.Data,
		Hash:            form.Hash,
		PageCount:       form.PageCount,
		SourceVersionNo: form.SourceVersionNo,
		DocumentContent: form.DocumentContent,
	})
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	response.Success(c, http.StatusCreated, "高保真阅览已生成", result)
}

// StreamTemplateSnapshotPdf 代理输出模板快照 PDF（内嵌预览）。
func (h *FidelityHandler) StreamTemplateSnapshotPdf(c *gin.Context) {
	templateID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "模板ID不合法")
		return
	}
	snapshotID, err := parsePathID(c, "snapshotId")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "快照ID不合法")
		return
	}
	data, fileName, err := h.svc.GetTemplateSnapshotPdf(c.Request.Context(), templateID, snapshotID, middleware.GetUserID(c))
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "inline; filename=\""+fileName+"\"")
	c.Data(http.StatusOK, "application/pdf", data)
}

// GetTemplateSnapshot 模板高保真快照详情。
func (h *FidelityHandler) GetTemplateSnapshot(c *gin.Context) {
	templateID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "模板ID不合法")
		return
	}
	snapshotID, err := parsePathID(c, "snapshotId")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "快照ID不合法")
		return
	}
	result, err := h.svc.GetTemplateSnapshot(c.Request.Context(), templateID, snapshotID, middleware.GetUserID(c))
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// RollbackTemplateSnapshot 回退模板至高保真快照。
func (h *FidelityHandler) RollbackTemplateSnapshot(c *gin.Context) {
	templateID, err := parsePathID(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "模板ID不合法")
		return
	}
	snapshotID, err := parsePathID(c, "snapshotId")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "快照ID不合法")
		return
	}
	result, err := h.svc.RollbackTemplateSnapshot(c.Request.Context(), service.RollbackFidelityInput{
		EntityID:   templateID,
		SnapshotID: snapshotID,
		UserID:     middleware.GetUserID(c),
		Username:   middleware.GetUsername(c),
	})
	if err != nil {
		writeFidelityError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "已回退至快照内容", result)
}

func parsePathID(c *gin.Context, key string) (int64, error) {
	id, err := strconv.ParseInt(c.Param(key), 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}

func writeFidelityError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidPdfInput),
		errors.Is(err, service.ErrInvalidPdfHash),
		errors.Is(err, service.ErrExportPdfTooLarge):
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
	case errors.Is(err, service.ErrContractNotFound),
		errors.Is(err, service.ErrTemplateNotFound),
		errors.Is(err, service.ErrFidelitySnapshotNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	case errors.Is(err, service.ErrContractLocked):
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
	default:
		if err != nil && err.Error() != "" {
			response.Error(c, http.StatusBadRequest, 40001, err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, 50001, "服务器内部错误")
	}
}
