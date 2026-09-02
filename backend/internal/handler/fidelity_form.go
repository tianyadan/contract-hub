package handler

import (
	"errors"
	"io"
	"strconv"

	"github.com/gin-gonic/gin"
)

// fidelityUploadForm 高保真快照 multipart 表单。
type fidelityUploadForm struct {
	Data            []byte
	Hash            string
	PageCount       int
	SourceVersionNo int
	DocumentContent string
}

// parseFidelityUploadForm 解析高保真快照上传表单。
func parseFidelityUploadForm(c *gin.Context) (*fidelityUploadForm, error) {
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
	sourceVersionNo, err := strconv.Atoi(c.PostForm("source_version_no"))
	if err != nil || sourceVersionNo <= 0 {
		return nil, errors.New("source_version_no 不合法")
	}
	doc := c.PostForm("document_content")
	if doc == "" {
		return nil, errors.New("document_content 不能为空")
	}

	return &fidelityUploadForm{
		Data:            data,
		Hash:            c.PostForm("hash"),
		PageCount:       pageCount,
		SourceVersionNo: sourceVersionNo,
		DocumentContent: doc,
	}, nil
}
