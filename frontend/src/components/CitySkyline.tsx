/**
 * 城市天际线（SVG 装饰背景）。
 * 白色低透明度建筑剪影，用于品牌面板底部铺底，营造“城市”意象。
 */
export default function CitySkyline() {
  return (
    <svg
      className="city-skyline"
      viewBox="0 0 1200 420"
      preserveAspectRatio="xMidYMax slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g fill="currentColor">
        {/* 远景低矮建筑群 */}
        <rect x="0" y="300" width="70" height="120" opacity="0.28" />
        <rect x="80" y="330" width="90" height="90" opacity="0.22" />
        <rect x="180" y="270" width="60" height="150" opacity="0.30" />
        <rect x="250" y="310" width="110" height="110" opacity="0.22" />
        <rect x="370" y="250" width="55" height="170" opacity="0.30" />
        <rect x="435" y="300" width="80" height="120" opacity="0.24" />
        <rect x="525" y="335" width="105" height="85" opacity="0.22" />
        <rect x="640" y="280" width="60" height="140" opacity="0.30" />
        <rect x="710" y="320" width="90" height="100" opacity="0.24" />
        <rect x="810" y="255" width="55" height="165" opacity="0.30" />
        <rect x="875" y="305" width="100" height="115" opacity="0.22" />
        <rect x="985" y="340" width="85" height="80" opacity="0.22" />
        <rect x="1080" y="290" width="70" height="130" opacity="0.28" />
        <rect x="1160" y="320" width="40" height="100" opacity="0.22" />

        {/* 近景高楼 */}
        <rect x="120" y="190" width="70" height="230" opacity="0.34" />
        <rect x="205" y="150" width="48" height="270" opacity="0.38" />
        <rect x="300" y="210" width="62" height="210" opacity="0.34" />
        <rect x="470" y="170" width="52" height="250" opacity="0.38" />
        <rect x="560" y="120" width="60" height="300" opacity="0.36" />
        <rect x="660" y="200" width="46" height="220" opacity="0.34" />
        <rect x="830" y="160" width="56" height="260" opacity="0.36" />
        <rect x="920" y="210" width="64" height="210" opacity="0.32" />
        <rect x="1030" y="140" width="50" height="280" opacity="0.36" />
        <rect x="1120" y="190" width="60" height="230" opacity="0.32" />

        {/* 楼顶天线 */}
        <rect x="227" y="120" width="4" height="32" opacity="0.32" />
        <rect x="588" y="88" width="4" height="34" opacity="0.32" />
        <rect x="1053" y="108" width="4" height="34" opacity="0.32" />

        {/* 左侧树林剪影，呼应“绿森” */}
        <circle cx="55" cy="262" r="34" opacity="0.26" />
        <circle cx="96" cy="272" r="26" opacity="0.26" />
        <circle cx="30" cy="286" r="22" opacity="0.26" />
      </g>
    </svg>
  )
}
