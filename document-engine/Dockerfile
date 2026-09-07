# Document Engine（FastAPI）镜像
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
# 国内镜像，避免服务器访问 PyPI 超时
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple \
    --trusted-host pypi.tuna.tsinghua.edu.cn \
    -r requirements.txt
COPY app ./app
EXPOSE 9002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9002"]
