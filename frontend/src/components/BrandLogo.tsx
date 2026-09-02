/**
 * 品牌 Logo（SVG）。
 * 以“绿色森林 + 城市建筑”为意象，白色圆角底 + 绿色树冠，呼应“心智协同”。
 */
interface BrandLogoProps {
  /** 尺寸（px），默认 44 */
  size?: number
}

export default function BrandLogo({ size = 44 }: BrandLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="心智协同品牌标识"
    >
      {/* 白色圆角底片 */}
      <rect width="48" height="48" rx="12" fill="#ffffff" />

      {/* 左侧建筑剪影 */}
      <rect x="8.5" y="24" width="6.5" height="13" rx="1.2" fill="#9fe0c0" />
      <rect x="10" y="26.5" width="3.5" height="3" rx="0.8" fill="#ffffff" />

      {/* 右侧建筑剪影 */}
      <rect x="33" y="28" width="6.5" height="9" rx="1.2" fill="#9fe0c0" />
      <rect x="34.5" y="30" width="3.5" height="3" rx="0.8" fill="#ffffff" />

      {/* 树冠（云朵形，绿色森林意象） */}
      <path
        d="M24 8.5c-4.4 0-7.6 3.3-7.6 7.3 0 1.1.3 2.2.8 3.1-2.9 1-4.9 3.6-4.9 6.7 0 4 3.2 7.1 7.2 7.1h9c4 0 7.2-3.1 7.2-7.1 0-3.1-2-5.7-4.9-6.7.5-.9.8-2 .8-3.1 0-4-3.2-7.3-7.6-7.3z"
        fill="#00b96b"
      />

      {/* 树干 */}
      <rect x="21.6" y="32.5" width="4.8" height="5.5" rx="1.4" fill="#0b8f58" />
    </svg>
  )
}
