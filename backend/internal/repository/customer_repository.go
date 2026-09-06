package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/lshc/contract-hub/backend/internal/model"
)

// CustomerRepository 客户数据访问。
type CustomerRepository struct {
	db *sql.DB
}

// NewCustomerRepository 创建客户仓库。
func NewCustomerRepository(db *sql.DB) *CustomerRepository {
	return &CustomerRepository{db: db}
}

// CustomerListFilter 客户列表过滤。
type CustomerListFilter struct {
	OwnerUserID int64
	Keyword     string
	Limit       int
	Offset      int
}

// Create 新建客户。
func (r *CustomerRepository) Create(ctx context.Context, customer *model.Customer) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO customer (
			id, owner_user_id, customer_name, phone, address,
			business_type, status, remark, create_time, update_time
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, customer.ID, customer.OwnerUserID, customer.CustomerName, customer.Phone,
		nullString(customer.Address), nullString(customer.BusinessType),
		customer.Status, nullString(customer.Remark),
		customer.CreateTime, customer.UpdateTime)
	return err
}

// Update 更新客户信息。
func (r *CustomerRepository) Update(ctx context.Context, customer *model.Customer) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE customer
		SET customer_name = ?, phone = ?, address = ?,
		    business_type = ?, remark = ?
		WHERE id = ? AND owner_user_id = ? AND status = 1
	`, customer.CustomerName, customer.Phone,
		nullString(customer.Address), nullString(customer.BusinessType),
		nullString(customer.Remark), customer.ID, customer.OwnerUserID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// SoftDelete 软删除客户。
func (r *CustomerRepository) SoftDelete(ctx context.Context, customerID, ownerUserID int64) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE customer SET status = 0
		WHERE id = ? AND owner_user_id = ? AND status = 1
	`, customerID, ownerUserID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// GetByOwner 按 ID 查询客户（校验归属）。
func (r *CustomerRepository) GetByOwner(ctx context.Context, customerID, ownerUserID int64) (*model.Customer, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, owner_user_id, customer_name, phone, address,
		       business_type, status, remark, create_time, update_time
		FROM customer
		WHERE id = ? AND owner_user_id = ? AND status = 1
	`, customerID, ownerUserID)

	var c model.Customer
	var address, businessType, remark sql.NullString
	err := row.Scan(
		&c.ID, &c.OwnerUserID, &c.CustomerName, &c.Phone, &address,
		&businessType, &c.Status, &remark, &c.CreateTime, &c.UpdateTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	c.Address = address.String
	c.BusinessType = businessType.String
	c.Remark = remark.String
	return &c, nil
}

// Count 统计客户数量。
func (r *CustomerRepository) Count(ctx context.Context, filter CustomerListFilter) (int64, error) {
	where, args := buildCustomerWhere(filter)
	var total int64
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM customer "+where, args...).Scan(&total)
	return total, err
}

// List 分页查询客户列表。
func (r *CustomerRepository) List(ctx context.Context, filter CustomerListFilter) ([]model.Customer, error) {
	where, args := buildCustomerWhere(filter)
	args = append(args, filter.Limit, filter.Offset)

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, owner_user_id, customer_name, phone, address,
		       business_type, status, remark, create_time, update_time
		FROM customer `+where+`
		ORDER BY update_time DESC, id DESC
		LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]model.Customer, 0)
	for rows.Next() {
		var c model.Customer
		var address, businessType, remark sql.NullString
		if err := rows.Scan(
			&c.ID, &c.OwnerUserID, &c.CustomerName, &c.Phone, &address,
			&businessType, &c.Status, &remark, &c.CreateTime, &c.UpdateTime,
		); err != nil {
			return nil, err
		}
		c.Address = address.String
		c.BusinessType = businessType.String
		c.Remark = remark.String
		list = append(list, c)
	}
	return list, rows.Err()
}

// CountActiveContracts 统计客户下未取消的合同数。
func (r *CustomerRepository) CountActiveContracts(ctx context.Context, customerID int64) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM contract
		WHERE customer_id = ? AND status <> 5
	`, customerID).Scan(&total)
	return total, err
}

// CountContracts 统计客户下全部合同数（含已取消）。
func (r *CustomerRepository) CountContracts(ctx context.Context, customerID int64) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM contract WHERE customer_id = ?
	`, customerID).Scan(&total)
	return total, err
}

func buildCustomerWhere(filter CustomerListFilter) (string, []interface{}) {
	sb := strings.Builder{}
	sb.WriteString("WHERE owner_user_id = ? AND status = 1")
	args := []interface{}{filter.OwnerUserID}
	if filter.Keyword != "" {
		sb.WriteString(" AND (customer_name LIKE ? OR phone LIKE ?)")
		like := "%" + filter.Keyword + "%"
		args = append(args, like, like)
	}
	return sb.String(), args
}
