import { Tag } from 'antd'
import { getStatusConfig } from '../utils/contract'

/**
 * 合同状态标签。
 * 根据状态码展示对应颜色的标签，合同列表、首页等场景可复用。
 */
interface ContractStatusTagProps {
  /** 合同状态码 */
  status: number
}

export default function ContractStatusTag({ status }: ContractStatusTagProps) {
  const config = getStatusConfig(status)
  return <Tag color={config.color}>{config.label}</Tag>
}
