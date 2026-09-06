package handler

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/middleware"
	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// SaveWatermarkRequest 保存导出水印请求。
type SaveWatermarkRequest struct {
	Enabled  bool   `json:"enabled"`
	Content  string `json:"content"`
	Density  int    `json:"density"`
	FontSize int    `json:"font_size"`
	Rotate   int    `json:"rotate"`
	Opacity  int    `json:"opacity"`
}

// UpdateSealRequest 更新电子章元数据。
type UpdateSealRequest struct {
	Name      string `json:"name"`
	IsDefault *bool  `json:"is_default"`
}

// SettingsHandler 处理合同设置相关 HTTP 请求。
type SettingsHandler struct {
	watermark *service.WatermarkService
	seal      *service.SealService
}

// NewSettingsHandler 创建设置 Handler。
func NewSettingsHandler(watermark *service.WatermarkService, seal *service.SealService) *SettingsHandler {
	return &SettingsHandler{watermark: watermark, seal: seal}
}

// GetWatermark 获取当前用户导出水印设置。
func (h *SettingsHandler) GetWatermark(c *gin.Context) {
	userID := middleware.GetUserID(c)
	result, err := h.watermark.Get(c.Request.Context(), userID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// SaveWatermark 保存当前用户导出水印设置。
func (h *SettingsHandler) SaveWatermark(c *gin.Context) {
	var req SaveWatermarkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}

	userID := middleware.GetUserID(c)
	result, err := h.watermark.Save(c.Request.Context(), userID, service.SaveWatermarkInput{
		Enabled:  req.Enabled,
		Content:  req.Content,
		Density:  req.Density,
		FontSize: req.FontSize,
		Rotate:   req.Rotate,
		Opacity:  req.Opacity,
	})
	if err != nil {
		if errors.Is(err, service.ErrInvalidInput) {
			response.Error(c, http.StatusBadRequest, 40001, err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
		return
	}
	response.Success(c, http.StatusOK, "保存成功", result)
}

// ListSeals 列出当前用户电子章库。
func (h *SettingsHandler) ListSeals(c *gin.Context) {
	userID := middleware.GetUserID(c)
	list, err := h.seal.List(c.Request.Context(), userID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
		return
	}
	response.Success(c, http.StatusOK, "ok", list)
}

// UploadSeal 上传电子章图片。
func (h *SettingsHandler) UploadSeal(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请上传印章图片文件")
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "无法读取上传文件")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, 2*1024*1024+1))
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "读取文件失败")
		return
	}

	mimeType := fileHeader.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = service.GuessSealMime(fileHeader.Filename)
	}
	name := strings.TrimSpace(c.PostForm("name"))
	if name == "" {
		name = strings.TrimSuffix(fileHeader.Filename, pathExt(fileHeader.Filename))
	}
	setDefault := c.PostForm("is_default") == "1" || c.PostForm("is_default") == "true"

	userID := middleware.GetUserID(c)
	result, err := h.seal.Upload(c.Request.Context(), userID, name, data, mimeType, setDefault)
	if err != nil {
		if errors.Is(err, service.ErrInvalidInput) {
			response.Error(c, http.StatusBadRequest, 40001, err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, 50000, "上传失败")
		return
	}
	response.Success(c, http.StatusOK, "上传成功", result)
}

// UpdateSeal 更新电子章名称或默认标记。
func (h *SettingsHandler) UpdateSeal(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "无效的电子章 ID")
		return
	}
	var req UpdateSealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}
	userID := middleware.GetUserID(c)
	result, err := h.seal.Update(c.Request.Context(), userID, id, req.Name, req.IsDefault)
	if err != nil {
		if errors.Is(err, service.ErrInvalidInput) {
			response.Error(c, http.StatusBadRequest, 40001, err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
		return
	}
	response.Success(c, http.StatusOK, "保存成功", result)
}

// DeleteSeal 软删除电子章。
func (h *SettingsHandler) DeleteSeal(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "无效的电子章 ID")
		return
	}
	userID := middleware.GetUserID(c)
	if err := h.seal.Delete(c.Request.Context(), userID, id); err != nil {
		if errors.Is(err, service.ErrInvalidInput) {
			response.Error(c, http.StatusBadRequest, 40001, err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
		return
	}
	response.Success(c, http.StatusOK, "已删除", nil)
}

// StreamSealImage 同源代理输出电子章图片（私有 OSS，避免浏览器 403）。
func (h *SettingsHandler) StreamSealImage(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "无效的电子章 ID")
		return
	}
	userID := middleware.GetUserID(c)
	data, mimeType, err := h.seal.DownloadForUser(c.Request.Context(), userID, id)
	if err != nil {
		if errors.Is(err, service.ErrInvalidInput) {
			response.Error(c, http.StatusNotFound, 40401, err.Error())
			return
		}
		response.Error(c, http.StatusInternalServerError, 50000, "读取电子章失败")
		return
	}
	c.Header("Cache-Control", "private, max-age=300")
	c.Data(http.StatusOK, mimeType, data)
}

func pathExt(name string) string {
	i := strings.LastIndex(name, ".")
	if i < 0 {
		return ""
	}
	return name[i:]
}
