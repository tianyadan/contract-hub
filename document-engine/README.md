# 心智协同合同协作系统 - Document Engine

合同文档处理服务，使用 Python FastAPI 实现。

## 功能

- DOCX 解析为结构化 JSON
- 支持段落、标题、表格
- 支持页眉、页脚
- 支持 Word 公式提取（OMML 转纯文本）
- 已实现版本 Diff
- 后续扩展：DOCX 渲染

## 本地启动

```bash
cd document-engine
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 9002 --reload
```

## 接口

### 健康检查

```text
GET /health
```

### DOCX 解析

```text
POST /parse
Content-Type: multipart/form-data
file: xxx.docx
```

### 文档 Diff

对比两个结构化文档版本，返回变更记录：

```text
POST /diff
Content-Type: application/json
```

请求体：

```json
{
  "old_document": {
    "headers": [],
    "footers": [],
    "blocks": []
  },
  "new_document": {
    "headers": [],
    "footers": [],
    "blocks": []
  }
}
```

变更类型：

- 0 = 新增
- 1 = 删除
- 2 = 修改

### DOCX 渲染 + 水印

```text
POST /render
Content-Type: application/json
```

请求：

```json
{
  "document_content": {
    "headers": [],
    "footers": [],
    "blocks": []
  },
  "watermark": "心智协同"
}
```

响应：DOCX 文件字节流，内置文字水印。
