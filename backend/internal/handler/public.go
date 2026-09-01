package handler

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// PublicHandler 公开接口（无需登录）。
type PublicHandler struct {
	contracts *service.ContractService
}

// NewPublicHandler 创建公开接口 Handler。
func NewPublicHandler(contracts *service.ContractService) *PublicHandler {
	return &PublicHandler{contracts: contracts}
}

// VerifyContract 扫码验真（公开）。
func (h *PublicHandler) VerifyContract(c *gin.Context) {
	code := c.Param("code")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))

	result, err := h.contracts.VerifyByCode(c.Request.Context(), code, page)
	if err != nil {
		log.Printf("verify error: %v", err)
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}
