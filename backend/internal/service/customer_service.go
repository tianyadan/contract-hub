package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/lshc/contract-hub/backend/internal/model"
	"github.com/lshc/contract-hub/backend/internal/repository"
	"github.com/lshc/contract-hub/backend/pkg/pagination"
)

var (
	ErrCustomerNotFound      = errors.New("客户不存在或无权访问")
	ErrCustomerHasContracts  = errors.New("客户下存在进行中的合同，无法删除")
)

// CustomerService 客户管理业务逻辑。
type CustomerService struct {
	customers *repository.CustomerRepository
	contracts *repository.ContractRepository
}

// NewCustomerService 创建客户服务。
func NewCustomerService(customers *repository.CustomerRepository, contracts *repository.ContractRepository) *CustomerService {
	return &CustomerService{
		customers: customers,
		contracts: contracts,
	}
}

// CreateCustomerInput 新建客户入参。
type CreateCustomerInput struct {
	UserID       int64
	CustomerName string
	Phone        string
	Address      string
	BusinessType string
	Remark       string
}

// CustomerVO 客户返回结构。
type CustomerVO struct {
	ID           int64     `json:"id"`
	CustomerName string    `json:"customer_name"`
	Phone        string    `json:"phone"`
	Address      string    `json:"address"`
	BusinessType string    `json:"business_type"`
	Remark       string    `json:"remark"`
	CreateTime   time.Time `json:"create_time"`
	UpdateTime   time.Time `json:"update_time"`
}

// Create 新建客户。
func (s *CustomerService) Create(ctx context.Context, input CreateCustomerInput) (*CustomerVO, error) {
	name := strings.TrimSpace(input.CustomerName)
	phone := strings.TrimSpace(input.Phone)
	if name == "" || phone == "" {
		return nil, ErrInvalidContractInput
	}

	now := time.Now()
	customer := &model.Customer{
		ID:           nextID(),
		OwnerUserID:  input.UserID,
		CustomerName: name,
		Phone:        phone,
		Address:      strings.TrimSpace(input.Address),
		BusinessType: strings.TrimSpace(input.BusinessType),
		Status:       1,
		Remark:       strings.TrimSpace(input.Remark),
		CreateTime:   now,
		UpdateTime:   now,
	}
	if err := s.customers.Create(ctx, customer); err != nil {
		return nil, err
	}
	return toCustomerVO(customer), nil
}

// UpdateCustomerInput 更新客户入参。
type UpdateCustomerInput struct {
	CustomerID   int64
	UserID       int64
	CustomerName string
	Phone        string
	Address      string
	BusinessType string
	Remark       string
}

// Update 更新客户信息。
func (s *CustomerService) Update(ctx context.Context, input UpdateCustomerInput) (*CustomerVO, error) {
	name := strings.TrimSpace(input.CustomerName)
	phone := strings.TrimSpace(input.Phone)
	if name == "" || phone == "" {
		return nil, ErrInvalidContractInput
	}

	customer := &model.Customer{
		ID:           input.CustomerID,
		OwnerUserID:  input.UserID,
		CustomerName: name,
		Phone:        phone,
		Address:      strings.TrimSpace(input.Address),
		BusinessType: strings.TrimSpace(input.BusinessType),
		Remark:       strings.TrimSpace(input.Remark),
	}
	if err := s.customers.Update(ctx, customer); err != nil {
		return nil, ErrCustomerNotFound
	}
	updated, err := s.customers.GetByOwner(ctx, input.CustomerID, input.UserID)
	if err != nil {
		return nil, err
	}
	return toCustomerVO(updated), nil
}

// Delete 软删除客户。
func (s *CustomerService) Delete(ctx context.Context, customerID, userID int64) error {
	count, err := s.customers.CountActiveContracts(ctx, customerID)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrCustomerHasContracts
	}
	if err := s.customers.SoftDelete(ctx, customerID, userID); err != nil {
		return ErrCustomerNotFound
	}
	return nil
}

// Detail 客户详情。
func (s *CustomerService) Detail(ctx context.Context, customerID, userID int64) (*CustomerVO, error) {
	customer, err := s.customers.GetByOwner(ctx, customerID, userID)
	if err != nil {
		return nil, err
	}
	if customer == nil {
		return nil, ErrCustomerNotFound
	}
	return toCustomerVO(customer), nil
}

// CustomerListQuery 客户列表查询。
type CustomerListQuery struct {
	UserID   int64
	Page     int
	PageSize int
	Keyword  string
}

// List 分页查询客户列表。
func (s *CustomerService) List(ctx context.Context, query CustomerListQuery) (*pagination.PageResult[CustomerVO], error) {
	pageQuery := &pagination.Query{Page: query.Page, PageSize: query.PageSize}
	pageQuery.Normalize()

	filter := repository.CustomerListFilter{
		OwnerUserID: query.UserID,
		Keyword:     strings.TrimSpace(query.Keyword),
		Limit:       pageQuery.Limit(),
		Offset:      pageQuery.Offset(),
	}

	total, err := s.customers.Count(ctx, filter)
	if err != nil {
		return nil, err
	}

	rows, err := s.customers.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	items := make([]CustomerVO, 0, len(rows))
	for i := range rows {
		items = append(items, *toCustomerVO(&rows[i]))
	}
	result := pagination.NewPageResult(items, total, pageQuery.Page, pageQuery.PageSize)
	return &result, nil
}

func toCustomerVO(c *model.Customer) *CustomerVO {
	return &CustomerVO{
		ID:           c.ID,
		CustomerName: c.CustomerName,
		Phone:        c.Phone,
		Address:      c.Address,
		BusinessType: c.BusinessType,
		Remark:       c.Remark,
		CreateTime:   c.CreateTime,
		UpdateTime:   c.UpdateTime,
	}
}
