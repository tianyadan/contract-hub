package ws

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"github.com/lshc/contract-hub/backend/internal/auth"
	"github.com/lshc/contract-hub/backend/internal/collab"
	"github.com/lshc/contract-hub/backend/internal/service"
)

// UserPresence 在线用户信息。
type UserPresence struct {
	Name string `json:"name"`
	Role string `json:"role"` // owner / collaborator
}

// wsMessage WebSocket 消息统一格式。
type wsMessage struct {
	Type string         `json:"type"`
	Data any            `json:"data,omitempty"`
	List []UserPresence `json:"list,omitempty"`
}

// Client 表示一个 WebSocket 连接。
type Client struct {
	hub        *Hub
	conn       *websocket.Conn
	send       chan []byte
	contractID int64
	user       UserPresence
}

// Hub 管理所有合同的在线连接。
type Hub struct {
	mu    sync.Mutex
	rooms map[int64]map[*Client]struct{}
}

// NewHub 创建在线状态 Hub，并启动每秒全量同步。
func NewHub() *Hub {
	h := &Hub{
		rooms: make(map[int64]map[*Client]struct{}),
	}
	h.startPresenceSync(1 * time.Second)
	return h
}

// startPresenceSync 定时向各房间广播全量在线列表，避免 join/leave 消息丢失导致状态不准。
func (h *Hub) startPresenceSync(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			h.mu.Lock()
			roomIDs := make([]int64, 0, len(h.rooms))
			for id := range h.rooms {
				roomIDs = append(roomIDs, id)
			}
			h.mu.Unlock()
			for _, id := range roomIDs {
				h.broadcast(id, wsMessage{Type: "presence", List: h.presenceList(id)})
			}
		}
	}()
}

// upgrader 允许跨域 WebSocket（前端开发环境可能不同端口）。
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// ServeShare 外部协作者 WebSocket：/api/share/{token}/ws?collaborator_name=xxx
func ServeShare(hub *Hub, shareSvc *service.ShareService) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Param("token")
		name := c.Query("collaborator_name")

		contractID, _, err := shareSvc.ValidateShareAccess(c.Request.Context(), token, name)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"code": 40301, "message": "无权访问或协作者不存在"})
			return
		}

		serveWebSocket(hub, c, contractID, UserPresence{Name: name, Role: "collaborator"})
	}
}

// RegisterInternalHandler 注册内部用户 WebSocket，带合同 owner 校验。
func RegisterInternalHandler(hub *Hub, contractSvc *service.ContractService, jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		contractID, err := parsePositiveInt64(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "message": "合同ID不合法"})
			return
		}

		tokenStr := c.Query("token")
		claims, err := auth.ParseToken(tokenStr, jwtSecret)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 40101, "message": "登录状态已失效"})
			return
		}

		// 校验合同 owner
		if _, err := contractSvc.Detail(c.Request.Context(), contractID, claims.UserID); err != nil {
			c.JSON(http.StatusForbidden, gin.H{"code": 40301, "message": "无权访问该合同"})
			return
		}

		serveWebSocket(hub, c, contractID, UserPresence{Name: claims.Username, Role: "owner"})
	}
}

// serveWebSocket 升级连接并启动读写协程。
func serveWebSocket(hub *Hub, c *gin.Context, contractID int64, user UserPresence) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	client := &Client{
		hub:        hub,
		conn:       conn,
		send:       make(chan []byte, 16),
		contractID: contractID,
		user:       user,
	}

	hub.register(client)

	go client.writePump()
	go client.readPump()
}

// register 将客户端加入房间并广播上线。
func (h *Hub) register(client *Client) {
	h.mu.Lock()
	if h.rooms[client.contractID] == nil {
		h.rooms[client.contractID] = make(map[*Client]struct{})
	}
	h.rooms[client.contractID][client] = struct{}{}
	h.mu.Unlock()

	h.broadcast(client.contractID, wsMessage{Type: "presence", List: h.presenceList(client.contractID)})
	h.broadcast(client.contractID, wsMessage{Type: "join", Data: client.user})
}

// unregister 移除客户端并广播下线。
func (h *Hub) unregister(client *Client) {
	h.mu.Lock()
	if room := h.rooms[client.contractID]; room != nil {
		if _, ok := room[client]; ok {
			delete(room, client)
			if len(room) == 0 {
				delete(h.rooms, client.contractID)
			}
		}
	}
	h.mu.Unlock()

	h.broadcast(client.contractID, wsMessage{Type: "presence", List: h.presenceList(client.contractID)})
	h.broadcast(client.contractID, wsMessage{Type: "leave", Data: client.user})
}

// presenceList 获取当前房间在线用户。
func (h *Hub) presenceList(contractID int64) []UserPresence {
	h.mu.Lock()
	defer h.mu.Unlock()

	room := h.rooms[contractID]
	list := make([]UserPresence, 0, len(room))
	for client := range room {
		list = append(list, client.user)
	}
	return list
}

// BroadcastConfirmProgress 广播双方确认进度变更。
func (h *Hub) BroadcastConfirmProgress(contractID int64, payload collab.ConfirmProgressPayload) {
	h.broadcast(contractID, wsMessage{Type: "confirm_progress", Data: payload})
}

// BroadcastVersionSaved 广播新版本保存事件。
func (h *Hub) BroadcastVersionSaved(contractID int64, payload collab.VersionSavedPayload) {
	h.broadcast(contractID, wsMessage{Type: "version_saved", Data: payload})
}

// broadcast 向房间所有客户端发送消息。
func (h *Hub) broadcast(contractID int64, msg wsMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.rooms[contractID] {
		select {
		case client.send <- data:
		default:
			// 发送缓冲区满则关闭慢客户端
			close(client.send)
			delete(h.rooms[contractID], client)
		}
	}
}

// readPump 读取客户端消息，处理心跳。
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(512)
	_ = c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// 客户端可发 ping 保活；这里统一由服务端 PongHandler 处理
	}
}

// writePump 向客户端写消息。
func (c *Client) writePump() {
	ticker := time.NewTicker(15 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			_ = c.conn.WriteMessage(websocket.TextMessage, message)
		case <-ticker.C:
			_ = c.conn.WriteMessage(websocket.PingMessage, nil)
		}
	}
}

// parsePositiveInt64 解析正数 int64。
func parsePositiveInt64(s string) (int64, error) {
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return 0, errors.New("invalid id")
	}
	return n, nil
}
