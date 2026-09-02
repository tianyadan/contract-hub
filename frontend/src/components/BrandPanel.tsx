import {
  FundOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import BrandLogo from './BrandLogo'
import FeatureItem from './FeatureItem'
import CitySkyline from './CitySkyline'
import './brand-panel.css'

/**
 * 左侧品牌宣传面板。
 * 展示品牌标识、口号、业务定位与三项核心能力，登录 / 注册页共用。
 */
export default function BrandPanel() {
  return (
    <aside className="brand-panel">
      {/* 城市天际线装饰背景 */}
      <CitySkyline />

      {/* 顶部：品牌标识 + 名称 */}
      <div className="brand-panel__header">
        <BrandLogo size={46} />
        <div className="brand-panel__name">
          <div className="brand-panel__title">心智协同</div>
          <div className="brand-panel__pinyin">XIN ZHI XIE TONG</div>
        </div>
      </div>

      {/* 中部：标语 + 定位 + 核心能力 */}
      <div className="brand-panel__body">
        <h1 className="brand-panel__slogan">专业 · 高效 · 诚信 · 共赢</h1>
        <p className="brand-panel__subtitle">建筑资质代办与企业管理服务专家</p>

        <div className="brand-panel__features">
          <FeatureItem
            icon={<SafetyCertificateOutlined />}
            title="安全可靠"
            description="数据加密守护"
          />
          <FeatureItem
            icon={<TeamOutlined />}
            title="高效协作"
            description="合同在线协同"
          />
          <FeatureItem
            icon={<FundOutlined />}
            title="智能管理"
            description="业务数据汇总"
          />
        </div>
      </div>

      {/* 底部：公司名称 */}
      <div className="brand-panel__footer">心智协同企业文档处理系统</div>
    </aside>
  )
}
