/**
 * DOCX 文档图标（SVG）。
 * 参考网上常见的 Word 文档图标样式：白色文档页 + 右上折角 + 蓝色 W 标识 + 内容行。
 * 适用于合同列表、首页最近合同等展示 DOCX 文件的地方。
 * 参考来源：IconScout / svgicons / iconpacks 上的 docx 文件图标样式。
 */
interface DocxIconProps {
  /** 尺寸（px），默认 24 */
  size?: number
}

export default function DocxIcon({ size = 24 }: DocxIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="DOCX 文档"
    >
      {/* 文档页主体（白色纸张） */}
      <path
        d="M10 4h21l9 9v29a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        fill="#ffffff"
        stroke="#d9dee3"
        strokeWidth="2"
      />
      {/* 右上折角 */}
      <path
        d="M31 4l9 9h-9z"
        fill="#f0f6f3"
        stroke="#d9dee3"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* 蓝色 W 标识（Word 风格） */}
      <rect x="14" y="15" width="20" height="18" rx="4" fill="#2b7cd3" />
      <path
        d="M19.5 19.5l2 10 2.5-6 2.5 6 2-10"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* 文档内容行 */}
      <rect x="14" y="38" width="20" height="2.5" rx="1.25" fill="#e2e6ea" />
    </svg>
  )
}
