import { useEffect, useState } from 'react'
import { Form, Input, Modal, Typography } from 'antd'
import type { BlockStyle, DocumentChromeItem } from '../../types/contract'
import FormatToolbar from './FormatToolbar'
import { chromeTextStyle } from '../../utils/chromeTextStyle'
import './header-footer-settings.css'

export interface HeaderFooterSaveValue {
  header: DocumentChromeItem | null
  footer: DocumentChromeItem | null
}

interface HeaderFooterSettingsModalProps {
  open: boolean
  header: DocumentChromeItem | null
  footer: DocumentChromeItem | null
  /** 打开时聚焦的区域 */
  focus?: 'header' | 'footer' | 'both'
  onCancel: () => void
  onSave: (value: HeaderFooterSaveValue) => void
}

const DEFAULT_CHROME_STYLE: BlockStyle = {
  font_size: 9,
  color: '999999',
  alignment: 'center',
  east_asia_font: '宋体',
}

/**
 * 页眉页脚设置弹窗：支持文本 + 颜色 / 加粗等格式。
 */
export default function HeaderFooterSettingsModal({
  open,
  header,
  footer,
  focus = 'both',
  onCancel,
  onSave,
}: HeaderFooterSettingsModalProps) {
  const [headerText, setHeaderText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [headerStyle, setHeaderStyle] = useState<BlockStyle>(DEFAULT_CHROME_STYLE)
  const [footerStyle, setFooterStyle] = useState<BlockStyle>(DEFAULT_CHROME_STYLE)

  useEffect(() => {
    if (!open) return
    setHeaderText(header?.text ?? '')
    setFooterText(footer?.text ?? '')
    setHeaderStyle({ ...DEFAULT_CHROME_STYLE, ...(header?.style ?? {}) })
    setFooterStyle({ ...DEFAULT_CHROME_STYLE, ...(footer?.style ?? {}) })
  }, [open, header, footer])

  const handleOk = () => {
    const headerId = header?.id || `header-${Date.now()}`
    const footerId = footer?.id || `footer-${Date.now()}`
    onSave({
      header: headerText.trim()
        ? { id: headerId, text: headerText.trim(), style: headerStyle }
        : null,
      footer: footerText.trim()
        ? { id: footerId, text: footerText.trim(), style: footerStyle }
        : null,
    })
  }

  return (
    <Modal
      open={open}
      title="设置页眉页脚"
      okText="保存"
      cancelText="取消"
      width={720}
      destroyOnHidden
      onCancel={onCancel}
      onOk={handleOk}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        支持字体、字号、加粗、颜色、对齐等格式；清空文本即可移除。导出 PDF/PNG 会一并带上样式。
      </Typography.Paragraph>

      <Form layout="vertical">
        <Form.Item label="页眉" style={{ marginBottom: 16 }}>
          <div className="hf-settings__toolbar">
            <FormatToolbar
              style={headerStyle}
              onChange={(patch) => setHeaderStyle((prev) => ({ ...prev, ...patch }))}
            />
          </div>
          <Input.TextArea
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            placeholder="例如：合同名称 / 保密文件"
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={200}
            showCount
            autoFocus={focus === 'header' || focus === 'both'}
            style={chromeTextStyle(headerStyle)}
            className="hf-settings__textarea"
          />
        </Form.Item>

        <Form.Item label="页脚" style={{ marginBottom: 0 }}>
          <div className="hf-settings__toolbar">
            <FormatToolbar
              style={footerStyle}
              onChange={(patch) => setFooterStyle((prev) => ({ ...prev, ...patch }))}
            />
          </div>
          <Input.TextArea
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="例如：公司名称 / 联系方式（页码由系统自动生成）"
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={200}
            showCount
            autoFocus={focus === 'footer'}
            style={chromeTextStyle(footerStyle)}
            className="hf-settings__textarea"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
