# GPU-friendly base image. If you don't have NVIDIA runtime, this can still run on CPU
# (torch will fall back) but it will be slow.
#
# If your server GPU is very new (e.g. RTX 50xx), you may need to adjust this base
# image / torch version to a CUDA runtime that supports it.
FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY docker/reranker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY docker/reranker/app.py /app/app.py
COPY docker/reranker/enrich_csv.py /app/enrich_csv.py

ENV RERANKER_MODEL=BAAI/bge-reranker-base
ENV RERANKER_DEVICE=auto
ENV RERANKER_MAX_LENGTH=256

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
