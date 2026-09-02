package handler

import (
	"errors"
	"io"
	"strconv"

	"github.com/gin-gonic/gin"
)

// pdfUploadForm 从 multipart 表单解析 PDF 上传字段。
type pdfUploadForm struct {
	Data       []byte
	Hash       string
	PageCount  int
	VerifyCode string
	Draft      bool
	HasFile    bool
}

// parsePdfUploadForm 解析 PDF multipart 表单（file 必填）。
func parsePdfUploadForm(c *gin.Context) (*pdfUploadForm, error) {
	form, err := parsePdfUploadFormOptional(c)
	if err != nil {
		return nil, err
	}
	if !form.HasFile {
		return nil, errors.New("请上传 PDF 文件")
	}
	return form, nil
}

// parseConfirmPdfForm 解析确认接口 multipart（PDF 在双方均已确认时才必填）。
func parseConfirmPdfForm(c *gin.Context) (*pdfUploadForm, error) {
	return parsePdfUploadFormOptional(c)
}

// parsePdfUploadFormOptional 解析 PDF multipart，file 可选。
func parsePdfUploadFormOptional(c *gin.Context) (*pdfUploadForm, error) {
	form := &pdfUploadForm{Draft: c.PostForm("draft") == "1"}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		// 无文件：用于双方确认的第一方仅提交确认意向
		pageCount, _ := strconv.Atoi(c.PostForm("page_count"))
		form.PageCount = pageCount
		form.Hash = c.PostForm("hash")
		form.VerifyCode = c.PostForm("verify_code")
		return form, nil
	}

	file, err := fileHeader.Open()
	if err != nil {
		return nil, errors.New("读取上传文件失败")
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return nil, errors.New("读取上传文件失败")
	}
	form.Data = data
	form.HasFile = true

	pageCount, err := strconv.Atoi(c.PostForm("page_count"))
	if err != nil || pageCount <= 0 {
		if form.HasFile {
			return nil, errors.New("page_count 不合法")
		}
	} else {
		form.PageCount = pageCount
	}
	form.Hash = c.PostForm("hash")
	form.VerifyCode = c.PostForm("verify_code")
	return form, nil
}
