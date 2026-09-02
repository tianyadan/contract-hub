import { requestTyped } from './request'
import type {
  CreateContractFromTemplateParams,
  CreateCustomerParams,
  Customer,
  CustomerListParams,
  CustomerListResult,
} from '../types/customer'
import type { ContractListResult } from '../types/contract'

/** 新建客户 */
export async function createCustomer(data: CreateCustomerParams): Promise<Customer> {
  return requestTyped({ url: '/customers', method: 'POST', data })
}

/** 客户列表 */
export async function getCustomerList(params?: CustomerListParams): Promise<CustomerListResult> {
  return requestTyped({ url: '/customers', method: 'GET', params })
}

/** 客户详情 */
export async function getCustomerDetail(id: number): Promise<Customer> {
  return requestTyped({ url: `/customers/${id}`, method: 'GET' })
}

/** 更新客户 */
export async function updateCustomer(id: number, data: CreateCustomerParams): Promise<Customer> {
  return requestTyped({ url: `/customers/${id}`, method: 'PUT', data })
}

/** 删除客户 */
export async function deleteCustomer(id: number): Promise<void> {
  return requestTyped({ url: `/customers/${id}`, method: 'DELETE' })
}

/** 客户下合同列表 */
export async function getCustomerContracts(
  customerId: number,
  params?: { page?: number; page_size?: number },
): Promise<ContractListResult> {
  return requestTyped({ url: `/customers/${customerId}/contracts`, method: 'GET', params })
}

/** 从模板为客户创建合同 */
export async function createContractFromTemplate(
  customerId: number,
  data: CreateContractFromTemplateParams,
): Promise<{ contract_id: number; contract_no: string; contract_name: string }> {
  return requestTyped({
    url: `/customers/${customerId}/contracts`,
    method: 'POST',
    data,
  })
}
