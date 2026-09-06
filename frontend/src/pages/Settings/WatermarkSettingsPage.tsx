import { useEffect, useMemo, useState } from 'react'
import { App, Button, Card, Col, Form, Input, Row, Slider, Space, Switch, Typography } from 'antd'
import {
  DEFAULT_WATERMARK_SETTING,
  getWatermarkSetting,
  saveWatermarkSetting,
  type WatermarkSetting,
} from '../../api/settingsApi'
import {
  buildWatermarkInnerStyle,
  buildWatermarkTileStyle,
  pickWatermarkVisualStyle,
  watermarkGridFromDensity,
} from '../../utils/watermarkStyle'

/**
 * 合同设置 · 导出水印配置页。
 * 支持开关、文案，以及密度 / 字号 / 倾斜 / 透明度滑动条；实时预览。
 */
export default function WatermarkSettingsPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm<WatermarkSetting>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const enabled = Form.useWatch('enabled', form)
  const contentWatch = Form.useWatch('content', form)
  const density = Form.useWatch('density', form)
  const fontSize = Form.useWatch('font_size', form)
  const rotate = Form.useWatch('rotate', form)
  const opacity = Form.useWatch('opacity', form)

  const previewText = (contentWatch ?? '').trim()
  const previewStyle = useMemo(
    () =>
      pickWatermarkVisualStyle({
        density,
        font_size: fontSize,
        rotate,
        opacity,
      }),
    [density, fontSize, rotate, opacity],
  )
  const previewGrid = useMemo(
    () => watermarkGridFromDensity(previewStyle.density),
    [previewStyle.density],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getWatermarkSetting()
        if (!cancelled) {
          form.setFieldsValue({ ...DEFAULT_WATERMARK_SETTING, ...data })
        }
      } catch {
        if (!cancelled) {
          message.error('加载水印设置失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [form, message])

  /** 保存水印设置（含视觉参数） */
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const content = (values.content ?? '').trim()
      if (values.enabled && !content) {
        message.warning('开启水印时请填写水印内容')
        return
      }
      setSaving(true)
      const payload: WatermarkSetting = {
        enabled: Boolean(values.enabled),
        content,
        density: values.density ?? DEFAULT_WATERMARK_SETTING.density,
        font_size: values.font_size ?? DEFAULT_WATERMARK_SETTING.font_size,
        rotate: values.rotate ?? DEFAULT_WATERMARK_SETTING.rotate,
        opacity: values.opacity ?? DEFAULT_WATERMARK_SETTING.opacity,
      }
      const saved = await saveWatermarkSetting(payload)
      form.setFieldsValue({ ...DEFAULT_WATERMARK_SETTING, ...saved })
      message.success('水印设置已保存')
    } catch {
      // 校验失败时 ant form 已提示；接口错误由拦截器提示
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card loading={loading} title="导出水印">
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        开启后，在合同编辑页与导出 PDF/PNG 时叠加全页防伪水印。可用滑动条调节密度、字号、倾斜与透明度，设置仅对当前登录账号生效。
      </Typography.Paragraph>

      <Row gutter={[32, 24]}>
        <Col xs={24} lg={12}>
          <Form
            form={form}
            layout="vertical"
            initialValues={DEFAULT_WATERMARK_SETTING}
            style={{ maxWidth: 520 }}
          >
            <Form.Item
              label="导出水印开关"
              name="enabled"
              valuePropName="checked"
              extra="打开后，合同页面编辑时展示水印，覆盖整页防伪"
            >
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>

            <Form.Item
              label="水印内容"
              name="content"
              rules={[
                { max: 64, message: '最多 64 个字符' },
                {
                  validator: async (_, value) => {
                    if (enabled && !(value ?? '').trim()) {
                      throw new Error('开启水印时内容不能为空')
                    }
                  },
                },
              ]}
            >
              <Input
                placeholder="例如：公司名称 / 姓名"
                maxLength={64}
                showCount
                allowClear
              />
            </Form.Item>

            <Form.Item
              label={`密度（${density ?? DEFAULT_WATERMARK_SETTING.density}）`}
              name="density"
              extra="数值越大，水印平铺越密"
            >
              <Slider min={1} max={10} step={1} marks={{ 1: '疏', 5: '中', 10: '密' }} />
            </Form.Item>

            <Form.Item
              label={`文字大小（${fontSize ?? DEFAULT_WATERMARK_SETTING.font_size}px）`}
              name="font_size"
            >
              <Slider
                min={12}
                max={48}
                step={1}
                marks={{ 12: '12', 22: '22', 48: '48' }}
              />
            </Form.Item>

            <Form.Item
              label={`倾斜程度（${rotate ?? DEFAULT_WATERMARK_SETTING.rotate}°）`}
              name="rotate"
              extra="负值向左倾斜，0° 为水平"
            >
              <Slider
                min={-60}
                max={0}
                step={1}
                marks={{ '-60': '-60°', '-28': '-28°', 0: '0°' }}
              />
            </Form.Item>

            <Form.Item
              label={`透明度（${opacity ?? DEFAULT_WATERMARK_SETTING.opacity}%）`}
              name="opacity"
              extra="数值越大，水印越明显"
            >
              <Slider
                min={5}
                max={40}
                step={1}
                marks={{ 5: '淡', 18: '中', 40: '浓' }}
              />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                  保存
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Col>

        <Col xs={24} lg={12}>
          {/* 实时预览：跟随滑动条变化 */}
          <div
            style={{
              position: 'relative',
              height: 360,
              maxWidth: 520,
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            <Typography.Text
              type="secondary"
              style={{ position: 'absolute', zIndex: 2, left: 12, top: 8 }}
            >
              预览效果
            </Typography.Text>
            {previewText ? (
              <div style={buildWatermarkInnerStyle(previewStyle)}>
                {Array.from({ length: Math.min(previewGrid.tileCount, 72) }).map((_, i) => (
                  <span key={i} style={buildWatermarkTileStyle(previewStyle)}>
                    {previewText}
                  </span>
                ))}
              </div>
            ) : (
              <Typography.Text
                type="secondary"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                填写水印内容后可预览
              </Typography.Text>
            )}
          </div>
        </Col>
      </Row>
    </Card>
  )
}
