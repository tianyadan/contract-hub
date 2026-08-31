# DOCX 解析服务：把 Word 文档转换成结构化 JSON
import re
from io import BytesIO
from typing import Dict, List, Optional, Tuple

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

# DrawingML 命名空间（主题色）
A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def parse_docx(content: bytes, file_name: str) -> dict:
    """解析 DOCX 文件，返回结构化 JSON。

    支持：
    - 普通段落
    - 标题段落
    - 表格
    - 页眉、页脚
    - Word 公式（OMML 提取为纯文本）
    - 段落 / 表格样式（字体、字号、加粗、对齐、缩进、行距等）
    - 字体颜色：显式 RGB、主题色（themeColor + themeShade/Tint）、样式级颜色回退
    - 页面设置（纸张大小、页边距、方向），供前端分页渲染
    """
    doc = Document(BytesIO(content))

    # 主题色表（theme1.xml 的 clrScheme，accent1-6 等）
    theme_colors = _parse_theme_colors(doc)
    # 样式颜色表（styles.xml，styleId -> 颜色 hex）
    style_colors = _parse_style_colors(doc)

    # 解析页眉
    headers = _parse_header_footer(doc, "header")
    # 解析页脚
    footers = _parse_header_footer(doc, "footer")

    # 页面设置（纸张大小 / 页边距 / 方向）
    page = _parse_document_page(doc)
    # 文档默认样式（Normal 样式，作为未显式设置时的兜底）
    default_style = _parse_default_style(doc, style_colors)

    # 按文档原始顺序解析正文块
    blocks = _parse_body_blocks(doc, theme_colors, style_colors)

    formula_count = sum(len(b.get("formulas", [])) for b in blocks)
    metadata = {
        "file_name": file_name,
        "paragraph_count": sum(1 for b in blocks if b["type"] in ("paragraph", "heading", "formula")),
        "table_count": sum(1 for b in blocks if b["type"] == "table"),
        "header_count": len(headers),
        "footer_count": len(footers),
        "formula_count": formula_count,
    }

    return {
        "schema_version": 2,
        "render_mode": "web_editor",
        "metadata": metadata,
        "page": page,
        "default_style": default_style,
        "headers": headers,
        "footers": footers,
        "blocks": blocks,
    }


def _parse_theme_colors(doc: Document) -> Dict[str, str]:
    """从 theme1.xml 解析主题色表（clrScheme 的 dk1/lt1/dk2/lt2/accent1-6/hyperlink 等）。"""
    colors: Dict[str, str] = {}
    try:
        from lxml import etree

        # 遍历包内 part 找到主题文件（不同文档的主题关系位置可能不同）
        theme_root = None
        for part in doc.part.package.iter_parts():
            if "theme" in str(part.partname).lower():
                theme_root = etree.fromstring(part.blob)
                break
        if theme_root is None:
            return colors

        clr_scheme = theme_root.find(f"{A_NS}themeElements/{A_NS}clrScheme")
        if clr_scheme is None:
            return colors
        for child in clr_scheme:
            name = child.tag.split("}")[-1]  # dk1 / lt1 / accent1 ...
            srgb = child.find(f"{A_NS}srgbClr")
            if srgb is not None:
                val = srgb.get("val")
                if val:
                    colors[name] = val
                continue
            sysc = child.find(f"{A_NS}sysClr")
            if sysc is not None:
                last = sysc.get("lastClr")
                if last:
                    colors[name] = last
    except Exception:
        # 解析不到主题时忽略，颜色回退为 None（默认色）
        pass
    return colors


def _parse_style_colors(doc: Document) -> Dict[str, str]:
    """解析 styles.xml 中每个样式的字体颜色（styleId -> hex）。"""
    colors: Dict[str, str] = {}
    try:
        for st in doc.styles:
            rPr = getattr(st.element, "rPr", None)
            if rPr is None:
                continue
            c = rPr.find(qn("w:color"))
            if c is not None and c.get(qn("w:val")):
                val = c.get(qn("w:val"))
                if val and val.lower() != "auto":
                    colors[st.style_id] = val.upper()
    except Exception:
        pass
    return colors


def _apply_theme_shade(hex_color: str, shade: str) -> str:
    """themeShade 近似：颜色按比例加深（val 为十六进制，如 80 -> 128/255）。"""
    try:
        ratio = int(shade, 16) / 255.0
    except ValueError:
        return hex_color
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return f"{int(r * ratio):02X}{int(g * ratio):02X}{int(b * ratio):02X}".upper()


def _apply_theme_tint(hex_color: str, tint: str) -> str:
    """themeTint 近似：颜色按比例变亮。"""
    try:
        ratio = int(tint, 16) / 255.0
    except ValueError:
        return hex_color
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    nr = int(r * ratio + 255 * (1 - ratio))
    ng = int(g * ratio + 255 * (1 - ratio))
    nb = int(b * ratio + 255 * (1 - ratio))
    return f"{nr:02X}{ng:02X}{nb:02X}".upper()


def _resolve_run_color(rPr, theme_colors: Dict[str, str]) -> Optional[str]:
    """解析 run 的 w:color，返回最终颜色 hex。

    优先级：themeColor（含 themeShade/themeTint 调整）> 显式 val > None。
    企业文档常只用主题色引用，颜色定义在主题文件里，这里负责解析出来。
    """
    if rPr is None:
        return None
    c = rPr.find(qn("w:color"))
    if c is None:
        return None

    val = c.get(qn("w:val")) or ""
    theme = c.get(qn("w:themeColor")) or ""
    shade = c.get(qn("w:themeShade")) or ""
    tint = c.get(qn("w:themeTint")) or ""

    color: Optional[str] = None
    # 主题色优先（Word 中 themeColor 决定实际显示色，val 只是无主题时的回退）
    if theme and theme in theme_colors:
        color = theme_colors[theme]
    elif val.lower() not in ("", "auto"):
        color = val.upper()

    if color is None:
        return None
    if shade:
        color = _apply_theme_shade(color, shade)
    if tint:
        color = _apply_theme_tint(color, tint)
    return color


def _style_color_recursive(st, style_colors: Dict[str, str], visited: set) -> Optional[str]:
    """沿样式继承链（段落样式 -> base_style -> Normal）查找颜色。"""
    if st is None or st.style_id in visited:
        return None
    visited.add(st.style_id)
    if st.style_id in style_colors:
        return style_colors[st.style_id]
    return _style_color_recursive(st.base_style, style_colors, visited)


def _twips(length) -> int:
    """Length 对象转 twips（1 twip = 1/20 pt），空值返回 0。"""
    return int(length.twips) if length else 0


def _pt(length):
    """Length 对象转 pt 浮点数，空值返回 None。"""
    return round(float(length.pt), 2) if length else None


def _parse_document_page(doc: Document) -> dict:
    """解析第一节的页面设置：纸张大小、页边距、方向。"""
    section = doc.sections[0] if doc.sections else None
    if section is None:
        # 默认 A4 纵向，上下 2.54cm 左右 3.18cm
        return {
            "width": 11906,
            "height": 16838,
            "orientation": "portrait",
            "margin_top": 1440,
            "margin_right": 1800,
            "margin_bottom": 1440,
            "margin_left": 1800,
        }
    return {
        "width": _twips(section.page_width),
        "height": _twips(section.page_height),
        "orientation": "landscape" if section.orientation == WD_ORIENT.LANDSCAPE else "portrait",
        "margin_top": _twips(section.top_margin),
        "margin_right": _twips(section.right_margin),
        "margin_bottom": _twips(section.bottom_margin),
        "margin_left": _twips(section.left_margin),
    }


def _parse_default_style(doc: Document, style_colors: Dict[str, str]) -> dict:
    """解析文档默认样式（Normal 样式），作为块未显式设置时的兜底。"""
    style: dict = {}
    try:
        normal = doc.styles["Normal"]
        if normal.font.size:
            style["font_size"] = normal.font.size.pt
        if normal.font.name:
            style["font_name"] = normal.font.name
        # 中文字体（w:eastAsia）
        rPr = getattr(normal.element, "rPr", None)
        if rPr is not None and rPr.rFonts is not None:
            ea = rPr.rFonts.get(qn("w:eastAsia"))
            if ea:
                style["east_asia_font"] = ea
        # Normal 默认颜色
        if "Normal" in style_colors:
            style["color"] = style_colors["Normal"]
    except Exception:
        pass
    return style


def _parse_body_blocks(doc: Document, theme_colors: Dict[str, str], style_colors: Dict[str, str]) -> List[dict]:
    """按文档顺序解析正文中的段落和表格，并记录原始文档位置 source_ref。

    Word 的真实分页由排版引擎决定，python-docx 无法重排得到完全一致的物理页。
    这里优先读取 DOCX 内显式分页符、段前分页和 Word 写入的 lastRenderedPageBreak，
    给前端一个稳定的 page_index，避免第二页内容被前端高度估算挤到第一页。
    """
    blocks: List[dict] = []
    order = 0
    # source_index 对应 body 下段落/表格的原始序号（从 0 开始）
    source_index = 0
    page_index = 0
    next_page_break_before = False

    for block in _iter_block_items(doc):
        if isinstance(block, Paragraph):
            page_break_before = _has_page_break_before(block) or next_page_break_before
            next_page_break_before = False
            if page_break_before:
                page_index += 1
            order += 1
            parsed = _parse_paragraph(block, order, {
                "kind": "paragraph",
                "index": source_index,
            }, theme_colors, style_colors)
            parsed["page_index"] = page_index
            parsed["page_break_before"] = page_break_before
            blocks.append(parsed)
            if _paragraph_breaks_page_after(block):
                # 分页符在当前段落末尾时，下一块才应该新起一页。
                # 这里只标记下一块，避免当前段落和下一段都被计算为同一页后再靠 page_index 猜测。
                next_page_break_before = True
            source_index += 1
        elif isinstance(block, Table):
            page_break_before = next_page_break_before
            next_page_break_before = False
            if page_break_before:
                page_index += 1
            order += 1
            parsed = _parse_table(block, order, {
                "kind": "table",
                "index": source_index,
            }, theme_colors, style_colors)
            parsed["page_index"] = page_index
            parsed["page_break_before"] = page_break_before
            blocks.append(parsed)
            source_index += 1

    return blocks


def _run_style(run, theme_colors: Dict[str, str]) -> dict:
    """提取单个 run 的显式样式（字体、字号、加粗、颜色、高亮、阴影、删除线等）。"""
    s: dict = {}
    f = run.font
    if f.size:
        s["font_size"] = f.size.pt
    if f.name:
        s["font_name"] = f.name
    rPr = getattr(run._element, "rPr", None)
    if rPr is not None and rPr.rFonts is not None:
        ea = rPr.rFonts.get(qn("w:eastAsia"))
        if ea:
            s["east_asia_font"] = ea
    if f.bold is not None:
        s["bold"] = bool(f.bold)
    if f.italic is not None:
        s["italic"] = bool(f.italic)
    if f.underline is not None:
        s["underline"] = bool(f.underline)
    if f.strike is not None:
        s["strike"] = bool(f.strike)
    # 颜色：显式 RGB 或主题色（themeColor + shade/tint）。
    # 注意：w:color 带 themeColor 时，Word 实际显示主题色（val 只是无主题时的回退），
    # 且 run 为纯主题色时 f.color.rgb 会抛异常，需单独处理。
    color_value = None
    has_theme = False
    if rPr is not None:
        color_el = rPr.find(qn("w:color"))
        has_theme = color_el is not None and bool(color_el.get(qn("w:themeColor")))
    if has_theme:
        try:
            color_value = _resolve_run_color(rPr, theme_colors)
        except Exception:
            color_value = None
    else:
        try:
            if f.color is not None and f.color.rgb is not None:
                color_value = str(f.color.rgb)
        except Exception:
            color_value = None
    if color_value:
        s["color"] = color_value

    # 通过 XML 提取 python-docx 未直接暴露的样式
    if rPr is not None:
        # 文本高亮（w:highlight）
        hl = rPr.find(qn("w:highlight"))
        if hl is not None:
            val = hl.get(qn("w:val"))
            if val and val != "none":
                s["highlight"] = val
        # 文字阴影（w:shadow）
        sh = rPr.find(qn("w:shadow"))
        if sh is not None:
            val = sh.get(qn("w:val"))
            if val not in (None, "0", "false", "none"):
                s["shadow"] = True
    return s


def _parse_paragraph_style(paragraph: Paragraph, theme_colors: Dict[str, str], style_colors: Dict[str, str]) -> dict:
    """解析段落样式：对齐、行距、段前段后、缩进、底纹 + 主导 run 的字体样式。

    颜色回退链：run 显式/主题色 -> 段落样式 -> 继承样式(base_style) -> Normal。
    """
    fmt = paragraph.paragraph_format
    style: dict = {
        "alignment": None,
        "line_spacing": None,
        "line_spacing_rule": None,
        "space_before": _pt(fmt.space_before),
        "space_after": _pt(fmt.space_after),
        "indent_first_line": _twips(fmt.first_line_indent),
        "indent_left": _twips(fmt.left_indent),
        "indent_right": _twips(fmt.right_indent),
        "font_size": None,
        "font_name": None,
        "east_asia_font": None,
        "bold": None,
        "italic": None,
        "underline": None,
        "strike": None,
        "color": None,
        "highlight": None,
        "shadow": None,
        "shading": None,
    }

    if fmt.alignment is not None:
        style["alignment"] = fmt.alignment.name.lower()
    ls = fmt.line_spacing
    if isinstance(ls, float) or isinstance(ls, int):
        # 倍数行距（如 1.5）
        style["line_spacing"] = float(ls)
    elif ls is not None:
        # 固定值行距（pt）
        style["line_spacing"] = _pt(ls)
    if fmt.line_spacing_rule is not None:
        style["line_spacing_rule"] = fmt.line_spacing_rule.name.lower()

    # 段落底纹（w:shd，用于段落背景色）
    pPr = getattr(paragraph._p, "pPr", None)
    if pPr is not None:
        shd = pPr.find(qn("w:shd"))
        if shd is not None:
            fill = shd.get(qn("w:fill"))
            if fill and fill.lower() != "auto":
                style["shading"] = fill

    # 取第一个非空 run 作为段落主导样式（合同段落内通常样式统一）
    for run in paragraph.runs:
        if not run.text.strip():
            continue
        style.update(_run_style(run, theme_colors))
        break

    # 颜色回退：run 无显式/主题颜色时，沿段落样式继承链查找
    if style["color"] is None and paragraph.style is not None:
        style["color"] = _style_color_recursive(paragraph.style, style_colors, set())

    return style


def _parse_paragraph_runs(paragraph: Paragraph, theme_colors: Dict[str, str]) -> Optional[List[dict]]:
    """提取段落内所有非空 run 的文本与样式。

    支持段落内部的混合样式（如同一段里金额部分蓝色+下划线），
    供前端分段渲染、导出时逐个 run 应用样式。
    仅当段落内存在多个样式各异的 run 时返回（单一样式段落返回 None，走整段 style）。
    """
    runs: List[dict] = []
    for run in paragraph.runs:
        text = run.text
        if not text:
            continue
        runs.append({
            "text": text,
            "style": _run_style(run, theme_colors),
        })
    # 只有一个 run 或全部样式相同：不需要 runs，段落级 style 已足够
    if len(runs) <= 1:
        return None
    return runs


def _parse_paragraph(paragraph: Paragraph, order: int, source_ref: dict, theme_colors: Dict[str, str], style_colors: Dict[str, str]) -> dict:
    """解析单个段落，识别标题、普通段落和公式，并记录 source_ref 与样式。"""
    text = paragraph.text
    formulas = _extract_math(paragraph)
    style = _parse_paragraph_style(paragraph, theme_colors, style_colors)
    # 段落内 run 级样式（混合样式时存在）
    runs = _parse_paragraph_runs(paragraph, theme_colors)

    # 段落样式名，例如 Heading 1 / 标题 1
    style_name = paragraph.style.name if paragraph.style else ""
    is_heading = "heading" in style_name.lower() or "标题" in style_name

    # 如果段落没有普通文本但包含公式，则作为独立公式块
    if not text.strip() and formulas:
        return {
            "id": f"f_{order}",
            "type": "formula",
            "text": " ".join(formulas),
            "order": order,
            "level": 0,
            "formulas": formulas,
            "source_ref": source_ref,
            "style": style,
        }

    level = 0
    if is_heading:
        # 从样式名中提取标题级别，例如 Heading 1 -> 1
        match = re.search(r"(\d+)", style_name)
        if match:
            level = int(match.group(1))

    block_type = "heading" if is_heading else "paragraph"
    return {
        "id": f"p_{order}",
        "type": block_type,
        "text": text,
        "order": order,
        "level": level,
        "formulas": formulas,
        "source_ref": source_ref,
        "style": style,
        # 段落内混合 run 样式（可选）
        **({"runs": runs} if runs else {}),
    }


def _parse_table(table: Table, order: int, source_ref: dict, theme_colors: Dict[str, str], style_colors: Dict[str, str]) -> dict:
    """解析表格为二维数组，并记录 source_ref 与表格样式。"""
    rows = []
    for row in table.rows:
        rows.append([cell.text for cell in row.cells])

    # 表格样式：对齐 + 首个非空单元格的字体样式
    table_style: dict = {
        "alignment": None,
        "font_size": None,
        "font_name": None,
        "east_asia_font": None,
        "bold": None,
        "color": None,
    }
    if table.alignment is not None:
        table_style["alignment"] = table.alignment.name.lower()
    for row in table.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                for run in para.runs:
                    if not run.text.strip():
                        continue
                    table_style.update(_run_style(run, theme_colors))
                    break
                if table_style.get("font_size"):
                    break
            if table_style.get("font_size"):
                break
        if table_style.get("font_size"):
            break

    return {
        "id": f"t_{order}",
        "type": "table",
        "text": "",
        "order": order,
        "level": 0,
        "formulas": [],
        "rows": rows,
        "source_ref": source_ref,
        "style": table_style,
    }


def _parse_header_footer(doc: Document, kind: str) -> List[dict]:
    """解析页眉或页脚。

    kind 为 header 或 footer。
    """
    items: List[dict] = []
    if not doc.sections:
        return items

    section = doc.sections[0]
    container = section.header if kind == "header" else section.footer

    index = 0
    for paragraph in container.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        index += 1
        items.append({
            "id": f"{'h' if kind == 'header' else 'f'}_{index}",
            "text": text,
        })

    return items


def _extract_math(paragraph: Paragraph) -> List[str]:
    """从段落 XML 中提取 Word 公式（OMML）的纯文本。"""
    formulas: List[str] = []
    # m:oMath 是 Word 公式根元素
    for math in paragraph._p.iter(qn("m:oMath")):
        # 公式中的 m:t 是文本节点
        parts = [node.text or "" for node in math.iter(qn("m:t"))]
        formula_text = "".join(parts).strip()
        if formula_text:
            formulas.append(formula_text)
    return formulas


def _has_page_break_before(paragraph: Paragraph) -> bool:
    """识别段落属性 pageBreakBefore。"""
    pPr = getattr(paragraph._p, "pPr", None)
    if pPr is None:
        return False
    page_break = pPr.find(qn("w:pageBreakBefore"))
    if page_break is None:
        return False
    val = page_break.get(qn("w:val"))
    return val not in ("0", "false")


def _paragraph_breaks_page_after(paragraph: Paragraph) -> bool:
    """识别段落内的显式分页符或 Word 已渲染分页标记。

    这不是重新实现 Word 排版，而是复用 DOCX 已携带的分页信息。
    对合同封面这类常见模板，封面末尾通常有 w:br type=page 或 sectPr，
    可以避免下一页正文被流式排到第一页。
    """
    for br in paragraph._p.iter(qn("w:br")):
        if br.get(qn("w:type")) == "page":
            return True
    for _ in paragraph._p.iter(qn("w:lastRenderedPageBreak")):
        return True
    pPr = getattr(paragraph._p, "pPr", None)
    return pPr is not None and pPr.find(qn("w:sectPr")) is not None


def _iter_block_items(parent):
    """按文档 XML 原始顺序迭代段落和表格。"""
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P

    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)
