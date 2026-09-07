import { useCallback, useEffect, useState } from 'react'
import {
  App,
  Button,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  banUser,
  deleteUser,
  enableUser,
  getAdminUsers,
  resetUserPassword,
} from '../../api/adminApi'
import type { UserVO } from '../../types/auth'
import { getStoredUser } from '../../utils/token'

/**
 * 管理员：用户管理（封禁 / 启用 / 重置密码 / 软删除）。
 */
export default function AdminUsersPage() {
  const { message, modal } = App.useApp()
  const me = getStoredUser()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<UserVO[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<number | undefined>(undefined)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminUsers({
        page,
        page_size: pageSize,
        keyword: keyword || undefined,
        status,
      })
      setData(res.list || [])
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, status])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const columns: ColumnsType<UserVO> = [
    { title: 'ID', dataIndex: 'id', width: 160, ellipsis: true },
    { title: '账号', dataIndex: 'username', width: 140 },
    { title: '昵称', dataIndex: 'nickname', width: 120, render: (v) => v || '-' },
    {
      title: '角色',
      dataIndex: 'role',
      width: 90,
      render: (role: number) =>
        role === 1 ? <Tag color="gold">管理员</Tag> : <Tag>普通</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: number) =>
        s === 1 ? <Tag color="success">正常</Tag> : <Tag color="error">封禁</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      width: 180,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 280,
      render: (_, record) => {
        const isSelf = me?.id === record.id
        return (
          <Space wrap size="small">
            {record.status === 1 ? (
              <Button
                size="small"
                disabled={isSelf}
                onClick={() =>
                  modal.confirm({
                    title: `封禁用户 ${record.username}？`,
                    onOk: async () => {
                      await banUser(record.id)
                      message.success('已封禁')
                      await loadList()
                    },
                  })
                }
              >
                封禁
              </Button>
            ) : (
              <Button
                size="small"
                type="primary"
                ghost
                onClick={async () => {
                  await enableUser(record.id)
                  message.success('已启用')
                  await loadList()
                }}
              >
                启用
              </Button>
            )}
            <Button
              size="small"
              disabled={isSelf}
              onClick={() =>
                modal.confirm({
                  title: `重置 ${record.username} 的密码？`,
                  content: '密码将重置为默认值 12345678',
                  onOk: async () => {
                    const res = await resetUserPassword(record.id)
                    message.success(`密码已重置为 ${res.default_password}`)
                  },
                })
              }
            >
              重置密码
            </Button>
            <Button
              size="small"
              danger
              disabled={isSelf}
              onClick={() =>
                modal.confirm({
                  title: `删除用户 ${record.username}？`,
                  content: '软删除后不可登录，历史业务数据保留',
                  okType: 'danger',
                  onOk: async () => {
                    await deleteUser(record.id)
                    message.success('已删除')
                    await loadList()
                  },
                })
              }
            >
              删除
            </Button>
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        用户管理
      </Typography.Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索账号/昵称/手机号"
          allowClear
          onSearch={(v) => {
            setPage(1)
            setKeyword(v.trim())
          }}
          style={{ width: 240 }}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 120 }}
          value={status}
          onChange={(v) => {
            setPage(1)
            setStatus(v)
          }}
          options={[
            { value: 1, label: '正常' },
            { value: 0, label: '封禁' },
          ]}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        scroll={{ x: 1000 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
        }}
      />
    </div>
  )
}
