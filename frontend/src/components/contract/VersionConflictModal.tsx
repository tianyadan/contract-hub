import { useMemo, useState } from 'react'
import { Alert, Button, Modal, Radio, Space, Typography } from 'antd'
import type {
  BlockConflictItem,
  ConflictChoice,
  VersionConflictPayload,
} from '../../utils/conflictResolve'
import { applyConflictResolutions } from '../../utils/conflictResolve'
import type { DocumentContent } from '../../types/contract'
import './version-conflict-modal.css'

interface VersionConflictModalProps {
  open: boolean
  payload: VersionConflictPayload | null
  confirming?: boolean
  onCancel: () => void
  /** 用户确认后提交已解决文档（父级用 current_version_id 作 base 再保存） */
  onConfirm: (resolved: DocumentContent, baseVersionId: number) => void
}

/**
 * 版本冲突解决弹窗：对每个冲突块选择「保留我的 / 保留对方的」。
 */
export default function VersionConflictModal({
  open,
  payload,
  confirming = false,
  onCancel,
  onConfirm,
}: VersionConflictModalProps) {
  const conflicts = payload?.conflicts ?? []
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})

  // 打开新冲突时重置选择（默认保留我的）
  const choiceKey = useMemo(
    () => (payload ? `${payload.current_version_id}-${conflicts.map((c) => c.block_id).join(',')}` : ''),
    [payload, conflicts],
  )

  const effectiveChoices = useMemo(() => {
    const next: Record<string, ConflictChoice> = {}
    for (const c of conflicts) {
      next[c.block_id] = choices[c.block_id] ?? 'ours'
    }
    return next
    // choiceKey 变化时用默认 ours；choices 用户改动时更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceKey, choices, conflicts])

  const handleOk = () => {
    if (!payload) return
    const resolved = applyConflictResolutions(
      payload.merged_document,
      payload.conflicts,
      effectiveChoices,
    )
    onConfirm(resolved, payload.current_version_id)
  }

  return (
    <Modal
      open={open}
      title="文档版本冲突"
      width={720}
      className="version-conflict-modal"
      destroyOnHidden
      maskClosable={false}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={confirming}>
          取消
        </Button>,
        <Button key="ok" type="primary" loading={confirming} onClick={handleOk}>
          按选择合并并保存
        </Button>,
      ]}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={`对方已保存为 V${payload?.current_version_no ?? '?'}，与您的本地修改存在 ${conflicts.length} 处冲突`}
        description="未冲突的修改已自动合并。请为下列冲突区域选择保留内容后继续保存。"
      />

      <div className="version-conflict-modal__list">
        {conflicts.map((item) => (
          <ConflictCard
            key={item.block_id}
            item={item}
            value={effectiveChoices[item.block_id] ?? 'ours'}
            onChange={(side) =>
              setChoices((prev) => ({ ...prev, [item.block_id]: side }))
            }
          />
        ))}
      </div>
    </Modal>
  )
}

function ConflictCard({
  item,
  value,
  onChange,
}: {
  item: BlockConflictItem
  value: ConflictChoice
  onChange: (side: ConflictChoice) => void
}) {
  return (
    <div className="version-conflict-modal__card">
      <Typography.Text strong>{item.summary}</Typography.Text>
      <Radio.Group
        value={value}
        onChange={(e) => onChange(e.target.value as ConflictChoice)}
        style={{ marginTop: 8, width: '100%' }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Radio value="ours" className="version-conflict-modal__radio">
            <div>
              <Typography.Text>保留我的</Typography.Text>
              <div className="version-conflict-modal__preview version-conflict-modal__preview--ours">
                {item.ours_preview || '（已删除）'}
              </div>
            </div>
          </Radio>
          <Radio value="theirs" className="version-conflict-modal__radio">
            <div>
              <Typography.Text>保留对方的</Typography.Text>
              <div className="version-conflict-modal__preview version-conflict-modal__preview--theirs">
                {item.theirs_preview || '（已删除）'}
              </div>
            </div>
          </Radio>
        </Space>
      </Radio.Group>
    </div>
  )
}
