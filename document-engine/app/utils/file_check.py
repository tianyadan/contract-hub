# 文件校验工具
import os
from pathlib import Path


def check_docx(filename: str, content: bytes) -> None:
    """校验文件必须是 .docx，并且不能为空。"""
    if not filename or Path(filename).suffix.lower() != ".docx":
        raise ValueError("仅支持 .docx 文件")

    if not content:
        raise ValueError("文件不能为空")

    # DOCX 本质是 ZIP，文件头应为 PK\x03\x04
    if len(content) < 4 or content[:2] != b"PK" or content[2] != 0x03 or content[3] != 0x04:
        raise ValueError("文件不是有效的 DOCX")
