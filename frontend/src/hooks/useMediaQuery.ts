import { useEffect, useState } from 'react'

/**
 * 监听 CSS media query 是否匹配（用于移动端布局分支）。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** 常见断点：手机竖屏及以下 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
