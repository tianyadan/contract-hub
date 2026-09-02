package collab

// ConfirmProgressPayload 双方确认进度 WebSocket 载荷。
type ConfirmProgressPayload struct {
	VersionID           int64 `json:"version_id"`
	HasInternalConfirm  bool  `json:"has_internal_confirm"`
	HasExternalConfirm  bool  `json:"has_external_confirm"`
	RequiresDualConfirm bool  `json:"requires_dual_confirm"`
	ContractStatus      int8  `json:"contract_status"`
}

// VersionSavedPayload 版本保存 WebSocket 载荷。
type VersionSavedPayload struct {
	VersionID   int64  `json:"version_id"`
	VersionNo   int    `json:"version_no"`
	SavedBy     string `json:"saved_by"`
	SavedByRole string `json:"saved_by_role"` // owner | collaborator
}

// Broadcaster 协作事件广播接口（由 WebSocket Hub 实现）。
type Broadcaster interface {
	BroadcastConfirmProgress(contractID int64, payload ConfirmProgressPayload)
	BroadcastVersionSaved(contractID int64, payload VersionSavedPayload)
}
