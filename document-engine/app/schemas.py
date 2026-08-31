# 请求和响应数据模型
from typing import List, Optional

from pydantic import BaseModel


class DocBlock(BaseModel):
    """文档内容块，后续 Diff 和在线编辑都基于 block.id 定位。"""

    id: str
    type: str  # paragraph / heading / table / formula
    text: str
    order: int
    page_index: int = 0  # 原 DOCX 页序号，从 0 开始；用于前端按原文档分页展示
    page_break_before: bool = False  # 当前块前是否有显式分页符；新版 Web 编辑器据此稳定分页
    export_page_break_before: bool = False  # 历史兼容字段；新版导出不再将 Web 自动分页作为硬分页
    level: int = 0
    formulas: List[str] = []
    rows: Optional[List[List[str]]] = None  # type=table 时使用
    source_ref: Optional[dict] = None  # 原始 DOCX 中的位置引用
    style: Optional[dict] = None  # 段落 / 表格样式（字体、字号、对齐、缩进等）
    runs: Optional[List[dict]] = None  # 段落内混合 run 样式（局部颜色 / 下划线等）


class HeaderFooterItem(BaseModel):
    """页眉或页脚内容。"""

    id: str
    text: str


class DocMetadata(BaseModel):
    """文档元数据。"""

    file_name: str
    paragraph_count: int
    table_count: int
    header_count: int
    footer_count: int
    formula_count: int


class ParseResponseData(BaseModel):
    """/parse 成功返回的数据。"""

    schema_version: int = 2
    render_mode: str = "web_editor"
    metadata: DocMetadata
    page: Optional[dict] = None  # 页面设置：纸张大小、页边距、方向（前端分页用）
    default_style: Optional[dict] = None  # 文档默认样式（Normal）
    headers: List[HeaderFooterItem]
    footers: List[HeaderFooterItem]
    blocks: List[DocBlock]


class DiffChange(BaseModel):
    """Diff 变更记录。"""

    change_type: int  # 0新增 1删除 2修改
    block_id: str
    block_type: str = ""
    clause_no: str = ""
    old_content: str = ""
    new_content: str = ""


class DiffRequest(BaseModel):
    """Diff 请求：两个版本的结构化文档。"""

    old_document: dict
    new_document: dict


class DiffResponseData(BaseModel):
    """/diff 成功返回的数据。"""

    changes: List[DiffChange]


class ApiResponse(BaseModel):
    """统一响应格式，与 Go 后端保持一致。"""

    code: int
    message: str
    data: Optional[ParseResponseData | DiffResponseData] = None
