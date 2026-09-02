import { useEffect, useRef, useState } from 'react'
import type { PresenceMessage, PresenceUser } from '../types/contract'
import { getStoredUser, getToken } from '../utils/token'

const RECONNECT_MS = 2000
const MAX_RECONNECT_MS = 15000

/**
 * 在线状态 Hook：WebSocket + 服务端每秒全量同步 + 断线自动重连。
 */
export function usePresence(
  contractId?: number | string,
  shareToken?: string,
): { users: PresenceUser[]; isConnected: boolean } {
  const [users, setUsers] = useState<PresenceUser[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const reconnectRef = useRef(RECONNECT_MS)

  useEffect(() => {
    const user = getStoredUser()
    const shareName = shareToken
      ? sessionStorage.getItem(`lshc_share_name_${shareToken}`)
      : null

    let wsUrl: string | null = null
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'

    if (contractId && user) {
      wsUrl = `${protocol}://${window.location.host}/api/ws/contracts/${contractId}?token=${encodeURIComponent(getToken() ?? '')}`
    } else if (shareToken && shareName) {
      wsUrl = `${protocol}://${window.location.host}/api/share/${shareToken}/ws?collaborator_name=${encodeURIComponent(shareName)}`
    }

    if (!wsUrl) {
      setUsers([])
      setIsConnected(false)
      return undefined
    }

    let ws: WebSocket | null = null
    let alive = true
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    /** 应用服务端全量在线列表 */
    const applyPresenceList = (list: { name: string; role: string }[]) => {
      setUsers(
        list.map((u) => ({
          id: `${u.role}-${u.name}`,
          name: u.name,
          role: u.role,
          is_online: true,
        })),
      )
    }

    const connect = () => {
      if (!alive) return
      try {
        ws = new WebSocket(wsUrl!)
      } catch {
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        if (!alive) return
        setIsConnected(true)
        reconnectRef.current = RECONNECT_MS
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as PresenceMessage
          if (msg.type === 'presence' && msg.list) {
            applyPresenceList(msg.list)
          }
        } catch {
          // 忽略非 JSON
        }
      }

      ws.onclose = () => {
        if (!alive) return
        setIsConnected(false)
        scheduleReconnect()
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    const scheduleReconnect = () => {
      if (!alive) return
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        reconnectRef.current = Math.min(reconnectRef.current * 1.5, MAX_RECONNECT_MS)
        connect()
      }, reconnectRef.current)
    }

    connect()

    return () => {
      alive = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [contractId, shareToken])

  return { users, isConnected }
}
