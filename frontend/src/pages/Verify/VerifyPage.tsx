import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { App, Button, Card, Descriptions, Result, Skeleton, Space, Tag, Typography } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, FilePdfOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { getPublicVerify, type PublicVerifyResult } from '../../api/publicApi'
import './verify.css'

/**
 * 公开验真页：扫码后展示合同信息与 PDF 原件链接。
 */
export default function VerifyPage() {
  const { code = '' } = useParams<{ code: string }>()
  const [searchParams] = useSearchParams()
  const scannedPage = Number(searchParams.get('page') || '0')
  const { message } = App.useApp()

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<PublicVerifyResult | null>(null)

  useEffect(() => {
    if (!code) {
      setLoading(false)
      return
    }
    setLoading(true)
    getPublicVerify(code, scannedPage > 0 ? scannedPage : undefined)
      .then(setResult)
      .catch(() => message.error('验真查询失败'))
      .finally(() => setLoading(false))
  }, [code, scannedPage, message])

  if (loading) {
    return (
      <div className="verify-page">
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="verify-page">
        <Result status="error" title="验真失败" subTitle="无法获取验真信息，请稍后重试" />
      </div>
    )
  }

  const valid = result.valid

  return (
    <div className="verify-page">
      <Card>
        <Result
          icon={valid ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
          title={valid ? '验真通过' : '验真未通过'}
          subTitle={valid ? '本合同由系统出具，信息如下' : result.reason || '验真码无效'}
        />

        <Descriptions bordered size="small" column={1} className="verify-page__desc">
          {result.contract_no && (
            <Descriptions.Item label="合同编号">{result.contract_no}</Descriptions.Item>
          )}
          {result.contract_name && (
            <Descriptions.Item label="合同名称">{result.contract_name}</Descriptions.Item>
          )}
          {result.version_no != null && (
            <Descriptions.Item label="版本号">V{result.version_no}</Descriptions.Item>
          )}
          {result.status_text && (
            <Descriptions.Item label="合同状态">
              <Tag color={valid ? 'success' : 'default'}>{result.status_text}</Tag>
            </Descriptions.Item>
          )}
          {scannedPage > 0 && (
            <Descriptions.Item label="扫码页码">第 {scannedPage} 页</Descriptions.Item>
          )}
          {result.page_count != null && result.page_count > 0 && (
            <Descriptions.Item label="总页数">{result.page_count} 页</Descriptions.Item>
          )}
          {result.confirmed_at && (
            <Descriptions.Item label="确认时间">
              {dayjs(result.confirmed_at).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
          )}
          {result.confirmers && result.confirmers.length > 0 && (
            <Descriptions.Item label="确认人">{result.confirmers.join('、')}</Descriptions.Item>
          )}
          {result.exported_at && (
            <Descriptions.Item label="归档时间">
              {dayjs(result.exported_at).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
          )}
        </Descriptions>

        {valid && result.pdf_url && (
          <Space direction="vertical" size="middle" className="verify-page__actions">
            <Button
              type="primary"
              size="large"
              block
              icon={<FilePdfOutlined />}
              href={result.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              查看合同原件（PDF）
            </Button>
            <Typography.Text type="secondary" className="verify-page__hint">
              链接有效期约 15 分钟，过期请重新扫码获取
            </Typography.Text>
          </Space>
        )}
      </Card>
    </div>
  )
}
