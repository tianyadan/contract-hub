# Document Engine 入口：FastAPI 应用（V3 仅保留 DOCX 解析）
import logging

from fastapi import FastAPI, File, UploadFile, HTTPException

from app.schemas import ApiResponse, ParseResponseData
from app.services.docx_parser import parse_docx
from app.utils.file_check import check_docx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("document-engine")

app = FastAPI(
    title="心智协同合同协作系统 Document Engine",
    description="合同文档处理服务：DOCX 解析（导入初稿）",
    version="0.2.0",
)


@app.get("/health")
def health():
    """健康检查接口。"""
    return {
        "code": 0,
        "message": "ok",
        "data": {
            "service": "document-engine",
            "status": "running",
            "mode": "parse-only",
        },
    }


@app.post("/parse", response_model=ApiResponse)
async def parse_docx_api(file: UploadFile = File(...)):
    """解析 DOCX 文件为结构化 JSON（导入初稿用）。"""
    content = await file.read()

    try:
        check_docx(file.filename or "", content)
        data = parse_docx(content, file.filename or "unknown.docx")
        response_data = ParseResponseData(**data)
        return ApiResponse(code=0, message="ok", data=response_data)
    except ValueError as e:
        logger.warning("parse file rejected: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("parse docx failed")
        raise HTTPException(status_code=422, detail="文档解析失败，请检查 DOCX 文件")
