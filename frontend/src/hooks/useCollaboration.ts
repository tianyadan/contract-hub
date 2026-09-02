import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ConfirmProgress,
  ConfirmProgressWsPayload,
  PresenceUser,
  VersionSavedWsPayload,
} from '../types/contract'
import { getStoredUser, getToken } from '../utils/token'

const RECONNECT_MS = 2000
const MAX_RECONNECT_MS = 15000
const POLL_MS = 15000

interface CollaborationMessage {
  type: string
  list?: { name: string; role: string }[]
  data?: ConfirmProgressWsPayload | VersionSavedWsPayload
}

export interface UseCollaborationOptions {
  contractId?: number | string
  shareToken?: string
  /** 当前用户角色（用于过滤自己触发的 version_saved） */
  selfRole?: 'owner' | 'collaborator'
  selfName?: string
  /** WS 断开时的确认进度轮询 */
  fetchConfirmProgress?: () => Promise<ConfirmProgress>
  enabled?: boolean
}

/**
 * 协作 Hook：在线状态 + 确认进度推送 + 版本保存提醒。
 */
export function useCollaboration(options: UseCollaborationOptions) {
  const {
    contractId,
    shareToken,
    selfRole,
    selfName,
    fetchConfirmProgress,
    enabled = true,
  } = options

  const [users, setUsers] = useState<PresenceUser[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [confirmProgress, setConfirmProgress] = useState<ConfirmProgress | null>(null)
  const [staleVersion, setStaleVersion] = useState<VersionSavedWsPayload | null>(null)
  const reconnectRef = useRef(RECONNECT_MS)
  const fetchConfirmProgressRef = useRef(fetchConfirmProgress)
  fetchConfirmProgressRef.current = fetchConfirmProgress

  const applyConfirmWs = useCallback((data: ConfirmProgressWsPayload) => {
    setConfirmProgress((prev) => ({
      requires_dual_confirm: data.requires_dual_confirm,
      has_internal_confirm: data.has_internal_confirm,
      has_external_confirm: data.has_external_confirm,
      pending_parties: prev?.pending_parties ?? [],
      will_finalize_on_next: prev?.will_finalize_on_next ?? false,
    }))
  }, [])

  const dismissStaleVersion = useCallback(() => {
    setStaleVersion(null)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setUsers([])
      setIsConnected(false)
      return undefined
    }

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
    let pollTimer: ReturnType<typeof setInterval> | null = null

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

    const pollConfirmProgress = async () => {
      const fetcher = fetchConfirmProgressRef.current
      if (!fetcher) return
      try {
        const progress = await fetcher()
        setConfirmProgress(progress)
      } catch {
        // 忽略轮询失败
      }
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
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as CollaborationMessage
          if (msg.type === 'presence' && msg.list) {
            applyPresenceList(msg.list)
            return
          }
          if (msg.type === 'confirm_progress' && msg.data) {
            applyConfirmWs(msg.data as ConfirmProgressWsPayload)
            return
          }
          if (msg.type === 'version_saved' && msg.data) {
            const payload = msg.data as VersionSavedWsPayload
            const isSelf =
              (selfRole && payload.saved_by_role === selfRole && payload.saved_by === selfName) ||
              (selfRole === 'owner' && user?.username === payload.saved_by)
            if (!isSelf) {
              setStaleVersion(payload)
            }
          }
        } catch {
          // 忽略非 JSON
        }
      }

      ws.onclose = () => {
        if (!alive) return
        setIsConnected(false)
        scheduleReconnect()
        if (!pollTimer && fetchConfirmProgressRef.current) {
          pollTimer = setInterval(() => {
            void pollConfirmProgress()
          }, POLL_MS)
        }
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
      if (pollTimer) clearInterval(pollTimer)
      ws?.close()
    }
  }, [contractId, shareToken, enabled, selfRole, selfName, applyConfirmWs])

  return {
    users,
    isConnected,
    confirmProgress,
    setConfirmProgress,
    staleVersion,
    dismissStaleVersion,
  }
}

/** @deprecated 请使用 useCollaboration */
export function usePresence(contractId?: number | string, shareToken?: string) {
  const { users, isConnected } = useCollaboration({ contractId, shareToken })
  return { users, isConnected }
}
