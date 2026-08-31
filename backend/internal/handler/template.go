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

// TemplateHandler 模板池 HTTP 处理。
type TemplateHandler struct {
	svc *service.TemplateService
}

// NewTemplateHandler 创建模板 Handler。
func NewTemplateHandler(svc *service.TemplateService) *TemplateHandler {
	return &TemplateHandler{svc: svc}
}

// Upload 上传模板 DOCX。
func (h *TemplateHandler) Upload(c *gin.Context) {
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

	data, err := io.ReadAll(file)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "读取上传文件失败")
		return
	}

	result, err := h.svc.Upload(c.Request.Context(), service.UploadTemplateInput{
		UserID:       middleware.GetUserID(c),
		TemplateName: c.PostForm("template_name"),
		Description:  c.PostForm("description"),
		FileName:     fileHeader.Filename,
		FileData:     data,
	})
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	response.Success(c, http.StatusCreated, "上传成功", result)
}

// List 模板列表。
func (h *TemplateHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	result, err := h.svc.List(c.Request.Context(), service.TemplateListQuery{
		UserID:   middleware.GetUserID(c),
		Page:     page,
		PageSize: pageSize,
		Keyword:  c.Query("keyword"),
	})
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// Detail 模板详情。
func (h *TemplateHandler) Detail(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "模板 ID 不合法")
		return
	}
	result, err := h.svc.Detail(c.Request.Context(), id, middleware.GetUserID(c))
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// Update 更新模板名称与说明。
func (h *TemplateHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "模板 ID 不合法")
		return
	}
	var body struct {
		TemplateName string `json:"template_name"`
		Description  string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}
	err = h.svc.UpdateMeta(c.Request.Context(), service.UpdateMetaInput{
		TemplateID:   id,
		UserID:       middleware.GetUserID(c),
		TemplateName: body.TemplateName,
		Description:  body.Description,
	})
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "更新成功", nil)
}

// Delete 删除模板。
func (h *TemplateHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "模板 ID 不合法")
		return
	}
	if err := h.svc.Delete(c.Request.Context(), id, middleware.GetUserID(c)); err != nil {
		writeTemplateError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "删除成功", nil)
}

// Preview 下载模板 DOCX 预览流。
func (h *TemplateHandler) Preview(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "模板 ID 不合法")
		return
	}
	data, fileName, err := h.svc.PreviewDocx(c.Request.Context(), id, middleware.GetUserID(c))
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	c.Header("Content-Disposition", "inline; filename=\""+fileName+"\"")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data)
}

// SaveContent 保存模板结构化内容。
func (h *TemplateHandler) SaveContent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "模板 ID 不合法")
		return
	}
	var body struct {
		DocumentContent map[string]interface{} `json:"document_content"`
		ChangeSummary   string                 `json:"change_summary"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}
	result, err := h.svc.SaveContent(c.Request.Context(), service.SaveTemplateContentInput{
		TemplateID:      id,
		UserID:          middleware.GetUserID(c),
		DocumentContent: body.DocumentContent,
		ChangeSummary:   body.ChangeSummary,
	})
	if err != nil {
		writeTemplateError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "保存成功", result)
}

func writeTemplateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidContractInput),
		errors.Is(err, service.ErrInvalidFileType),
		errors.Is(err, service.ErrEmptyFile),
		errors.Is(err, service.ErrFileTooLarge):
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
	case errors.Is(err, service.ErrTemplateNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	case errors.Is(err, service.ErrTemplateInUse):
		response.Error(c, http.StatusConflict, 40901, err.Error())
	case errors.Is(err, service.ErrDocParseFailed):
		response.Error(c, http.StatusUnprocessableEntity, 42201, err.Error())
	default:
		log.Printf("template error: %v", err)
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
	}
}
