package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Body 是全局统一响应结构。
// code 为 0 表示成功，非 0 表示业务错误码。
type Body struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Success 返回成功响应。
func Success(c *gin.Context, httpStatus int, message string, data interface{}) {
	c.JSON(httpStatus, Body{
		Code:    0,
		Message: message,
		Data:    data,
	})
}

// Error 返回失败响应。
func Error(c *gin.Context, httpStatus int, code int, message string) {
	c.JSON(httpStatus, Body{
		Code:    code,
		Message: message,
	})
}

// ErrorWithData 返回带业务数据的失败响应（如版本冲突详情）。
func ErrorWithData(c *gin.Context, httpStatus int, code int, message string, data interface{}) {
	c.JSON(httpStatus, Body{
		Code:    code,
		Message: message,
		Data:    data,
	})
}

// Health 接口常用的“无业务数据”成功响应。
func OK(c *gin.Context) {
	Success(c, http.StatusOK, "ok", nil)
}
