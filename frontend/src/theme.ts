import type { ThemeConfig } from 'antd'

/**
 * 全局主题配置。
 * 心智协同：整体采用清新自然的绿色系，保持 Ant Design 原生风格。
 */
export const themeConfig: ThemeConfig = {
  token: {
    // 主色：清新绿，呼应“心智协同”品牌
    colorPrimary: '#00b96b',
    // 信息色与链接色跟随主色，保证全局统一
    colorInfo: '#00b96b',
    colorLink: '#00b96b',
    // 圆角：中等大小，观感柔和但不失专业
    borderRadius: 8,
    // 内容区最大宽度（antd 布局组件使用）
    colorBgLayout: '#f5f7f6',
  },
  components: {
    // 按钮：主按钮使用渐变绿，呈现清新质感
    Button: {
      primaryColor: '#ffffff',
      fontWeight: 500,
    },
    // 输入框：聚焦时使用主色描边
    Input: {
      activeBorderColor: '#00b96b',
      hoverBorderColor: '#4dd39b',
    },
    // 表单：垂直间距适中
    Form: {
      verticalLabelPadding: '0 0 6px',
    },
  },
}
