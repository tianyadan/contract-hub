package pagination

// Query 通用分页查询参数。
type Query struct {
	Page     int // 当前页码，从 1 开始
	PageSize int // 每页数量
}

// Normalize 规范化分页参数，避免前端传入非法值。
func (q *Query) Normalize() {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 10
	}
	if q.PageSize > 100 {
		q.PageSize = 100
	}
}

// Offset 计算 SQL LIMIT 的 offset。
func (q *Query) Offset() int {
	return (q.Page - 1) * q.PageSize
}

// Limit 返回 SQL LIMIT 的数量。
func (q *Query) Limit() int {
	return q.PageSize
}

// PageResult 通用分页响应结构，后续所有分页接口可复用。
type PageResult[T any] struct {
	List       []T   `json:"list"`
	Total      int64 `json:"total"`
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	TotalPages int64 `json:"total_pages"`
}

// NewPageResult 构造分页响应。
func NewPageResult[T any](list []T, total int64, page, pageSize int) PageResult[T] {
	totalPages := int64(0)
	if total > 0 {
		totalPages = (total + int64(pageSize) - 1) / int64(pageSize)
	}
	return PageResult[T]{
		List:       list,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}
}
