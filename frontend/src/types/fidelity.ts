/** 高保真阅览快照 */
export interface FidelitySnapshot {
  snapshot_id: number
  snapshot_no: number
  source_version_no: number
  page_count: number
  created_by_name: string
  create_time: string
  pdf_url?: string
}

export interface FidelitySnapshotDetail extends FidelitySnapshot {
  hash: string
}
