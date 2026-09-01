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
}

// parsePdfUploadForm 解析 PDF multipart 表单（file + hash + page_count + verify_code）。
func parsePdfUploadForm(c *gin.Context) (*pdfUploadForm, error) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return nil, errors.New("请上传 PDF 文件")
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

	pageCount, err := strconv.Atoi(c.PostForm("page_count"))
	if err != nil || pageCount <= 0 {
		return nil, errors.New("page_count 不合法")
	}

	return &pdfUploadForm{
		Data:       data,
		Hash:       c.PostForm("hash"),
		PageCount:  pageCount,
		VerifyCode: c.PostForm("verify_code"),
		Draft:      c.PostForm("draft") == "1",
	}, nil
}
