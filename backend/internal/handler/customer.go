package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/lshc/contract-hub/backend/internal/middleware"
	"github.com/lshc/contract-hub/backend/internal/service"
	"github.com/lshc/contract-hub/backend/pkg/response"
)

// CustomerHandler 客户管理 HTTP 处理。
type CustomerHandler struct {
	customers *service.CustomerService
	contracts *service.ContractService
}

// NewCustomerHandler 创建客户 Handler。
func NewCustomerHandler(customers *service.CustomerService, contracts *service.ContractService) *CustomerHandler {
	return &CustomerHandler{customers: customers, contracts: contracts}
}

// Create 新建客户。
func (h *CustomerHandler) Create(c *gin.Context) {
	var body struct {
		CustomerName string `json:"customer_name"`
		Phone        string `json:"phone"`
		Address      string `json:"address"`
		BusinessType string `json:"business_type"`
		Remark       string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}
	result, err := h.customers.Create(c.Request.Context(), service.CreateCustomerInput{
		UserID:       middleware.GetUserID(c),
		CustomerName: body.CustomerName,
		Phone:        body.Phone,
		Address:      body.Address,
		BusinessType: body.BusinessType,
		Remark:       body.Remark,
	})
	if err != nil {
		writeCustomerError(c, err)
		return
	}
	response.Success(c, http.StatusCreated, "创建成功", result)
}

// List 客户列表。
func (h *CustomerHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	result, err := h.customers.List(c.Request.Context(), service.CustomerListQuery{
		UserID:   middleware.GetUserID(c),
		Page:     page,
		PageSize: pageSize,
		Keyword:  c.Query("keyword"),
	})
	if err != nil {
		writeCustomerError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// Detail 客户详情。
func (h *CustomerHandler) Detail(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return
	}
	result, err := h.customers.Detail(c.Request.Context(), id, middleware.GetUserID(c))
	if err != nil {
		writeCustomerError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// Update 更新客户。
func (h *CustomerHandler) Update(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return
	}
	var body struct {
		CustomerName string `json:"customer_name"`
		Phone        string `json:"phone"`
		Address      string `json:"address"`
		BusinessType string `json:"business_type"`
		Remark       string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, 40001, "请求参数格式错误")
		return
	}
	result, err := h.customers.Update(c.Request.Context(), service.UpdateCustomerInput{
		CustomerID:   id,
		UserID:       middleware.GetUserID(c),
		CustomerName: body.CustomerName,
		Phone:        body.Phone,
		Address:      body.Address,
		BusinessType: body.BusinessType,
		Remark:       body.Remark,
	})
	if err != nil {
		writeCustomerError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "更新成功", result)
}

// Delete 删除客户。
func (h *CustomerHandler) Delete(c *gin.Context) {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return
	}
	if err := h.customers.Delete(c.Request.Context(), id, middleware.GetUserID(c)); err != nil {
		writeCustomerError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "删除成功", nil)
}

// ListContracts 客户下合同列表。
func (h *CustomerHandler) ListContracts(c *gin.Context) {
	customerID, err := parseIDParam(c, "id")
	if err != nil {
		return
	}
	if _, err := h.customers.Detail(c.Request.Context(), customerID, middleware.GetUserID(c)); err != nil {
		writeCustomerError(c, err)
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	cid := customerID
	result, err := h.contracts.List(c.Request.Context(), service.ContractListQuery{
		UserID:     middleware.GetUserID(c),
		CustomerID: &cid,
		Page:       page,
		PageSize:   pageSize,
	})
	if err != nil {
		writeContractError(c, err)
		return
	}
	response.Success(c, http.StatusOK, "ok", result)
}

// CreateContract 从模板为客户创建合同。
func (h *CustomerHandler) CreateContract(c *gin.Context) {
	customerID, err := parseIDParam(c, "id")
	if err != nil {
		return
	}
	var body struct {
		TemplateID   int64  `json:"template_id"`
		ContractName string `json:"contract_name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.TemplateID <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "请选择合同模板")
		return
	}
	result, err := h.contracts.CreateFromTemplate(c.Request.Context(), service.CreateFromTemplateInput{
		CustomerID:   customerID,
		TemplateID:   body.TemplateID,
		ContractName: body.ContractName,
		UserID:       middleware.GetUserID(c),
		Username:     middleware.GetUsername(c),
		ClientIP:     c.ClientIP(),
		UserAgent:    c.Request.UserAgent(),
	})
	if err != nil {
		writeContractError(c, err)
		return
	}
	response.Success(c, http.StatusCreated, "创建成功", result)
}

func parseIDParam(c *gin.Context, name string) (int64, error) {
	id, err := strconv.ParseInt(c.Param(name), 10, 64)
	if err != nil || id <= 0 {
		response.Error(c, http.StatusBadRequest, 40001, "ID 不合法")
		return 0, err
	}
	return id, nil
}

func writeCustomerError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidContractInput):
		response.Error(c, http.StatusBadRequest, 40001, err.Error())
	case errors.Is(err, service.ErrCustomerNotFound):
		response.Error(c, http.StatusNotFound, 40401, err.Error())
	case errors.Is(err, service.ErrCustomerHasContracts):
		response.Error(c, http.StatusConflict, 40901, err.Error())
	default:
		log.Printf("customer error: %v", err)
		response.Error(c, http.StatusInternalServerError, 50000, "服务器内部错误")
	}
}
