import { useCallback, useEffect, useState } from 'react'
import { App, Button, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { createInviteCode, listInviteCodes } from '../../api/adminApi'
import type { InviteCodeVO } from '../../types/auth'

/**
 * 管理员：生成与查看注册邀请码（5 分钟、一次性）。
 */
export default function InviteCodesPage() {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [data, setData] = useState<InviteCodeVO[]>([])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listInviteCodes(30)
      setData(list || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  /** 生成邀请码并复制到剪贴板 */
  const handleCreate = async () => {
    setCreating(true)
    try {
      const vo = await createInviteCode()
      message.success(`邀请码已生成：${vo.code}（5 分钟内有效）`)
      try {
        await navigator.clipboard.writeText(vo.code)
        message.info('已复制到剪贴板')
      } catch {
        // 忽略剪贴板失败
      }
      await loadList()
    } finally {
      setCreating(false)
    }
  }

  const columns: ColumnsType<InviteCodeVO> = [
    {
      title: '邀请码',
      dataIndex: 'code',
      render: (code: string) => (
        <Typography.Text copyable strong>
          {code}
        </Typography.Text>
      ),
    },
    {
      title: '过期时间',
      dataIndex: 'expire_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '状态',
      key: 'state',
      render: (_, r) => {
        if (r.used) return <Tag color="default">已使用</Tag>
        if (r.expired) return <Tag color="warning">已过期</Tag>
        return <Tag color="success">可用</Tag>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          邀请码管理
        </Typography.Title>
        <Button type="primary" loading={creating} onClick={() => void handleCreate()}>
          生成邀请码
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        邀请码仅可使用一次，生成后 5 分钟内有效。请及时发给待注册用户。
      </Typography.Paragraph>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={data} pagination={false} />
    </div>
  )
}
