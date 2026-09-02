/** 客户相关类型 */

export interface Customer {
  id: number
  customer_name: string
  phone: string
  address: string
  business_type: string
  remark: string
  create_time: string
  update_time: string
}

export interface CustomerListParams {
  page?: number
  page_size?: number
  keyword?: string
}

export interface CustomerListResult {
  list: Customer[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface CreateCustomerParams {
  customer_name: string
  phone: string
  address?: string
  business_type?: string
  remark?: string
}

export interface CreateContractFromTemplateParams {
  template_id: number
  contract_name?: string
}
