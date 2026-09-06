import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Empty,
  Image,
  Input,
  Popconfirm,
  Space,
  Switch,
  Typography,
  Upload,
} from 'antd'
import { DeleteOutlined, PlusOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import {
  deleteSealAsset,
  listSealAssets,
  updateSealAsset,
  uploadSealAsset,
  type SealAsset,
} from '../../api/settingsApi'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { sealProxyImageUrl } from '../../utils/sealUrl'
import './seal-settings.css'

/**
 * 合同设置 · 电子章库。
 * 内部用户统一维护；支持手机上传；可对任意合同盖章选用。
 */
export default function SealSettingsPage() {
  const { message } = App.useApp()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [list, setList] = useState<SealAsset[]>([])
  const [name, setName] = useState('')
  const [asDefault, setAsDefault] = useState(false)

  /** 刷新章库列表 */
  const reload = async () => {
    const data = await listSealAssets()
    setList(data)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await listSealAssets()
        if (!cancelled) setList(data)
      } catch {
        if (!cancelled) message.error('加载电子章失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [message])

  /** 上传电子章文件 */
  const handleUpload = async (file: File) => {
    const lower = file.name.toLowerCase()
    if (!/\.(png|jpe?g|webp)$/.test(lower)) {
      message.error('仅支持 PNG / JPEG / WebP')
      return false
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error('印章图片不能超过 2MB')
      return false
    }
    setUploading(true)
    try {
      await uploadSealAsset(file, name.trim() || undefined, asDefault)
      message.success('上传成功')
      setName('')
      setAsDefault(false)
      await reload()
    } finally {
      setUploading(false)
    }
    return false
  }

  /** 设为默认章 */
  const handleSetDefault = async (item: SealAsset) => {
    await updateSealAsset(item.id, { is_default: true })
    message.success('已设为默认')
    await reload()
  }

  /** 重命名 */
  const handleRename = async (item: SealAsset, nextName: string) => {
    const trimmed = nextName.trim()
    if (!trimmed || trimmed === item.name) return
    await updateSealAsset(item.id, { name: trimmed })
    message.success('已更新名称')
    await reload()
  }

  /** 删除 */
  const handleDelete = async (id: number) => {
    await deleteSealAsset(id)
    message.success('已删除')
    await reload()
  }

  return (
    <div className={`seal-settings${isMobile ? ' seal-settings--mobile' : ''}`}>
      <Card title="电子章" loading={loading}>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          在此维护您的电子章库，可在任意未确认合同中选用并盖章。合同确认后文档内落章配置会清除，终稿
          PDF 保留盖章效果；章库本身不会删除。
        </Typography.Paragraph>

        <div className="seal-settings__upload">
          <Input
            placeholder="印章名称（可选，默认取文件名）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            style={{ maxWidth: isMobile ? '100%' : 320 }}
          />
          <Space wrap>
            <span>设为默认</span>
            <Switch checked={asDefault} onChange={setAsDefault} />
          </Space>
          <Upload
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUpload(file)
              return false
            }}
            disabled={uploading}
          >
            <Button type="primary" icon={<PlusOutlined />} loading={uploading} block={isMobile}>
              上传电子章
            </Button>
          </Upload>
        </div>

        {list.length === 0 && !loading ? (
          <Empty description="暂无电子章，请先上传 PNG（推荐透明底）" />
        ) : (
          <div className="seal-settings__grid">
            {list.map((item) => (
              <div key={item.id} className="seal-settings__card">
                <div className="seal-settings__preview">
                  <Image src={sealProxyImageUrl(item.id)} alt={item.name} height={96} style={{ objectFit: 'contain' }} />
                </div>
                <Input
                  defaultValue={item.name}
                  onBlur={(e) => void handleRename(item, e.target.value)}
                  onPressEnter={(e) => {
                    ;(e.target as HTMLInputElement).blur()
                  }}
                />
                <div className="seal-settings__actions">
                  <Button
                    type="text"
                    size="small"
                    icon={item.is_default ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                    onClick={() => void handleSetDefault(item)}
                  >
                    {item.is_default ? '默认' : '设默认'}
                  </Button>
                  <Popconfirm title="确定删除该电子章？" onConfirm={() => void handleDelete(item.id)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
